import "server-only";

import { Prisma } from "@prisma/client";
import type { AccountKind, LedgerDirection, LedgerKind } from "@prisma/client";

import { nextLedgerNumber } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import type { TxClient } from "@/lib/prisma";

/**
 * Posting a line to the general ledger.
 *
 * Always called with the transaction client of the action that moved the money,
 * never with the bare prisma singleton. That is the whole design: a payment and
 * its ledger line commit together or not at all, exactly as a payment and its
 * receipt already do. Money that moved without a line, or a line without money,
 * are both worse than either failing outright.
 *
 * The ledger is append-only. There is no update and no delete here on purpose —
 * a line that turns out to be wrong is cancelled by a reversing line that points
 * back at it, so the register keeps both what was believed at the time and what
 * corrected it.
 */
export type PostEntry = {
  accountId: string;
  /** The account's own currency. Passed in rather than re-read, so the caller
   *  has already had to think about whether the money fits the account. */
  currency: string;
  direction: LedgerDirection;
  kind: LedgerKind;
  /** Positive, in the account's currency. `direction` carries the sign. */
  amount: number;
  /** The same money in USD, so totals can cross accounts of mixed currency. */
  amountUsd: number;
  /** Null when the account is already in USD. */
  exchangeRate?: number | null;
  /** When the money moved — not when the row was typed. */
  occurredAt: Date;
  description: string;
  sourceEntity: string;
  sourceId?: string | null;
  paymentId?: string | null;
  expenseId?: string | null;
  /** Set on both legs of a transfer; the pair (transferId, direction) is unique. */
  transferId?: string | null;
  /** Set on both legs of money borrowed or repaid; unique with direction. */
  loanMovementId?: string | null;
  recordedById?: string | null;
  /**
   * The entry this one cancels.
   *
   * A wrong line is never edited or deleted — it is answered by an opposite
   * one that points back at it, so the register still shows what was believed
   * at the time and what corrected it. The column is unique, so the same entry
   * cannot be reversed twice.
   */
  reversesId?: string | null;
  /**
   * Post to an account that has been closed. Only closing it may: the
   * transfer that empties it is the one new movement a closed account takes.
   */
  onClosedAccount?: boolean;
};

/*
  WHAT MAY TOUCH A LOAN ACCOUNT.

  A cost the lender paid (EXPENSE, and its correction going the other way),
  money she handed over or was paid back (LOAN_*), and the adjustments that
  correct a line. Nothing else: a customer's payment, a transfer, a delivery
  fare or an opening balance on a loan account would be company money filed
  as a debt, or a debt filed as company money.

  Checked HERE because this is the one door every movement of money passes
  through. Each screen that takes a customer's money already leaves loans out
  of its list and each action refuses them — this is what holds if one of
  those is ever forgotten.
*/
const LOAN_ACCOUNT_KINDS: LedgerKind[] = [
  "EXPENSE",
  "ADJUSTMENT",
  "LOAN_RECEIVED",
  "LOAN_REPAYMENT",
];

export async function postLedgerEntry(tx: TxClient, entry: PostEntry) {
  const account = await tx.companyAccount.findUnique({
    where: { id: entry.accountId },
    select: { kind: true, name: true },
  });
  /*
    NOTHING NEW LANDS ON A CLOSED ACCOUNT.

    Each form refuses a closed account when it reads it, but it reads it
    before it writes — so a payment or a cost begun while M-Pesa was being
    closed into Lipa could still post to M-Pesa after the close had taken its
    balance, leaving it closed and holding money nobody moved. Re-read here,
    under a share lock: a close already under way (it holds the row) makes
    this wait and then refuse; a post already under way makes the close wait
    and then count it.

    A reversal is let through — cancelling an old M-Pesa payment has to undo
    it on M-Pesa, where it was recorded — and so is a loan, which is never
    closed this way and whose row a repayment already holds.
  */
  if (account && account.kind !== "LOAN" && !entry.reversesId && !entry.onClosedAccount) {
    const [row] = await tx.$queryRaw<{ active: boolean }[]>`
      SELECT "active" FROM "CompanyAccount" WHERE "id" = ${entry.accountId} FOR SHARE`;
    if (row && !row.active) {
      throw new Error(
        `${account.name} has been closed, so nothing new can be recorded into it. Use the account that replaced it.`
      );
    }
  }
  if (account?.kind === "LOAN" && !LOAN_ACCOUNT_KINDS.includes(entry.kind)) {
    throw new Error(
      `${account.name} is money the company owes, not a company account, so nothing but a cost it paid or a repayment can be put against it.`
    );
  }
  if (
    account &&
    account.kind !== "LOAN" &&
    (entry.kind === "LOAN_RECEIVED" || entry.kind === "LOAN_REPAYMENT") &&
    !entry.loanMovementId &&
    !entry.reversesId
  ) {
    throw new Error("Money borrowed or repaid must be recorded on the loan.");
  }
  return tx.ledgerEntry.create({
    data: {
      entryNumber: await nextLedgerNumber(tx, entry.occurredAt.getFullYear()),
      accountId: entry.accountId,
      direction: entry.direction,
      kind: entry.kind,
      amount: new Prisma.Decimal(entry.amount),
      currency: entry.currency,
      amountUsd: new Prisma.Decimal(entry.amountUsd),
      exchangeRate:
        entry.exchangeRate === null || entry.exchangeRate === undefined
          ? null
          : new Prisma.Decimal(entry.exchangeRate),
      occurredAt: entry.occurredAt,
      description: entry.description,
      sourceEntity: entry.sourceEntity,
      sourceId: entry.sourceId ?? null,
      paymentId: entry.paymentId ?? null,
      expenseId: entry.expenseId ?? null,
      transferId: entry.transferId ?? null,
      loanMovementId: entry.loanMovementId ?? null,
      recordedById: entry.recordedById ?? null,
      reversesId: entry.reversesId ?? null,
    },
  });
}

