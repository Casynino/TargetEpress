import "server-only";

import type { Prisma } from "@prisma/client";

import {
  AGING_BUCKETS,
  type AgingKey,
  type CreditLine,
  type CreditState,
  agingBucket,
  creditCheck,
  creditLine,
  customerCredit,
} from "@/lib/credit";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Every credit figure in the application, asked once.
 *
 * ONE FILE, ON PURPOSE. This app has been bitten repeatedly by the same bug:
 * two screens computing the same money two different ways and quietly
 * disagreeing — storage derived from dates here and read off the invoice there,
 * a cash headline converted at a different rate from the cards beneath it. A
 * credit system has a dozen surfaces (a settlements page, a customer profile,
 * two dashboards, a batch band, a P&L, an aging chart, four reports) and if each
 * one writes its own "what do they owe us" query, they will disagree by the end
 * of the month and nobody will know which to believe.
 *
 * So every one of them comes through here, and every figure is derived by
 * `creditLine` from the invoice's own total and amountPaid. Nothing is stored.
 *
 * WHAT IS AND IS NOT REVENUE. A credit sale is billed revenue the moment the
 * cargo is released — the sale happened. It is NOT collected cash, and no
 * function here ever adds it to a cash figure. That separation is the entire
 * point: "sold" and "banked" are two different questions, and the answer to the
 * second one is the ledger, not this file.
 */

/** The invoice fields every credit derivation needs. Selected identically everywhere. */
const CREDIT_SELECT = {
  id: true,
  invoiceNumber: true,
  total: true,
  amountPaid: true,
  status: true,
  currency: true,
  exchangeRate: true,
  dueDate: true,
  paymentType: true,
  creditStatus: true,
  creditTermDays: true,
  creditRequestedAt: true,
  creditRequestNote: true,
  creditDecidedAt: true,
  creditDecisionNote: true,
  storageCharge: true,
  storageWaivedUsd: true,
  customerId: true,
  customer: {
    select: {
      id: true,
      name: true,
      code: true,
      phone: true,
      creditLimitUsd: true,
      creditTermDays: true,
    },
  },
  creditRequestedBy: { select: { name: true } },
  creditDecidedBy: { select: { name: true } },
  shipment: {
    select: {
      trackingNumber: true,
      batch: { select: { id: true, batchNumber: true } },
    },
  },
} satisfies Prisma.InvoiceSelect;

export type CreditRow = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  customerPhone: string | null;
  trackingNumber: string | null;
  batchId: string | null;
  batchNumber: string | null;
  termDays: number | null;
  /** The frozen rate on this bill, so the shilling figure never moves. */
  exchangeRate: number | null;
  /** Storage inside this credit — a receivable that grew in our own warehouse. */
  storageUsd: number;
  storageWaivedUsd: number;
  requestedBy: string | null;
  requestedAt: Date | null;
  requestNote: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
} & CreditLine;

function toRow(inv: Prisma.InvoiceGetPayload<{ select: typeof CREDIT_SELECT }>, now: Date): CreditRow {
  const line = creditLine(inv, now);
  return {
    ...line,
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    customerName: inv.customer.name,
    customerCode: inv.customer.code,
    customerPhone: inv.customer.phone,
    trackingNumber: inv.shipment?.trackingNumber ?? null,
    batchId: inv.shipment?.batch?.id ?? null,
    batchNumber: inv.shipment?.batch?.batchNumber ?? null,
    termDays: inv.creditTermDays,
    exchangeRate: inv.exchangeRate === null ? null : toNumber(inv.exchangeRate),
    storageUsd: toNumber(inv.storageCharge),
    storageWaivedUsd: toNumber(inv.storageWaivedUsd),
    requestedBy: inv.creditRequestedBy?.name ?? null,
    requestedAt: inv.creditRequestedAt,
    requestNote: inv.creditRequestNote,
    decidedBy: inv.creditDecidedBy?.name ?? null,
    decisionNote: inv.creditDecisionNote,
  };
}

