/**
 * The owner's own reconciliation examples, worked by hand and by the system.
 *
 *   npx tsx scripts/reconcile.ts
 *
 * Every figure below is stated as the arithmetic a person would do on paper,
 * then asked of the functions the application actually uses. A disagreement
 * here is a disagreement in somebody's books.
 */
import { invoiceBalance, paymentLabelFor } from "@/lib/invoice-balance";
import { invoiceStatusFor } from "@/lib/invoice-status";

type Case = {
  name: string;
  total: number;
  paid: number;
  adjusted: number;
  expect: {
    balance: number;
    overpaid: number;
    settled: boolean;
    status: string;
    label: string;
  };
};

/* Stated in shillings, as the owner stated them. */
const CASES: Case[] = [
  {
    name: "1 — exact payment",
    total: 100_000, paid: 100_000, adjusted: 0,
    expect: { balance: 0, overpaid: 0, settled: true, status: "PAID", label: "Paid" },
  },
  {
    name: "2 — underpayment",
    total: 100_000, paid: 95_000, adjusted: 0,
    expect: { balance: 5_000, overpaid: 0, settled: false, status: "PARTIALLY_PAID", label: "Partly paid — balance" },
  },
  {
    name: "3 — underpayment cleared by adjustment",
    total: 100_000, paid: 95_000, adjusted: 5_000,
    expect: { balance: 0, overpaid: 0, settled: true, status: "PAID", label: "Fully cleared — adjustment" },
  },
  {
    name: "4 — overpayment",
    total: 100_000, paid: 105_000, adjusted: 0,
    expect: { balance: 0, overpaid: 5_000, settled: true, status: "PAID", label: "Paid — overpaid" },
  },
  {
    name: "5 — nothing paid",
    total: 100_000, paid: 0, adjusted: 0,
    expect: { balance: 100_000, overpaid: 0, settled: false, status: "UNPAID", label: "Awaiting payment" },
  },
  /* The rounding cases the code claims to handle. */
  {
    name: "6 — one cent short is settled (tolerance)",
    total: 100_000, paid: 99_999.996, adjusted: 0,
    expect: { balance: 0, overpaid: 0, settled: true, status: "PAID", label: "Paid" },
  },
  {
    name: "7 — a dollar bill part-paid and part-cleared",
    total: 13.5, paid: 13.33, adjusted: 0.17,
    expect: { balance: 0, overpaid: 0, settled: true, status: "PAID", label: "Fully cleared — adjustment" },
  },
];

let failed = 0;

for (const c of CASES) {
  const b = invoiceBalance({ total: c.total, amountPaid: c.paid, amountAdjusted: c.adjusted });
  const status = invoiceStatusFor("UNPAID", c.paid, c.total, c.adjusted);
  const label = paymentLabelFor({ total: c.total, amountPaid: c.paid, amountAdjusted: c.adjusted });

  const checks: [string, unknown, unknown][] = [
    ["balance", b.balance, c.expect.balance],
    ["overpaid", b.overpaid, c.expect.overpaid],
    ["settled", b.settled, c.expect.settled],
    ["status", status, c.expect.status],
    ["label", label.label, c.expect.label],
  ];

  const bad = checks.filter(([, got, want]) => got !== want);
  if (bad.length) failed += 1;

  console.log(`${bad.length ? "FAIL" : "PASS"}  ${c.name}`);
  console.log(
    `      due ${c.total}  paid ${c.paid}  adjusted ${c.adjusted}` +
      `  ->  balance ${b.balance}  overpaid ${b.overpaid}  ${status}  "${label.label}"`
  );
  for (const [field, got, want] of bad) {
    console.log(`      ^ ${field}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
}

/* The release gate asks exactly one question, so ask it the same way. */
console.log("\nRelease eligibility (settled === may go):");
for (const c of CASES) {
  const b = invoiceBalance({ total: c.total, amountPaid: c.paid, amountAdjusted: c.adjusted });
  console.log(`  ${b.settled ? "ALLOWED " : "BLOCKED "} ${c.name}`);
}

console.log(failed === 0 ? "\nAll reconciliation cases agree." : `\n${failed} case(s) disagree.`);
process.exit(failed === 0 ? 0 : 1);