/**
 * What an account is worth, derived every time.
 *
 * Nothing anywhere stores a balance. This codebase derives every money figure
 * it shows — outstanding, collected, batch finance — and that discipline is the
 * reason none of them has ever drifted from the rows underneath. A stored
 * balance is a second source of truth that is correct only until the first
 * process crashes between the movement and the update.
 */
/**
 * A LINE THAT STILL MEANS SOMETHING.
 *
 * The register is append-only, so cancelling a movement leaves the original
 * line and adds one going the other way. The pair nets to zero, which is why
 * `balance` has always been right — but `inflow` and `outflow` are reported on
 * their own, and keeping either half turns a cancellation into fresh money on
 * one side and fresh spending on the other. Every account screen reads these,
 * so one account showing "Received TSh 145,450" when nothing has ever come
 * into that tin came from here.
 *
 * Both halves go: the reversal, and the line it answers. The balance is
 * untouched by the change — the pair is the same amount in both directions on
 * the same account, so removing it moves nothing.
 *
 * `entries` deliberately still counts everything: the register on screen lists
 * every line including the cancelled ones, and a count that disagreed with the
 * list beneath it would be a second small wrongness in place of the first.
 */
const LIVE = Prisma.sql`
  e."reversesId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "LedgerEntry" r WHERE r."reversesId" = e."id"
  )
`;

export async function accountBalances(
  client: { $queryRaw: typeof import("@/lib/prisma").prisma.$queryRaw }
) {
  return client.$queryRaw<
    {
      accountId: string;
      /* The currency the account is actually held in. Without it a caller
         totalling several accounts has to convert the frozen dollar column at
         today's rate, which is not what the account holds. */
      currency: string;
      /* What kind of account: every total of company money leaves out LOAN,
         whose balance is a debt, and needs this to do it without a second
         lookup. */
      kind: AccountKind;
      inflow: Prisma.Decimal;
      outflow: Prisma.Decimal;
      inflowUsd: Prisma.Decimal;
      outflowUsd: Prisma.Decimal;
      entries: bigint;
      lastMovedAt: Date | null;
    }[]
  >(Prisma.sql`
    SELECT
      e."accountId",
      a."currency",
      a."kind",
      COALESCE(SUM(e."amount")    FILTER (WHERE e."direction" = 'IN'  AND ${LIVE}), 0) AS "inflow",
      COALESCE(SUM(e."amount")    FILTER (WHERE e."direction" = 'OUT' AND ${LIVE}), 0) AS "outflow",
      COALESCE(SUM(e."amountUsd") FILTER (WHERE e."direction" = 'IN'  AND ${LIVE}), 0) AS "inflowUsd",
      COALESCE(SUM(e."amountUsd") FILTER (WHERE e."direction" = 'OUT' AND ${LIVE}), 0) AS "outflowUsd",
      COUNT(*)                                                                         AS "entries",
      MAX(e."occurredAt")                                                              AS "lastMovedAt"
    FROM "LedgerEntry" e
    JOIN "CompanyAccount" a ON a."id" = e."accountId"
    GROUP BY e."accountId", a."currency", a."kind"
  `);
}

