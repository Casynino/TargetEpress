/* Temporary review harness — deleted after the check. */
import { reportToPdf } from "@/lib/report-pdf";
import { statementToPdf } from "@/lib/statement-pdf";
import { presentReport } from "@/lib/reports";

const raw = {
  key: "income",
  title: "Income",
  caption: "Every confirmed bill in the period.",
  columns: [
    { key: "invoice", label: "Invoice" },
    { key: "date", label: "Date" },
    { key: "customer", label: "Customer" },
    { key: "tracking", label: "Cargo" },
    { key: "flight", label: "Batch" },
    { key: "billed", label: "Billed", numeric: true, money: true },
    { key: "paid", label: "Paid", numeric: true, money: true },
    { key: "due", label: "Still owed", numeric: true, money: true },
  ],
  rows: Array.from({ length: 90 }, (_, i) => ({
    invoice: `INV-00${i}`,
    date: "2026-08-01",
    customer: "A very long customer name limited company",
    tracking: `TX-0001${i}`,
    flight: "TX-BATCH-12",
    billed: 1234.5 + i,
    paid: 1000,
    due: 234.5 + i,
  })),
  totals: { billed: 111105, paid: 90000, due: 21105 },
};

const ledgerRaw = {
  key: "ledger",
  title: "General ledger",
  caption: "Every movement of money.",
  columns: [
    { key: "date", label: "Date" },
    { key: "entry", label: "Entry" },
    { key: "type", label: "Type" },
    { key: "description", label: "Description" },
    { key: "account", label: "Account" },
    { key: "currency", label: "Currency" },
    { key: "debit", label: "Debit", numeric: true },
    { key: "credit", label: "Credit", numeric: true },
    { key: "balance", label: "Balance", numeric: true },
    { key: "recordedBy", label: "Recorded by" },
  ],
  rows: [
    {
      date: "2026-08-01",
      entry: "LE-1",
      type: "PAYMENT",
      description: "Guangzhou → Dar es Salaam freight",
      account: "NMB",
      currency: "TZS",
      debit: null,
      credit: 250000,
      balance: 250000,
      recordedBy: "Finance",
    },
  ],
  totals: { debit: 0, credit: 250000 },
};

const empty = { ...raw, rows: [], totals: undefined };

for (const [name, r, unit] of [
  ["income-usd", raw, "USD"],
  ["income-tzs", raw, "TZS"],
  ["ledger-tzs", ledgerRaw, "TZS"],
  ["empty-tzs", empty, "TZS"],
] as const) {
  const shown = presentReport(r as never, { unit: unit as never, rate: 2700 });
  const pdf = reportToPdf(shown, {
    period: "2026-08-01 to 2026-08-31",
    currencyNote: shown.currencyNote,
    unitLabel: shown.unitLabel,
    preparedBy: "Reviewer",
  });
  console.log(name, "bytes", pdf.length, "| note:", shown.currencyNote);
  console.log("   labels:", shown.columns.map((c) => c.label).join(" | "));
}

const pl = {
  revenue: 120000,
  costs: 80000,
  profit: 40000,
  margin: 33.3,
  cashIn: 90000,
  cashOut: 70000,
  netCash: 20000,
  invoices: 42,
  categories: [
    { category: "FREIGHT", amount: 50000 },
    { category: "CUSTOMS", amount: 20000 },
    { category: "SALARIES", amount: 10000 },
  ],
  specialCosts: 5000,
  specialCount: 2,
  profitAfterSpecial: 35000,
};
const prior = { ...pl, revenue: 100000, costs: 90000, cashIn: 0 };

const dash = {
  pl,
  revenue: {
    expectedUsd: 120000,
    collectedUsd: 90000,
    outstandingUsd: 30000,
    collectionRate: 75,
    byOrigin: [{ origin: "GUANGZHOU", expectedUsd: 80000, collectedUsd: 60000 }],
    topCustomers: [
      { name: "Mama Ntilie Traders Limited", expectedUsd: 40000, outstandingUsd: 12000 },
      { name: "Settled Customer", expectedUsd: 10000, outstandingUsd: 0 },
    ],
  },
  expenses: {
    batchUsd: 60000,
    officeUsd: 20000,
    specialUsd: 5000,
    totalUsd: 85000,
    byCategory: [
      { category: "FREIGHT", amount: 50000, share: 58.8 },
      { category: "CUSTOMS", amount: 20000, share: 23.5 },
    ],
  },
  batches: Array.from({ length: 14 }, (_, i) => ({
    batchNumber: `TX-B${i}`,
    origin: "GUANGZHOU",
    kg: 1234.5,
    expectedUsd: 22913.415,
    collectedUsd: 12000,
    outstandingUsd: 10913,
    profitUsd: -500,
  })),
  position: {
    accounts: [
      { name: "NMB Main", currency: "TZS", balance: 22913415, balanceUsd: 8486 },
      { name: "Cash tin", currency: "USD", balance: 500, balanceUsd: 500 },
    ],
    cashUsd: 8986,
    receivableUsd: 30000,
    payableUsd: 4000,
    netUsd: 34986,
  },
  collections: {
    expectedUsd: 120000,
    collectedUsd: 90000,
    outstandingUsd: 30000,
    rate: 75,
    paid: 20,
    partiallyPaid: 12,
    unpaid: 10,
    awaitingVerification: 3,
  },
  volume: {
    kgReceived: 12345.6,
    kgBilled: 12000.2,
    kgCollected: 9000.9,
    packages: 812,
    customers: 96,
    batchesArrived: 6,
    batchesClosed: 4,
  },
  health: [
    { label: "Collection rate", value: "75%", explain: "Of what was billed.", tone: "good" },
    { label: "Overdue", value: "12", explain: "Bills past due.", tone: "bad" },
  ],
};

for (const unit of ["USD", "TZS"] as const) {
  const pdf = statementToPdf({
    dash: dash as never,
    pl: pl as never,
    prior: prior as never,
    rate: 2700,
    unit,
    periodLabel: "August 2026",
    periodDates: "1 Aug 2026 – 31 Aug 2026",
    previousLabel: "July 2026",
    producedBy: "Reviewer",
  });
  console.log("statement", unit, "bytes", pdf.length);
}

const noRate = statementToPdf({
  dash: dash as never,
  pl: pl as never,
  prior: prior as never,
  rate: null,
  unit: "TZS",
  periodLabel: "August 2026",
  periodDates: "1 Aug 2026 – 31 Aug 2026",
  previousLabel: "July 2026",
  producedBy: "Reviewer",
});
console.log("statement TZS-no-rate bytes", noRate.length);
