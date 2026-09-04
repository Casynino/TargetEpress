import "server-only";

import { Prisma } from "@prisma/client";

import { STORAGE_POLICY, storageDaysFor } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { LOCAL_CURRENCY, currentRateValue, toLocal } from "@/lib/fx";
import { reserveInvoiceNumbers } from "@/lib/ids";
import { quote, quoteContext } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

/** The invoice columns check-in writes, whether it creates or re-prices. */
type Figures = {
  currency: string;
  freightCost: Prisma.Decimal;
  storageDays: number;
  storageCharge: Prisma.Decimal;
  total: Prisma.Decimal;
  exchangeRate: Prisma.Decimal | null;
  localCurrency: string;
  totalLocal: Prisma.Decimal | null;
  status: "DRAFT";
};

/** A successful quote — the shape `quote()` returns when it can price. */
type Quoted = Extract<Awaited<ReturnType<typeof quote>>, { ok: true }>;

/**
 * Price cargo the moment it is checked in at Dar, as a DRAFT invoice.
 *
 * The owner's rule: nobody works a shipping charge out by hand. The rate book
 * already knows what the cargo costs, so the system does the arithmetic at the
 * moment the cargo becomes real, and Finance reviews rather than types.
 *
 * FOUR THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * 1. It does not run inside the check-in transaction. `quote()` uses the module
 *    client and cannot join one, and a bulk check-in of an 87-line manifest
 *    would otherwise carry ~170 extra queries inside a single transaction
 *    holding row locks on the whole batch.
 *
 * 2. It never fails a check-in. `quote()` returns a soft failure when no rate
 *    covers the cargo; that is written to `pricingBlockedReason` and the cargo
 *    is checked in regardless. Cargo physically standing in the warehouse must
 *    never be un-receivable because the CEO has not published a rate — the box
 *    is here either way, and the clerk cannot fix a rate book.
 *
 * 3. It never touches an invoice that is not still a draft. Check-in is
 *    re-runnable by design, and a re-run must not overwrite a price Finance has
 *    confirmed or a bill a customer has already paid.
 *
 * 4. It does not decide storage. A draft raised on arrival always carries zero
 *    storage days, correctly — none have passed. Storage is worked out again
 *    when Finance confirms the price, which is the whole reason confirming
 *    re-derives instead of flipping a status.
 */

export type AutoPriceResult = {
  priced: number;
  skipped: number;
  blocked: { trackingNumber: string; reason: string }[];
};

