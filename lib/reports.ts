import "server-only";

import type { InvoiceStatus, Prisma } from "@prisma/client";

import {
  BILLED_INVOICE_STATUSES,
  STORAGE_POLICY,
  storageStatus,
} from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { prisma } from "@/lib/prisma";

/**
 * The reports Finance can pull, as data rather than as pages.
 *
 * One engine and one screen rather than fourteen near-identical routes. Every
 * report answers with the same shape — columns, rows, totals — so the filters,
 * the table and the download are written once and a new report is a query
 * rather than a page.
 *
 * Three rules hold across all of them.
 *
 * Money is reported in USD, because the business bills in dollars and holds
 * shillings, and a column that silently mixes the two is worse than no column.
 * Where the original currency matters — a shilling cost, a shilling account —
 * it is carried in its own column beside the dollar figure, never instead of
 * it.
 *
 * A draft invoice is not revenue. It is the system's own price, not something
 * a customer has agreed to, so every revenue figure here counts confirmed
 * bills only. That is the single most common way a report flatters a month.
 *
 * A written-off bill is neither revenue nor a debt — see `earned` below. It was
 * both here until now, which is the second most common way, and the one that
 * also sends somebody to ring a customer about money the office had already
 * given up on.
 */

export type ReportFilters = {
  from?: Date | null;
  to?: Date | null;
  batchId?: string | null;
  accountId?: string | null;
  category?: string | null;
  currency?: string | null;
};

export type ReportColumn = {
  key: string;
  label: string;
  /** Right-aligned and monospaced; also what the totals row sums. */
  numeric?: boolean;
  /**
   * A USD figure that may be restated in shillings.
   *
   * Not every number is money — a count of invoices, a margin percentage, an
   * age in days must never be multiplied by an exchange rate — and not every
   * money figure is convertible either: the ledger's debit, credit and balance
   * are already in the account's own currency and carry a Currency column
   * beside them, so they are deliberately NOT marked. Only columns that hold
   * dollars, and only dollars, are flagged here.
   */
  money?: boolean;
};

export type ReportResult = {
  key: string;
  title: string;
  /** One line saying what the reader is looking at, and what it excludes. */
  caption: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  /** Keyed by column. Absent for reports where a total is meaningless. */
  totals?: Record<string, number>;
};

/** Which money a report is written in. The reader chooses; nothing is doubled. */
export type ReportUnit = "USD" | "TZS";

/**
 * Restate a report in the currency the reader is working in.
 *
 * The owner's rule: one currency per document. "If I'm on USD I should get a
 * USD report, if I'm on TSh I should get a TSh report — not two." Printing
 * both columns doubles the width of every table to answer a question nobody
 * asked twice, so the screen's switch decides, and the document says which
 * money it is written in and at what rate.
 *
 * Only columns marked `money` move. Counts, ages, percentages and the ledger's
 * native-currency amounts are left exactly as they were — multiplying a margin
 * percentage by 2,700 is the kind of error that survives review because every
 * figure on the page is technically a number.
 */
