import "server-only";

import type { InvoiceStatus } from "@prisma/client";

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
 * Two rules hold across all of them.
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

export const REPORTS = [
  { key: "profit-loss", label: "Profit & loss" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "expense-by-category", label: "Expenses by category" },
  { key: "batch-profit", label: "Batch profitability" },
  { key: "receivables", label: "Accounts receivable" },
  { key: "outstanding", label: "Outstanding customer payments" },
  { key: "cash-flow", label: "Cash flow" },
  { key: "ledger", label: "General ledger" },
  { key: "bank", label: "Bank accounts" },
  { key: "mobile-money", label: "Mobile money" },
  { key: "petty-cash", label: "Cash and petty cash" },
  { key: "monthly-summary", label: "Monthly summary" },
  { key: "financial-statement", label: "Financial statement" },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

const money = (n: number) => Math.round(n * 100) / 100;

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
    status: { notIn: ["DRAFT", "VOID"] as InvoiceStatus[] },
    ...(range(f) ? { issuedAt: range(f) } : {}),
    ...(f.batchId ? { shipment: { batchId: f.batchId } } : {}),
    ...(f.currency ? { currency: f.currency } : {}),
  };
  const rows = await prisma.invoice.findMany({
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

  return {
    key: "income",
    title: "Income",
    caption:
      "Every confirmed bill raised in the window. Drafts are excluded — a draft is the system's price, not one a customer has agreed to.",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "date", label: "Issued" },
      { key: "customer", label: "Customer" },
      { key: "tracking", label: "Cargo" },
      { key: "flight", label: "Batch" },
      { key: "billed", label: "Billed", numeric: true },
      { key: "paid", label: "Paid", numeric: true },
      { key: "due", label: "Still owed", numeric: true },
    ],
    rows: rows.map((r) => {
      const billed = toNumber(r.total);
      const paid = toNumber(r.amountPaid);
      return {
        invoice: r.invoiceNumber,
        date: r.issuedAt.toISOString().slice(0, 10),
        customer: r.shipment?.customer?.name ?? "—",
        tracking: r.shipment?.trackingNumber ?? "—",
        flight: r.shipment?.batch?.batchNumber ?? "—",
        billed: money(billed),
        paid: money(paid),
        due: money(Math.max(0, billed - paid)),
      };
    }),
    totals: {
      billed: money(rows.reduce((n, r) => n + toNumber(r.total), 0)),
      paid: money(rows.reduce((n, r) => n + toNumber(r.amountPaid), 0)),
      due: money(
        rows.reduce(
          (n, r) => n + Math.max(0, toNumber(r.total) - toNumber(r.amountPaid)),
          0
        )
      ),
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
      { key: "usd", label: "USD", numeric: true },
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
            ? "Flight"
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
      { key: "usd", label: "USD", numeric: true },
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
        select: { invoice: { select: { total: true, amountPaid: true, status: true } } },
      },
      expenses: {
        where: { status: { not: "VOID" }, expenseClass: "OPERATING" },
        select: { amountUsd: true },
      },
    },
  });

  const rows = batches.map((b) => {
    const confirmed = b.shipments.filter(
      (s) => s.invoice && s.invoice.status !== "DRAFT" && s.invoice.status !== "VOID"
    );
    const revenue = confirmed.reduce((n, s) => n + toNumber(s.invoice!.total), 0);
    const collected = confirmed.reduce(
      (n, s) => n + toNumber(s.invoice!.amountPaid),
      0
    );
    const costs = b.expenses.reduce((n, e) => n + toNumber(e.amountUsd), 0);
    return {
      flight: b.batchNumber,
      status: b.status,
      departed: b.departedAt ? b.departedAt.toISOString().slice(0, 10) : "—",
      cargo: b.shipments.length,
      revenue: money(revenue),
      collected: money(collected),
      outstanding: money(Math.max(0, revenue - collected)),
      costs: money(costs),
      profit: money(revenue - costs),
      margin: revenue > 0 ? Math.round(((revenue - costs) / revenue) * 100) : 0,
    };
  });

  return {
    key: "batch-profit",
    title: "Batch profitability",
    caption:
      "What each batch billed, collected and cost. Revenue is billed rather than banked, so profit and margin here are expectations — only Collected is money in the bank. A batch with no costs recorded reads as pure profit, so check that column before believing the margin.",
    columns: [
      { key: "flight", label: "Batch" },
      { key: "status", label: "Status" },
      { key: "departed", label: "Departed" },
      { key: "cargo", label: "Cargo", numeric: true },
      { key: "revenue", label: "Expected revenue", numeric: true },
      { key: "collected", label: "Collected", numeric: true },
      { key: "outstanding", label: "Outstanding", numeric: true },
      { key: "costs", label: "Costs", numeric: true },
      { key: "profit", label: "Expected profit", numeric: true },
      { key: "margin", label: "Expected margin %", numeric: true },
    ],
    rows,
    totals: {
      revenue: money(rows.reduce((n, r) => n + Number(r.revenue), 0)),
      collected: money(rows.reduce((n, r) => n + Number(r.collected), 0)),
      outstanding: money(rows.reduce((n, r) => n + Number(r.outstanding), 0)),
      costs: money(rows.reduce((n, r) => n + Number(r.costs), 0)),
      profit: money(rows.reduce((n, r) => n + Number(r.profit), 0)),
    },
  };
}

