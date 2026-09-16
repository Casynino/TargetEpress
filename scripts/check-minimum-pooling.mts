/**
 * THE ROUTE'S MINIMUM IS CHARGED ONCE PER CUSTOMER, PER FLIGHT.
 *
 * Drives the real autoPriceShipments against real cargo, because the rule it
 * is checking is not one function's arithmetic — it is what a customer ends up
 * owing across several bills, which only the whole path produces.
 *
 * Needs the local database and the seeded rate book:
 *   npx tsx --conditions=react-server scripts/check-minimum-pooling.mts
 *
 * Every case wipes the board first. Without that each case pooled with the
 * leftovers of the one before it — same customer, same flight — and reported
 * six failures that had nothing to do with the code.
 */
import { prisma } from "@/lib/prisma";
import { autoPriceShipments } from "@/lib/auto-price";
import { toNumber } from "@/lib/format";

const BATCH_A = "cmtq60p8e0001sbwj6lk8i27a";
const BATCH_B = "cmt2hbt6b023wsbzlphxu4ezo";
const CUST_1 = "cmt2hbebb0236sbzl7s6u2rl2";
const CUST_2 = "cmt2hbkzm023hsbzl6pn23csy";
const GENERAL = "cms7lcbkl0008y8u1oodevmxl";
const BAGS = "cms7h4acy0002y8e5kaahg14s";
const ACTOR = "cms7eq2ew000ky8fma02kqgms";

let n = 0;
async function ship(kg: number, opts: { cust?: string; batch?: string; type?: string } = {}) {
  n += 1;
  const tn = `ZZT-${String(n).padStart(3, "0")}`;
  const s = await prisma.shipment.create({
    data: {
      trackingNumber: tn, qrToken: tn.toLowerCase(),
      customerId: opts.cust ?? CUST_1,
      batchId: opts.batch ?? BATCH_A,
      cargoCategory: "NORMAL_GOODS", cargoTypeId: opts.type ?? GENERAL,
      goodsType: "GENERAL_MERCHANDISE", description: "test",
      weightKg: kg, packages: 1, status: "RECEIVED_AT_DAR",
      arrivedAt: new Date("2026-09-10T00:00:00Z"), origin: "GUANGZHOU",
    },
    select: { id: true, trackingNumber: true },
  });
  return s;
}

async function totals(ids: string[]) {
  const rows = await prisma.shipment.findMany({
    where: { id: { in: ids } },
    select: { trackingNumber: true, weightKg: true, invoice: { select: { total: true, freightCost: true } } },
    orderBy: { trackingNumber: "asc" },
  });
  return rows.map((r) => ({
    tn: r.trackingNumber, kg: toNumber(r.weightKg),
    freight: toNumber(r.invoice?.freightCost ?? 0),
    total: toNumber(r.invoice?.total ?? 0),
  }));
}

let fails = 0;

/* Each case runs against an EMPTY board — and "empty" means every ZZ- prefix,
   not just this file's. A stray consignment left behind by another test sat on
   the same customer and the same flight, joined every pool, and reported nine
   failures that had nothing to do with the code. Without this every case pooled with
   the leftovers of the one before it — same customer, same flight — and six
   cases failed for a reason that had nothing to do with the code. */