export function presentReport(
  report: ReportResult,
  opts: { unit: ReportUnit; rate: number | null }
): ReportResult & { unit: ReportUnit; unitLabel: string; currencyNote: string } {
  const toShillings = opts.unit === "TZS" && opts.rate !== null;
  const unit: ReportUnit = toShillings ? "TZS" : "USD";
  const unitLabel = toShillings ? "TSh" : "USD";

  /* Amounts in the account's own currency, carried beside a Currency column.
     Named so the note can say plainly why they did not move. */
  const native = report.columns
    .filter((c) => c.numeric && !c.money)
    .filter((c) => ["debit", "credit", "balance"].includes(c.key));

  const convert = (value: string | number | null) => {
    if (!toShillings || typeof value !== "number") return value;
    return Math.round(value * (opts.rate as number));
  };

  const columns = report.columns.map((c) =>
    c.money
      ? {
          ...c,
          /* "USD" as a whole label becomes "TSh"; anything else gains the unit,
             because a spreadsheet column outlives the caption explaining it. */
          label: c.label === "USD" ? unitLabel : `${c.label} (${unitLabel})`,
        }
      : c
  );

  const moneyKeys = new Set(report.columns.filter((c) => c.money).map((c) => c.key));

  return {
    ...report,
    unit,
    unitLabel,
    columns,
    rows: toShillings
      ? report.rows.map((row) => {
          const next: Record<string, string | number | null> = { ...row };
          for (const key of moneyKeys) next[key] = convert(row[key] ?? null);
          return next;
        })
      : report.rows,
    totals:
      report.totals && toShillings
        ? Object.fromEntries(
            Object.entries(report.totals).map(([key, value]) => [
              key,
              moneyKeys.has(key) ? Math.round(value * (opts.rate as number)) : value,
            ])
          )
        : report.totals,
    currencyNote: (() => {
      /*
        A report with nothing convertible must not claim a currency.

        The ledger family — general ledger, bank, mobile money, petty cash —
        marks no column `money`, because Debit, Credit and Balance are each in
        the account's own currency. Nothing converts, correctly. But the note
        was written from the reader's chosen unit alone, so a register full of
        shilling entries printed "Money shown in dollars, as billed." under it
        the moment somebody switched to USD — a flat untruth sitting beneath
        the figures, in the same document whose header says "As recorded".
      */
      if (moneyKeys.size === 0) {
        return native.length > 0
          ? `${native.map((c) => c.label).join(", ")} are each in the account's own currency, shown in the Currency column. Nothing on this report is converted.`
          : "Nothing on this report is a money figure.";
      }
      if (toShillings) {
        return `Money shown in shillings, converted at USD 1 = TSh ${(opts.rate as number).toLocaleString("en-US")}, the rate in force when this was printed.${
          native.length > 0
            ? ` ${native.map((c) => c.label).join(", ")} are each in the account's own currency, shown in the Currency column, and are not converted.`
            : ""
        }`;
      }
      return opts.unit === "TZS"
        ? "No exchange rate has been published, so money is shown in dollars."
        : "Money shown in dollars, as billed.";
    })(),
  };
}

export const REPORTS = [
  { key: "profit-loss", label: "Profit & loss" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "expense-by-category", label: "Expenses by category" },
  { key: "batch-profit", label: "Batch profitability" },
  { key: "storage", label: "Warehouse storage" },
  { key: "receivables", label: "Accounts receivable" },
  { key: "outstanding", label: "Outstanding customer payments" },
  { key: "cash-flow", label: "Cash flow" },
  { key: "ledger", label: "General ledger" },
  { key: "bank", label: "Bank accounts" },
  { key: "mobile-money", label: "Mobile money" },
  { key: "petty-cash", label: "Cash and petty cash" },
  { key: "monthly-summary", label: "Monthly summary" },
  /* "Position summary", not "Financial statement": the statement is now a real
     multi-section document with its own download at the top of that section,
     and two different things under one name on one page is exactly the
     confusion to avoid. This is what it always was — the position on a page. */
  { key: "financial-statement", label: "Position summary" },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * What one bill earned, and what was given up on.
 *
 * A written-off bill is money the company has decided in writing it will never
 * see. Every report here counted its `total` as revenue, and every one with a
 * debt column counted `total − amountPaid` as still owed on top — so a month
 * that abandoned USD 1,240 read as a month that billed it and was still chasing
 * it, while the flight's own band (lib/batch-finance.ts:221) printed a different
 * revenue figure for the same batch.
 *
 * So it earns what was collected before the decision was taken, it owes
 * nothing, and the abandoned part is reported in its own column rather than
 * folded into either. Keeping it out of revenue is the schema's rule; keeping
 * it visible is the storage report's lesson — a month where the desk forgave
 * two million shillings must not read like a month where nothing happened.
 */
function earned(invoice: {
  status: InvoiceStatus;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
}) {
  const total = toNumber(invoice.total);
  const paid = toNumber(invoice.amountPaid);
  if (invoice.status === "WRITTEN_OFF") {
    return { billed: paid, paid, due: 0, writtenOff: Math.max(0, total - paid) };
  }
  return { billed: total, paid, due: Math.max(0, total - paid), writtenOff: 0 };
}

/** The date window, as a Prisma filter, or undefined when unbounded. */
function range(f: ReportFilters) {
  if (!f.from && !f.to) return undefined;
  return {
    ...(f.from ? { gte: f.from } : {}),
    ...(f.to ? { lt: f.to } : {}),
  };
}

/* ------------------------------------------------------------------ income */

async function income(f: ReportFilters): Promise<ReportResult> {
  const where = {
    /* A written-off bill stays in the row set on purpose and is neutralised per
       row by `earned`. Dropping it from the query instead would take the money
       collected before the write-off out of Paid as well, which really did come
       in and really is in the bank. */
    status: { notIn: ["DRAFT", "VOID"] as InvoiceStatus[] },
    ...(range(f) ? { issuedAt: range(f) } : {}),
    ...(f.batchId ? { shipment: { batchId: f.batchId } } : {}),
    ...(f.currency ? { currency: f.currency } : {}),
  };
  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: "desc" },
    take: 2000,
    select: {
      invoiceNumber: true,
      issuedAt: true,
      total: true,
      amountPaid: true,
      currency: true,
      status: true,
      shipment: {
        select: {
          trackingNumber: true,
          customer: { select: { name: true } },
          batch: { select: { batchNumber: true } },
        },
      },
    },
  });

  /* Worked out once per bill and read by both the rows and the totals line, so
     the two cannot answer "what did this month earn" differently. */
  const lines = invoices.map((invoice) => ({ invoice, ...earned(invoice) }));

  return {
    key: "income",
    title: "Income",
    caption:
      "Every confirmed bill raised in the window. Drafts are excluded — a draft is the system's price, not one a customer has agreed to. A bill that was later written off earns only what was collected before it was given up on; the rest is in Written off, which is neither income nor a debt.",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "date", label: "Issued" },
      { key: "customer", label: "Customer" },
      { key: "tracking", label: "Cargo" },
      { key: "flight", label: "Batch" },
      { key: "billed", label: "Billed", numeric: true, money: true },
      { key: "paid", label: "Paid", numeric: true, money: true },
      { key: "due", label: "Still owed", numeric: true, money: true },
      { key: "writtenOff", label: "Written off", numeric: true, money: true },
    ],
    rows: lines.map((l) => ({
      invoice: l.invoice.invoiceNumber,
      date: l.invoice.issuedAt.toISOString().slice(0, 10),
      customer: l.invoice.shipment?.customer?.name ?? "—",
      tracking: l.invoice.shipment?.trackingNumber ?? "—",
      flight: l.invoice.shipment?.batch?.batchNumber ?? "—",
      billed: money(l.billed),
      paid: money(l.paid),
      due: money(l.due),
      writtenOff: money(l.writtenOff),
    })),
    totals: {
      billed: money(lines.reduce((n, l) => n + l.billed, 0)),
      paid: money(lines.reduce((n, l) => n + l.paid, 0)),
      due: money(lines.reduce((n, l) => n + l.due, 0)),
      writtenOff: money(lines.reduce((n, l) => n + l.writtenOff, 0)),
    },
  };
}

/* ---------------------------------------------------------------- expenses */

async function expenses(f: ReportFilters): Promise<ReportResult> {
  const rows = await prisma.expense.findMany({
    where: {
      status: { not: "VOID" },
      ...(range(f) ? { incurredAt: range(f) } : {}),
      ...(f.batchId ? { batchId: f.batchId } : {}),
      ...(f.accountId ? { accountId: f.accountId } : {}),
      ...(f.category ? { category: f.category as never } : {}),
      ...(f.currency ? { currency: f.currency } : {}),
    },
    orderBy: { incurredAt: "desc" },
    take: 2000,
    select: {
      expenseNumber: true,
      incurredAt: true,
      description: true,
      category: true,
      expenseClass: true,
      vendor: true,
      amount: true,
      currency: true,
      amountUsd: true,
      status: true,
      account: { select: { name: true } },
      batch: { select: { batchNumber: true } },
      recordedBy: { select: { name: true } },
      _count: { select: { receipts: true } },
    },
  });

  return {
    key: "expenses",
    title: "Expenses",
    caption:
      "Every cost incurred in the window, cancelled ones excluded. Special costs are listed and marked, but they do not belong in operating profit.",
    columns: [
      { key: "number", label: "Number" },
      { key: "date", label: "Incurred" },
      { key: "description", label: "What for" },
      { key: "category", label: "Category" },
      { key: "kind", label: "Kind" },
      { key: "flight", label: "Batch" },
      { key: "account", label: "Paid from" },
      { key: "status", label: "Status" },
      { key: "proof", label: "Proof" },
      { key: "recordedBy", label: "Recorded by" },
      { key: "original", label: "Original" },
      { key: "usd", label: "USD", numeric: true, money: true },
    ],
    rows: rows.map((r) => ({
      number: r.expenseNumber,
      date: r.incurredAt.toISOString().slice(0, 10),
      description: r.description,
      category: r.category,
      kind:
        r.expenseClass === "NON_OPERATING"
          ? "Special"
          : r.batch
            ? "Batch"
            : "Office",
      flight: r.batch?.batchNumber ?? "—",
      account: r.account?.name ?? "not paid yet",
      status: r.status,
      // Named rather than counted: "missing" is the thing worth spotting.
      proof: r._count.receipts > 0 ? String(r._count.receipts) : "missing",
      recordedBy: r.recordedBy?.name ?? "—",
      original: `${r.currency} ${toNumber(r.amount).toLocaleString("en-US")}`,
      usd: money(toNumber(r.amountUsd)),
    })),
    totals: { usd: money(rows.reduce((n, r) => n + toNumber(r.amountUsd), 0)) },
  };
}

async function expenseByCategory(f: ReportFilters): Promise<ReportResult> {
  const grouped = await prisma.expense.groupBy({
    by: ["category"],
    where: {
      status: { not: "VOID" },
      expenseClass: "OPERATING",
      ...(range(f) ? { incurredAt: range(f) } : {}),
      ...(f.batchId ? { batchId: f.batchId } : {}),
    },
    _sum: { amountUsd: true },
    _count: true,
    orderBy: { _sum: { amountUsd: "desc" } },
  });

  const total = grouped.reduce((n, g) => n + toNumber(g._sum.amountUsd), 0);

  return {
    key: "expense-by-category",
    title: "Expenses by category",
    caption:
      "Operating costs only. Special costs are excluded here because this is the mix the business is managed on.",
    columns: [
      { key: "category", label: "Category" },
      { key: "count", label: "Records", numeric: true },
      { key: "usd", label: "USD", numeric: true, money: true },
      { key: "share", label: "Share", numeric: true },
    ],
    rows: grouped.map((g) => {
      const amount = toNumber(g._sum.amountUsd);
      return {
        category: g.category,
        count: g._count,
        usd: money(amount),
        share: total > 0 ? Math.round((amount / total) * 100) : 0,
      };
    }),
    totals: { usd: money(total), count: grouped.reduce((n, g) => n + g._count, 0) },
  };
}

/* ------------------------------------------------------------ batch profit */

async function batchProfit(f: ReportFilters): Promise<ReportResult> {
  const batches = await prisma.batch.findMany({
    where: {
      ...(f.batchId ? { id: f.batchId } : {}),
      ...(range(f) ? { departedAt: range(f) } : {}),
    },
    orderBy: [{ departedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      batchNumber: true,
      status: true,
      departedAt: true,
      shipments: {
        where: { deletedAt: null },
        select: {
          invoice: {
            select: {
              total: true,
              amountPaid: true,
              status: true,
              storageCharge: true,
            },
          },
        },
      },
      expenses: {
        where: { status: { not: "VOID" }, expenseClass: "OPERATING" },
        select: { amountUsd: true },
      },
    },
  });

  const rows = batches.map((b) => {
    const confirmed = b.shipments
      .map((s) => s.invoice)
      .filter(
        (invoice): invoice is NonNullable<typeof invoice> =>
          !!invoice && invoice.status !== "DRAFT" && invoice.status !== "VOID"
      );
    /* Revenue, collection and debt per bill rather than in three sweeps: a
       written-off bill contributes only what it collected and owes nothing, and
       the part given up on is its own column. A flight that closed by
       abandoning a fifth of its revenue used to show that fifth as revenue AND
       as outstanding, so its profit and its margin both read as if the debt
       were still coming. */
    let revenue = 0;
    let collected = 0;
    let outstanding = 0;
    let writtenOff = 0;
    for (const invoice of confirmed) {
      const line = earned(invoice);
      revenue += line.billed;
      collected += line.paid;
      outstanding += line.due;
      writtenOff += line.writtenOff;
    }
    const costs = b.expenses.reduce((n, e) => n + toNumber(e.amountUsd), 0);
    /* Part of revenue, not on top of it — shown separately because a batch
       that made its margin on late collection is a different business result
       from one that priced its freight well. What reached a bill, which is what
       the batch band and the storage report both count. */
    const storageRevenue = confirmed.reduce(
      (n, invoice) => n + toNumber(invoice.storageCharge),
      0
    );
    return {
      flight: b.batchNumber,
      status: b.status,
      departed: b.departedAt ? b.departedAt.toISOString().slice(0, 10) : "—",
      cargo: b.shipments.length,
      revenue: money(revenue),
      storage: money(storageRevenue),
      collected: money(collected),
      outstanding: money(outstanding),
      writtenOff: money(writtenOff),
      costs: money(costs),
      profit: money(revenue - costs),
      margin: revenue > 0 ? Math.round(((revenue - costs) / revenue) * 100) : 0,
    };
  });

  return {
    key: "batch-profit",
    title: "Batch profitability",
    caption:
      "What each batch billed, collected and cost. Revenue is billed rather than banked, so profit and margin here are expectations — only Collected is money in the bank. A batch with no costs recorded reads as pure profit, so check that column before believing the margin. Written off is debt this flight gave up on when it closed: it is out of revenue and out of Outstanding, and it is the column that explains a flight whose margin fell.",
    columns: [
      { key: "flight", label: "Batch" },
      { key: "status", label: "Status" },
      { key: "departed", label: "Departed" },
      { key: "cargo", label: "Cargo", numeric: true },
      { key: "revenue", label: "Expected revenue", numeric: true, money: true },
      { key: "storage", label: "of which storage", numeric: true, money: true },
      { key: "collected", label: "Collected", numeric: true, money: true },
      { key: "outstanding", label: "Outstanding", numeric: true, money: true },
      { key: "writtenOff", label: "Written off", numeric: true, money: true },
      { key: "costs", label: "Costs", numeric: true, money: true },
      { key: "profit", label: "Expected profit", numeric: true, money: true },
      { key: "margin", label: "Expected margin %", numeric: true },
    ],
    rows,
    totals: {
      revenue: money(rows.reduce((n, r) => n + Number(r.revenue), 0)),
      storage: money(rows.reduce((n, r) => n + Number(r.storage), 0)),
      collected: money(rows.reduce((n, r) => n + Number(r.collected), 0)),
      outstanding: money(rows.reduce((n, r) => n + Number(r.outstanding), 0)),
      writtenOff: money(rows.reduce((n, r) => n + Number(r.writtenOff), 0)),
      costs: money(rows.reduce((n, r) => n + Number(r.costs), 0)),
      profit: money(rows.reduce((n, r) => n + Number(r.profit), 0)),
    },
  };
}

/* ----------------------------------------------------------------- storage */

/**
 * What the warehouse clock earned, and what the desk let go.
 *
 * Storage was the one charge with no report behind it: the fee accrues by
 * itself off two dates, so nobody enters it and nobody could see it either —
 * a month where the counter forgave two million shillings looked exactly like
 * a month where nothing sat past its free days.
 *
 * Three separate figures, never merged. CALCULATED is what the policy
 * produced. CHARGED is what reached a bill. WAIVED is what somebody decided
 * not to collect, and it is the column to read: it is the only place the cost
 * of goodwill, or of our own delays, is visible at all.
 *
 * Days come from the same `storageStatus` the invoice and the customer's phone
 * use, so this report cannot drift from what either of them shows.
 */
async function storage(f: ReportFilters): Promise<ReportResult> {
  const shipments = await prisma.shipment.findMany({
    where: {
      deletedAt: null,
      arrivedAt: { not: null },
      ...(f.batchId ? { batchId: f.batchId } : {}),
      ...(range(f) ? { arrivedAt: range(f) } : {}),
    },
    orderBy: { arrivedAt: "desc" },
    take: 400,
    select: {
      trackingNumber: true,
      arrivedAt: true,
      deliveredAt: true,
      customer: { select: { name: true } },
      batch: { select: { batchNumber: true } },
      invoice: {
        select: {
          storageCharge: true,
          storageWaivedUsd: true,
          status: true,
        },
      },
    },
  });

  const rows = shipments.map((s) => {
    const st = storageStatus(s.arrivedAt, s.deliveredAt);
    /* A voided bill charged nobody and forgave nobody — it was a bill that
       should not have existed. Its status was read here and then ignored, so
       the same waiver appeared on this report and was refused by the flight's
       own band (lib/batch-finance.ts:192), giving one waiver two figures. */
    const live = s.invoice && s.invoice.status !== "VOID" ? s.invoice : null;
    const charged = toNumber(live?.storageCharge ?? 0);
    const waived = toNumber(live?.storageWaivedUsd ?? 0);
    /* Waived cargo is not "at risk" and not free either — it is forgiven, and
       it says so, because every other state here is a state of the clock. */
    const state = s.deliveredAt
      ? "Collected"
      : waived > 0
        ? "Waived"
        : st.expired
          ? "Charging"
          : st.lastFreeDay
            ? "Last free day"
            : "Free";
    return {
      tracking: s.trackingNumber,
      customer: s.customer?.name ?? "—",
      batch: s.batch?.batchNumber ?? "—",
      arrived: s.arrivedAt ? s.arrivedAt.toISOString().slice(0, 10) : "—",
      days: st.daysInWarehouse,
      over: st.chargeableDays,
      state,
      calculated: money(Math.max(st.chargeUsd, charged, waived)),
      charged: money(charged),
      waived: money(waived),
    };
  });

  const held = rows.filter((r) => r.state === "Charging").length;
  const forgiven = rows.filter((r) => r.state === "Waived").length;

  return {
    key: "storage",
    title: "Warehouse storage",
    caption:
      `Every consignment that landed in Dar in this period, how long it stayed and what that cost. ${STORAGE_POLICY.freeDays} days are free from the day it arrives; USD ${STORAGE_POLICY.perDayUsd} a day after that, and the clock stops when the cargo is collected. Calculated is what the policy produced, Charged is what reached a bill, and Waived is what the desk chose not to collect — read that column, it is the only record of what goodwill and our own delays cost. ${held} consignment(s) are charging right now; ${forgiven} had the fee waived.`,
    columns: [
      { key: "tracking", label: "Tracking" },
      { key: "customer", label: "Customer" },
      { key: "batch", label: "Batch" },
      { key: "arrived", label: "Arrived Dar" },
      { key: "days", label: "Days held", numeric: true },
      { key: "over", label: "Days over", numeric: true },
      { key: "state", label: "Status" },
      { key: "calculated", label: "Calculated", numeric: true, money: true },
      { key: "charged", label: "Charged", numeric: true, money: true },
      { key: "waived", label: "Waived", numeric: true, money: true },
    ],
    rows,
    totals: {
      calculated: money(rows.reduce((n, r) => n + Number(r.calculated), 0)),
      charged: money(rows.reduce((n, r) => n + Number(r.charged), 0)),
      waived: money(rows.reduce((n, r) => n + Number(r.waived), 0)),
    },
  };
}

/* ------------------------------------------------------------ receivables */


/**
 * Every bill somebody still owes money on. Both the receivable and the call
 * list are built from this, so the boss's total and the phone list can never be
 * two different sets of invoices.
 *
 * NAMED STATUSES, NOT "EVERYTHING EXCEPT". This asked for anything that was not
 * DRAFT, VOID or PAID, which let a WRITTEN_OFF bill through: the company had
 * decided in writing it would never collect that money and the row still had
 * `total − amountPaid > 0`, so it was printed as an asset the owner reads as
 * receivable and put on the call list with the customer's phone beside it —
 * somebody ringing to chase a debt the office had already abandoned. The
 * dashboard's ageing panel (lib/queries.ts:205) asks the question this way and
 * dropped it correctly, so the business had two answers to "how much are we
 * owed" and the bigger one was the one printed. Asking for the two statuses
 * that ARE a debt also means a status added to the enum later cannot silently
 * become one.
 */
async function outstandingInvoices(f: ReportFilters, byCustomer: boolean) {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["UNPAID", "PARTIALLY_PAID"] as InvoiceStatus[] },
      ...(range(f) ? { issuedAt: range(f) } : {}),
      ...(f.batchId ? { shipment: { batchId: f.batchId } } : {}),
    },
    orderBy: { issuedAt: "asc" },
    take: 2000,
    select: {
      invoiceNumber: true,
      issuedAt: true,
      dueDate: true,
      total: true,
      amountPaid: true,
      shipment: {
        select: {
          trackingNumber: true,
          customer: { select: { id: true, name: true, phone: true } },
          batch: { select: { batchNumber: true } },
        },
      },
    },
  });

  const now = Date.now();
  const live = invoices
    .map((i) => ({
      ...i,
      owed: toNumber(i.total) - toNumber(i.amountPaid),
      days: Math.floor((now - i.issuedAt.getTime()) / 86_400_000),
    }))
    .filter((i) => i.owed > 0.005);

  if (!byCustomer) return { live };

  const map = new Map<
    string,
    { name: string; phone: string | null; owed: number; count: number; oldest: number }
  >();
  for (const i of live) {
    const id = i.shipment?.customer?.id ?? "unknown";
    const row = map.get(id) ?? {
      name: i.shipment?.customer?.name ?? "Unknown",
      phone: i.shipment?.customer?.phone ?? null,
      owed: 0,
      count: 0,
      oldest: 0,
    };
    row.owed += i.owed;
    row.count += 1;
    row.oldest = Math.max(row.oldest, i.days);
    map.set(id, row);
  }
  return { live, byCustomer: [...map.values()].sort((a, b) => b.owed - a.owed) };
}

async function receivables(f: ReportFilters): Promise<ReportResult> {
  const { byCustomer: rows = [] } = await outstandingInvoices(f, true);
  return {
    key: "receivables",
    title: "Accounts receivable",
    caption:
      "What each customer owes, and how long the oldest of it has been outstanding. Drafts are excluded — nobody owes an estimate — and so are bills that have been written off, which the company has decided it will never collect.",
    columns: [
      { key: "customer", label: "Customer" },
      { key: "phone", label: "Phone" },
      { key: "invoices", label: "Bills", numeric: true },
      { key: "oldest", label: "Oldest (days)", numeric: true },
      { key: "owed", label: "Owed", numeric: true, money: true },
    ],
    rows: rows.map((r) => ({
      customer: r.name,
      phone: r.phone ?? "—",
      invoices: r.count,
      oldest: r.oldest,
      owed: money(r.owed),
    })),
    totals: { owed: money(rows.reduce((n, r) => n + r.owed, 0)) },
  };
}

async function outstanding(f: ReportFilters): Promise<ReportResult> {
  const { live } = await outstandingInvoices(f, false);
  return {
    key: "outstanding",
    title: "Outstanding customer payments",
    caption:
      "Every unpaid or part-paid bill, oldest first — the call list, one line per invoice. A written-off bill is not on it: nobody should be rung about money the office has already given up on.",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "phone", label: "Phone" },
      { key: "tracking", label: "Cargo" },
      { key: "flight", label: "Batch" },
      { key: "issued", label: "Issued" },
      { key: "days", label: "Days", numeric: true },
      { key: "billed", label: "Billed", numeric: true, money: true },
      { key: "paid", label: "Paid", numeric: true, money: true },
      { key: "owed", label: "Owed", numeric: true, money: true },
    ],
    rows: live.map((i) => ({
      invoice: i.invoiceNumber,
      customer: i.shipment?.customer?.name ?? "—",
      phone: i.shipment?.customer?.phone ?? "—",
      tracking: i.shipment?.trackingNumber ?? "—",
      flight: i.shipment?.batch?.batchNumber ?? "—",
      issued: i.issuedAt.toISOString().slice(0, 10),
      days: i.days,
      billed: money(toNumber(i.total)),
      paid: money(toNumber(i.amountPaid)),
      owed: money(i.owed),
    })),
    totals: {
      billed: money(live.reduce((n, i) => n + toNumber(i.total), 0)),
      paid: money(live.reduce((n, i) => n + toNumber(i.amountPaid), 0)),
      owed: money(live.reduce((n, i) => n + i.owed, 0)),
    },
  };
}

/* -------------------------------------------------------------- the ledger */

async function ledgerRows(f: ReportFilters, kinds?: string[]) {
  return prisma.ledgerEntry.findMany({
    where: {
      ...(range(f) ? { occurredAt: range(f) } : {}),
      ...(f.accountId ? { accountId: f.accountId } : {}),
      ...(f.currency ? { currency: f.currency } : {}),
      ...(kinds ? { account: { kind: { in: kinds as never } } } : {}),
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    take: 5000,
    select: {
      entryNumber: true,
      occurredAt: true,
      direction: true,
      kind: true,
      amount: true,
      currency: true,
      amountUsd: true,
      description: true,
      reversesId: true,
      account: { select: { name: true, kind: true } },
      recordedBy: { select: { name: true } },
    },
  });
}

function ledgerReport(
  key: string,
  title: string,
  caption: string,
  entries: Awaited<ReturnType<typeof ledgerRows>>
): ReportResult {
  /*
    A running balance, in the order the money actually moved.

    This is the column that makes a register a register: any single line can be
    checked against the one above it, which is how somebody finds the entry
    that put an account where it should not be.

    ONE CURRENCY, OR NO BALANCE. Every amount here is in its own account's
    currency, and the company holds both shilling and dollar accounts. Running
    them into a single figure produced a balance that added TSh 1,200,000 to
    USD 5,000 and printed 1,205,000 — a number that is not money in any
    currency, on a page a bank might read. When the range spans more than one,
    the balance and the totals are withheld and the caption says how to get
    them back, because a blank is recoverable and a wrong total is not.
  */
  const currencies = new Set(entries.map((e) => e.currency));
  const mixed = currencies.size > 1;

  let balance = 0;
  const rows = entries.map((e) => {
    const amount = toNumber(e.amount);
    const debit = e.direction === "OUT" ? amount : 0;
    const credit = e.direction === "IN" ? amount : 0;
    balance += credit - debit;
    return {
      date: e.occurredAt.toISOString().slice(0, 10),
      entry: e.entryNumber,
      type: e.reversesId ? `${e.kind} (reversal)` : e.kind,
      description: e.description,
      account: e.account?.name ?? "—",
      currency: e.currency,
      debit: debit ? money(debit) : null,
      credit: credit ? money(credit) : null,
      balance: mixed ? null : money(balance),
      recordedBy: e.recordedBy?.name ?? "—",
    };
  });

  return {
    key,
    title,
    caption: mixed
      ? `${caption} These entries span accounts in ${[...currencies].sort().join(" and ")}, and each amount is in its own account's currency — so the running balance and the totals are left out rather than adding one currency to another. Filter to a single account to see them.`
      : caption,
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
    rows,
    totals: mixed
      ? undefined
      : {
          debit: money(rows.reduce((n, r) => n + Number(r.debit ?? 0), 0)),
          credit: money(rows.reduce((n, r) => n + Number(r.credit ?? 0), 0)),
        },
  };
}

/* ------------------------------------------------------------- cash & time */

async function cashFlow(f: ReportFilters): Promise<ReportResult> {
  const entries = await ledgerRows(f);
  const months = new Map<string, { in: number; out: number }>();
  for (const e of entries) {
    const key = e.occurredAt.toISOString().slice(0, 7);
    const row = months.get(key) ?? { in: 0, out: 0 };
    const usd = toNumber(e.amountUsd);
    if (e.direction === "IN") row.in += usd;
    else row.out += usd;
    months.set(key, row);
  }
  const rows = [...months.entries()]
    .sort()
    .map(([month, v]) => ({
      month,
      in: money(v.in),
      out: money(v.out),
      net: money(v.in - v.out),
    }));

  return {
    key: "cash-flow",
    title: "Cash flow",
    caption:
      /* No currency named here: the column headings carry the unit and the
         note underneath states the rate. This caption used to say "in USD"
         and was printed unchanged above columns already restated in
         shillings. */
      "Money in and money out of every company account, by month. This includes special costs — they really did leave the bank.",
    columns: [
      { key: "month", label: "Month" },
      { key: "in", label: "In", numeric: true, money: true },
      { key: "out", label: "Out", numeric: true, money: true },
      { key: "net", label: "Net", numeric: true, money: true },
    ],
    rows,
    totals: {
      in: money(rows.reduce((n, r) => n + Number(r.in), 0)),
      out: money(rows.reduce((n, r) => n + Number(r.out), 0)),
      net: money(rows.reduce((n, r) => n + Number(r.net), 0)),
    },
  };
}

async function monthlySummary(f: ReportFilters): Promise<ReportResult> {
  const [invoices, costs] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { notIn: ["DRAFT", "VOID"] as InvoiceStatus[] },
        ...(range(f) ? { issuedAt: range(f) } : {}),
      },
      // `status` is here so `earned` can neutralise a written-off bill: it used
      // to add the abandoned debt to the month's revenue, which raised that
      // month's profit and its margin by exactly what the business gave up on.
      select: { issuedAt: true, total: true, amountPaid: true, status: true },
    }),
    prisma.expense.findMany({
      where: {
        status: { not: "VOID" },
        expenseClass: "OPERATING",
        ...(range(f) ? { incurredAt: range(f) } : {}),
      },
      select: { incurredAt: true, amountUsd: true },
    }),
  ]);

  type Month = {
    revenue: number;
    collected: number;
    writtenOff: number;
    costs: number;
  };
  const blank = (): Month => ({
    revenue: 0,
    collected: 0,
    writtenOff: 0,
    costs: 0,
  });
  const months = new Map<string, Month>();
  const at = (d: Date) => d.toISOString().slice(0, 7);
  for (const i of invoices) {
    const row = months.get(at(i.issuedAt)) ?? blank();
    const line = earned(i);
    row.revenue += line.billed;
    row.collected += line.paid;
    row.writtenOff += line.writtenOff;
    months.set(at(i.issuedAt), row);
  }
  for (const c of costs) {
    const row = months.get(at(c.incurredAt)) ?? blank();
    row.costs += toNumber(c.amountUsd);
    months.set(at(c.incurredAt), row);
  }

  const rows = [...months.entries()].sort().map(([month, v]) => ({
    month,
    revenue: money(v.revenue),
    collected: money(v.collected),
    writtenOff: money(v.writtenOff),
    costs: money(v.costs),
    profit: money(v.revenue - v.costs),
    margin: v.revenue > 0 ? Math.round(((v.revenue - v.costs) / v.revenue) * 100) : 0,
  }));

  return {
    key: "monthly-summary",
    title: "Monthly summary",
    caption:
      "Revenue against operating costs, month by month. Revenue is dated when the bill was raised and costs when they were incurred, so a flight's customs lands in the month it flew. Written off is billed money the business later gave up on: it is out of revenue and out of profit, and it is dated to the month the bill was raised rather than the month of the decision.",
    columns: [
      { key: "month", label: "Month" },
      { key: "revenue", label: "Revenue", numeric: true, money: true },
      { key: "collected", label: "Collected", numeric: true, money: true },
      { key: "writtenOff", label: "Written off", numeric: true, money: true },
      { key: "costs", label: "Operating costs", numeric: true, money: true },
      { key: "profit", label: "Profit", numeric: true, money: true },
      { key: "margin", label: "Margin %", numeric: true },
    ],
    rows,
    totals: {
      revenue: money(rows.reduce((n, r) => n + Number(r.revenue), 0)),
      collected: money(rows.reduce((n, r) => n + Number(r.collected), 0)),
      writtenOff: money(rows.reduce((n, r) => n + Number(r.writtenOff), 0)),
      costs: money(rows.reduce((n, r) => n + Number(r.costs), 0)),
      profit: money(rows.reduce((n, r) => n + Number(r.profit), 0)),
    },
  };
}

