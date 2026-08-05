import "server-only";

import { Prisma } from "@prisma/client";
import type { LedgerDirection, LedgerKind } from "@prisma/client";

import { nextLedgerNumber } from "@/lib/ids";
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
  recordedById?: string | null;
};

export async function postLedgerEntry(tx: TxClient, entry: PostEntry) {
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
      recordedById: entry.recordedById ?? null,
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
export async function accountBalances(
  client: { $queryRaw: typeof import("@/lib/prisma").prisma.$queryRaw }
) {
  return client.$queryRaw<
    {
      accountId: string;
      inflow: Prisma.Decimal;
      outflow: Prisma.Decimal;
      inflowUsd: Prisma.Decimal;
      outflowUsd: Prisma.Decimal;
      entries: bigint;
      lastMovedAt: Date | null;
    }[]
  >(Prisma.sql`
    SELECT
      "accountId",
      COALESCE(SUM("amount")    FILTER (WHERE "direction" = 'IN'),  0) AS "inflow",
      COALESCE(SUM("amount")    FILTER (WHERE "direction" = 'OUT'), 0) AS "outflow",
      COALESCE(SUM("amountUsd") FILTER (WHERE "direction" = 'IN'),  0) AS "inflowUsd",
      COALESCE(SUM("amountUsd") FILTER (WHERE "direction" = 'OUT'), 0) AS "outflowUsd",
      COUNT(*)                                                         AS "entries",
      MAX("occurredAt")                                                AS "lastMovedAt"
    FROM "LedgerEntry"
    GROUP BY "accountId"
  `);
}
