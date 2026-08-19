import "server-only";

import type { Prisma, ReviewState } from "@prisma/client";

import { reviewsFor, type Standing } from "@/lib/control";
import { toNumber } from "@/lib/format";
import { accountBalances } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";

/**
 * THE MANAGER'S RECONCILIATION WORKSPACE, ON THE BOOKS THE BUSINESS ALREADY HAS.
 *
 * Every row this returns is a LedgerEntry, a CompanyAccount or a Batch that
 * Finance already recorded. Nothing here writes a financial figure and nothing
 * stores a second copy of one: a verdict is an append-only ManagerReview beside
 * the record, and an account check is an AccountReconciliation beside the
 * account. Reviewing a payment never edits the payment.
 *
 * The one figure that genuinely comes from outside the system is an account's
 * ACTUAL balance — what the bank statement, the phone or the till says. That is
 * typed by the manager, stored with the ledger's own figure frozen beside it,
 * and never auto-corrected.
 */

export const QUEUE_PAGE_SIZE = 40;

/** The register's own vocabulary, so both screens call a row the same thing. */
export const KIND_LABEL: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  CUSTOMER_PAYMENT: "Freight payment",
  EXPENSE: "Expense",
  COMPENSATION: "Compensation",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  ADJUSTMENT: "Adjustment",
};

/** PENDING is the absence of a verdict, so it is never a stored row. */
export const QUEUE_STATES = [
  "PENDING",
  "MISMATCH",
  "SENT_BACK",
  "FLAGGED",
  "INFO_REQUESTED",
  "UNDER_REVIEW",
  "RECONCILED",
] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

export type QueueFilters = {
  q?: string;
  account?: string;
  direction?: string;
  kind?: string;
  person?: string;
  period?: string;
  status?: string;
  page?: string;
};

export function windowStart(period: string | undefined, now = new Date()): Date | null {
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "yesterday") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

/** Everything except the status, which is applied against the review table. */
function baseWhere(filters: QueueFilters): Prisma.LedgerEntryWhereInput {
  const where: Prisma.LedgerEntryWhereInput = {};
  if (filters.account) where.accountId = filters.account;
  if (filters.direction === "IN" || filters.direction === "OUT") {
    where.direction = filters.direction;
  }
  if (filters.kind && filters.kind in KIND_LABEL) {
    where.kind = filters.kind as Prisma.LedgerEntryWhereInput["kind"];
  }
  if (filters.person) where.recordedById = filters.person;

  const from = windowStart(filters.period);
  if (from) {
    const until = filters.period === "yesterday" ? new Date(from) : null;
    if (until) until.setDate(until.getDate() + 1);
    where.occurredAt = until ? { gte: from, lt: until } : { gte: from };
  }

  /* The register's search, verbatim: whatever Finance can find, the reviewer
     finds by the same half-remembered code. */
  const q = filters.q?.trim();
  if (q) {
    const like = { contains: q, mode: "insensitive" as const };
    where.OR = [
      { description: like },
      { entryNumber: like },
      { account: { name: like } },
      { recordedBy: { name: like } },
      { payment: { reference: like } },
      { payment: { note: like } },
      { payment: { receipt: { receiptNumber: like } } },
      { payment: { invoice: { invoiceNumber: like } } },
      { payment: { invoice: { customer: { name: like } } } },
      { payment: { invoice: { customer: { phone: like } } } },
      { payment: { invoice: { shipment: { trackingNumber: like } } } },
      { expense: { expenseNumber: like } },
      { expense: { description: like } },
      { expense: { vendor: like } },
      { expense: { batch: { batchNumber: like } } },
      { transfer: { transferNumber: like } },
      { transfer: { reason: like } },
    ];
  }
  return where;
}

const QUEUE_INCLUDE = {
  account: { select: { id: true, name: true, currency: true, kind: true } },
  recordedBy: { select: { name: true } },
  payment: {
    select: {
      id: true,
      method: true,
      reference: true,
      note: true,
      paidAt: true,
      voidedAt: true,
      receipt: { select: { receiptNumber: true } },
      proofs: { select: { url: true } },
      receivedBy: { select: { name: true } },
      invoice: {
        select: {
          invoiceNumber: true,
          creditStatus: true,
          customer: { select: { name: true, phone: true } },
          shipment: { select: { trackingNumber: true, batch: { select: { batchNumber: true } } } },
        },
      },
    },
  },
  expense: {
    select: {
      id: true,
      expenseNumber: true,
      description: true,
      vendor: true,
      category: true,
      status: true,
      batch: { select: { batchNumber: true } },
      receipts: { select: { url: true } },
    },
  },
  transfer: {
    select: {
      transferNumber: true,
      reason: true,
      fromAccount: { select: { name: true } },
      toAccount: { select: { name: true } },
    },
  },
} satisfies Prisma.LedgerEntryInclude;

export type QueueRow = Prisma.LedgerEntryGetPayload<{ include: typeof QUEUE_INCLUDE }> & {
  standing: Standing | null;
  state: QueueState;
};

/**
 * The newest verdict per entry, and the entry ids that carry each state.
 *
 * One query rather than one per row: `distinct` over a descending order is what
 * "current standing" means in an append-only table, and the whole page — the
 * counts, the filter and every row's badge — is answered from it.
 */
