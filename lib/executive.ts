import "server-only";

import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { prisma } from "@/lib/prisma";

/**
 * The executive account: what the company has advanced, and what has come back.
 *
 * A draw is NOT a cost. Money taken out for executive use buys the business
 * nothing, so booking it as an expense makes a good month read as a poor one
 * and hides the only figure that actually matters here — the running balance
 * between the company and its director. It was being recorded as an expense
 * called "BOSS", sitting inside office overhead and quietly reducing profit.
 *
 * So it is its own account, with its own register and its own report. Nothing
 * about it is hidden: every row moves real cash and writes a line to the same
 * general ledger as everything else, so the bank position stays right and the
 * audit log carries who did what. What changes is that it is no longer mixed
 * into the cost of running the business.
 *
 * The balance is derived, never stored — withdrawn less returned, computed
 * from the rows every time, exactly as every other money figure in this
 * system. A stored balance is a second source of truth that is correct only
 * until the first process crashes between the movement and the update.
 */

export type ExecutiveSummary = {
  withdrawnUsd: number;
  returnedUsd: number;
  /** Positive means the executive owes the company. */
  balanceUsd: number;
  withdrawnThisMonthUsd: number;
  returnedThisMonthUsd: number;
  draws: number;
  returns: number;
  lastMovementAt: Date | null;
  rate: number | null;
};

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

/** Totals for the cards, and for the dashboard tile. */
export async function executiveSummary(): Promise<ExecutiveSummary> {
  const live = { voidedAt: null };
  const month = { gte: startOfMonth() };

  const [drawn, returned, drawnMonth, returnedMonth, last, rate] =
    await Promise.all([
      prisma.executiveEntry.aggregate({
        where: { ...live, direction: "DRAW" },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.executiveEntry.aggregate({
        where: { ...live, direction: "RETURN" },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.executiveEntry.aggregate({
        where: { ...live, direction: "DRAW", occurredAt: month },
        _sum: { amountUsd: true },
      }),
      prisma.executiveEntry.aggregate({
        where: { ...live, direction: "RETURN", occurredAt: month },
        _sum: { amountUsd: true },
      }),
      prisma.executiveEntry.findFirst({
        where: live,
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
      currentRateValue(),
    ]);

  const withdrawnUsd = toNumber(drawn._sum.amountUsd);
  const returnedUsd = toNumber(returned._sum.amountUsd);

  return {
    withdrawnUsd,
    returnedUsd,
    balanceUsd: withdrawnUsd - returnedUsd,
    withdrawnThisMonthUsd: toNumber(drawnMonth._sum.amountUsd),
    returnedThisMonthUsd: toNumber(returnedMonth._sum.amountUsd),
    draws: drawn._count,
    returns: returned._count,
    lastMovementAt: last?.occurredAt ?? null,
    rate,
  };
}

export type ExecutiveFilters = {
  from?: Date | null;
  to?: Date | null;
  direction?: "DRAW" | "RETURN" | null;
  accountId?: string | null;
  q?: string | null;
  /** Cancelled rows are hidden by default; they are never deleted. */
  includeVoid?: boolean;
};

/**
 * The register, newest first, with a running balance.
 *
 * The balance beside each row is what the account stood at after that
 * movement, which is how somebody checks a figure against the row above it
 * rather than re-adding the column. Computed oldest-first and then reversed,
 * because a running balance only means anything in the order money moved.
 */
export async function executiveEntries(
  filters: ExecutiveFilters = {},
  take = 200
) {
  const where = {
    ...(filters.includeVoid ? {} : { voidedAt: null }),
    ...(filters.direction ? { direction: filters.direction } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lt: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { reason: { contains: filters.q, mode: "insensitive" as const } },
            { note: { contains: filters.q, mode: "insensitive" as const } },
            {
              entryNumber: {
                contains: filters.q,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const rows = await prisma.executiveEntry.findMany({
    where,
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    take,
    include: {
      account: { select: { name: true, currency: true } },
      recordedBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
      receipts: { select: { id: true, url: true, filename: true } },
    },
  });

  let balance = 0;
  const withBalance = rows.map((row) => {
    const usd = toNumber(row.amountUsd);
    /* A cancelled row stays in the register and out of the arithmetic. */
    if (!row.voidedAt) {
      balance += row.direction === "DRAW" ? usd : -usd;
    }
    return { ...row, balanceAfterUsd: balance };
  });

  return withBalance.reverse();
}
