import "server-only";

import { Prisma } from "@prisma/client";

import { autoPriceShipments, type AutoPriceResult } from "@/lib/auto-price";
import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { toLocal } from "@/lib/fx";
import { AUTO_WEIGHT_REASON, recordPriceChange } from "@/lib/price-changes";
import { quote, quoteContext } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

/**
 * A CORRECTED WEIGHT REACHES THE BILL, WHATEVER STATE THE BILL IS IN.
 *
 * The warehouse re-weighs a consignment and the price has to follow: the
 * owner's rule, in his words — "whenever the KG changes, the system must
 * recalculate the cargo price using the new KG automatically", and the
 * warehouse must never have to go and change a figure by hand.
 *
 * autoPriceShipments does this for a bill that is still a draft and refuses
 * everything else, for a good reason: check-in is re-runnable, and a re-run
 * must not overwrite a price Finance confirmed or a bill somebody paid. That
 * refusal was also the bug — a consignment re-weighed after its price was
 * confirmed was billed the kilos Guangzhou typed, silently, with the right
 * number on the cargo page and the wrong one on the customer's bill.
 *
 * So the line is drawn at MONEY, not at status:
 *
 *   - Draft: priced as before, by autoPriceShipments. Nothing here changes it.
 *   - Confirmed with nothing paid: re-priced from the new weight. The customer
 *     has not paid anything, so the bill is simply corrected before they do,
 *     and Finance is told through the price-change queue they already read.
 *   - Anything with money against it — part paid, paid, or cleared by an
 *     adjustment: NOT touched. A difference on a bill somebody has paid is a
 *     refund or a fresh demand, and that is a decision, not an edit. It is
 *     reported back to the caller so the screen can say so.
 *   - Void or written off: not a bill any more. Left alone.
 *
 * AN AGREED RATE SURVIVES A RE-WEIGH. Where Finance agreed 12.90 a kilo with
 * this customer, the new kilos are multiplied by 12.90 — the concession stands
 * and only the quantity moves. Dropping back to the rate book here would
 * cancel a discount somebody promised, quietly, because a box was re-weighed.
 * This is the one door that re-works an agreed quantity: everywhere else the
 * quantity on the bill stands (see agreedQuantityOf), precisely so a discount
 * typed later does not follow today's weight. Here the weight IS the change.
 */
export type WeightReprice = {
  /** Drafts, priced exactly as check-in prices them. */
  drafts: AutoPriceResult;
  /** Confirmed bills the new weight moved. */
  moved: {
    trackingNumber: string;
    invoiceNumber: string;
    currency: string;
    before: number;
    after: number;
  }[];
  /** Bills left alone because money is already against them. */
  held: { trackingNumber: string; invoiceNumber: string; status: string }[];
  /** The rate book cannot price the cargo as it now stands. */
  blocked: { trackingNumber: string; reason: string }[];
};

const CENT = (n: number) => Math.round(n * 100) / 100;

