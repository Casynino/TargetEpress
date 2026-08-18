import "server-only";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * The flights Finance has shut and nobody senior has read yet.
 *
 * The handoff the owner described is two facts, not one: Finance closes a
 * batch, and then somebody above Finance agrees the figures. The second half
 * already existed — the statement, the SUBMITTED status, the accept/send-back
 * control on the closed-batches sheet — but it existed nowhere the manager
 * looks, so a statement could sit for a fortnight without anything on his
 * screen saying so. That is what this module is for: the queue, not the ruling.
 *
 * Nothing here recomputes anything. Every figure is read off the statement as
 * it was frozen at the close, including the exchange rate, because the whole
 * point of a statement is that the manager reads the same numbers the day it
 * lands and the day he signs it.
 *
 * RETURNED is not waiting on him. He has already ruled on it and the batch is
 * open again — it is Finance's to fix and close afresh, and listing it here
 * would ask the same person to decide the same thing twice.
 */
export type WaitingStatement = {
  batchId: string;
  batchNumber: string;
  /** Airline and flight number as one string; null when neither was keyed in. */
  flight: string | null;
  /**
   * When the books were shut. Every SUBMITTED statement should carry one —
   * reopening a batch deletes its statement, and sending one back moves it out
   * of SUBMITTED — but the column is nullable, so callers fall back to
   * submittedAt rather than printing a dash on a flight that plainly closed.
   */
  closedAt: Date | null;
  /**
   * Who shut them. A batch that settled itself on its last payment has no
   * submitter at all, which is why closedBy comes along — between the two,
   * every row can say something truer than "—".
   */
  submittedBy: string | null;
  closedBy: string | null;
  submittedAt: Date;
  /** Whole days since it went up. 0 means it landed today. */
  waitingDays: number;

  kg: number;
  /** What the flight was worth: everything billed on it, written off aside. */
  revenueUsd: number;
  expensesUsd: number;
  /**
   * Revenue less every cost booked against the flight. Nullable because the
   * column is: a statement written before the figure was computed leaves it
   * blank rather than reading as a flight that made nothing.
   */
  profitUsd: number | null;
  /** The rate on the day it was closed, so the shillings never move again. */
  rate: number | null;
};

export type StatementSummary = {
  waiting: number;
  /** Days the oldest one has been sitting. Null when nothing is waiting. */
  oldestDays: number | null;
  revenueUsd: number;
  profitUsd: number;
};

const DAY = 86_400_000;
const daysSince = (from: Date, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY));

/**
 * Oldest first, deliberately.
 *
 * The queue is read top to bottom and acted on until it is empty, so the flight
 * that has waited longest has to be the one under the cursor. Newest-first is
 * how the item nobody wants to open sinks out of sight.
 */
export async function submittedStatements(
  now = new Date()
): Promise<WaitingStatement[]> {
  const rows = await prisma.batchStatement.findMany({
    where: { status: "SUBMITTED" },
    orderBy: { submittedAt: "asc" },
    select: {
      batchId: true,
      submittedAt: true,
      submittedBy: { select: { name: true } },
      kgReceived: true,
      receivedUsd: true,
      expensesUsd: true,
      profitUsd: true,
      exchangeRate: true,
      batch: {
        select: {
          batchNumber: true,
          airline: true,
          flightNumber: true,
          closedAt: true,
          closedBy: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    batchId: row.batchId,
    batchNumber: row.batch.batchNumber,
    flight:
      [row.batch.airline, row.batch.flightNumber].filter(Boolean).join(" ") ||
      null,
    closedAt: row.batch.closedAt,
    submittedBy: row.submittedBy?.name ?? null,
    closedBy: row.batch.closedBy?.name ?? null,
    submittedAt: row.submittedAt,
    waitingDays: daysSince(row.submittedAt, now),
    kg: toNumber(row.kgReceived),
    revenueUsd: toNumber(row.receivedUsd),
    expensesUsd: toNumber(row.expensesUsd),
    profitUsd: row.profitUsd === null ? null : toNumber(row.profitUsd),
    rate: row.exchangeRate === null ? null : toNumber(row.exchangeRate),
  }));
}

/**
 * The same queue as one line: how much, how old, how big.
 *
 * The age is the oldest item, not the average — an average of one day and
 * twelve reads as six and describes neither. The money is summed in dollars
 * and converted once by the caller, rather than adding each statement's own
 * frozen shilling figure: those rates differ by weeks, and a total struck
 * across them is a number no rate ever produced.
 *
 * Takes the list when the caller already has it. A screen showing the headline
 * above the rows would otherwise run the same query twice, and could print a
 * count that disagrees with the rows beneath it if a statement were confirmed
 * between the two.
 */
export async function statementSummary(
  rows?: WaitingStatement[],
  now = new Date()
): Promise<StatementSummary> {
  const waiting = rows ?? (await submittedStatements(now));

  return {
    waiting: waiting.length,
    oldestDays: waiting.length > 0 ? waiting[0].waitingDays : null,
    revenueUsd: waiting.reduce((sum, row) => sum + row.revenueUsd, 0),
    profitUsd: waiting.reduce((sum, row) => sum + (row.profitUsd ?? 0), 0),
  };
}