/**
 * MONEY THAT ACTUALLY LEFT THE BUSINESS.
 *
 * "What went out this month" was asked in three places and answered three
 * different ways. The Finance overview added up the Expense table, so a
 * customer refunded and a delivery fare handed to a driver — money genuinely
 * gone out of a till — appeared nowhere on it. The owner's dashboard read the
 * register but only for costs and refunds, so it missed the fare too. The
 * general ledger counted every line and was the only one right, which is why
 * it always showed more going out than the cards above it, on the same month,
 * in the same business.
 *
 * One definition now, and it lives here. A movement is money out if it took
 * money out of the company: a cost, a customer paid back, a fare passed on.
 * A transfer between our own accounts is not — carrying cash from the tin to
 * the bank spends nothing — and neither half of a cancelled pair is, since a
 * reversal answers a line that was already counted.
 *
 * Out of a COMPANY account. A cost a lender paid from her own pocket is a real
 * cost, and Profit & loss carries it from the day it was paid — but no company
 * money left for it, so it is not money out until the company pays him back,
 * and that repayment is counted beside money out (see loanCashRows), never as
 * a cost inside it.
 */
export const MONEY_OUT_KINDS = [
  "EXPENSE",
  "COMPENSATION",
  /*
    The delivery fare.

    The customer sends it in the same transfer as the cargo money, so the
    whole lump is in Money in — and it is handed straight to whoever drives,
    so it has to be in Money out as well. Counting it on one side only makes
    the business look like it kept shillings it never had.
  */
  "TRANSPORT_OUT",
  /* A withdrawn feature left one row of this kind behind — TSh 100,000 that
     really did leave CRDB. Nothing writes it any more, and leaving it out
     would hide money that is gone. */
  "EXECUTIVE_DRAW",
] satisfies LedgerKind[];

/**
 * BORROWING AND REPAYING — NEITHER MONEY EARNED NOR MONEY SPENT.
 *
 * Both legs of a loan movement sit in the register like a transfer's do, and
 * are left out of every figure of money in or money out: the lender's cash
 * arriving is not income, and paying him back is not a cost. A statement of
 * cash — what the company's own accounts gained and lost — still has to show
 * them, on lines of their own; loanCashRows is where it reads them.
 */
export const LOAN_LEDGER_KINDS = [
  "LOAN_RECEIVED",
  "LOAN_REPAYMENT",
] satisfies LedgerKind[];

/**
 * A LEG THAT STILL MEANS SOMETHING.
 *
 * Not a reversal, and not a line that has been reversed. Cancelling a cost
 * answers its line with one going the other way, so without the second test
 * the cancelled cost stays in the month's spending and the money that came
 * back is not shown at all. Exported so a caller needing its own `select` can
 * ask the same question rather than writing a second version of it.
 */
export const LIVE_LEG = {
  reversesId: null,
  reversedBy: { is: null },
} as const;

/**
 * Those lines, as rows rather than a total.
 *
 * Rows, because shillings are added up as shillings and only foreign money
 * goes through the dollar snapshot — see lib/money-totals.ts. A caller that
 * wants one figure passes these to sumShillings or sumUsd; a caller that wants
 * to say "4 payments out" counts them.
 */
export async function moneyOutRows(
  window: {
    from?: Date;
    to?: Date;
    /* A narrower slice of the same definition — the Expenses page asks for
       exactly the outgoings that are NOT costs, so it can name the difference
       between its own total and the register's. */
    kinds?: (typeof MONEY_OUT_KINDS)[number][];
  } = {}
) {
  const occurredAt =
    window.from || window.to
      ? {
          ...(window.from ? { gte: window.from } : {}),
          ...(window.to ? { lt: window.to } : {}),
        }
      : undefined;

  return prisma.ledgerEntry.findMany({
    where: {
      direction: "OUT",
      kind: { in: window.kinds ?? MONEY_OUT_KINDS },
      account: { kind: { not: "LOAN" } },
      ...(occurredAt ? { occurredAt } : {}),
      ...LIVE_LEG,
    },
    select: { kind: true, amount: true, currency: true, amountUsd: true },
  });
}

/**
 * Money a lender handed the company, and money the company paid her back, as
 * it moved through the company's own accounts in a window — the company-side
 * leg of each loan movement, live ones only. For a statement of cash to add
 * beside money in and money out; never to be added into either.
 */
export async function loanCashRows(window: { from?: Date; to?: Date } = {}) {
  const occurredAt =
    window.from || window.to
      ? {
          ...(window.from ? { gte: window.from } : {}),
          ...(window.to ? { lt: window.to } : {}),
        }
      : undefined;
  return prisma.ledgerEntry.findMany({
    where: {
      kind: { in: [...LOAN_LEDGER_KINDS] },
      account: { kind: { not: "LOAN" } },
      ...(occurredAt ? { occurredAt } : {}),
      ...LIVE_LEG,
    },
    select: { kind: true, direction: true, amount: true, currency: true, amountUsd: true },
  });
}
