import "server-only";

import type { ReviewTarget } from "@prisma/client";

import { approvalQueues } from "@/lib/approvals";
import { toNumber } from "@/lib/format";
import { accountBalances } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { reconciliation } from "@/lib/reconciliation";

/**
 * The manager's control layer: what the books say against what the world says.
 *
 * Every other engine in this app derives its figures from the company's own
 * records, which is why they can be trusted to agree with each other and why
 * they can never catch the one thing a control is for. A ledger compared with
 * itself reports zero every time. The only figures that can contradict it come
 * from outside — a bank statement, a count of the till, a balance on a phone —
 * and until somebody types one in there is nothing here to reconcile against.
 *
 * So this module reads two things and joins them: the derived position, from
 * the engines that already own it, and the human verdicts recorded beside it.
 * It computes no money of its own.
 */

const DAY = 86_400_000;

/* ------------------------------------------------------------------ accounts */

export type AccountStanding = {
  id: string;
  name: string;
  kind: string;
  /** The account's OWN currency. Never converted — see the note below. */
  currency: string;
  /**
   * Balance in the account's own currency.
   *
   * Not restated in shillings, unlike every customer-facing figure in this app.
   * A bank account holds what it holds; putting a dollar account through
   * today's rate would print a number the bank statement will never show, on
   * the one screen whose entire job is to be compared against that statement.
   */
  balance: number;
  moneyIn: number;
  moneyOut: number;
  entries: number;
  lastMovedAt: Date | null;
  /** The newest check, or null where nobody has ever checked this account. */
  lastCheck: {
    id: string;
    asOf: Date;
    state: string;
    difference: number;
    checkedBy: string;
    note: string | null;
  } | null;
  /**
   * Money has moved since the last check, so the check no longer describes the
   * account. A reconciliation is a statement about a moment; an old one sitting
   * beside a moved balance is the most misleading thing this page could show,
   * because it reads as reassurance.
   */
  staleSince: number | null;
  /** Days since anybody checked. Null when nobody ever has. */
  daysSinceCheck: number | null;
};

export async function accountStandings(now = new Date()): Promise<AccountStanding[]> {
  const [accounts, balances, checks] = await Promise.all([
    prisma.companyAccount.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, currency: true },
    }),
    accountBalances(prisma),
    /* Every account's newest check in ONE query rather than one per account:
       distinct on accountId with the newest first is what Prisma's `distinct`
       does over an ordered findMany. */
    prisma.accountReconciliation.findMany({
      orderBy: [{ accountId: "asc" }, { asOf: "desc" }, { createdAt: "desc" }],
      distinct: ["accountId"],
      select: {
        id: true,
        accountId: true,
        asOf: true,
        state: true,
        difference: true,
        note: true,
        checkedBy: { select: { name: true } },
      },
    }),
  ]);

  const byAccount = new Map(balances.map((b) => [b.accountId, b]));
  const checkByAccount = new Map(checks.map((c) => [c.accountId, c]));

  return accounts.map((a) => {
    const b = byAccount.get(a.id);
    const c = checkByAccount.get(a.id);
    const lastMovedAt = b?.lastMovedAt ?? null;

    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      currency: a.currency,
      balance: b ? toNumber(b.inflow) - toNumber(b.outflow) : 0,
      moneyIn: b ? toNumber(b.inflow) : 0,
      moneyOut: b ? toNumber(b.outflow) : 0,
      entries: b ? Number(b.entries) : 0,
      lastMovedAt,
      lastCheck: c
        ? {
            id: c.id,
            asOf: c.asOf,
            state: c.state,
            difference: toNumber(c.difference),
            checkedBy: c.checkedBy.name,
            note: c.note,
          }
        : null,
      staleSince:
        c && lastMovedAt && lastMovedAt > c.asOf
          ? Math.max(0, Math.floor((now.getTime() - c.asOf.getTime()) / DAY))
          : null,
      daysSinceCheck: c
        ? Math.max(0, Math.floor((now.getTime() - c.asOf.getTime()) / DAY))
        : null,
    };
  });
}

/** One account's movements and its full history of being checked. */
export async function accountHistory(accountId: string, take = 40) {
  const [account, entries, checks] = await Promise.all([
    prisma.companyAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        kind: true,
        currency: true,
        accountNumber: true,
        institution: true,
        active: true,
      },
    }),
    prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: [{ occurredAt: "desc" }, { entryNumber: "desc" }],
      take,
      select: {
        id: true,
        entryNumber: true,
        direction: true,
        kind: true,
        amount: true,
        currency: true,
        occurredAt: true,
        description: true,
        sourceEntity: true,
        sourceId: true,
      },
    }),
    prisma.accountReconciliation.findMany({
      where: { accountId },
      orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
      take: 24,
      select: {
        id: true,
        asOf: true,
        systemBalance: true,
        actualBalance: true,
        difference: true,
        currency: true,
        state: true,
        note: true,
        createdAt: true,
        checkedBy: { select: { name: true } },
      },
    }),
  ]);

  if (!account) return null;
  return { account, entries, checks };
}

