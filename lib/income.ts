import "server-only";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * What each closed batch made — the statements, not a running total.
 *
 * The owner's rule, in his words: when we close a batch is when we do that
 * maths, and then it goes to the boss. So this page is not a live grid that
 * keeps moving. It is the register of batches that have been shut, each
 * carrying the figures as they stood on the day, and each either waiting on
 * the boss or signed off by him.
 *
 * Nothing here is recomputed. A payment that lands next week is still recorded
 * against its invoice and still changes what that customer owes — it does not
 * rewrite what a batch was reported to have made in July.
 */
export type IncomeRow = {
  batchId: string;
  batchNumber: string;
  month: string;
  closedLabel: string | null;

  status: "SUBMITTED" | "CONFIRMED" | "RETURNED";
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  note: string | null;

  // Goods received
  kg: number;
  worthUsd: number;
  sellRate: number | null;
  profitUsd: number | null;

  // Goods sold
  soldKg: number;
  soldUsd: number;
  collectedUsd: number;

  // What left without being paid for
  carriedKg: number;
  carriedUsd: number;
  writtenOffKg: number;
  writtenOffUsd: number;

  expensesUsd: number;
  /** The rate on the day it was closed, so shillings never move afterwards. */
  rate: number | null;
};

export type IncomeSheet = {
  rows: IncomeRow[];
  /** The stretch before this one, for comparison. Null when unfiltered. */
  period: {
    label: string;
    previousLabel: string;
    batches: number;
    kg: number;
    worthUsd: number;
    profitUsd: number;
    collectedUsd: number;
  } | null;
  months: { key: string; label: string }[];
  awaiting: number;
  /** Sent back by the boss: the ones somebody has to act on. */
  returned: IncomeRow[];
  /** How many closed batches there are in total, before any filter. */
  total: number;
  counts: { submitted: number; confirmed: number; returned: number };
  totals: {
    kg: number;
    worthUsd: number;
    profitUsd: number;
    soldKg: number;
    soldUsd: number;
    collectedUsd: number;
    carriedKg: number;
    writtenOffUsd: number;
    expensesUsd: number;
    sellRate: number | null;
  };
};

/**
 * A stretch of time, and the same stretch before it.
 *
 * Finance does not read a closed batch on its own — it reads this week against
 * last week, this month against the one before. So a period is always a pair,
 * and the summary carries both so the page can say "up" or "down" rather than
 * leaving somebody to work it out from two numbers on two screens.
 *
 * Calendar weeks and calendar months, not rolling windows: the office closes
 * its books on the same boundaries the boss asks about.
 */
function periodBounds(period: string | undefined) {
  if (period !== "week" && period !== "month") return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    /* Monday-first: Sunday is 0, so it counts back six days, not none. */
    const back = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - back);
    const previous = new Date(start);
    previous.setDate(previous.getDate() - 7);
    return { start, previous, label: "this week", previousLabel: "last week" };
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    start: monthStart,
    previous,
    label: "this month",
    previousLabel: "last month",
  };
}