async function currentStandings() {
  const rows = await prisma.managerReview.findMany({
    where: { target: "LEDGER_ENTRY" },
    orderBy: [{ targetId: "asc" }, { createdAt: "desc" }],
    distinct: ["targetId"],
    select: { targetId: true, state: true },
  });
  const byState = new Map<ReviewState, string[]>();
  for (const row of rows) {
    const list = byState.get(row.state) ?? [];
    list.push(row.targetId);
    byState.set(row.state, list);
  }
  return { reviewedIds: rows.map((r) => r.targetId), byState };
}

export async function reconciliationQueue(filters: QueueFilters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const where = baseWhere(filters);
  const { reviewedIds, byState } = await currentStandings();

  /* The status filter is a set of ids, because the verdict lives in another
     table and PENDING is the absence of a row rather than a value in one. */
  const status = filters.status as QueueState | undefined;
  const scoped: Prisma.LedgerEntryWhereInput = { ...where };
  if (status === "PENDING") {
    scoped.id = { notIn: reviewedIds };
  } else if (status && QUEUE_STATES.includes(status)) {
    scoped.id = { in: byState.get(status as ReviewState) ?? ["__none__"] };
  }

  const [rows, total, filteredTotal, accounts, people] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: scoped,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * QUEUE_PAGE_SIZE,
      take: QUEUE_PAGE_SIZE,
      include: QUEUE_INCLUDE,
    }),
    /* Counted over the filters WITHOUT the status, so the summary cards keep
       saying how big each pile is while you are standing inside one of them. */
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.count({ where: scoped }),
    prisma.companyAccount.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, currency: true, kind: true },
    }),
    prisma.user.findMany({
      where: { ledgerEntries: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const standings = await reviewsFor(
    "LEDGER_ENTRY",
    rows.map((r) => r.id)
  );

  const entries: QueueRow[] = rows.map((row) => {
    const standing = standings.get(row.id) ?? null;
    return {
      ...row,
      standing,
      state: (standing?.state as QueueState) ?? "PENDING",
    };
  });

  /* Counts within the same filters as the list, so a month's figures never sit
     under a week's list. Reviewed ids are counted by intersecting with the
     filtered set rather than globally. */
  const idsInFilter = new Set(
    (
      await prisma.ledgerEntry.findMany({ where, select: { id: true } })
    ).map((r) => r.id)
  );
  const counts: Record<QueueState, number> = {
    PENDING: 0,
    MISMATCH: 0,
    SENT_BACK: 0,
    FLAGGED: 0,
    INFO_REQUESTED: 0,
    UNDER_REVIEW: 0,
    RECONCILED: 0,
  };
  let reviewedInFilter = 0;
  for (const [state, ids] of byState) {
    const n = ids.filter((id) => idsInFilter.has(id)).length;
    if (state in counts) counts[state as QueueState] = n;
    reviewedInFilter += n;
  }
  counts.PENDING = Math.max(0, total - reviewedInFilter);

  return {
    entries,
    counts,
    total,
    filteredTotal,
    page,
    pages: Math.max(1, Math.ceil(filteredTotal / QUEUE_PAGE_SIZE)),
    accounts,
    people,
  };
}

export type AccountPosition = {
  id: string;
  name: string;
  kind: string;
  currency: string;
  /** What the ledger says, derived from its own lines. Never typed by anyone. */
  systemBalance: number;
  moneyIn: number;
  moneyOut: number;
  /** The newest check against something outside this system, if there is one. */
  lastCheck: {
    actualBalance: number;
    difference: number;
    asOf: Date;
    state: string;
    note: string | null;
    checkedBy: string;
  } | null;
  /** Money has moved since that check, so it no longer describes the account. */
  movedSinceCheck: boolean;
  lastMovedAt: Date | null;
};

/**
 * Every live account: what the books say, and what somebody proved from outside.
 *
 * The two figures are kept apart on purpose and labelled as such on screen. A
 * system balance is the ledger agreeing with itself; only the actual balance
 * has been held against a statement, a phone or a till count.
 */
export async function accountPositions(): Promise<AccountPosition[]> {
  const [accounts, balances, checks] = await Promise.all([
    prisma.companyAccount.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, currency: true },
    }),
    accountBalances(prisma),
    prisma.accountReconciliation.findMany({
      orderBy: [{ accountId: "asc" }, { asOf: "desc" }, { createdAt: "desc" }],
      distinct: ["accountId"],
      select: {
        accountId: true,
        actualBalance: true,
        difference: true,
        asOf: true,
        state: true,
        note: true,
        checkedBy: { select: { name: true } },
      },
    }),
  ]);

  const byAccount = new Map(balances.map((b) => [b.accountId, b]));
  const checkFor = new Map(checks.map((c) => [c.accountId, c]));

  return accounts.map((account) => {
    const b = byAccount.get(account.id);
    const c = checkFor.get(account.id);
    const lastMovedAt = b?.lastMovedAt ?? null;
    return {
      id: account.id,
      name: account.name,
      kind: account.kind,
      currency: account.currency,
      systemBalance: b ? toNumber(b.inflow) - toNumber(b.outflow) : 0,
      moneyIn: b ? toNumber(b.inflow) : 0,
      moneyOut: b ? toNumber(b.outflow) : 0,
      lastCheck: c
        ? {
            actualBalance: toNumber(c.actualBalance),
            difference: toNumber(c.difference),
            asOf: c.asOf,
            state: c.state,
            note: c.note,
            checkedBy: c.checkedBy.name,
          }
        : null,
      movedSinceCheck: Boolean(c && lastMovedAt && lastMovedAt > c.asOf),
      lastMovedAt,
    };
  });
}
