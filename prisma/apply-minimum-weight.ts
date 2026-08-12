/**
 * Bill every consignment for at least one kilo, and re-price what was not.
 *
 *   npx tsx --conditions=react-server prisma/apply-minimum-weight.ts [--commit]
 *
 * Two steps, in this order:
 *
 *   1. Put a 1 kg minimum billable weight on every active weight-based rate.
 *      Anything lighter is charged as if it weighed a kilo — the freight
 *      industry's normal floor, and the quote tells the customer exactly that.
 *
 *   2. Re-price the invoices that were raised before the floor existed. A
 *      0.1 kg parcel had come out at USD 1.35 to fly Guangzhou to Dar, which
 *      does not cover handling it.
 *
 * ONLY touches invoices with nothing paid against them. An invoice a customer
 * has already paid, in part or in full, is a figure they were given and agreed
 * to; re-pricing it after the fact would change a bill under someone who has
 * already settled it. Those are listed and left alone.
 *
 * Dry unless --commit. Prints the database it is pointed at first.
 */

import { Prisma } from "@prisma/client";

import { STORAGE_POLICY, storageDaysFor } from "../lib/constants";
import { toNumber } from "../lib/format";
import { LOCAL_CURRENCY, currentRateValue, toLocal } from "../lib/fx";
import { quote } from "../lib/pricing";
import { prisma } from "../lib/prisma";

const COMMIT = process.argv.includes("--commit");
const MINIMUM_KG = 1;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(`\nDatabase: ${(url.match(/@([^/:?]+)/) ?? [])[1] ?? "?"}`);
  console.log(COMMIT ? "Mode:     COMMIT — this writes\n" : "Mode:     dry run\n");

  // ------------------------------------------------------------- the rate book
  const weightRules = await prisma.pricingRule.findMany({
    where: { active: true, method: "WEIGHT_BASED" },
    select: { id: true, category: true, price: true, minChargeableKg: true },
  });
  const needFloor = weightRules.filter(
    (r) => r.minChargeableKg === null || toNumber(r.minChargeableKg) < MINIMUM_KG
  );

  console.log(`Weight-based rates: ${weightRules.length}, of which ${needFloor.length} have no ${MINIMUM_KG} kg floor.`);
  for (const r of needFloor) {
    console.log(`  ${r.category.padEnd(16)} USD ${String(r.price)}/kg  ->  minimum ${MINIMUM_KG} kg`);
  }

  if (COMMIT && needFloor.length > 0) {
    await prisma.pricingRule.updateMany({
      where: { id: { in: needFloor.map((r) => r.id) } },
      data: { minChargeableKg: new Prisma.Decimal(MINIMUM_KG) },
    });
    console.log(`\n  ${needFloor.length} rate(s) updated.`);
  }

  // ------------------------------------------------------------ the invoices
  const light = await prisma.shipment.findMany({
    where: { weightKg: { lt: MINIMUM_KG }, deletedAt: null, invoice: { isNot: null } },
    select: {
      id: true, trackingNumber: true, weightKg: true, packages: true,
      cargoCategory: true, cargoTypeId: true, arrivedAt: true, deliveredAt: true,
      invoice: {
        select: {
          id: true, invoiceNumber: true, status: true, total: true,
          amountPaid: true, discount: true, otherCharges: true, freightOverride: true,
        },
      },
    },
    orderBy: { weightKg: "asc" },
  });

  console.log(`\nConsignments under ${MINIMUM_KG} kg with an invoice: ${light.length}\n`);

  const rate = await currentRateValue();
  let repriced = 0;
  const skipped: string[] = [];

  console.log("  tracking      kg    was      becomes   ");
  for (const s of light) {
    const inv = s.invoice!;
    if (toNumber(inv.amountPaid) > 0) {
      skipped.push(`${s.trackingNumber} (${inv.status}, ${inv.amountPaid} already paid)`);
      continue;
    }

    const priced = await quote({
      category: s.cargoCategory,
      cargoTypeId: s.cargoTypeId,
      weightKg: toNumber(s.weightKg),
      quantity: s.packages,
    });
    if (!priced.ok) {
      skipped.push(`${s.trackingNumber} (cannot be priced: ${priced.message})`);
      continue;
    }

    const storageDays = storageDaysFor(s.arrivedAt, s.deliveredAt);
    const storageCharge = storageDays * STORAGE_POLICY.perDayUsd;
    const billedFreight =
      inv.freightOverride === null ? priced.total : toNumber(inv.freightOverride);
    const total =
      billedFreight + storageCharge + toNumber(inv.otherCharges) - toNumber(inv.discount);

    console.log(
      `  ${s.trackingNumber}  ${String(s.weightKg).padStart(4)}  ${String(toNumber(inv.total).toFixed(2)).padStart(7)}  ->  ${total.toFixed(2).padStart(7)}`
    );

    if (COMMIT) {
      const totalLocal = rate === null ? null : toLocal(total, rate);
      await prisma.invoice.update({
        where: { id: inv.id },
        data: {
          freightCost: new Prisma.Decimal(priced.total),
          storageDays,
          storageCharge: new Prisma.Decimal(storageCharge),
          total: new Prisma.Decimal(total),
          exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
          localCurrency: LOCAL_CURRENCY,
          totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
        },
      });
      await prisma.shipment.update({
        where: { id: s.id },
        data: {
          quotedAmount: new Prisma.Decimal(priced.total),
          quotedRate: new Prisma.Decimal(priced.rate),
          chargeableKg:
            priced.chargeableWeightKg === null
              ? null
              : new Prisma.Decimal(priced.chargeableWeightKg),
        },
      });
    }
    repriced++;
  }

  console.log(`\n  ${repriced} invoice(s) ${COMMIT ? "re-priced" : "would be re-priced"}.`);
  if (skipped.length) {
    console.log(`  ${skipped.length} left alone:`);
    for (const s of skipped) console.log(`    ${s}`);
  }
  if (!COMMIT) console.log("\nRe-run with --commit to apply.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
