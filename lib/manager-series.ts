import "server-only";

import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/**
 * Money in against money out, over any stretch of time.
 *
 * WHY THIS EXISTS when cashFlowByMonth already draws a year: that engine buckets
 * by calendar month and always returns twelve, which is the right shape for "how
 * did the year go" and useless for "how did this week go" — seven days inside one
 * month collapse to a single bar. The manager's chart is asked to answer both, so
 * the bucket has to follow the question.
 *
 * THE RULE: a range of ninety days or less is drawn by DAY, anything longer by
 * MONTH. Below that boundary a day is legible and a month hides the shape; above
 * it, days are too many to read and too fine to mean anything — a Tuesday in
 * March is noise against a quarter.
 *
 * Both series are CASH, not billing. Payments that actually arrived against costs
 * that actually went out, so the line answers "did money move" rather than "did
 * we invoice" — those are different questions and the hero above the chart
 * already answers the second.
 */
export type FlowPoint = { label: string; moneyIn: number; moneyOut: number };

export type Bucket = "DAY" | "WEEK" | "MONTH";

export type MoneyFlow = {
  points: FlowPoint[];
  /** Totals over the whole window, so the legend never re-sums the points. */
  inUsd: number;
  outUsd: number;
  /** DAY or MONTH, so the caption can say which without guessing the range. */
  bucket: Bucket;
};

const DAY_MS = 86_400_000;

export async function moneyFlow(
  window: { from: Date; to: Date },
  locale: Locale = "en"
): Promise<MoneyFlow> {
  const spanDays = Math.max(
    1,
    Math.round((window.to.getTime() - window.from.getTime()) / DAY_MS)
  );
  /*
    THREE BUCKETS, because two were not enough.

    A quarter drawn by month is four points — not a trend, a shrug. Drawn by day
    it is ninety-odd, which no phone renders legibly. A week is the honest unit
    in between, and it is also how this business actually moves: flights leave on
    a weekly rhythm, so a weekly bar is one dispatch cycle rather than an
    arbitrary slice.
  */
  const bucket: Bucket =
    spanDays <= 35 ? "DAY" : spanDays <= 200 ? "WEEK" : "MONTH";

  const range = { gte: window.from, lt: window.to };

  const [payments, expenses] = await Promise.all([
    /* Cash in: what customers actually handed over. Voided payments are excluded
       rather than netted, because a payment that was cancelled did not arrive —
       the reversing ledger line is the ledger's business, not this chart's. */
    prisma.payment.findMany({
      where: { paidAt: range, voidedAt: null },
      select: { paidAt: true, creditedAmount: true, amount: true },
    }),
    /* Cash out: money that left an account, dated when it left. Not when the
       cost was incurred — that is the accrual question and belongs to the
       profit figure, not to a cash-flow line. */
    prisma.expense.findMany({
      where: { paidAt: range, status: "PAID" },
      select: { paidAt: true, amountUsd: true },
    }),
  ]);

  /* Buckets built from the window rather than from the data, so a quiet week
     draws a flat line at zero instead of vanishing from the axis. */
  const keys: string[] = [];
  const labels: string[] = [];
  const cursor = new Date(window.from);
  if (bucket === "DAY") {
    cursor.setHours(0, 0, 0, 0);
    while (cursor < window.to) {
      keys.push(cursor.toISOString().slice(0, 10));
      labels.push(
        cursor.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", {
          day: "numeric",
          month: "short",
        })
      );
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (bucket === "WEEK") {
    /* Monday-first, like every other week in this app. */
    const back = (cursor.getDay() + 6) % 7;
    cursor.setDate(cursor.getDate() - back);
    cursor.setHours(0, 0, 0, 0);
    while (cursor < window.to) {
      keys.push(`W${cursor.toISOString().slice(0, 10)}`);
      labels.push(
        cursor.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", {
          day: "numeric",
          month: "short",
        })
      );
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    while (cursor < window.to) {
      keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      labels.push(
        cursor.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", {
          month: "short",
        })
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const keyFor = (d: Date) => {
    if (bucket === "DAY") return d.toISOString().slice(0, 10);
    if (bucket === "WEEK") {
      const m = new Date(d);
      m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
      m.setHours(0, 0, 0, 0);
      return `W${m.toISOString().slice(0, 10)}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const inBy = new Map(keys.map((k) => [k, 0]));
  const outBy = new Map(keys.map((k) => [k, 0]));

  for (const p of payments) {
    const k = keyFor(p.paidAt);
    if (!inBy.has(k)) continue;
    /* creditedAmount is the payment restated in the invoice's currency, which
       is what settles the bill. Falls back to the raw amount only where the
       customer paid in the invoice's own currency and nothing needed restating. */
    inBy.set(k, inBy.get(k)! + toNumber(p.creditedAmount ?? p.amount));
  }
  for (const e of expenses) {
    if (!e.paidAt) continue;
    const k = keyFor(e.paidAt);
    if (!outBy.has(k)) continue;
    outBy.set(k, outBy.get(k)! + toNumber(e.amountUsd));
  }

  const points = keys.map((k, i) => ({
    label: labels[i],
    moneyIn: inBy.get(k) ?? 0,
    moneyOut: outBy.get(k) ?? 0,
  }));

  return {
    points,
    inUsd: points.reduce((n, p) => n + p.moneyIn, 0),
    outUsd: points.reduce((n, p) => n + p.moneyOut, 0),
    bucket,
  };
}

/** The ranges the manager's chart offers, and what each one is called. */
export const FLOW_RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "3m", label: "3 months", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
] as const;

export type FlowRangeKey = (typeof FLOW_RANGES)[number]["key"];

export function flowWindow(key: string | undefined, now = new Date()) {
  const chosen =
    FLOW_RANGES.find((r) => r.key === key) ??
    FLOW_RANGES.find((r) => r.key === "30d")!;
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(to.getTime() - chosen.days * DAY_MS);
  from.setHours(0, 0, 0, 0);
  return { window: { from, to }, key: chosen.key, label: chosen.label };
}