/* ------------------------------- what the account screens actually ask for */

/**
 * The newest check on every account, keyed by account.
 *
 * A narrower read than `accountStandings` on purpose: the accounts screens
 * already fetch their own accounts and balances, and handing them a second copy
 * of both would put two versions of one balance on one page and invite them to
 * drift. This gives them only the part they cannot derive — the human verdict.
 *
 * The row is handed over as stored rather than reshaped. The screen owns "has
 * it moved since the check" — it already holds the balances that answer it, and
 * deriving that here from a second read would put two versions of one fact on
 * one page.
 */
export async function reconciliationStandings() {
  return new Map(
    (
      await prisma.accountReconciliation.findMany({
        orderBy: [{ accountId: "asc" }, { asOf: "desc" }, { createdAt: "desc" }],
        distinct: ["accountId"],
        select: {
          accountId: true,
          asOf: true,
          state: true,
          difference: true,
          note: true,
          checkedBy: { select: { name: true } },
        },
      })
    ).map((c) => [c.accountId, c] as const)
  );
}

/** One account's checks, newest first. The history IS the control. */
export async function reconciliationHistory(accountId: string, take = 24) {
  return prisma.accountReconciliation.findMany({
    where: { accountId },
    orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      accountId: true,
      asOf: true,
      systemBalance: true,
      actualBalance: true,
      difference: true,
      currency: true,
      state: true,
      note: true,
      createdAt: true,
      checkedBy: { select: { name: true } },
    },
  });
}

/* ------------------------------------------------------------------ verdicts */

export type Standing = {
  state: string;
  reason: string | null;
  reviewedBy: string;
  at: Date;
};

/**
 * The current verdict on each of these records.
 *
 * ONE QUERY FOR THE WHOLE PAGE. A review list renders fifty payments, and
 * asking per row would be fifty round trips for a column most rows have nothing
 * in. `distinct` over a descending order gives the newest row per target, which
 * is what "current standing" means in an append-only table.
 */
export async function reviewsFor(
  target: ReviewTarget,
  targetIds: string[]
): Promise<Map<string, Standing>> {
  if (targetIds.length === 0) return new Map();

  const rows = await prisma.managerReview.findMany({
    where: { target, targetId: { in: targetIds } },
    orderBy: [{ targetId: "asc" }, { createdAt: "desc" }],
    distinct: ["targetId"],
    select: {
      targetId: true,
      state: true,
      reason: true,
      createdAt: true,
      reviewedBy: { select: { name: true } },
    },
  });

  return new Map(
    rows.map((r) => [
      r.targetId,
      {
        state: r.state,
        reason: r.reason,
        reviewedBy: r.reviewedBy.name,
        at: r.createdAt,
      },
    ])
  );
}

/** The full history of one record's verdicts, oldest first — the audit trail. */
export async function reviewHistory(target: ReviewTarget, targetId: string) {
  return prisma.managerReview.findMany({
    where: { target, targetId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      state: true,
      reason: true,
      createdAt: true,
      reviewedBy: { select: { name: true } },
    },
  });
}

export type OpenReview = {
  id: string;
  target: ReviewTarget;
  targetId: string;
  state: string;
  reason: string | null;
  reviewedBy: string;
  at: Date;
  waitingDays: number;
};

/**
 * Every record a manager has disputed and nobody has closed.
 *
 * Only the NEWEST verdict counts: a payment sent back on Monday and reconciled
 * on Friday is finished, and listing it because the Monday row still exists
 * would make this queue grow forever and be abandoned within a month.
 */
export async function openReviews(now = new Date()): Promise<OpenReview[]> {
  const newest = await prisma.managerReview.findMany({
    orderBy: [{ target: "asc" }, { targetId: "asc" }, { createdAt: "desc" }],
    distinct: ["target", "targetId"],
    select: {
      id: true,
      target: true,
      targetId: true,
      state: true,
      reason: true,
      createdAt: true,
      reviewedBy: { select: { name: true } },
    },
  });

  return newest
    .filter(
      (r) =>
        r.state === "SENT_BACK" ||
        r.state === "MISMATCH" ||
        r.state === "UNDER_REVIEW"
    )
    .map((r) => ({
      id: r.id,
      target: r.target,
      targetId: r.targetId,
      state: r.state,
      reason: r.reason,
      reviewedBy: r.reviewedBy.name,
      at: r.createdAt,
      waitingDays: Math.max(
        0,
        Math.floor((now.getTime() - r.createdAt.getTime()) / DAY)
      ),
    }))
    .sort((a, b) => b.waitingDays - a.waitingDays);
}

