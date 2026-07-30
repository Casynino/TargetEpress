import "server-only";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * USD → TZS.
 *
 * Prices are quoted in USD; almost everyone pays in shillings. Two rules govern
 * everything here:
 *
 *  1. The rate is a dated history, not a setting. Updating it inserts a new row.
 *  2. An invoice stores the rate it used. Nothing recalculates an old invoice,
 *     because a customer who was told "TZS 202,500" must still see that figure
 *     in six months, whatever the rate has done since.
 */

export const BASE_CURRENCY = "USD";
export const LOCAL_CURRENCY = "TZS";

/** The rate in force at a moment — latest effective row on or before it. */
export async function currentRate(asOf: Date = new Date()) {
  return prisma.exchangeRate.findFirst({
    where: {
      active: true,
      fromCurrency: BASE_CURRENCY,
      toCurrency: LOCAL_CURRENCY,
      effectiveFrom: { lte: asOf },
    },
    orderBy: { effectiveFrom: "desc" },
    include: { setBy: { select: { name: true } } },
  });
}

/** Numeric rate, or null when none has been published yet. */
export async function currentRateValue(asOf?: Date): Promise<number | null> {
  const row = await currentRate(asOf);
  return row ? toNumber(row.rate) : null;
}

/** Rate history, newest first, for the management screen. */
export async function rateHistory(take = 20) {
  return prisma.exchangeRate.findMany({
    orderBy: { effectiveFrom: "desc" },
    take,
    include: { setBy: { select: { name: true } } },
  });
}

/**
 * Converts USD to TZS at a given rate.
 *
 * Rounded to whole shillings: there is no sub-shilling coin, and showing
 * decimals on a TZS figure looks like a system that does not understand the
 * currency it is quoting.
 */
export function toLocal(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

export function formatLocal(amount: number, currency = LOCAL_CURRENCY) {
  return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
}

export function formatUsd(amount: number) {
  return `${BASE_CURRENCY} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