async function wipe() {
  const rows = await prisma.shipment.findMany({
    where: { trackingNumber: { startsWith: "ZZ" } },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  await prisma.invoice.deleteMany({ where: { shipmentId: { in: ids } } });
  await prisma.shipment.deleteMany({ where: { id: { in: ids } } });
}
await wipe();
async function check(label: string, ids: string[], expectSum: number, detail?: string) {
  const rows = await totals(ids);
  const sum = Math.round(rows.reduce((n2, r) => n2 + r.total, 0) * 100) / 100;
  const ok = Math.abs(sum - expectSum) < 0.005;
  if (!ok) fails++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label.padEnd(46)} USD ${sum.toFixed(2)} (expected ${expectSum.toFixed(2)})`);
  console.log(`        ${rows.map((r) => `${r.tn} ${r.kg}kg→${r.freight.toFixed(2)}`).join("   ")}${detail ? "   " + detail : ""}`);
}

// 1. The reported case: 0.1 + 0.8 on one flight, one customer.
{
  const a = await ship(0.8, { type: BAGS }), b = await ship(0.1);
  await autoPriceShipments([a.id, b.id], ACTOR);
  await check("0.1 + 0.8, same customer & flight", [a.id, b.id], 13.5, "was 27.00");
  await wipe();
}

// 2. Combined weight ABOVE the minimum — must bill the real weight, not one minimum.
{
  const a = await ship(0.8), b = await ship(0.8);
  await autoPriceShipments([a.id, b.id], ACTOR);
  await check("0.8 + 0.8 = 1.6 kg (over the minimum)", [a.id, b.id], 21.6, "1.6 × 13.50; was 27.00");
  await wipe();
}

// 3. A box above the minimum must never be touched.
{
  const a = await ship(50), b = await ship(0.1);
  await autoPriceShipments([a.id, b.id], ACTOR);
  await check("50 kg + 0.1 kg — the big one untouched", [a.id, b.id], 50 * 12.5 + 13.5, "50kg at the >10kg tier + its own minimum");
  await wipe();
}

// 4. Different customers must not pool.
{
  const a = await ship(0.1), b = await ship(0.1, { cust: CUST_2 });
  await autoPriceShipments([a.id, b.id], ACTOR);
  await check("0.1 + 0.1, DIFFERENT customers", [a.id, b.id], 27, "each pays its own minimum");
  await wipe();
}

// 5. Same customer, different flights must not pool.
{
  const a = await ship(0.1), b = await ship(0.1, { batch: BATCH_B });
  await autoPriceShipments([a.id, b.id], ACTOR);
  await check("0.1 + 0.1, DIFFERENT flights", [a.id, b.id], 27, "each flight has its own minimum");
  await wipe();
}

// 6. Three parcels, all tiny.
{
  const a = await ship(0.2), b = await ship(0.3), c = await ship(0.1);
  await autoPriceShipments([a.id, b.id, c.id], ACTOR);
  await check("0.2 + 0.3 + 0.1 = 0.6 kg", [a.id, b.id, c.id], 13.5, "one minimum, not three");
  await wipe();
}

// 7. A sibling whose bill Finance has already confirmed keeps the charge.
{
  const a = await ship(0.8), b = await ship(0.1);
  await autoPriceShipments([a.id], ACTOR);
  await prisma.invoice.updateMany({ where: { shipmentId: a.id }, data: { status: "UNPAID" } });
  await autoPriceShipments([b.id], ACTOR);
  /* The confirmed bill keeps its figure — it is not ours to move — and the
     late arrival goes to zero rather than paying the minimum a second time. */
  await check("sibling already billed keeps the minimum", [a.id, b.id], 13.5, "confirmed bill untouched, new one zeroed");
  await wipe();
}


// 8. THE ONE THAT WAS BROKEN: re-pricing must not re-charge the minimum.
{
  const a = await ship(0.8), b = await ship(0.1);
  await autoPriceShipments([a.id, b.id], ACTOR);
  /* Confirmation re-prices, and it used to quote each consignment ALONE — so
     the desk doing its job put the second minimum straight back. The rule the
     action now calls is poolShareFor; ask it for both, in both orders. */
  const { poolShareFor } = await import("@/lib/minimum-pool");
  const sa = await poolShareFor(a.id);
  const sb = await poolShareFor(b.id);
  const sum = (sa?.freight ?? 0) + (sb?.freight ?? 0);
  const ok = Math.abs(sum - 13.5) < 0.005;
  if (!ok) fails++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${"re-pricing both keeps one minimum".padEnd(46)} USD ${sum.toFixed(2)} (expected 13.50)`);
  console.log(`        ${a.trackingNumber} 0.8kg→${(sa?.freight ?? 0).toFixed(2)}   ${b.trackingNumber} 0.1kg→${(sb?.freight ?? 0).toFixed(2)}   carrier ${sa?.carrierTracking}`);
  await wipe();
}

// 9. A sibling already CONFIRMED and carrying the charge keeps it.
{
  const a = await ship(0.1);
  await autoPriceShipments([a.id], ACTOR);
  await prisma.invoice.updateMany({ where: { shipmentId: a.id }, data: { status: "UNPAID" } });
  const b = await ship(0.8);
  await autoPriceShipments([b.id], ACTOR);
  const { poolShareFor } = await import("@/lib/minimum-pool");
  const sb = await poolShareFor(b.id);
  const rows = await totals([a.id, b.id]);
  const sum = Math.round(rows.reduce((n2, r) => n2 + r.total, 0) * 100) / 100;
  const ok = Math.abs(sum - 13.5) < 0.005;
  if (!ok) fails++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${"light one billed first, heavy lands later".padEnd(46)} USD ${sum.toFixed(2)} (expected 13.50)`);
  console.log(`        ${rows.map(r=>`${r.tn} ${r.kg}kg→${r.freight.toFixed(2)}`).join("   ")}   carrier ${sb?.carrierTracking}`);
  await wipe();
}

await wipe();
console.log(fails === 0 ? "\nEvery case correct." : `\n${fails} FAILED`);
await prisma.$disconnect();
process.exit(fails === 0 ? 0 : 1);