/* ------------------------------------------------------------- the approvals */

/**
 * What Finance has to decide, with the exposure each decision would create.
 *
 * The customer's whole position is attached to every request, because "approve
 * USD 500" and "approve USD 500 for somebody already 900 overdue" are different
 * questions and the queue must not make them look the same.
 */
export async function pendingCreditRequests(now = new Date()) {
  const requests = await prisma.invoice.findMany({
    where: { creditStatus: "REQUESTED" },
    orderBy: { creditRequestedAt: "asc" },
    select: CREDIT_SELECT,
  });
  if (requests.length === 0) return [];

  /* One query for every requester's existing exposure rather than one per row. */
  const customerIds = Array.from(new Set(requests.map((r) => r.customerId)));
  const open = await prisma.invoice.findMany({
    where: {
      customerId: { in: customerIds },
      creditStatus: "APPROVED",
      status: { notIn: ["DRAFT", "VOID"] },
    },
    select: CREDIT_SELECT,
  });

  return requests.map((req) => {
    const row = toRow(req, now);
    const theirs = open
      .filter((o) => o.customerId === req.customerId)
      .map((o) => creditLine(o, now));
    const credit = customerCredit(req.customer, theirs);
    return { ...row, credit, check: creditCheck(row.outstandingUsd, credit) };
  });
}

/* ------------------------------------------------------------- the portfolio */

export type CreditFilter = {
  /** Derived state, not a stored column — filtered after derivation. */
  state?: CreditState | "OPEN" | "DUE_TODAY" | "DUE_WEEK";
  customerId?: string;
  batchId?: string;
  from?: Date | null;
  to?: Date | null;
  q?: string;
};

/**
 * Every credit ever granted, filtered.
 *
 * Note what is NOT filtered in the database: state. ACTIVE, OVERDUE and the rest
 * are derived from two amounts and a date, so filtering them in SQL would mean a
 * second implementation of the rules in `creditLine` — the exact duplication this
 * file exists to prevent. The date window and the text search go to the database;
 * the state is applied to derived rows.
 */