/* ---------------------------------------------------------------- the control room */

export type ControlLine = {
  key: string;
  label: string;
  detail: string;
  count: number;
  /** Days the oldest item has waited. Null when the line is clear. */
  oldestDays: number | null;
  href: string;
  tone: "bad" | "warn" | "info";
};

/**
 * Everything waiting on this desk, in one list, with how long it has waited.
 *
 * COMPOSED, NEVER RECOMPUTED. Every line comes from the engine that already
 * owns that queue — approvals, reconciliation checks, account standings,
 * disputes. This module's job is to put them in one order, not to count
 * anything a second time.
 *
 * The age is the finding. A queue of eleven that arrived this morning is a
 * normal Tuesday; a queue of one that nobody has touched in nine days is the
 * thing this page exists to surface, and only the age tells them apart.
 *
 * NOT INCLUDED: the owner's "large expenses require review". Nothing in this
 * schema or in company settings defines what "large" means, and picking a
 * number here would invent a company policy in a display module. It belongs in
 * settings first, as a figure the owner sets.
 */
export async function controlRoom(now = new Date()): Promise<ControlLine[]> {
  const [queues, checks, accounts, disputes] = await Promise.all([
    approvalQueues(now),
    reconciliation(),
    accountStandings(now),
    openReviews(now),
  ]);

  const lines: ControlLine[] = [];

  /* The decision queues, straight from the approvals engine. */
  for (const q of queues) {
    if (q.count === 0) continue;
    lines.push({
      key: `queue:${q.key}`,
      label: q.label,
      detail: q.detail,
      count: q.count,
      oldestDays: q.oldestDays,
      href: q.href,
      tone: (q.oldestDays ?? 0) >= 3 ? "bad" : "warn",
    });
  }

  /* Accounts nobody has checked, and checks that the ledger has moved past. */
  const never = accounts.filter((a) => a.lastCheck === null);
  if (never.length > 0) {
    lines.push({
      key: "accounts:never",
      label: "Accounts never checked",
      detail: "No one has compared these against a statement or a count.",
      count: never.length,
      oldestDays: null,
      href: "/app/finance/accounts",
      tone: "warn",
    });
  }

  const stale = accounts.filter((a) => a.staleSince !== null);
  if (stale.length > 0) {
    lines.push({
      key: "accounts:stale",
      label: "Checks the money has moved past",
      detail: "Reconciled once, but the balance has changed since.",
      count: stale.length,
      oldestDays: Math.max(...stale.map((a) => a.staleSince ?? 0)),
      href: "/app/finance/accounts",
      tone: "warn",
    });
  }

  const mismatched = accounts.filter((a) => a.lastCheck?.state === "MISMATCH");
  if (mismatched.length > 0) {
    lines.push({
      key: "accounts:mismatch",
      label: "Accounts that did not balance",
      detail: "The statement and the ledger disagree, and nobody has closed it.",
      count: mismatched.length,
      oldestDays: Math.max(...mismatched.map((a) => a.daysSinceCheck ?? 0)),
      href: "/app/finance/accounts",
      tone: "bad",
    });
  }

  /* Records disputed and not yet resolved. */
  if (disputes.length > 0) {
    const sentBack = disputes.filter((d) => d.state === "SENT_BACK").length;
    lines.push({
      key: "reviews:open",
      label: "Records you have questioned",
      detail: sentBack > 0
        ? `${sentBack} sent back to the desk that recorded them.`
        : "Flagged or under review, and still open.",
      count: disputes.length,
      oldestDays: disputes[0]?.waitingDays ?? null,
      /* Questioned records are raised on Batch finances and shown there; the
         standalone review page came out at the owner's instruction. */
      href: "/app/manager/batches",
      tone: "warn",
    });
  }

  /* The integrity checks that failed — the books disagreeing with themselves. */
  const failing = checks.checks.filter((c) => !c.ok);
  if (failing.length > 0) {
    lines.push({
      key: "reconciliation:failing",
      label: "Checks that disagree",
      detail: failing.map((c) => c.label).join(" · "),
      count: failing.length,
      oldestDays: null,
      href: "/app/manager/reconciliation",
      tone: "bad",
    });
  }

  /* Worst first: a thing failing outranks a thing merely waiting, and within
     each, the one that has waited longest. */
  const rank = { bad: 0, warn: 1, info: 2 } as const;
  return lines.sort(
    (a, b) =>
      rank[a.tone] - rank[b.tone] || (b.oldestDays ?? 0) - (a.oldestDays ?? 0)
  );
}