/* ------------------------------------------------------------ receivables */

async function outstandingInvoices(f: ReportFilters, byCustomer: boolean) {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { notIn: ["DRAFT", "VOID", "PAID"] as InvoiceStatus[] },
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
      "What each customer owes, and how long the oldest of it has been outstanding. Drafts are excluded — nobody owes an estimate.",
    columns: [
      { key: "customer", label: "Customer" },
      { key: "phone", label: "Phone" },
      { key: "invoices", label: "Bills", numeric: true },
      { key: "oldest", label: "Oldest (days)", numeric: true },
      { key: "owed", label: "Owed", numeric: true },
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
      "Every unpaid or part-paid bill, oldest first — the call list, one line per invoice.",
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "phone", label: "Phone" },
      { key: "tracking", label: "Cargo" },
      { key: "flight", label: "Batch" },
      { key: "issued", label: "Issued" },
      { key: "days", label: "Days", numeric: true },
      { key: "billed", label: "Billed", numeric: true },
      { key: "paid", label: "Paid", numeric: true },
      { key: "owed", label: "Owed", numeric: true },
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
  */
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
      balance: money(balance),
      recordedBy: e.recordedBy?.name ?? "—",
    };
  });

  return {
    key,
    title,
    caption,
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
    totals: {
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
      "Money in and money out of every company account, by month, in USD. This includes special costs — they really did leave the bank.",
    columns: [
      { key: "month", label: "Month" },
      { key: "in", label: "In", numeric: true },
      { key: "out", label: "Out", numeric: true },
      { key: "net", label: "Net", numeric: true },
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
      select: { issuedAt: true, total: true, amountPaid: true },
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

  const months = new Map<
    string,
    { revenue: number; collected: number; costs: number }
  >();
  const at = (d: Date) => d.toISOString().slice(0, 7);
  for (const i of invoices) {
    const row = months.get(at(i.issuedAt)) ?? { revenue: 0, collected: 0, costs: 0 };
    row.revenue += toNumber(i.total);
    row.collected += toNumber(i.amountPaid);
    months.set(at(i.issuedAt), row);
  }
  for (const c of costs) {
    const row = months.get(at(c.incurredAt)) ?? { revenue: 0, collected: 0, costs: 0 };
    row.costs += toNumber(c.amountUsd);
    months.set(at(c.incurredAt), row);
  }

  const rows = [...months.entries()].sort().map(([month, v]) => ({
    month,
    revenue: money(v.revenue),
    collected: money(v.collected),
    costs: money(v.costs),
    profit: money(v.revenue - v.costs),
    margin: v.revenue > 0 ? Math.round(((v.revenue - v.costs) / v.revenue) * 100) : 0,
  }));

  return {
    key: "monthly-summary",
    title: "Monthly summary",
    caption:
      "Revenue against operating costs, month by month. Revenue is dated when the bill was raised and costs when they were incurred, so a flight's customs lands in the month it flew.",
    columns: [
      { key: "month", label: "Month" },
      { key: "revenue", label: "Revenue", numeric: true },
      { key: "collected", label: "Collected", numeric: true },
      { key: "costs", label: "Operating costs", numeric: true },
      { key: "profit", label: "Profit", numeric: true },
      { key: "margin", label: "Margin %", numeric: true },
    ],
    rows,
    totals: {
      revenue: money(rows.reduce((n, r) => n + Number(r.revenue), 0)),
      collected: money(rows.reduce((n, r) => n + Number(r.collected), 0)),
      costs: money(rows.reduce((n, r) => n + Number(r.costs), 0)),
      profit: money(rows.reduce((n, r) => n + Number(r.profit), 0)),
    },
  };
}

/* --------------------------------------------------- statements of position */

async function financialStatement(f: ReportFilters): Promise<ReportResult> {
  const [invoices, operating, special, entries, rate] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        status: { notIn: ["DRAFT", "VOID"] as InvoiceStatus[] },
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

  const revenue = toNumber(invoices._sum.total);
  const collected = toNumber(invoices._sum.amountPaid);
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
    title: "Financial statement",
    caption: rate
      ? `The whole position on one page, in USD, at the published rate of ${rate.toLocaleString("en-US")}.`
      : "The whole position on one page, in USD. No exchange rate is published, so shilling balances are shown at their recorded dollar value.",
    columns: [
      { key: "line", label: "Line" },
      { key: "usd", label: "USD", numeric: true },
    ],
    rows: lines.map(([line, usd]) => ({ line, usd })),
  };
}

async function profitLoss(f: ReportFilters): Promise<ReportResult> {
  const statement = await financialStatement(f);
  return {
    ...statement,
    key: "profit-loss",
    title: "Profit & loss",
    caption:
      "Revenue against costs. Operating profit is the figure the business is judged on; special costs are shown beneath it rather than mixed into it.",
    rows: statement.rows.slice(0, 5),
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