export async function creditRows(
  filter: CreditFilter = {},
  now = new Date()
): Promise<CreditRow[]> {
  const q = filter.q?.trim();
  const invoices = await prisma.invoice.findMany({
    where: {
      creditStatus: "APPROVED",
      status: { notIn: ["DRAFT", "VOID"] },
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.batchId ? { shipment: { batchId: filter.batchId } } : {}),
      ...(filter.from || filter.to
        ? {
            creditDecidedAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { invoiceNumber: { contains: q, mode: "insensitive" as const } },
              { customer: { name: { contains: q, mode: "insensitive" as const } } },
              { customer: { code: { contains: q, mode: "insensitive" as const } } },
              { customer: { phone: { contains: q, mode: "insensitive" as const } } },
              {
                shipment: {
                  trackingNumber: { contains: q, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ dueDate: "asc" }, { creditDecidedAt: "desc" }],
    select: CREDIT_SELECT,
  });

  const rows = invoices.map((i) => toRow(i, now));
  const state = filter.state;
  if (!state) return rows;
  if (state === "OPEN") return rows.filter((r) => r.outstandingUsd > 0.005);
  if (state === "DUE_TODAY") {
    return rows.filter((r) => r.outstandingUsd > 0.005 && r.daysRemaining === 0);
  }
  if (state === "DUE_WEEK") {
    return rows.filter(
      (r) =>
        r.outstandingUsd > 0.005 &&
        r.daysRemaining !== null &&
        r.daysRemaining >= 0 &&
        r.daysRemaining <= 7
    );
  }
  return rows.filter((r) => r.state === state);
}

/* --------------------------------------------------------------- the summary */

export type CreditOverview = {
  /** Everything ever released on credit. Billed revenue, never cash. */
  soldUsd: number;
  /** Of that, what has come back. */
  collectedUsd: number;
  /** Of that, what is still owed. The receivable. */
  outstandingUsd: number;
  overdueUsd: number;
  dueTodayUsd: number;
  dueThisWeekUsd: number;
  /** Credit collected inside the current calendar month. */
  collectedThisMonthUsd: number;
  waivedUsd: number;
  /** Storage that ended up inside credit receivables. */
  storageInCreditUsd: number;
  creditCount: number;
  customerCount: number;
  /** Customers with a live facility, whether or not they are using it. */
  facilityCount: number;
  activeAccountCount: number;
  overdueCount: number;
  /** collected / sold, as a percentage. Null before any credit exists. */
  collectionRate: number | null;
  aging: { key: AgingKey; label: string; amountUsd: number; count: number }[];
  /** Oldest debt first — who to ring, in order. */
  worst: CreditRow[];
};

export async function creditOverview(now = new Date()): Promise<CreditOverview> {
  const [rows, facilityCount] = await Promise.all([
    creditRows({}, now),
    prisma.customer.count({ where: { creditLimitUsd: { gt: 0 } } }),
  ]);

  const live = rows.filter((r) => r.state !== "WAIVED");
  const sum = (xs: CreditRow[], pick: (r: CreditRow) => number) =>
    Math.round(xs.reduce((n, r) => n + pick(r), 0) * 100) / 100;

  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  const aging = AGING_BUCKETS.map((b) => {
    const inBucket = live.filter(
      (r) => r.outstandingUsd > 0.005 && agingBucket(r.daysOverdue) === b.key
    );
    return {
      key: b.key,
      label: b.label,
      amountUsd: sum(inBucket, (r) => r.outstandingUsd),
      count: inBucket.length,
    };
  });

  return {
    soldUsd: sum(rows, (r) => r.totalUsd),
    collectedUsd: sum(rows, (r) => r.paidUsd),
    outstandingUsd: sum(live, (r) => r.outstandingUsd),
    overdueUsd: sum(
      live.filter((r) => r.state === "OVERDUE"),
      (r) => r.outstandingUsd
    ),
    dueTodayUsd: sum(
      live.filter((r) => r.outstandingUsd > 0.005 && r.daysRemaining === 0),
      (r) => r.outstandingUsd
    ),
    dueThisWeekUsd: sum(
      live.filter(
        (r) =>
          r.outstandingUsd > 0.005 &&
          r.daysRemaining !== null &&
          r.daysRemaining >= 0 &&
          r.daysRemaining <= 7
      ),
      (r) => r.outstandingUsd
    ),
    /* Approximated by credits SETTLED this month rather than by payment rows,
       because a payment can be split across months; a fully settled credit whose
       last payment landed this month is the honest unit of "collected". */
    collectedThisMonthUsd: sum(
      rows.filter(
        (r) =>
          r.state === "PAID" &&
          r.creditDate !== null &&
          r.creditDate >= monthStart
      ),
      (r) => r.paidUsd
    ),
    waivedUsd: sum(
      rows.filter((r) => r.state === "WAIVED"),
      (r) => Math.max(0, r.totalUsd - r.paidUsd)
    ),
    storageInCreditUsd: sum(live, (r) => r.storageUsd),
    creditCount: rows.length,
    customerCount: new Set(rows.map((r) => r.customerId)).size,
    facilityCount,
    activeAccountCount: new Set(
      live.filter((r) => r.outstandingUsd > 0.005).map((r) => r.customerId)
    ).size,
    overdueCount: live.filter((r) => r.state === "OVERDUE").length,
    collectionRate:
      sum(rows, (r) => r.totalUsd) > 0
        ? (sum(rows, (r) => r.paidUsd) / sum(rows, (r) => r.totalUsd)) * 100
        : null,
    aging,
    worst: live
      .filter((r) => r.outstandingUsd > 0.005)
      .sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstandingUsd - a.outstandingUsd)
      .slice(0, 8),
  };
}

/* -------------------------------------------------------------- one customer */

/** A customer's facility, their position against it, and every credit they hold. */
export async function customerCreditProfile(customerId: string, now = new Date()) {
  const [customer, rows] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        code: true,
        phone: true,
        creditLimitUsd: true,
        creditTermDays: true,
        creditNote: true,
        creditApprovedAt: true,
        creditApprovedBy: { select: { name: true } },
      },
    }),
    creditRows({ customerId }, now),
  ]);
  if (!customer) return null;

  const credit = customerCredit(customer, rows);
  const paidRows = rows
    .filter((r) => r.paidUsd > 0.005)
    .sort((a, b) => (b.creditDate?.getTime() ?? 0) - (a.creditDate?.getTime() ?? 0));

  return {
    customer,
    credit,
    rows,
    /** Most recent credit that has money against it — "last payment", in effect. */
    lastSettled: paidRows[0] ?? null,
    /**
     * Whether they pay on time, from their own settled history.
     *
     * Counted on credits that are DONE, because a bill that is not yet due says
     * nothing about anybody's behaviour. Null until there is history — an
     * unproven customer must not be flattered by a 100% score.
     */
    performance: (() => {
      const closed = rows.filter((r) => r.state === "PAID");
      if (closed.length === 0) return null;
      const late = closed.filter(
        (r) => r.dueDate !== null && r.creditDate !== null && r.daysOverdue > 0
      ).length;
      return {
        settled: closed.length,
        late,
        onTimeRate: ((closed.length - late) / closed.length) * 100,
      };
    })(),
  };
}