export async function autoPriceShipments(
  shipmentIds: string[],
  actorId: string
): Promise<AutoPriceResult> {
  if (shipmentIds.length === 0) {
    return { priced: 0, skipped: 0, blocked: [] };
  }

  const cargo = await prisma.shipment.findMany({
    where: { id: { in: shipmentIds }, deletedAt: null },
    select: {
      id: true,
      trackingNumber: true,
      customerId: true,
      cargoCategory: true,
      cargoTypeId: true,
      weightKg: true,
      packages: true,
      arrivedAt: true,
      deliveredAt: true,
      invoice: { select: { id: true, status: true, storageWaivedUsd: true } },
    },
  });

  // One rate for the whole run, so eighty-seven drafts raised by one press of
  // one button cannot be denominated at two different rates. The rule book is
  // taken once for the same reason — and because re-reading the same small
  // table per line priced a manifest in hundreds of round trips.
  const [rate, pricebook] = await Promise.all([currentRateValue(), quoteContext()]);

  const blocked: AutoPriceResult["blocked"] = [];
  let skipped = 0;

  /*
    EVERY QUOTE FIRST, THEN THE WRITES.

    This used to open one interactive transaction per consignment — BEGIN,
    write, write, COMMIT, four round trips a line — so an eighty-seven box
    manifest cost the warehouse several hundred waits before the screen came
    back, and the wait grew with the flight.

    The reason it was per consignment was that a rate book gap on line forty
    must not roll back the thirty-nine drafts before it. Quoting every line
    before anything is written keeps that guarantee outright: a line with no
    price is known to be blocked BEFORE the writes start, and is never in them.
  */
  const blockedWrites: Prisma.PrismaPromise<unknown>[] = [];
  const updates: { invoiceId: string; shipmentId: string; figures: Figures; quoted: Quoted }[] = [];
  const creates: { shipmentId: string; customerId: string; figures: Figures; quoted: Quoted }[] = [];

  for (const shipment of cargo) {
    // Already confirmed, sent, part-paid or paid. Not ours to touch.
    if (shipment.invoice && shipment.invoice.status !== "DRAFT") {
      skipped += 1;
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
      blockedWrites.push(
        prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            pricingBlockedReason: quoted.message,
            pricingCheckedAt: new Date(),
          },
        })
      );
      continue;
    }

    const storageDays = storageDaysFor(shipment.arrivedAt, shipment.deliveredAt);
    /* A waiver survives a re-run. Check-in is re-runnable by design, and a
       draft whose fee Finance already forgave must not come back charged —
       the same rule confirmInvoicePrice applies at confirmation. */
    const waiverStands =
      shipment.invoice !== null &&
      toNumber(shipment.invoice.storageWaivedUsd ?? 0) > 0;
    const storageCharge = waiverStands
      ? 0
      : storageDays * STORAGE_POLICY.perDayUsd;
    const total = quoted.total + storageCharge;
    const totalLocal = rate === null ? null : toLocal(total, rate);

    const figures: Figures = {
      currency: quoted.currency,
      freightCost: new Prisma.Decimal(quoted.total),
      storageDays,
      storageCharge: new Prisma.Decimal(storageCharge),
      total: new Prisma.Decimal(total),
      exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
      localCurrency: LOCAL_CURRENCY,
      totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
      status: "DRAFT" as const,
    };

    if (shipment.invoice) {
      updates.push({
        invoiceId: shipment.invoice.id,
        shipmentId: shipment.id,
        figures,
        quoted,
      });
    } else {
      creates.push({
        shipmentId: shipment.id,
        customerId: shipment.customerId,
        figures,
        quoted,
      });
    }
  }

  /** What check-in stamps back onto the consignment beside its draft. */
  const stamp = (quoted: Quoted) => ({
    quotedAmount: new Prisma.Decimal(quoted.total),
    quoteCurrency: quoted.currency,
    quotedMethod: quoted.method,
    quotedRate: new Prisma.Decimal(quoted.rate),
    chargeableKg:
      quoted.chargeableWeightKg === null
        ? null
        : new Prisma.Decimal(quoted.chargeableWeightKg),
    currency: quoted.currency,
    pricingBlockedReason: null,
    pricingCheckedAt: new Date(),
  });

  /*
    WRITTEN IN SLICES, SO A FAILURE COSTS ONE SLICE.

    The old shape was a transaction per consignment, for a stated reason: a
    rate book gap on line forty must not roll back the thirty-nine drafts
    before it. Quoting first removes the pricing half of that — a line with no
    price never reaches these writes at all — but it does not remove the other
    half. A database error on line forty in ONE batch would still discard the
    thirty-nine, which is a worse failure than the one this was speeding up.

    Twenty at a time keeps effectively all of the round-trip saving, because
    what cost the time was the begin-and-commit per consignment rather than
    per flight, and bounds a failure to the slice it happened in. What
    committed before it stands, and check-in is re-runnable by design.
  */
  const SLICE = 20;
  const sliced = <T,>(rows: T[]) => {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += SLICE) out.push(rows.slice(i, i + SLICE));
    return out;
  };

  let priced = 0;

  /* The re-run path: every draft already exists, so this is pure updates. */
  for (const slice of sliced(updates)) {
    await prisma.$transaction(
      slice.flatMap((row) => [
        prisma.invoice.update({
          where: { id: row.invoiceId },
          data: row.figures,
        }),
        prisma.shipment.update({
          where: { id: row.shipmentId },
          data: stamp(row.quoted),
        }),
      ])
    );
    priced += slice.length;
  }

  /*
    The first run. The numbers are taken INSIDE the slice's own transaction,
    so a slice that rolls back rolls its numbers back with it — taking them
    outside left a hole in the invoice sequence that no document explains, and
    an unexplained gap in a numbered financial series is the thing an auditor
    asks about first.
  */
  for (const slice of sliced(creates)) {
    await prisma.$transaction(async (tx) => {
      const numbers = await reserveInvoiceNumbers(tx, slice.length);
      for (const [i, row] of slice.entries()) {
        await tx.invoice.create({
          data: {
            ...row.figures,
            invoiceNumber: numbers[i]!,
            shipmentId: row.shipmentId,
            customerId: row.customerId,
            issuedById: actorId,
          },
        });
        await tx.shipment.update({
          where: { id: row.shipmentId },
          data: stamp(row.quoted),
        });
      }
    });
    priced += slice.length;
  }

  /*
    LAST, AND NEVER IN FRONT OF THE MONEY.

    A blocked reason is advisory — it is re-derived on the next pricing run —
    while a draft that was never raised does not come back on its own. These
    used to run first as one transaction, so a failure writing a cosmetic
    sentence discarded every invoice on the flight. Each stands alone now and
    a failure among them is not allowed to take the drafts down.
  */
  for (const write of blockedWrites) {
    try {
      await write;
    } catch {
      /* The next check-in re-derives it. Nothing here is money. */
    }
  }

  return { priced, skipped, blocked };
}
