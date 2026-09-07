/**
 * ADDING MONEY UP WITHOUT LOSING ANY OF IT.
 *
 * Every movement in this system is stored twice: `amount`, exactly as it was
 * typed, in the currency it was typed in; and `amountUsd`, a Decimal(12,2)
 * snapshot kept so movements in different currencies can be totalled against
 * each other. The second is a convenience. It is not the money.
 *
 * Summing the snapshot and multiplying back by the rate loses a fraction of a
 * cent per row and then magnifies it by 2,700. Two office costs of TSh 20,000
 * and TSh 40,000 reached the Dar desk as TSh 59,994, because 7.41 + 14.81 is
 * 22.22 and 22.22 x 2700 is not 60,000 — and the same sixty thousand read as
 * three different figures on three different screens, which is worse than any
 * one of them being wrong.
 *
 * The error is per ROW, not per shilling: one cost of a million was out by 1,
 * fifty costs of twenty thousand were out by 350. So it is the busiest days
 * that drift furthest, which is exactly backwards.
 *
 * The rule, everywhere: shillings are added up as shillings, in the unit they
 * were typed in, and only genuinely foreign money goes through the snapshot.
 * This file exists so that rule lives in ONE place rather than being
 * remembered at each of the two dozen call sites that total something.
 */

import type { Prisma } from "@prisma/client";

import { toNumber } from "@/lib/format";

/** What the business keeps its books and its counter in. */
export const LOCAL_CURRENCY = "TZS";

/** Anything with a figure, its currency, and the dollar snapshot beside it. */
type Numeric = number | string | Prisma.Decimal | null | undefined;

export type MoneyRow = {
  currency: string;
  amount: Numeric;
  amountUsd: Numeric;
  /**
   * THE EXACT SHILLING FIGURE, WHERE ONE REALLY EXISTS.
   *
   * Foreign money usually has no exact shilling answer — a dollar expense was
   * never shillings, so it is worth whatever today's rate says. A BILL is the
   * exception: it was quoted to a customer at a rate frozen onto it, and that
   * shilling figure is the one they were given and the one they paid. Without
   * this, a flight's shilling revenue was recomputed at today's rate every
   * time the page was opened, so last month's dispatch quietly earned a
   * different amount whenever the rate moved.
   *
   * Optional. A row that has no such figure leaves it out and is converted as
   * before.
   */
  amountLocal?: Numeric;
};

/**
 * One row in shillings — exact when it already was shillings.
 *
 * Foreign money has no exact answer: it was never shillings, so it is worth
 * whatever today's rate says, and the snapshot is the honest source for it.
 * With no rate published there is nothing truthful to show, so it contributes
 * nothing rather than silently counting as its dollar figure.
 */
export function rowInShillings(row: MoneyRow, rate: number | null): number {
  if (row.currency === LOCAL_CURRENCY) return toNumber(row.amount);
  /* A figure that was fixed in shillings at the time stands as it is — see
     amountLocal. Only money with no shilling figure of its own is converted. */
  if (row.amountLocal !== null && row.amountLocal !== undefined) {
    return toNumber(row.amountLocal);
  }
  return rate ? toNumber(row.amountUsd) * rate : 0;
}

/** A set of movements in shillings, losing nothing that was already shillings. */
export function sumShillings(rows: MoneyRow[], rate: number | null): number {
  return rows.reduce((total, row) => total + rowInShillings(row, rate), 0);
}

/**
 * The same set in dollars.
 *
 * The mirror image of the rule above: a dollar movement is exact and shilling
 * money is the conversion. Kept here beside it so the two can never drift into
 * disagreeing about the same list.
 */
export function sumUsd(rows: MoneyRow[], rate: number | null): number {
  return rows.reduce((total, row) => {
    if (row.currency !== LOCAL_CURRENCY) return total + toNumber(row.amountUsd);
    const native = toNumber(row.amount);
    return total + (rate ? native / rate : toNumber(row.amountUsd));
  }, 0);
}