/* ------------------------------------------------------------------- batches */

/** Cash versus credit, per flight — §12's question, answered from one place. */
export async function creditByBatch(now = new Date()) {
  const rows = await creditRows({}, now);
  const byBatch = new Map<
    string,
    { batchId: string; batchNumber: string; creditUsd: number; collectedUsd: number; outstandingUsd: number; count: number }
  >();
  for (const r of rows) {
    if (!r.batchId) continue;
    const at = byBatch.get(r.batchId) ?? {
      batchId: r.batchId,
      batchNumber: r.batchNumber ?? "—",
      creditUsd: 0,
      collectedUsd: 0,
      outstandingUsd: 0,
      count: 0,
    };
    at.creditUsd += r.totalUsd;
    at.collectedUsd += r.paidUsd;
    if (r.state !== "WAIVED") at.outstandingUsd += r.outstandingUsd;
    at.count += 1;
    byBatch.set(r.batchId, at);
  }
  return Array.from(byBatch.values()).sort((a, b) => b.creditUsd - a.creditUsd);
}

/**
 * Credit totals for ONE batch, for the financial band on the batch page.
 *
 * Kept separate from creditByBatch so a single batch page does not load every
 * credit in the company to find its own three numbers.
 */
export async function batchCredit(batchId: string, now = new Date()) {
  const rows = await creditRows({ batchId }, now);
  const live = rows.filter((r) => r.state !== "WAIVED");
  return {
    creditUsd: rows.reduce((n, r) => n + r.totalUsd, 0),
    collectedUsd: rows.reduce((n, r) => n + r.paidUsd, 0),
    outstandingUsd: live.reduce((n, r) => n + r.outstandingUsd, 0),
    overdueUsd: live
      .filter((r) => r.state === "OVERDUE")
      .reduce((n, r) => n + r.outstandingUsd, 0),
    count: rows.length,
    overdueCount: live.filter((r) => r.state === "OVERDUE").length,
  };
}

/** Per month, for the trend chart and the "credit by month" report. */
export async function creditByMonth(months = 12, now = new Date()) {
  const rows = await creditRows({}, now);
  const buckets = new Map<string, { month: string; creditUsd: number; collectedUsd: number; count: number }>();
  for (const r of rows) {
    if (!r.creditDate) continue;
    const key = `${r.creditDate.getUTCFullYear()}-${String(r.creditDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const at = buckets.get(key) ?? { month: key, creditUsd: 0, collectedUsd: 0, count: 0 };
    at.creditUsd += r.totalUsd;
    at.collectedUsd += r.paidUsd;
    at.count += 1;
    buckets.set(key, at);
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-months);
}
