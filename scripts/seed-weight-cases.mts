/**
 * THE WEIGHT-AND-PRICE CASES, SET UP SO THEY CAN BE TRIED BY HAND.
 *
 *   npx tsx --conditions=react-server scripts/seed-weight-cases.mts
 *
 * Puts four consignments into the four states this behaviour has, prints where
 * to look at each one, and changes nothing else. Local only: it refuses to run
 * against anything that is not a database on this machine, because it rewrites
 * weights and bills to make a point.
 *
 * Re-runnable. Each case is written from scratch every time, so a case somebody
 * has already pressed the button on goes back to where it started.
 */
import { Prisma } from "@prisma/client";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error(
    "This only runs against a local database. It rewrites weights and bills."
  );
}

/** One case: the cargo, what is done to it, and what to look for. */
type Case = {
  tracking: string;
  what: string;
  look: string;
};

async function pick(where: Prisma.ShipmentWhereInput, skip: string[]) {
  return prisma.shipment.findFirst({
    where: {
      ...where,
      deletedAt: null,
      batchId: { not: null },
      trackingNumber: { notIn: skip },
      invoice: { isNot: null },
    },
    select: {
      id: true,
      trackingNumber: true,
      weightKg: true,
      batch: { select: { id: true, batchNumber: true } },
      customer: { select: { name: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
    },
    orderBy: { registeredAt: "desc" },
  });
}

const done: Case[] = [];
const used: string[] = [];

/* Clear whatever a previous run left, so every case starts from the book. */
async function reset(shipmentId: string, invoiceId: string) {
  await prisma.invoicePriceChange.deleteMany({ where: { invoiceId } });
  await prisma.fieldChange.deleteMany({
    where: { entityId: shipmentId, field: "weightKg", actorName: "Seeded" },
  });
}

// ── 1. Re-weighed, bill still on the old kilos ───────────────────────────────
{
  const s = await pick({ invoice: { status: { in: ["DRAFT", "UNPAID"] } } }, used);
  if (s) {
    used.push(s.trackingNumber);
    await reset(s.id, s.invoice!.id);
    const was = toNumber(s.weightKg);
    const now = Math.round((was + 60.5) * 10) / 10;
    await prisma.shipment.update({
      where: { id: s.id },
      data: {
        weightKg: new Prisma.Decimal(now),
        chargeableKg: new Prisma.Decimal(was),
        declaredWeightKg: null,
      },
    });
    await prisma.fieldChange.create({
      data: {
        entity: "Shipment",
        entityId: s.id,
        field: "weightKg",
        before: String(was),
        after: String(now),
        actorName: "Seeded",
      },
    });
    await prisma.invoice.update({
      where: { id: s.invoice!.id },
      data: { status: "UNPAID", amountPaid: 0, amountAdjusted: 0 },
    });
    done.push({
      tracking: s.trackingNumber,
      what: `booked ${was} kg, weighed ${now} kg, bill left on ${was}`,
      look: "Cargo page: the amber “This price is on the old weight” panel, with Re-price on it",
    });
  }
}

// ── 2. The same, with a rate Finance agreed ─────────────────────────────────
{
  const s = await pick({ invoice: { status: { in: ["DRAFT", "UNPAID"] } } }, used);
  if (s) {
    used.push(s.trackingNumber);
    await reset(s.id, s.invoice!.id);
    const was = toNumber(s.weightKg);
    const now = Math.round((was + 25) * 10) / 10;
    const agreed = 12.9;
    await prisma.shipment.update({
      where: { id: s.id },
      data: {
        weightKg: new Prisma.Decimal(now),
        chargeableKg: new Prisma.Decimal(was),
        declaredWeightKg: null,
      },
    });
    await prisma.fieldChange.create({
      data: {
        entity: "Shipment",
        entityId: s.id,
        field: "weightKg",
        before: String(was),
        after: String(now),
        actorName: "Seeded",
      },
    });
    await prisma.invoice.update({
      where: { id: s.invoice!.id },
      data: {
        status: "UNPAID",
        amountPaid: 0,
        amountAdjusted: 0,
        freightRateOverride: new Prisma.Decimal(agreed),
        freightRateMethod: "WEIGHT_BASED",
        freightRateQuantity: new Prisma.Decimal(was),
        freightOverride: new Prisma.Decimal(Math.round(agreed * was * 100) / 100),
        total: new Prisma.Decimal(Math.round(agreed * was * 100) / 100),
      },
    });
    done.push({
      tracking: s.trackingNumber,
      what: `agreed USD ${agreed}/kg on ${was} kg, now weighs ${now} kg`,
      look: `Re-price it: the agreed ${agreed} must survive — freight becomes ${now} × ${agreed}`,
    });
  }
}

// ── 3. Re-weighed, but the customer has already paid ────────────────────────
{
  const s = await pick({ invoice: { status: "PAID" } }, used);
  if (s) {
    used.push(s.trackingNumber);
    await reset(s.id, s.invoice!.id);
    const was = toNumber(s.weightKg);
    const now = Math.round((was + 18) * 10) / 10;
    await prisma.shipment.update({
      where: { id: s.id },
      data: {
        weightKg: new Prisma.Decimal(now),
        chargeableKg: new Prisma.Decimal(was),
        declaredWeightKg: null,
      },
    });
    await prisma.fieldChange.create({
      data: {
        entity: "Shipment",
        entityId: s.id,
        field: "weightKg",
        before: String(was),
        after: String(now),
        actorName: "Seeded",
      },
    });
    done.push({
      tracking: s.trackingNumber,
      what: `paid bill, booked ${was} kg, weighed ${now} kg`,
      look: "No Re-price button — money is on it. The lists say “Weight changed” only",
    });
  }
}

// ── 4. A price somebody moved, with the way back ────────────────────────────
{
  const s = await pick({ invoice: { status: { in: ["DRAFT", "UNPAID"] } } }, used);
  const hawa = await prisma.user.findFirst({
    where: { email: "support@targetexpress.co.tz" },
    select: { id: true },
  });
  if (s && hawa) {
    used.push(s.trackingNumber);
    await reset(s.id, s.invoice!.id);
    const invoice = await prisma.invoice.findUnique({
      where: { id: s.invoice!.id },
      select: { total: true, freightCost: true, storageCharge: true, otherCharges: true, discount: true, currency: true },
    });
    const before = toNumber(invoice!.total);
    const after = Math.round(before * 1.4 * 100) / 100;
    await prisma.invoice.update({
      where: { id: s.invoice!.id },
      data: {
        status: "UNPAID",
        amountPaid: 0,
        amountAdjusted: 0,
        freightOverride: new Prisma.Decimal(after - toNumber(invoice!.storageCharge)),
        total: new Prisma.Decimal(after),
      },
    });
    await prisma.invoicePriceChange.create({
      data: {
        invoiceId: s.invoice!.id,
        currency: invoice!.currency,
        totalBefore: new Prisma.Decimal(before),
        freightBefore: null,
        rateBefore: null,
        storageBefore: invoice!.storageCharge,
        otherBefore: invoice!.otherCharges,
        discountBefore: invoice!.discount,
        totalAfter: new Prisma.Decimal(after),
        reason: "Typed by mistake — try undoing it.",
        changedById: hawa.id,
      },
    });
    done.push({
      tracking: s.trackingNumber,
      what: `price moved ${invoice!.currency} ${before.toFixed(2)} → ${after.toFixed(2)} by Hawa`,
      look: "Cargo page as Hawa: “This price was changed” with Undo — back to the old figure",
    });
  }
}

console.log("\nFOUR CASES, READY TO TRY\n");
for (const c of done) {
  console.log(`  ${c.tracking}  —  ${c.what}`);
  console.log(`      look:  ${c.look}`);
  console.log(`      open:  /app/cargo/${c.tracking}\n`);
}
await prisma.$disconnect();
