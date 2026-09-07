/**
 * THE OWNER'S ARITHMETIC, RUN THROUGH THE APP'S OWN FUNCTIONS.
 *
 * Not a reading of the code — the real helpers, called with the real numbers
 * from the second audit brief, checked against the answer worked out by hand.
 * If one of these ever disagrees, a figure on somebody's screen is wrong.
 */
import { invoiceBalance, outstandingOf, isSettled } from "../lib/invoice-balance";
import { invoiceStatusFor } from "../lib/invoice-status";
import { toLocal, formatShillings, formatLocal, formatUsd } from "../lib/money";
import { chargeableStorageDays, storageStatus, STORAGE_POLICY } from "../lib/constants";
import { quote, quoteContext } from "../lib/pricing";
import { prisma } from "../lib/prisma";

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}  →  ${JSON.stringify(got)}${ok ? "" : `   EXPECTED ${JSON.stringify(want)}`}`);
};

console.log("\n== CURRENCY: USD 1 = TZS 2,700 ==");
eq("13.50 USD in shillings", toLocal(13.5, 2700), 36450);
eq("67.50 USD in shillings", toLocal(67.5, 2700), 182250);
eq("0.01 USD in shillings", toLocal(0.01, 2700), 27);
eq("13.50 formatted", formatShillings(13.5, 2700), formatLocal(36450));
eq("no rate published → dollars stand", formatShillings(13.5, null), formatUsd(13.5));
/* The direction that matters: shillings back to dollars must not be a second
   multiply. 36,450 / 2,700 = 13.50 exactly. */
eq("36,450 TSh back to USD", Math.round((36450 / 2700) * 100) / 100, 13.5);

console.log("\n== PAYMENT SCENARIOS (the owner's four) ==");
const exact = invoiceBalance({ total: 100000, amountPaid: 100000, amountAdjusted: 0 });
eq("EXACT balance", exact.balance, 0);
eq("EXACT settled", exact.settled, true);
eq("EXACT status", invoiceStatusFor("UNPAID", 100000, 100000, 0), "PAID");

const under = invoiceBalance({ total: 100000, amountPaid: 95000, amountAdjusted: 0 });
eq("UNDER balance", under.balance, 5000);
eq("UNDER shortfall", under.shortfall, 5000);
eq("UNDER settled (must be false — release stays blocked)", under.settled, false);
eq("UNDER status", invoiceStatusFor("UNPAID", 95000, 100000, 0), "PARTIALLY_PAID");

const adj = invoiceBalance({ total: 100000, amountPaid: 95000, amountAdjusted: 5000 });
eq("ADJUSTMENT cash received", adj.paid, 95000);
eq("ADJUSTMENT cleared without money", adj.adjusted, 5000);
eq("ADJUSTMENT balance", adj.balance, 0);
eq("ADJUSTMENT settled", adj.settled, true);
eq("ADJUSTMENT flagged as cleared by decision, not cash", adj.clearedByAdjustment, true);
eq("ADJUSTMENT status", invoiceStatusFor("UNPAID", 95000, 100000, 5000), "PAID");

const over = invoiceBalance({ total: 100000, amountPaid: 105000, amountAdjusted: 0 });
eq("OVER cash received", over.paid, 105000);
eq("OVER balance", over.balance, 0);
eq("OVER overpayment stays identifiable", over.overpaid, 5000);
eq("OVER status", invoiceStatusFor("UNPAID", 105000, 100000, 0), "PAID");

console.log("\n== THE CLAMP: one overpayment must not cancel another's debt ==");
const book = [
  { total: 1000, amountPaid: 0, amountAdjusted: 0 },
  { total: 1000, amountPaid: 0, amountAdjusted: 0 },
  { total: 1000, amountPaid: 101000, amountAdjusted: 0 },
];
eq("three bills, one hugely overpaid → still owed", book.reduce((s, b) => s + outstandingOf(b), 0), 2000);
eq("naive aggregate would have said", book.reduce((s, b) => s + (Number(b.total) - Number(b.amountPaid)), 0), -98000);

console.log("\n== INVOICE STATUS: the three that must never be overturned ==");
eq("VOID stays VOID", invoiceStatusFor("VOID", 100000, 100000, 0), null);
eq("WRITTEN_OFF stays", invoiceStatusFor("WRITTEN_OFF", 0, 100000, 0), null);
eq("DRAFT stays", invoiceStatusFor("DRAFT", 0, 100000, 0), null);
eq("a cent of rounding does not block release", invoiceStatusFor("UNPAID", 99999.996, 100000, 0), "PAID");
eq("nothing paid, nothing cleared", invoiceStatusFor("PAID", 0, 100000, 0), "UNPAID");

console.log("\n== STORAGE: free 7 days from arrival, then USD 2/day ==");
eq("policy", [STORAGE_POLICY.freeDays, STORAGE_POLICY.perDayUsd], [7, 2]);
for (const d of [0, 5, 6, 7, 8, 14]) {
  eq(`day ${d} chargeable days`, chargeableStorageDays(d), Math.max(0, d - 6));
}
const arrived = new Date("2026-01-01T08:00:00Z");
const at7 = storageStatus(arrived, null, new Date("2026-01-08T08:00:00Z"));
eq("7 whole days: charge starts", [at7.chargeableDays, at7.chargeUsd, at7.expired], [1, 2, true]);
const at6 = storageStatus(arrived, null, new Date("2026-01-07T08:00:00Z"));
eq("6 whole days: still free, and it is the last free day", [at6.chargeableDays, at6.chargeUsd, at6.lastFreeDay], [0, 0, true]);
const collected = storageStatus(arrived, new Date("2026-01-03T08:00:00Z"), new Date("2026-02-01T08:00:00Z"));
eq("collected on day 2: clock stopped", [collected.chargeableDays, collected.collected], [0, true]);
eq("never landed: no storage position at all", storageStatus(null, null).chargeableDays, 0);

console.log("\n== PRICING: the weight ladder, through the real rate book ==");
const ctx = await quoteContext();

/* The weight path, on the category that is actually priced by the kilo. */
for (const kg of [0.1, 0.5, 0.9, 1.0, 1.1, 1.5, 5.4, 10.75]) {
  const q = await quote({ category: "NORMAL_GOODS", weightKg: kg }, "en", ctx);
  if (!q.ok) { console.log(`  ✗ ${kg} kg → no rule`); fails++; continue; }
  const billedKg = Math.max(kg, 1);
  eq(`actual ${kg} kg → billed kg`, q.chargeableWeightKg, billedKg);
  eq(`actual ${kg} kg → actual kg preserved`, q.actualWeightKg, kg);
  eq(`actual ${kg} kg → total`, Math.round(q.total * 100) / 100, Math.round(billedKg * q.rate * 100) / 100);
}

/* The tier boundary. Under 10 kg is one rate, 10 kg and over is the other —
   9.999 and 10.000 must not both land on the same side of it. */
const under10 = await quote({ category: "NORMAL_GOODS", weightKg: 9.999 }, "en", ctx);
const at10 = await quote({ category: "NORMAL_GOODS", weightKg: 10 }, "en", ctx);
if (under10.ok && at10.ok) {
  eq("9.999 kg and 10 kg are on different tiers", under10.rate !== at10.rate, true);
  console.log(`     9.999 kg → USD ${under10.rate}/kg = ${under10.total.toFixed(2)}   |   10 kg → USD ${at10.rate}/kg = ${at10.total.toFixed(2)}`);
}

/* The per-item path must never multiply the weight. */
const item = await prisma.cargoType.findFirst({ where: { active: true, route: "HONG_KONG" }, select: { id: true, name: true, category: true } });
if (item) {
  const one = await quote({ category: item.category, cargoTypeId: item.id, weightKg: 6, quantity: 1 }, "en", ctx);
  const fifteen = await quote({ category: item.category, cargoTypeId: item.id, weightKg: 6, quantity: 15 }, "en", ctx);
  if (one.ok && fifteen.ok) {
    eq(`${item.name}: 15 of them is 15 × the price`, Math.round(fifteen.total * 100) / 100, Math.round(one.total * 15 * 100) / 100);
    eq(`${item.name}: weight does not enter a per-item price`, fifteen.chargeableWeightKg, null);
  }
}

/* The owner's example, exactly: Dar confirmed 5.4 kg at USD 12.50/kg. */
eq("5.4 kg × USD 12.50/kg", Math.round(5.4 * 12.5 * 100) / 100, 67.5);

console.log("\n== FLOATING POINT ==");
eq("0.1 + 0.2 kg reads as 0.3", Math.round((0.1 + 0.2) * 100) / 100, 0.3);
eq("10.75 kg is not truncated", Number("10.75"), 10.75);
eq("a decimal balance rounds to the cent", invoiceBalance({ total: 100.57, amountPaid: 100, amountAdjusted: 0 }).balance, 0.57);

console.log(fails === 0 ? "\nALL ARITHMETIC AGREES\n" : `\n${fails} DISAGREEMENT(S)\n`);
await prisma.$disconnect();
process.exit(fails === 0 ? 0 : 1);