/* --------------------------------------------------- statements of position */

async function financialStatement(f: ReportFilters): Promise<ReportResult> {
  const [invoices, abandoned, operating, special, entries, rate] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        /* The three statuses that are a real demand for money. This was
           "anything but DRAFT and VOID", so a written-off bill was summed into
           revenue and into the receivable — the position overstated both by
           exactly the debt the company had given up on. */
        status: { in: [...BILLED_INVOICE_STATUSES] },
        ...(range(f) ? { issuedAt: range(f) } : {}),
      },
      _sum: { total: true, amountPaid: true },
    }),
    /* Counted separately rather than dropped, so a period that wrote off USD
       1,240 cannot read like one that never billed it. */
    prisma.invoice.aggregate({
      where: {
        status: "WRITTEN_OFF",
        ...(range(f) ? { issuedAt: range(f) } : {}),
      },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.expense.aggregate({
      where: {
        status: { not: "VOID" },
        expenseClass: "OPERATING",
        ...(range(f) ? { incurredAt: range(f) } : {}),
      },
      _sum: { amountUsd: true },
    }),
    prisma.expense.aggregate({
      where: {
        status: { not: "VOID" },
        expenseClass: "NON_OPERATING",
        ...(range(f) ? { incurredAt: range(f) } : {}),
      },
      _sum: { amountUsd: true },
    }),
    prisma.ledgerEntry.findMany({
      select: { direction: true, amountUsd: true, account: { select: { kind: true } } },
    }),
    currentRateValue(),
  ]);

  const held = { BANK: 0, MOBILE_MONEY: 0, CASH: 0 } as Record<string, number>;
  for (const e of entries) {
    const kind = e.account?.kind ?? "BANK";
    const usd = toNumber(e.amountUsd);
    held[kind] = (held[kind] ?? 0) + (e.direction === "IN" ? usd : -usd);
  }

  /* What a written-off bill collected before it was given up on is still money
     that came in and is still revenue — the same split lib/batch-finance.ts:221
     makes. Only the part nobody will ever pay leaves both figures, and it gets
     its own line below rather than being netted off either of them. */
  const abandonedPaid = toNumber(abandoned._sum.amountPaid);
  const revenue = toNumber(invoices._sum.total) + abandonedPaid;
  const collected = toNumber(invoices._sum.amountPaid) + abandonedPaid;
  const writtenOff = Math.max(
    0,
    toNumber(abandoned._sum.total) - abandonedPaid
  );
  const opCosts = toNumber(operating._sum.amountUsd);
  const spCosts = toNumber(special._sum.amountUsd);

  const lines: [string, number][] = [
    ["Revenue (confirmed bills)", money(revenue)],
    ["Operating costs", money(-opCosts)],
    ["Operating profit", money(revenue - opCosts)],
    ["Special costs", money(-spCosts)],
    ["Profit after special costs", money(revenue - opCosts - spCosts)],
    ["Collected from customers", money(collected)],
    ["Receivable (billed, not collected)", money(Math.max(0, revenue - collected))],
    /* Below the receivable and outside the profit block above, deliberately. It
       is not a cost and it is not owed to us any more — it is a memo saying what
       the receivable would have been. Putting a figure inside a run of lines
       that read as a sum, where the sum does not honour it, is how a reader ends
       up subtracting it a second time. */
    ["Written off (given up on)", money(writtenOff)],
    ["Held in bank accounts", money(held.BANK ?? 0)],
    ["Held in mobile money", money(held.MOBILE_MONEY ?? 0)],
    ["Held as cash", money(held.CASH ?? 0)],
    [
      "Cash position (all accounts)",
      money((held.BANK ?? 0) + (held.MOBILE_MONEY ?? 0) + (held.CASH ?? 0)),
    ],
  ];

  return {
    key: "financial-statement",
    title: "Position summary",
    caption: rate
      /*
        The unit belongs to the column heading and the rate to the note, not
        here. This said "in USD, at the published rate of 2,700" while the one
        money column had already been multiplied by 2,700 — naming the wrong
        currency and handing the reader the multiplier to apply a second time.
      */
      ? "The whole position on one page. Shilling balances are valued at the published rate; the full statement is the document above."
      : "The whole position on one page. No exchange rate is published, so shilling balances are shown at their recorded dollar value.",
    columns: [
      { key: "line", label: "Line" },
      { key: "usd", label: "USD", numeric: true, money: true },
    ],
    rows: lines.map(([line, usd]) => ({ line, usd })),
  };
}

