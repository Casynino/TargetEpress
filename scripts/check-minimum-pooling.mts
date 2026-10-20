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
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { autoPriceShipments } from "@/lib/auto-price";
import { toNumber } from "@/lib/format";

/*
  FLIGHTS OF ITS OWN, CREATED PER RUN.

  These were two real batches out of the seed, and one of them already carried
  a real 8.1 kg consignment belonging to the test customer. Every case that
  put a light parcel on that flight was therefore quietly sharing it with
  cargo the case never mentioned — invisible while the pool ignored heavy
  siblings, and the moment it stopped ignoring them, a case about two
  DIFFERENT customers started failing for a reason that had nothing to do with
  customers. A fixture that shares a flight with real data is not a fixture.
*/
const stamp = Date.now().toString(36).toUpperCase();
const madeBatches: string[] = [];
async function flight(suffix: string) {
  const batch = await prisma.batch.create({
    data: {
      batchNumber: `ZZB-${stamp}-${suffix}`,
      origin: "GUANGZHOU",
      status: "ARRIVED",
    },
    select: { id: true },
  });
  madeBatches.push(batch.id);
  return batch.id;
}
const BATCH_A = await flight("A");
const BATCH_B = await flight("B");
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
      arrivedAt: new Date(), origin: "GUANGZHOU",
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
/*
  SUMMED ON FREIGHT, NOT ON THE BILL TOTAL.

  These cases are about one rule: the route's minimum, charged once. Totalling
  the bills folded STORAGE in with it, and storage runs on a clock — so every
  expectation here silently went four dollars wrong the day the calendar passed
  the free week on fixtures pinned to a fixed arrival date. The figures had been
  right all along; the guard was measuring something it was not testing.

  Storage has its own case further down, which reads the total on purpose.
*/
async function check(label: string, ids: string[], expectSum: number, detail?: string) {
  const rows = await totals(ids);
  const sum = Math.round(rows.reduce((n2, r) => n2 + r.freight, 0) * 100) / 100;
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

/*
  3b. THE OWNER'S SECOND REPORT, FROM GZ-36.

  Peter Komba, 1.5 kg and 0.7 kg on one aircraft, billed 20.25 + 13.50 = 33.75:
  the heavy parcel was not lifted by the minimum, so the pool ignored it and
  left the light one alone to pay a whole kilo for 0.7. His words: "still its
  calculated as 1 kg only".

  The customer has 2.2 kg on that flight. The minimum is a floor under their
  cargo, and 2.2 clears it, so nothing should be lifted to anything: 2.2 ×
  13.50 = 29.70, and they are owed back the 0.3 kg of air they were charged.
*/
{
  const a = await ship(1.5), b = await ship(0.7);
  await autoPriceShipments([a.id, b.id], ACTOR);
  await check("1.5 + 0.7 = 2.2 kg, one of them under the minimum", [a.id, b.id], 29.7, "2.2 × 13.50; was 33.75");
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

// --- The owner's own worked examples, in his numbers. ---

// 0.3 + 0.4 = 0.7 kg  →  bill 1 kg  →  13.50
{
  const a = await ship(0.3), b = await ship(0.4);
  await autoPriceShipments([a.id, b.id], ACTOR);
  await check("owner's example 1: 0.3 + 0.4 = 0.7 kg", [a.id, b.id], 13.5, "bill 1 kg, not 2");
  await wipe();
}

// 0.2 + 0.3 + 0.4 = 0.9 kg  →  bill 1 kg  →  13.50
{
  const a = await ship(0.2), b = await ship(0.3), c = await ship(0.4);
  await autoPriceShipments([a.id, b.id, c.id], ACTOR);
  await check("owner's example 2: 0.2 + 0.3 + 0.4 = 0.9 kg", [a.id, b.id, c.id], 13.5, "bill 1 kg, not 3");
  await wipe();
}

// 0.6 + 0.8 = 1.4 kg  →  bill 1.4 kg, NOT rounded up to 2
{
  const a = await ship(0.6), b = await ship(0.8);
  await autoPriceShipments([a.id, b.id], ACTOR);
  await check("owner's example 3: 0.6 + 0.8 = 1.4 kg", [a.id, b.id], 18.9, "1.4 × 13.50; NOT rounded to 2 kg");
  await wipe();
}

// 10. THE POOL MUST NAME THE SAME CARRIER WHICHEVER MEMBER IS ASKED.
{
  const a = await ship(0.8), b = await ship(0.1);
  await autoPriceShipments([a.id, b.id], ACTOR);
  /* Both bills confirmed and both carrying freight — the state every bill
     raised before this rule is in. Asking about one used to treat the other
     as "already billed" and itself as not, so the two answers named different
     carriers and two screens disagreed about which bill holds the charge. */
  await prisma.invoice.updateMany({
    where: { shipmentId: { in: [a.id, b.id] } },
    data: { status: "UNPAID" },
  });
  await prisma.invoice.updateMany({ where: { shipmentId: b.id }, data: { freightCost: 13.5, total: 13.5 } });
  const { poolShareFor } = await import("@/lib/minimum-pool");
  const sa = await poolShareFor(a.id);
  const sb = await poolShareFor(b.id);
  const agree = sa?.carrierTracking === sb?.carrierTracking;
  if (!agree) fails++;
  console.log(`${agree ? "  ok  " : "  FAIL"}  ${"same carrier whichever member is asked".padEnd(46)} ${sa?.carrierTracking} / ${sb?.carrierTracking}`);
  await wipe();
}

// 11. STORAGE IS PER CONSIGNMENT AND IS NOT POOLED.
{
  const a = await ship(0.8), b = await ship(0.1);
  await autoPriceShipments([a.id, b.id], ACTOR);
  /* The zeroed bill sat on the floor past its free week. Its freight is
     nothing; its storage is still its own, and the bill must ask for it. */
  await prisma.invoice.updateMany({
    where: { shipmentId: b.id },
    data: { storageCharge: 4, storageDays: 2, total: 4 },
  });
  const rows = await totals([a.id, b.id]);
  const zeroed = rows.find((r) => r.kg === 0.1)!;
  const ok = Math.abs(zeroed.total - 4) < 0.005 && Math.abs(zeroed.freight) < 0.005;
  if (!ok) fails++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${"storage stays on a zero-freight bill".padEnd(46)} freight ${zeroed.freight.toFixed(2)} + storage = total ${zeroed.total.toFixed(2)}`);
  await wipe();
}

// 12. PER-ITEM CARGO HAS NO WEIGHT MINIMUM, SO IT NEVER POOLS.
{
  const a = await prisma.shipment.create({
    data: {
      trackingNumber: "ZZT-P1", qrToken: "zzt-p1x", customerId: CUST_1, batchId: BATCH_A,
      cargoCategory: "ELECTRONICS", cargoTypeId: "cms7h4adl000hy8e5plz73lcp",
      goodsType: "ELECTRONICS", description: "laptop", weightKg: 0.3, packages: 1,
      status: "RECEIVED_AT_DAR", arrivedAt: new Date(), origin: "GUANGZHOU",
    }, select: { id: true, trackingNumber: true },
  });
  const b = await ship(0.1);
  await autoPriceShipments([a.id, b.id], ACTOR);
  const rows = await totals([a.id, b.id]);
  const laptop = rows.find((r) => r.tn === "ZZT-P1")!;
  const parcel = rows.find((r) => r.tn !== "ZZT-P1")!;
  /* The laptop is USD 45 a piece and the parcel keeps its own minimum. */
  const ok = Math.abs(laptop.freight - 45) < 0.005 && Math.abs(parcel.freight - 13.5) < 0.005;
  if (!ok) fails++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${"per-item cargo never pools".padEnd(46)} laptop ${laptop.freight.toFixed(2)} · parcel ${parcel.freight.toFixed(2)}`);
  await wipe();
}

/* The correction button and a price set by hand.
   Not driven end to end here (the action needs a signed-in session); these hold
   the three rules the screen was tested against. */
{
  const act = readFileSync("lib/actions/pooling.ts", "utf8");
  const ui = readFileSync("components/app/apply-pooled-minimum.tsx", "utf8");
  const rules: [string, boolean][] = [
    ["a hand-set price is refused unless the shared minimum was chosen", /handSetFreight\)/.test(act) && /agreedBills\.length > 0 && !replaceAgreed/.test(act)],
    ["the choice is a tick box that holds the button until it is ticked", /name="replaceAgreed"/.test(ui) && /disabled=\{handSet\.length > 0 && !replace\}/.test(ui)],
    ["what was replaced is written to the audit line", /replacedHandSetPrices/.test(act)],
    ["the correction can never raise what a customer pays", /total > before \+ 0\.005/.test(act)],
    ["a payment or a dead bill is still refused", /already has money against it/.test(act) && /\["VOID", "WRITTEN_OFF", "CANCELLED"\]/.test(act)],
  ];
  for (const [label, pass] of rules) {
    if (!pass) fails++;
    console.log(`${pass ? "  ok  " : "  FAIL"}  ${label}`);
  }
}

await wipe();
console.log(fails === 0 ? "\nEvery case correct." : `\n${fails} FAILED`);
await prisma.$disconnect();
process.exit(fails === 0 ? 0 : 1);

/* The flights this run made, gone with the cargo that was on them. */
await prisma.batch.deleteMany({ where: { id: { in: madeBatches } } });
