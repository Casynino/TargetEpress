import "server-only";

import { Prisma } from "@prisma/client";

import { STORAGE_POLICY, storageDaysFor } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { LOCAL_CURRENCY, currentRateValue, toLocal } from "@/lib/fx";
import { nextInvoiceNumber } from "@/lib/ids";
import { quote } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

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
      invoice: { select: { id: true, status: true } },
    },
  });

  // One rate for the whole run, so eighty-seven drafts raised by one press of
  // one button cannot be denominated at two different rates.
  const rate = await currentRateValue();

  const blocked: AutoPriceResult["blocked"] = [];
  let priced = 0;
  let skipped = 0;

  for (const shipment of cargo) {
    // Already confirmed, sent, part-paid or paid. Not ours to touch.
    if (shipment.invoice && shipment.invoice.status !== "DRAFT") {
      skipped += 1;
      continue;
    }

    const quoted = await quote({
      category: shipment.cargoCategory,
      cargoTypeId: shipment.cargoTypeId,
      weightKg: toNumber(shipment.weightKg),
      quantity: shipment.packages,
    });

    if (!quoted.ok) {
      blocked.push({
        trackingNumber: shipment.trackingNumber,
        reason: quoted.message,
      });
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          pricingBlockedReason: quoted.message,
          pricingCheckedAt: new Date(),
        },
      });
      continue;
    }

    const storageDays = storageDaysFor(shipment.arrivedAt, shipment.deliveredAt);
    const storageCharge = storageDays * STORAGE_POLICY.perDayUsd;
    const total = quoted.total + storageCharge;
    const totalLocal = rate === null ? null : toLocal(total, rate);

    const figures = {
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

    // One transaction per consignment rather than one for the batch: a rate
    // book gap on line 40 must not roll back the thirty-nine drafts before it.
    await prisma.$transaction(async (tx) => {
      if (shipment.invoice) {
        await tx.invoice.update({
          where: { id: shipment.invoice.id },
          data: figures,
        });
      } else {
        await tx.invoice.create({
          data: {
            ...figures,
            invoiceNumber: await nextInvoiceNumber(tx),
            shipmentId: shipment.id,
            customerId: shipment.customerId,
            issuedById: actorId,
          },
        });
      }

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
          currency: quoted.currency,
          pricingBlockedReason: null,
          pricingCheckedAt: new Date(),
        },
      });
    });

    priced += 1;
  }

  return { priced, skipped, blocked };
}
