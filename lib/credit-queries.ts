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
  /* The newest live payment — the one that settled the bill, for judging
     whether a FINISHED credit was paid on time. */
  payments: {
    where: { voidedAt: null },
    orderBy: { paidAt: "desc" },
    take: 1,
    select: { paidAt: true },
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
  /** When the last live payment landed — null while nothing has been paid. */
  lastPaidAt: Date | null;
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
    lastPaidAt: inv.payments[0]?.paidAt ?? null,
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
      /*
        LATE MEANS PAID LATE, NOT "ITS DUE DATE HAS PASSED".

        The old test used daysOverdue, which is measured from NOW — so a credit
        settled a week early still turned "late" the day its due date went by,
        and every customer's score decayed toward zero with the calendar. A
        finished credit is judged by when the settling payment actually landed
        against the date it was due.
      */
      const late = closed.filter(
        (r) =>
          r.dueDate !== null &&
          r.lastPaidAt !== null &&
          r.lastPaidAt.getTime() > r.dueDate.getTime() + 86_400_000
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

/* --------------------------------------------- one customer, two more answers */

/**
 * The two things a customer's credit page asks that their position cannot answer.
 *
 * `customerCreditProfile` returns `lastSettled`, the most recent credit carrying
 * money — and its date is the date credit was GRANTED, not the date the customer
 * paid. Printed under the words "last payment" that tells the desk a customer
 * paid on the day they took the cargo, which is the one thing the row proves
 * untrue, so the payment date is read from the payment rows themselves.
 *
 * `waivedUsd` is here for the opposite reason. Written-off credit is excluded
 * from exposure by `customerCredit`, correctly — but a customer the desk has
 * forgiven two million shillings for must not read like a customer who has
 * simply never borrowed. Only the WRITTEN_OFF bills are fetched rather than the
 * whole row set again, and the figure still comes out of `creditLine` rather
 * than out of two columns subtracted here.
 */
export async function customerCreditOutcomes(customerId: string, now = new Date()) {
  const [payment, waived] = await Promise.all([
    prisma.payment.findFirst({
      where: {
        invoice: {
          customerId,
          creditStatus: "APPROVED",
          status: { notIn: ["DRAFT", "VOID"] },
        },
      },
      orderBy: { paidAt: "desc" },
      select: {
        paidAt: true,
        amount: true,
        creditedAmount: true,
        exchangeRate: true,
        method: true,
        invoice: { select: { id: true, invoiceNumber: true, exchangeRate: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { customerId, creditStatus: "APPROVED", status: "WRITTEN_OFF" },
      select: CREDIT_SELECT,
    }),
  ]);

  return {
    lastPayment: payment
      ? {
          paidAt: payment.paidAt,
          /* The debt's currency, not the till's: a customer hands over shillings
             against a dollar bill, and `creditedAmount` is that same money
             restated in the currency the debt is denominated in. */
          usd: toNumber(payment.creditedAmount ?? payment.amount),
          /* The rate this money actually moved at, falling back to the bill's
             own frozen rate when they paid in dollars. Either way it is a rate
             from the past — today's published one would restate a receipt the
             customer is holding. */
          rate:
            payment.exchangeRate !== null
              ? toNumber(payment.exchangeRate)
              : payment.invoice.exchangeRate !== null
                ? toNumber(payment.invoice.exchangeRate)
                : null,
          method: payment.method,
          invoiceId: payment.invoice.id,
          invoiceNumber: payment.invoice.invoiceNumber,
        }
      : null,
    waivedUsd: waived
      .map((i) => creditLine(i, now))
      .reduce((n, l) => n + l.outstandingUsd, 0),
  };
}

/* ------------------------------------------- the call list, and the warnings */

/**
 * The credit half of the collections queue, and the bills that queue must not
 * treat as unpaid cash.
 *
 * Two answers, because a chase list built from cargo gets credit wrong in two
 * opposite directions. It cannot SEE most of it: the whole point of a credit
 * sale is that the boxes went, so the consignment is DELIVERED and a queue made
 * of what is standing in the warehouse never reaches the money. And the few it
 * can see it reads backwards — a consignment released on terms that is still on
 * our floor looks exactly like a bill somebody forgot to pay, so the desk rings
 * a customer who is inside terms the company itself granted. That call is worse
 * than no call.
 *
 * `notCash` is every bill the cash queue must leave alone: the live credits,
 * which come back as credit rows instead, and the forgiven ones, which come
 * back as nothing at all — a written-off debt is off the call list by §3, and
 * chasing money the office already gave up on is the same mistake the waived
 * storage fee made.
 */
export async function creditForCollections(now = new Date()) {
  const rows = await creditRows({}, now);
  /* A SETTLED credit is deliberately in neither list. Its cargo may still be
     on the shelf waiting to be collected, and "paid — tell them to collect" is
     the right thing for the cash queue to keep saying about it. */
  const unsettled = rows.filter((r) => r.state !== "PAID");
  return {
    chase: unsettled.filter((r) => r.state !== "WAIVED"),
    notCash: unsettled.map((r) => r.invoiceId),
  };
}

/**
 * §19 — what a desk must be told about credit without going to look for it.
 *
 * Figures only. The sentences live with whoever draws the panel, because the
 * same fact reads differently to the two desks that need it — a request waiting
 * on a decision is work to Finance and a progress report to Support — while the
 * arithmetic behind it must be identical for both, or the two desks argue about
 * a number instead of about a customer.
 */
export type CreditAlertKind =
  | "OVERDUE"
  | "DUE_TODAY"
  | "DUE_SOON"
  | "LIMIT_EXCEEDED"
  | "LIMIT_NEAR"
  | "AWAITING_DECISION";

export type CreditAlert = {
  kind: CreditAlertKind;
  /** Bills — except on the two limit alerts, where the unit is customers. */
  count: number;
  /** How many customers those bills belong to, so "+3 more" can be honest. */
  customerCount: number;
  /**
   * The money behind it: the receivable on the bill alerts, how far past the
   * limit on LIMIT_EXCEEDED, and how little headroom is left on LIMIT_NEAR.
   */
  amountUsd: number;
  /** A few names, biggest first. A desk rings a customer, not a count. */
  names: string[];
  /** Worst days past due. OVERDUE only; 0 everywhere else. */
  worstDaysOverdue: number;
};

export async function creditAlerts(now = new Date()): Promise<CreditAlert[]> {
  const [rows, facilities, requested] = await Promise.all([
    creditRows({}, now),
    prisma.customer.findMany({
      where: { creditLimitUsd: { gt: 0 } },
      select: { id: true, name: true, creditLimitUsd: true, creditTermDays: true },
    }),
    prisma.invoice.findMany({
      where: { creditStatus: "REQUESTED" },
      select: CREDIT_SELECT,
    }),
  ]);

  /* Written-off credit is out of every warning here for the same reason it is
     out of exposure: nobody is going to collect it, so it cannot be late and it
     cannot fill up a limit. It is not hidden — the credit book still prints it. */
  const live = rows.filter((r) => r.state !== "WAIVED" && r.outstandingUsd > 0.005);

  const sum = (xs: { outstandingUsd: number }[]) =>
    Math.round(xs.reduce((n, r) => n + r.outstandingUsd, 0) * 100) / 100;

  /* Customers, biggest exposure first — three bills against one name is one
     phone call, and a panel that listed the bills would send the desk to make
     it three times. */
  const byCustomer = (xs: CreditRow[]) => {
    const owed = new Map<string, number>();
    for (const r of xs) {
      owed.set(r.customerName, (owed.get(r.customerName) ?? 0) + r.outstandingUsd);
    }
    return [...owed.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  };

  const bills = (kind: CreditAlertKind, xs: CreditRow[]): CreditAlert | null => {
    if (xs.length === 0) return null;
    const customers = byCustomer(xs);
    return {
      kind,
      count: xs.length,
      customerCount: customers.length,
      amountUsd: sum(xs),
      names: customers.slice(0, 3),
      worstDaysOverdue: xs.reduce((n, r) => Math.max(n, r.daysOverdue), 0),
    };
  };

  /*
    A limit is "nearly full" here in exactly the words it is nearly full in at
    the moment of approval: the position is put through creditCheck with a
    request of nothing, so `nearLimit` and `exceedsLimit` mean one thing in this
    app rather than one thing on a dashboard and another at the decision.
  */
  const positions = facilities.map((customer) => {
    const theirs = rows.filter((r) => r.customerId === customer.id);
    return {
      name: customer.name,
      check: creditCheck(0, customerCredit(customer, theirs)),
    };
  });

  const limit = (
    kind: CreditAlertKind,
    picked: typeof positions,
    amount: (available: number) => number
  ): CreditAlert | null =>
    picked.length === 0
      ? null
      : {
          kind,
          count: picked.length,
          customerCount: picked.length,
          amountUsd:
            Math.round(
              picked.reduce((n, p) => n + amount(p.check.availableAfterUsd ?? 0), 0) * 100
            ) / 100,
          /* Least headroom first, which reads correctly for both alerts: the
             deepest overshoot is the most negative, and the tightest facility is
             the smallest positive. */
          names: [...picked]
            .sort((a, b) => (a.check.availableAfterUsd ?? 0) - (b.check.availableAfterUsd ?? 0))
            .slice(0, 3)
            .map((p) => p.name),
          worstDaysOverdue: 0,
        };

  const waiting = requested.map((inv) => toRow(inv, now));

  return [
    bills("OVERDUE", live.filter((r) => r.state === "OVERDUE")),
    limit("LIMIT_EXCEEDED", positions.filter((p) => p.check.exceedsLimit), (a) => -a),
    bills("DUE_TODAY", live.filter((r) => r.daysRemaining === 0)),
    limit("LIMIT_NEAR", positions.filter((p) => p.check.nearLimit), (a) => a),
    bills("AWAITING_DECISION", waiting),
    bills(
      "DUE_SOON",
      live.filter(
        (r) => r.daysRemaining !== null && r.daysRemaining >= 1 && r.daysRemaining <= 7
      )
    ),
  ].filter((alert): alert is CreditAlert => alert !== null);
}

/* ------------------------------------------- one batch, on the batch's basis */

/**
 * The credit inside ONE dispatch's billed revenue.
 *
 * `batchCredit` above already answers the credit book's question about a batch:
 * what was released on terms, what came back, what is still owed. This answers a
 * different one — how much of the batch's REVENUE is credit rather than cash —
 * and it needs its own function because the batch band gets its cash figure by
 * subtracting one from the other, and two things make that subtraction wrong.
 *
 * A written-off credit is counted there at its full total, correctly: the credit
 * book must never let a forgiven debt read as a debt that was never granted. But
 * a batch counts a written-off bill at what was collected before it was
 * abandoned, so subtracting the credit book's figure from the batch's would
 * leave a flight reporting MORE cash revenue than it billed — and on a small
 * all-credit dispatch, a negative cash figure.
 *
 * And `creditRows` finds a batch's credits through `shipment.batchId` without
 * regard to whether that consignment has since been deleted, while the batch
 * sums its revenue over live cargo only. One deleted consignment and the two
 * halves stop adding up, with no sign on screen that they have.
 *
 * So the basis is restated here in the batch's own terms, once, and every figure
 * still comes out of `creditLine` rather than out of two columns subtracted by
 * hand.
 */
export async function batchCreditRevenue(batchId: string, now = new Date()) {
  const invoices = await prisma.invoice.findMany({
    where: {
      creditStatus: "APPROVED",
      status: { notIn: ["DRAFT", "VOID"] },
      shipment: { batchId, deletedAt: null },
    },
    select: CREDIT_SELECT,
  });

  const lines = invoices.map((i) => creditLine(i, now));
  const live = lines.filter((l) => l.state !== "WAIVED");
  const sum = (xs: CreditLine[], pick: (l: CreditLine) => number) =>
    xs.reduce((n, l) => n + pick(l), 0);

  return {
    /** The credit share of the batch's BILLED revenue, on the batch's own basis. */
    billedUsd: sum(lines, (l) => (l.state === "WAIVED" ? l.paidUsd : l.totalUsd)),
    /** Everything ever released on terms here, forgiven debt included. */
    grantedUsd: sum(lines, (l) => l.totalUsd),
    collectedUsd: sum(lines, (l) => l.paidUsd),
    outstandingUsd: sum(live, (l) => l.outstandingUsd),
    overdueUsd: sum(
      live.filter((l) => l.state === "OVERDUE"),
      (l) => l.outstandingUsd
    ),
    waivedUsd: sum(
      lines.filter((l) => l.state === "WAIVED"),
      (l) => l.outstandingUsd
    ),
    count: lines.length,
    overdueCount: live.filter((l) => l.state === "OVERDUE").length,
  };
}

/* ------------------------------------------------ what the register cannot hold */

/**
 * The credit revenue the general ledger legitimately has no line for.
 *
 * A credit sale moves no money, so it posts no ledger entry, and it must not:
 * the register is a cash register read straight down against a bank statement,
 * and a row for a sale that touched no account would put a figure in a running
 * balance no statement will ever show.
 *
 * But somebody totalling "money in" on that page and concluding that is what the
 * business sold is wrong by exactly this much, and an absence nobody explains is
 * indistinguishable from a missing row. So the register names the gap rather
 * than filling it, and this is the size of it.
 *
 * Outstanding rather than everything ever granted, deliberately. The collected
 * half of a credit IS in the register already — as a payment, on the day the
 * money actually arrived — so counting the whole grant here would report the
 * same revenue as both present and absent. Waived is kept apart because it is
 * the part that will never appear there at all.
 */
export async function creditNotInTheLedger(now = new Date()) {
  const rows = await creditRows({}, now);
  const live = rows.filter((r) => r.state !== "WAIVED");
  const owing = live.filter((r) => r.outstandingUsd > 0.005);

  return {
    /** Billed on credit and not yet through any account. */
    outstandingUsd: owing.reduce((n, r) => n + r.outstandingUsd, 0),
    count: owing.length,
    overdueUsd: owing
      .filter((r) => r.state === "OVERDUE")
      .reduce((n, r) => n + r.outstandingUsd, 0),
    overdueCount: owing.filter((r) => r.state === "OVERDUE").length,
    /** Forgiven, and so absent from the register permanently. */
    waivedUsd: rows
      .filter((r) => r.state === "WAIVED")
      .reduce((n, r) => n + r.outstandingUsd, 0),
  };
}

/* ------------------------------------------ every credit customer, in one list */

/**
 * Each credit customer's facility and their position against it, in one pass.
 *
 * `customerCreditProfile` answers this for ONE customer, which is what a profile
 * page needs. The credit customer report needs all of them at once, and building
 * it by calling the profile in a loop would run two queries per customer and, far
 * worse, would be a second place deciding what "available" means. So the facility
 * arithmetic stays exactly where it was — `customerCredit` in lib/credit.ts — and
 * this only groups the rows it is fed.
 *
 * WHO IS ON THE LIST. Customers with a facility OR with credit on their name,
 * because each belongs for the opposite reason: a limit nobody has drawn on is
 * unused capacity the desk should see, and a debt from somebody whose facility was
 * later withdrawn is still a debt somebody has to collect. Asking for
 * `creditLimitUsd > 0` alone would have hidden precisely the second group.
 *
 * NOT FILTERABLE BY PERIOD, on purpose. A limit, the exposure against it and the
 * room left inside it are as-at-today figures. Narrowed to credits granted in one
 * month, `available` would report room a customer does not have — which is the one
 * mistake a credit limit exists to prevent.
 */
export async function creditCustomerPositions(now = new Date()) {
  const [rows, customers] = await Promise.all([
    creditRows({}, now),
    prisma.customer.findMany({
      where: {
        OR: [
          { creditLimitUsd: { gt: 0 } },
          {
            invoices: {
              some: {
                creditStatus: "APPROVED",
                status: { notIn: ["DRAFT", "VOID"] },
              },
            },
          },
        ],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        phone: true,
        creditLimitUsd: true,
        creditTermDays: true,
      },
    }),
  ]);

  const byCustomer = new Map<string, CreditRow[]>();
  for (const r of rows) {
    const held = byCustomer.get(r.customerId);
    if (held) held.push(r);
    else byCustomer.set(r.customerId, [r]);
  }

  return customers.map((customer) => {
    const theirs = byCustomer.get(customer.id) ?? [];
    const live = theirs.filter((r) => r.state !== "WAIVED");
    return {
      customerId: customer.id,
      name: customer.name,
      code: customer.code,
      phone: customer.phone,
      credit: customerCredit(customer, theirs),
      /* The oldest late debt, which is what decides the order of a call list:
         sixty days late is a different conversation from four days late, for the
         same money and the same customer. */
      oldestOverdueDays: live.reduce(
        (n, r) => Math.max(n, r.state === "OVERDUE" ? r.daysOverdue : 0),
        0
      ),
      /* Forgiven credit, carried beside the position rather than dropped from it.
         `customerCredit` leaves it out of exposure, correctly — but without this
         column a customer the desk has written two million shillings off for
         reads exactly like one who never borrowed. */
      waivedUsd: theirs
        .filter((r) => r.state === "WAIVED")
        .reduce((n, r) => n + r.outstandingUsd, 0),
    };
  });
}

/* ------------------------------------------------- one bill, for one document */

/**
 * The credit on ONE invoice, for the documents that have to state whether the
 * bill is paid.
 *
 * The pickup slip is the reason this exists. It printed "Paid in full" over
 * every note it produced, because issuing one used to BE the act of confirming
 * payment — and it took the figure beside those words from the note's stored
 * `amountPaid`, which is a snapshot of what was settled at the moment of issue:
 * zero on a credit release, and still zero however much the customer pays
 * afterwards. A card that reads as a receipt for money somebody still owes is
 * the one thing the owner said must never happen, so the document asks the
 * invoice through here rather than reading that snapshot.
 *
 * Null means "this bill released no cargo on credit" — cash terms, and the
 * document keeps the settled wording it always had. REQUESTED is null with it,
 * because a request nobody has answered has granted nothing, and so is
 * REJECTED, which sent the bill back to cash.
 */
export async function invoiceCredit(
  invoiceId: string,
  now = new Date()
): Promise<CreditRow | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: CREDIT_SELECT,
  });
  if (!invoice) return null;
  if (invoice.creditStatus !== "APPROVED") return null;
  /* The same two exclusions every other query in this file makes: a draft is a
     figure nobody has signed off, and a void bill is not a bill. */
  if (invoice.status === "DRAFT" || invoice.status === "VOID") return null;
  return toRow(invoice, now);
}

/* ------------------------------------- credit inside a profit-and-loss period */

/** Cents, so a strip of figures adds back to the total printed above it. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The slice of one period's REVENUE that went out on credit.
 *
 * Windowed on `issuedAt`, not on `creditDecidedAt`, and that is the whole reason
 * this exists rather than another `creditRows` filter. The decision date is the
 * right one for "what did we release this week"; it is the wrong one for a profit
 * and loss, where revenue is every bill raised in the month. Window the two on
 * different dates and the credit slice comes out larger than the revenue it is a
 * slice of — so cash revenue plus credit revenue stops equalling the revenue line
 * printed directly above them, and no reader can tell which of the three figures
 * is the broken one.
 *
 * `billedUsd` values a written-off credit at what the customer paid before the
 * company gave up on it, because `profitAndLoss` values it that way and
 * `batchCreditRevenue` already does the same for a flight. Face value here would
 * push the slice past the whole again, by exactly the debt that was abandoned.
 *
 * `collectedUsd` is what has come back on those bills WHENEVER it came back — one
 * raised in July and settled in September counts here against July. That makes it
 * a fact about the period's billing rather than a cash figure, and it is why
 * nothing here may be added to cash in, cash available or an account balance: the
 * money in this field arrived on days outside the window.
 */
export type PeriodCredit = {
  /** Credit revenue: billed on credit terms, already inside period revenue. */
  billedUsd: number;
  collectedUsd: number;
  /** Still owed. Written-off credit is not in here — it is in `waivedUsd`. */
  outstandingUsd: number;
  overdueUsd: number;
  waivedUsd: number;
  count: number;
  customerCount: number;
  collectionRate: number | null;
};

export async function creditForPeriod(
  window: { from: Date; to: Date },
  now = new Date()
): Promise<PeriodCredit> {
  const invoices = await prisma.invoice.findMany({
    where: {
      creditStatus: "APPROVED",
      status: { notIn: ["DRAFT", "VOID"] },
      issuedAt: { gte: window.from, lt: window.to },
    },
    select: CREDIT_SELECT,
  });

  const rows = invoices.map((i) => toRow(i, now));
  const live = rows.filter((r) => r.state !== "WAIVED");

  const billedUsd = round2(
    rows.reduce((n, r) => n + (r.state === "WAIVED" ? r.paidUsd : r.totalUsd), 0)
  );
  const collectedUsd = round2(rows.reduce((n, r) => n + r.paidUsd, 0));
  /* The rate is measured against FACE value — the same arithmetic
     `creditOverview` uses, so "collection rate" means one thing across the app.
     `billedUsd` cannot be the denominator: it values a write-off at whatever was
     paid, which would score every abandoned debt as fully collected. Written-off
     credit drags this figure down instead, which is the truth. */
  const faceUsd = rows.reduce((n, r) => n + r.totalUsd, 0);

  return {
    billedUsd,
    collectedUsd,
    outstandingUsd: round2(live.reduce((n, r) => n + r.outstandingUsd, 0)),
    overdueUsd: round2(
      live
        .filter((r) => r.state === "OVERDUE")
        .reduce((n, r) => n + r.outstandingUsd, 0)
    ),
    waivedUsd: round2(
      rows
        .filter((r) => r.state === "WAIVED")
        .reduce((n, r) => n + r.outstandingUsd, 0)
    ),
    count: rows.length,
    customerCount: new Set(rows.map((r) => r.customerId)).size,
    collectionRate: faceUsd > 0 ? (collectedUsd / faceUsd) * 100 : null,
  };
}

/* ---------------------------- was the money there on the day it was promised */

/**
 * Expected collections against what actually arrived, on credit already due.
 *
 * The collection rate over the whole book answers a different question, and it
 * flatters or damns the desk for the wrong reason: it counts credit that is not
 * due yet, so a book of fresh 30-day terms reads as a collection failure while a
 * book holding one ancient debt reads as a triumph. This asks only about money a
 * customer promised to have paid BY NOW.
 *
 * Settled credits are counted, including ones paid late. Leaving them out would
 * turn the figure into "the share of UNPAID bills that have been paid", which is
 * always dreadful and says nothing about anybody.
 *
 * The cut-off is the end of the UTC day because `creditLine` counts days in UTC.
 * A bill the call list calls "due today" has to be a bill this figure calls due
 * today, or the two disagree about which debts have come round — the same
 * two-answers-to-one-question bug this file exists to prevent.
 */
export type CreditOutlook = {
  /** What was promised by today. */
  expectedUsd: number;
  /** What has come in against it. */
  actualUsd: number;
  shortfallUsd: number;
  /** Forgiven, and never quietly dropped: it was expected money once. */
  waivedUsd: number;
  count: number;
  metRate: number | null;
};

export async function creditCollectionOutlook(
  now = new Date()
): Promise<CreditOutlook> {
  const endOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );

  const invoices = await prisma.invoice.findMany({
    where: {
      creditStatus: "APPROVED",
      status: { notIn: ["DRAFT", "VOID"] },
      /* Narrow on purpose — this is the one credit question that does not need
         the whole book in memory, and the schema carries an index on
         (creditStatus, dueDate) for exactly this shape. A credit with no due
         date is excluded by the comparison, which is right: nothing was
         promised. */
      dueDate: { lt: endOfToday },
    },
    select: CREDIT_SELECT,
  });

  const rows = invoices.map((i) => toRow(i, now));
  const live = rows.filter((r) => r.state !== "WAIVED");
  const expectedUsd = round2(live.reduce((n, r) => n + r.totalUsd, 0));
  const actualUsd = round2(live.reduce((n, r) => n + r.paidUsd, 0));

  return {
    expectedUsd,
    actualUsd,
    shortfallUsd: round2(live.reduce((n, r) => n + r.outstandingUsd, 0)),
    waivedUsd: round2(
      rows
        .filter((r) => r.state === "WAIVED")
        .reduce((n, r) => n + r.outstandingUsd, 0)
    ),
    count: live.length,
    metRate: expectedUsd > 0 ? (actualUsd / expectedUsd) * 100 : null,
  };
}
