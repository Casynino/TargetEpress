import "server-only";

/*
  The pure part of this module lives in lib/money.ts and is re-exported here.

  Formatting a figure needs no database and no request, but this file does —
  it reads the published rate — so anything importing a formatter from here
  was importing the server with it, and a client component doing that fails
  the build. Existing imports from "@/lib/fx" keep working.
*/
export {
  BASE_CURRENCY,
  LOCAL_CURRENCY,
  formatLocal,
  formatShillings,
  formatUsd,
  toLocal,
} from "@/lib/money";

import { BASE_CURRENCY, LOCAL_CURRENCY } from "@/lib/money";

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