async function profitLoss(f: ReportFilters): Promise<ReportResult> {
  const statement = await financialStatement(f);
  /* Down to the profit line, found by name rather than counted. The position
     summary grew a Written off line beneath its receivable, and "the first five
     rows" is a promise about the order of a list edited somewhere else — the
     kind that turns into a P&L quietly printing a cash balance as profit. */
  const end = statement.rows.findIndex(
    (r) => r.line === "Profit after special costs"
  );
  return {
    ...statement,
    key: "profit-loss",
    title: "Profit & loss",
    caption:
      "Revenue against costs. Operating profit is the figure the business is judged on; special costs are shown beneath it rather than mixed into it.",
    rows: statement.rows.slice(0, end < 0 ? 5 : end + 1),
  };
}

/* -------------------------------------------------------------------- main */

export async function runReport(
  key: ReportKey,
  filters: ReportFilters
): Promise<ReportResult> {
  switch (key) {
    case "income":
      return income(filters);
    case "expenses":
      return expenses(filters);
    case "expense-by-category":
      return expenseByCategory(filters);
    case "batch-profit":
      return batchProfit(filters);
    case "storage":
      return storage(filters);
    case "receivables":
      return receivables(filters);
    case "outstanding":
      return outstanding(filters);
    case "cash-flow":
      return cashFlow(filters);
    case "ledger":
      return ledgerReport(
        "ledger",
        "General ledger",
        "Every movement of money, in the order it happened, with a running balance.",
        await ledgerRows(filters)
      );
    case "bank":
      return ledgerReport(
        "bank",
        "Bank accounts",
        "Every movement through a bank account.",
        await ledgerRows(filters, ["BANK"])
      );
    case "mobile-money":
      return ledgerReport(
        "mobile-money",
        "Mobile money",
        "Every movement through M-Pesa, Mixx by Yas and any other mobile account.",
        await ledgerRows(filters, ["MOBILE_MONEY"])
      );
    case "petty-cash":
      return ledgerReport(
        "petty-cash",
        "Cash and petty cash",
        "Every movement of physical cash, with the running balance the tin should hold.",
        await ledgerRows(filters, ["CASH"])
      );
    case "monthly-summary":
      return monthlySummary(filters);
    case "financial-statement":
      return financialStatement(filters);
    case "profit-loss":
    default:
      return profitLoss(filters);
  }
}

/**
 * The report as a spreadsheet.
 *
 * CSV rather than a PDF: a report is opened to be sorted, filtered and added
 * to, and a PDF of a table is a picture of data. The PDF that already exists
 * is for documents a customer receives, which is a different job.
 */
export function reportToCsv(report: ReportResult): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = report.columns.map((c) => escape(c.label)).join(",");
  const body = report.rows
    .map((r) => report.columns.map((c) => escape(r[c.key])).join(","))
    .join("\n");
  const totals = report.totals
    ? "\n" +
      report.columns
        .map((c, i) =>
          i === 0 ? escape("Total") : escape(report.totals?.[c.key] ?? "")
        )
        .join(",")
    : "";
  return `${head}\n${body}${totals}\n`;
}