export async function repriceForWeight(
  shipmentIds: string[],
  actorId: string
): Promise<WeightReprice> {
  const empty: WeightReprice = {
    drafts: { priced: 0, skipped: 0, blocked: [] },
    moved: [],
    held: [],
    blocked: [],
  };
  if (shipmentIds.length === 0) return empty;

  /* The draft path first, unchanged — it also handles cargo with no bill at
     all, and the minimum-weight pooling that goes with raising one. */
  const drafts = await autoPriceShipments(shipmentIds, actorId);

  const cargo = await prisma.shipment.findMany({
    where: {
      id: { in: shipmentIds },
      deletedAt: null,
      invoice: { status: { in: ["UNPAID", "PARTIALLY_PAID", "PAID"] } },
    },
    select: {
      id: true,
      trackingNumber: true,
      cargoCategory: true,
      cargoTypeId: true,
      weightKg: true,
      packages: true,
      quotedMethod: true,
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          freightCost: true,
          freightOverride: true,
          freightRateOverride: true,
          freightRateMethod: true,
          freightRateQuantity: true,
          storageCharge: true,
          otherCharges: true,
          discount: true,
          total: true,
          amountPaid: true,
          amountAdjusted: true,
          exchangeRate: true,
          localCurrency: true,
        },
      },
    },
  });

  const moved: WeightReprice["moved"] = [];
  const held: WeightReprice["held"] = [];
  const blocked: WeightReprice["blocked"] = [];
  if (cargo.length === 0) return { drafts, moved, held, blocked };

  const [pricebook, actor] = await Promise.all([
    quoteContext(),
    /* Who re-weighed it, for the audit line. Read once rather than per bill,
       and null-safe: a user removed between the edit and this is still a
       correction that happened. */
    prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, name: true, email: true, role: true, department: true },
    }),
  ]);

  for (const shipment of cargo) {
    const invoice = shipment.invoice!;
    const paid = toNumber(invoice.amountPaid) + toNumber(invoice.amountAdjusted);
    if (invoice.status !== "UNPAID" || paid > 0.005) {
      held.push({
        trackingNumber: shipment.trackingNumber,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
      });
      continue;
    }

    const quoted = await quote(
      {
        category: shipment.cargoCategory,
        cargoTypeId: shipment.cargoTypeId,
        weightKg: toNumber(shipment.weightKg),
        quantity: shipment.packages,
      },
      "en",
      pricebook
    );
    if (!quoted.ok) {
      blocked.push({
        trackingNumber: shipment.trackingNumber,
        reason: quoted.message,
      });
      continue;
    }

    /*
      The agreed rate, multiplied by the cargo as it now stands. The unit is
      whatever was agreed — a rate agreed per piece is multiplied by pieces —
      and the per-kilo one is multiplied by the CHARGEABLE weight the rate book
      worked out for the new figure, so the 1 kg minimum is applied once, here,
      exactly as it is on the book's own price.
    */
    const agreedRate =
      invoice.freightRateOverride === null
        ? null
        : toNumber(invoice.freightRateOverride);
    const byItem =
      (invoice.freightRateMethod ?? shipment.quotedMethod) === "FIXED_PER_ITEM";
    const quantity =
      agreedRate === null
        ? null
        : byItem
          ? shipment.packages
          : quoted.chargeableWeightKg;
    const freight =
      agreedRate === null || quantity === null
        ? quoted.total
        : CENT(agreedRate * quantity);

    const storage = toNumber(invoice.storageCharge);
    const other = toNumber(invoice.otherCharges);
    const discount = toNumber(invoice.discount);
    const before = toNumber(invoice.total);
    const total = CENT(freight + storage + other - discount);

    /* Nothing to do: the kilos moved but the figure they produce did not — a
       weight inside the same band, or a per-item price. Saying "the price
       changed" then would be a change nobody made. */
    if (Math.abs(total - before) < 0.005) continue;
    if (total < 0) continue;

    /* The bill's OWN frozen rate, never today's: the shilling figure the
       customer was quoted cannot move because a box was re-weighed. */
    const frozen =
      invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate);
    const totalLocal = frozen === null ? null : toLocal(total, frozen);

    try {
      await prisma.$transaction(async (tx) => {
        /*
          Re-stated as a conditional claim, like everywhere else money moves:
          a payment landing between the read above and this write would make
          the figure we are about to save a bill for money already taken.
        */
        const claimed = await tx.invoice.updateMany({
          where: {
            id: invoice.id,
            status: "UNPAID",
            amountPaid: invoice.amountPaid,
            amountAdjusted: invoice.amountAdjusted,
            total: invoice.total,
          },
          data: {
            freightCost: new Prisma.Decimal(quoted.total),
            /* The agreed figure follows its rate; a bill on the book's price
               keeps no override at all. */
            freightOverride:
              agreedRate === null ? null : new Prisma.Decimal(freight),
            freightRateQuantity:
              quantity === null ? null : new Prisma.Decimal(quantity),
            total: new Prisma.Decimal(total),
            totalLocal:
              totalLocal === null ? null : new Prisma.Decimal(totalLocal),
          },
        });
        if (claimed.count === 0) {
          throw new Error("moved");
        }

        /* The consignment's own working follows the bill, so its page and its
           PDF print a rate times a weight that reaches the total. */
        await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            quotedAmount: new Prisma.Decimal(quoted.total),
            quoteCurrency: quoted.currency,
            quotedMethod: quoted.method,
            quotedRate: new Prisma.Decimal(quoted.rate),
            chargeableKg:
              quoted.chargeableWeightKg === null
                ? null
                : new Prisma.Decimal(quoted.chargeableWeightKg),
            pricingBlockedReason: null,
            pricingCheckedAt: new Date(),
          },
        });

        /* Finance reads this queue. A price that moved because the warehouse
           put the box on a scale is exactly what it is for. */
        await recordPriceChange(tx, {
          invoiceId: invoice.id,
          actorId,
          currency: invoice.currency,
          totalBefore: before,
          freightBefore:
            invoice.freightOverride === null
              ? null
              : toNumber(invoice.freightOverride),
          rateBefore: agreedRate,
          methodBefore: invoice.freightRateMethod,
          quantityBefore:
            invoice.freightRateQuantity === null
              ? null
              : toNumber(invoice.freightRateQuantity),
          storageBefore: storage,
          otherBefore: other,
          discountBefore: discount,
          totalAfter: total,
          reason: AUTO_WEIGHT_REASON,
        });

        await recordAudit(
          {
            actor,
            action: "invoice.reprice",
            entity: "Invoice",
            entityId: invoice.id,
            summary:
              `Re-priced ${invoice.invoiceNumber} for ${shipment.trackingNumber} ` +
              `on the corrected weight: ${invoice.currency} ${before.toFixed(2)} → ${total.toFixed(2)}`,
            metadata: {
              weightKg: toNumber(shipment.weightKg),
              chargeableKg: quoted.chargeableWeightKg,
              agreedRate,
              quantity,
              freight,
              storage,
              otherCharges: other,
              discount,
            },
          },
          tx
        );
      });

      moved.push({
        trackingNumber: shipment.trackingNumber,
        invoiceNumber: invoice.invoiceNumber,
        currency: invoice.currency,
        before,
        after: total,
      });
    } catch {
      /* Somebody paid, or moved the bill, while this was being worked out.
         The weight is saved either way; the bill is now money's business. */
      held.push({
        trackingNumber: shipment.trackingNumber,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
      });
    }
  }

  return { drafts, moved, held, blocked };
}