export async function incomeSheet(
  month?: string,
  status?: string,
  query?: string,
  period?: string
): Promise<IncomeSheet> {
  const statements = await prisma.batchStatement.findMany({
    orderBy: { submittedAt: "desc" },
    take: 300,
    select: {
      batchId: true,
      status: true,
      note: true,
      reviewNote: true,
      submittedAt: true,
      submittedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      kgReceived: true,
      receivedUsd: true,
      sellRate: true,
      freightRatePerKg: true,
      customsRatePerKg: true,
      profitUsd: true,
      kgSold: true,
      soldUsd: true,
      collectedUsd: true,
      kgCarried: true,
      carriedUsd: true,
      kgWrittenOff: true,
      writtenOffUsd: true,
      expensesUsd: true,
      exchangeRate: true,
      batch: {
        select: {
          batchNumber: true,
          closedAt: true,
          arrivalDate: true,
          departureDate: true,
        },
      },
    },
  });

  const all: IncomeRow[] = statements.map((s) => {
    const kg = toNumber(s.kgReceived);
    const sellRate = s.sellRate === null ? null : toNumber(s.sellRate);

    return {
      batchId: s.batchId,
      batchNumber: s.batch.batchNumber,
      month: (s.batch.arrivalDate ?? s.batch.departureDate ?? s.submittedAt)
        .toISOString()
        .slice(0, 7),
      closedLabel: (s.batch.closedAt ?? s.submittedAt).toISOString().slice(0, 10),
      status: s.status,
      submittedBy: s.submittedBy?.name ?? null,
      reviewedBy: s.reviewedBy?.name ?? null,
      reviewNote: s.reviewNote,
      note: s.note,
      kg,
      worthUsd: toNumber(s.receivedUsd),
      sellRate,
      profitUsd: s.profitUsd === null ? null : toNumber(s.profitUsd),
      soldKg: toNumber(s.kgSold),
      soldUsd: toNumber(s.soldUsd),
      collectedUsd: toNumber(s.collectedUsd),
      carriedKg: toNumber(s.kgCarried),
      carriedUsd: toNumber(s.carriedUsd),
      writtenOffKg: toNumber(s.kgWrittenOff),
      writtenOffUsd: toNumber(s.writtenOffUsd),
      expensesUsd: toNumber(s.expensesUsd),
      rate: s.exchangeRate === null ? null : toNumber(s.exchangeRate),
    };
  });

  const months = [...new Set(all.map((row) => row.month))]
    .sort()
    .reverse()
    .map((key) => ({
      key,
      label: new Date(`${key}-02`).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
      }),
    }));

  /*
    Filtered in three independent ways, because they answer three different
    questions: which month am I closing off, what still needs somebody, and
    where is GZ-0028.

    The month pills and the counts are always computed from EVERY closed batch,
    never from the filtered set — a filter that hides its own escape route is
    how somebody ends up believing there is nothing to do.
  */
  const q = query?.trim().toLowerCase() ?? "";
  const bounds = periodBounds(period);
  /* Closed inside the window, read off the day the books were shut. */
  const inWindow = (row: IncomeRow, from: Date, to: Date | null) => {
    if (!row.closedLabel) return false;
    const day = new Date(`${row.closedLabel}T00:00:00`);
    return day >= from && (to === null || day < to);
  };

  const rows = all.filter(
    (row) =>
      (!bounds || inWindow(row, bounds.start, null)) &&
      (!month || row.month === month) &&
      (!status || row.status === status) &&
      (!q ||
        row.batchNumber.toLowerCase().includes(q) ||
        (row.closedLabel ?? "").includes(q) ||
        (row.submittedBy ?? "").toLowerCase().includes(q) ||
        (row.reviewedBy ?? "").toLowerCase().includes(q) ||
        (row.note ?? "").toLowerCase().includes(q) ||
        (row.reviewNote ?? "").toLowerCase().includes(q))
  );

  /*
    A sent-back statement stays on the page and stays out of the totals.

    Its batch is open again — costs can land on it, payments can arrive — so
    the figures on that row are a snapshot of a close that was rejected. The
    row is worth showing, because Finance needs to see the boss's note and
    what he was looking at; adding it to a total of what the business made
    would be counting a batch that has not finished.
  */
  const counted = rows.filter((row) => row.status !== "RETURNED");
  const sum = (pick: (row: IncomeRow) => number | null) =>
    counted.reduce((acc, row) => acc + (pick(row) ?? 0), 0);

  const kg = sum((r) => r.kg);
  const worthUsd = sum((r) => r.worthUsd);

  /*
    The same figures for the stretch before, so the page can compare rather
    than merely report. Counted on the same rule — sent-back statements are
    excluded from both sides, or a rejected close would make last week look
    worse than it was.
  */
  const before = bounds
    ? all.filter(
        (row) =>
          row.status !== "RETURNED" &&
          inWindow(row, bounds.previous, bounds.start)
      )
    : [];
  const priorSum = (pick: (row: IncomeRow) => number | null) =>
    before.reduce((acc, row) => acc + (pick(row) ?? 0), 0);

  return {
    period: bounds
      ? {
          label: bounds.label,
          previousLabel: bounds.previousLabel,
          batches: before.length,
          kg: priorSum((r) => r.kg),
          worthUsd: priorSum((r) => r.worthUsd),
          profitUsd: priorSum((r) => r.profitUsd),
          collectedUsd: priorSum((r) => r.collectedUsd),
        }
      : null,
    rows,
    months,
    awaiting: all.filter((row) => row.status === "SUBMITTED").length,
    returned: all.filter((row) => row.status === "RETURNED"),
    total: all.length,
    counts: {
      submitted: all.filter((row) => row.status === "SUBMITTED").length,
      confirmed: all.filter((row) => row.status === "CONFIRMED").length,
      returned: all.filter((row) => row.status === "RETURNED").length,
    },
    totals: {
      kg,
      worthUsd,
      profitUsd: sum((r) => r.profitUsd),
      soldKg: sum((r) => r.soldKg),
      soldUsd: sum((r) => r.soldUsd),
      collectedUsd: sum((r) => r.collectedUsd),
      carriedKg: sum((r) => r.carriedKg),
      writtenOffUsd: sum((r) => r.writtenOffUsd),
      expensesUsd: sum((r) => r.expensesUsd),
      sellRate: kg > 0 ? worthUsd / kg : null,
    },
  };
}
