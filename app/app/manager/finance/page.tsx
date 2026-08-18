import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Coins,
  Landmark,
  Plane,
  Smartphone,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { IconHint } from "@/components/app/icon-hint";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { FlowBars } from "@/components/charts/flow-bars";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { scalePoints, smoothPath } from "@/lib/chart";
import { ORIGIN_LABELS } from "@/lib/constants";
import { creditByBatch } from "@/lib/credit-queries";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { financeDashboard, type BatchPerformance } from "@/lib/finance-dashboard";
import { formatDate, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillings, formatUsd } from "@/lib/money";
import { windowFor, type PeriodKey } from "@/lib/profit";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Financial overview") };
}

/**
 * The manager's money screen: the period, the P&L behind it, and the flights.
 *
 * THIS PAGE COMPUTES NOTHING. Every figure on it is read from an engine that
 * already answers the same question for another desk — lib/profit.ts for the
 * period money, lib/finance-dashboard.ts for the breakdowns, the position and
 * the twelve-month trend, lib/credit-queries.ts for credit. That is not
 * tidiness: a manager's page with its own revenue query would disagree with the
 * owner's inside a quarter, and the weekly meeting would become an argument
 * about whose screen is right rather than about the business.
 *
 * Three honesty rules run through what it shows, and they are load-bearing:
 *
 * 1. NO PERCENTAGE AGAINST ZERO. A period whose predecessor recorded nothing
 *    has no growth rate — it has a first. "+∞%" on this screen would be a
 *    sentence the data does not support, so those cells say so in words.
 *
 * 2. PROFIT AND LOSS ARE ONE LINE. The bottom line has a sign; showing a
 *    "Profit" cell and a "Loss" cell, one of which is always zero, reads as
 *    though the business had both. The single cell flips its name and colour.
 *
 * 3. THE HEADLINE IS ALWAYS THE P&L ENGINE'S REVENUE. financeDashboard also
 *    carries a billed total (revenue.byOrigin sums to it) which counts a
 *    written-off bill at face value, while the P&L counts it at whatever was
 *    collected before it was abandoned. They are two answers to two questions.
 *    The strip at the top uses the P&L one throughout; the origin split is
 *    captioned as billing so nobody totals it against the headline and finds a
 *    gap they cannot explain.
 */
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
];

/** The batch table's row: what the engine gives, plus the credit book's answer. */
type BatchRow = BatchPerformance & { creditUsd: number };

/**
 * What the batch table can be ordered by.
 *
 * A number or null — never a fallback figure. A flight that billed nothing has
 * no margin, and sorting it as if its margin were zero (or minus infinity)
 * would rank a flight nobody has invoiced beside one that genuinely lost money.
 * Nulls sort last in both directions instead.
 */
const SORTS: Record<string, (row: BatchRow) => number | null> = {
  profit: (r) => r.profitUsd,
  revenue: (r) => r.expectedUsd,
  collected: (r) => r.collectedUsd,
  credit: (r) => r.creditUsd,
  outstanding: (r) => r.outstandingUsd,
  expenses: (r) => r.expensesUsd,
  margin: (r) => r.marginPct,
  kg: (r) => r.kg,
};

/** The three kinds an account can be. There is no fourth, and no petty-cash model. */
const KINDS = [
  { kind: "CASH", label: "Cash", icon: Coins },
  { kind: "BANK", label: "Bank", icon: Landmark },
  { kind: "MOBILE_MONEY", label: "Mobile money", icon: Smartphone },
] as const;

export default async function ManagerFinance({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; sort?: string; dir?: string }>;
}) {
  await requirePermission("profit.view");
  const locale = await viewerLocale();
  const { period, sort, dir } = await searchParams;

  /*
    One window, and the one before it, from the same helper the Profit & loss
    screen uses. Reading `?period=` exactly as app/app/finance/reports does
    means the two screens answer to the same word in the URL, so a link pasted
    from one lands on the same stretch of time in the other.
  */
  const picked = windowFor(period ?? "month", locale);

  const [dash, credit, rateRow] = await Promise.all([
    financeDashboard(picked.window, picked.previous),
    /* Cash against credit per flight, from the credit book rather than derived
       here — outstanding on a batch is "not yet paid", which is a different
       fact from "released on terms", and conflating the two is the mistake this
       column exists to avoid. */
    creditByBatch(),
    currentRate(),
  ]);

  const pl = dash.pl;
  const prior = dash.prior;
  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const money = (usd: number) => formatShillings(usd, rate);
  /** The bill's own currency, kept quiet underneath. Null when it adds nothing. */
  const inUsd = (usd: number) => (rate === null ? null : formatUsd(usd));

  /*
    A figure against the stretch before it, in words.

    `firstTime` is the sentence for a predecessor of zero, and it differs per
    figure because "first period with takings" is nonsense under an expense
    line. A percentage is never printed against a zero base — see the rule at
    the top of this file.
  */
  const against = (now: number, before: number, firstTime: string) => {
    if (before === 0) {
      return now === 0
        ? t(locale, "nothing in either period")
        : t(locale, firstTime);
    }
    const change = Math.round(((now - before) / Math.abs(before)) * 100);
    if (change === 0) return `${t(locale, "same as")} ${picked.previous.label}`;
    return `${t(locale, change > 0 ? "up" : "down")} ${Math.abs(change)}% ${t(
      locale,
      "on"
    )} ${picked.previous.label}`;
  };

  const profitable = pl.profit >= 0;

  const headline: {
    k: string;
    v: string;
    alt: string | null;
    sub: string;
    tone: string;
  }[] = [
    {
      k: "Revenue",
      v: money(pl.revenue),
      alt: inUsd(pl.revenue),
      sub: against(pl.revenue, prior.revenue, "first period with takings"),
      tone: "",
    },
    {
      k: "Collected",
      v: money(pl.cashIn),
      alt: inUsd(pl.cashIn),
      sub: against(pl.cashIn, prior.cashIn, "first period with money in"),
      tone: "text-success",
    },
    {
      k: "Credit sales",
      v: money(pl.creditRevenue),
      alt: inUsd(pl.creditRevenue),
      sub: against(
        pl.creditRevenue,
        prior.creditRevenue,
        "first period with credit given"
      ),
      tone: "text-brand",
    },
    {
      k: "Outstanding receivables",
      v: money(pl.receivable),
      alt: inUsd(pl.receivable),
      sub: against(
        pl.receivable,
        prior.receivable,
        "first period with anything left owed"
      ),
      tone: "text-signal",
    },
    {
      k: "Expenses",
      v: money(pl.costs),
      alt: inUsd(pl.costs),
      sub: against(pl.costs, prior.costs, "first period with costs"),
      tone: "text-destructive",
    },
    {
      /* One cell, named by its sign — see rule 2 at the top of this file. */
      k: profitable ? "Net profit" : "Net loss",
      v: money(Math.abs(pl.profit)),
      alt: inUsd(Math.abs(pl.profit)),
      sub: against(pl.profit, prior.profit, "first period with a bottom line"),
      tone: profitable ? "text-success" : "text-destructive",
    },
  ];

  // --------------------------------------------------------------- position
  const grouped = KINDS.map((k) => {
    const accounts = dash.position.accounts.filter((a) => a.kind === k.kind);
    return {
      ...k,
      accounts,
      total: accounts.reduce((n, a) => n + a.balanceUsd, 0),
    };
  });
  /* The engine falls back to "—" when a balance has no account record behind
     it. Rare, and worth showing rather than dropping: a balance nobody can name
     is a fault, and silently leaving it out makes the three tiles below fail to
     add up to the cash figure Finance reads. */
  const unnamed = dash.position.accounts.filter(
    (a) => !KINDS.some((k) => k.kind === a.kind)
  );

  // -------------------------------------------------------------------- P&L
  /*
    The bridge from revenue to the bottom line, and it reconciles exactly.

    Cost of sales is cost carried against a flight; operating expense is cost
    with no flight against it. That split is a PROXY, not a field — the schema
    has no overhead flag, so a customs bill nobody tagged to its batch lands in
    operating — and the caption underneath says so rather than presenting it as
    a classification somebody made.

    Bank charges are on their own line because they are the difference between
    the two expense figures on this page: the dashboard's expense split counts
    recorded expenses, while the P&L's cost line also carries the fees taken out
    of the company's own transfers. Without this line the reader would be left
    with a gap and no name for it.
  */
  const costOfSales = dash.expenses.batchUsd;
  const grossProfit = pl.revenue - costOfSales;
  const grossMargin = pl.revenue > 0 ? (grossProfit / pl.revenue) * 100 : null;

  const plRows: { label: string; value: number; strong?: boolean; tone?: string }[] = [
    { label: "Revenue billed", value: pl.revenue },
    { label: "Cost of sales — carried against a flight", value: -costOfSales },
    { label: "Gross profit", value: grossProfit, strong: true },
    { label: "Operating expenses — no flight against them", value: -dash.expenses.officeUsd },
    { label: "Bank charges on our own transfers", value: -pl.bankCharges },
    {
      label: profitable ? "Net profit" : "Net loss",
      value: pl.profit,
      strong: true,
      tone: profitable ? "text-success" : "text-destructive",
    },
  ];

  // ------------------------------------------------------------------ trend
  /*
    Profit month by month, drawn with the shared helpers rather than a chart
    library. The zero line is the point of it: a loss has to be visibly BELOW
    something, and a bar chart that clamps at two per cent of the height draws a
    losing month and a flat month identically.
  */
  const profitSeries = dash.trend.profit;
  const lo = Math.min(...profitSeries, 0);
  const hi = Math.max(...profitSeries, 0);
  const trendPoints = scalePoints(profitSeries, 800, 90, { min: lo, max: hi, padding: 6 });
  const zeroY = scalePoints([0], 800, 90, { min: lo, max: hi, padding: 6 })[0].y;

  // -------------------------------------------------------- batch comparison
  const creditFor = new Map(credit.map((c) => [c.batchId, c.creditUsd]));
  /*
    Arrived flights only. A batch still loading has costs and no billing, so it
    would sit at the bottom of a table sorted by profit looking like the worst
    performer in the company when nothing has happened to it yet.
  */
  const batchRows: BatchRow[] = dash.batches
    .filter((b) => b.arrivedAt !== null)
    .map((b) => ({ ...b, creditUsd: creditFor.get(b.id) ?? 0 }));

  const sortKey = sort && sort in SORTS ? sort : "profit";
  const descending = dir !== "asc";
  const sorted = [...batchRows].sort((a, b) => {
    const left = SORTS[sortKey](a);
    const right = SORTS[sortKey](b);
    /* Nulls last whichever way the column is pointing — an unbilled flight is
       not the best performer and not the worst, it is unanswered. */
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return descending ? right - left : left - right;
  });
  const losing = batchRows.filter((b) => b.profitUsd < 0).length;

  /** Keeps the period when a column header is pressed, and toggles direction. */
  const sortHref = (key: string) => {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    params.set("sort", key);
    if (sortKey === key && descending) params.set("dir", "asc");
    return `/app/manager/finance?${params.toString()}`;
  };

  const columns: {
    key: string;
    label: string;
    align: string;
    hide?: string;
  }[] = [
    { key: "kg", label: "Kg", align: "text-right", hide: "hidden lg:table-cell" },
    { key: "revenue", label: "Revenue", align: "text-right" },
    { key: "collected", label: "Collected", align: "text-right", hide: "hidden lg:table-cell" },
    { key: "credit", label: "Credit", align: "text-right", hide: "hidden xl:table-cell" },
    { key: "outstanding", label: "Outstanding", align: "text-right", hide: "hidden lg:table-cell" },
    { key: "expenses", label: "Expenses", align: "text-right", hide: "hidden xl:table-cell" },
    { key: "profit", label: "Profit / loss", align: "text-right" },
    { key: "margin", label: "Margin", align: "text-right" },
  ];

  return (
    <>
      <PageHeader
        title={t(locale, "Financial overview")}
        description={t(
          locale,
          "The period against the one before it, the P&L behind it, and every flight ranked by what it made. Read from the same engines Finance and the owner read."
        )}
      />

      {/* The period, as links: this screen is quoted from and printed. */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/app/manager/finance?period=${p.key}`}
            aria-current={picked.key === p.key ? "true" : undefined}
            className={
              picked.key === p.key
                ? "focus-ring rounded-full bg-foreground px-3 py-1 text-[11px] font-semibold text-background"
                : "focus-ring rounded-full border px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            }
          >
            {t(locale, p.label)}
          </Link>
        ))}
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground">
        {picked.window.from.toLocaleDateString("en-GB")} —{" "}
        {new Date(picked.window.to.getTime() - 1).toLocaleDateString("en-GB")}
        {" · "}
        {t(locale, "against")} {picked.previous.label}
        {rate === null
          ? ` · ${t(locale, "No rate published, so figures stay in dollars.")}`
          : ` · USD 1 = TSh ${rate.toLocaleString("en-US")}`}
      </p>

      {/* ─────────────────────────────── §3 the period ───────────────────── */}
      <dl className="mb-1.5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {headline.map((cell) => (
          <div key={cell.k} className="bg-card px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t(locale, cell.k)}
            </dt>
            <dd
              className={`tabular mt-0.5 whitespace-nowrap font-display text-lg font-bold leading-tight ${cell.tone}`}
            >
              {cell.v}
            </dd>
            {cell.alt ? (
              <p className="tabular whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                {cell.alt}
              </p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-muted-foreground">{cell.sub}</p>
          </div>
        ))}
      </dl>
      <p className="mb-4 text-[11px] text-muted-foreground">
        {t(
          locale,
          "Profit and loss are the same line with a sign, so there is one cell for both. Credit sales are already inside Revenue — the sale happened — and are deliberately absent from Collected."
        )}
        {pl.specialCosts > 0
          ? ` ${money(pl.specialCosts)} ${t(
              locale,
              "of special costs left the company in this period and are kept out of the margin."
            )}`
          : ""}
      </p>

      {/* ─────────────────────────────── §3 positions ────────────────────── */}
      <SectionLabel
        action={{ href: "/app/finance/accounts", label: t(locale, "Accounts") }}
      >
        {t(locale, "Where the money is sitting")}
      </SectionLabel>
      <div className="mb-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {grouped.map((group) => (
          <div key={group.kind} className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <IconHint label={t(locale, group.label)}>
                <group.icon className="h-3.5 w-3.5" />
              </IconHint>
              {t(locale, group.label)}
            </div>
            <p
              className={`tabular mt-0.5 font-display text-lg font-bold leading-tight ${
                group.total < 0 ? "text-destructive" : ""
              }`}
            >
              {money(group.total)}
            </p>
            {group.accounts.length === 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t(locale, "No account of this kind holds a balance.")}
              </p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {group.accounts.map((account) => (
                  <li
                    key={`${group.kind}-${account.name}`}
                    className="flex items-baseline justify-between gap-2 text-[11px]"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      {account.name}
                    </span>
                    <span
                      className={`tabular shrink-0 ${
                        account.balanceUsd < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {money(account.balanceUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="mb-4 text-[11px] text-muted-foreground">
        {t(
          locale,
          "Cash is the tins and tills. There is no separate petty-cash pot in this system — petty cash is a cash account, and it is counted above."
        )}
        {unnamed.length > 0
          ? ` ${unnamed.length} ${t(
              locale,
              "balance(s) belong to no account record and are excluded from the three tiles."
            )}`
          : ""}
      </p>

      {/* ─────────────────────────────── §4 P&L ──────────────────────────── */}
      <SectionLabel
        action={{ href: "/app/finance/reports", label: t(locale, "Full P&L") }}
      >
        {t(locale, "Profit & loss")} · {picked.window.label}
      </SectionLabel>
      <div className="mb-4 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="divide-y rounded-xl border bg-card">
          {plRows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline gap-3 px-3 py-2"
            >
              <span
                className={`min-w-0 flex-1 text-[11px] ${
                  row.strong ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {t(locale, row.label)}
              </span>
              <span
                className={`tabular shrink-0 text-sm ${
                  row.strong ? "font-semibold" : ""
                } ${row.tone ?? (row.value < 0 ? "text-destructive" : "")}`}
              >
                {row.value < 0 ? "− " : ""}
                {money(Math.abs(row.value))}
              </span>
            </div>
          ))}
          <div className="flex items-baseline gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              {t(locale, "Gross margin")} · {t(locale, "net margin")}
            </span>
            <span className="tabular shrink-0 text-sm font-semibold">
              {grossMargin === null ? "—" : `${grossMargin.toFixed(1)}%`}
              {" · "}
              <span className={(pl.margin ?? 0) < 0 ? "text-destructive" : ""}>
                {pl.margin === null ? "—" : `${pl.margin.toFixed(1)}%`}
              </span>
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(locale, "Billed against spent, twelve months")}
              </h3>
              <span className="tabular text-[11px] text-muted-foreground">
                {dash.trend.labels[0]} — {dash.trend.labels[dash.trend.labels.length - 1]}
              </span>
            </div>
            <FlowBars
              className="mt-2"
              labels={dash.trend.labels}
              valuesIn={dash.trend.revenue}
              valuesOut={dash.trend.expenses}
              currentIndex={dash.trend.labels.length - 1}
              format={(usd: number) => money(usd)}
              legendIn={t(locale, "Billed")}
              legendOut={t(locale, "Spent")}
            />
          </div>

          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(locale, "Profit, month by month")}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {t(locale, "the dotted line is nothing")}
              </span>
            </div>
            <svg
              viewBox="0 0 800 90"
              className="mt-2 w-full"
              role="img"
              aria-label={dash.trend.labels
                .map((label, i) => `${label}: ${money(profitSeries[i])}`)
                .join(", ")}
            >
              <line
                x1="0"
                y1={zeroY}
                x2="800"
                y2={zeroY}
                stroke="hsl(var(--border))"
                strokeDasharray="4 4"
              />
              <path
                d={smoothPath(trendPoints)}
                fill="none"
                stroke="hsl(var(--chart-1))"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* A losing month is marked, not merely drawn low: at this height
                  a shallow dip below the line is easy to read as flat. */}
              {trendPoints.map((point, i) =>
                profitSeries[i] < 0 ? (
                  <circle
                    key={dash.trend.labels[i]}
                    cx={point.x}
                    cy={point.y}
                    r="3.5"
                    fill="hsl(var(--destructive))"
                  />
                ) : null
              )}
            </svg>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              {dash.trend.labels.map((label, i) => (
                <span key={`${label}-${i}`}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────── §3 breakdowns ───────────────────── */}
      <SectionLabel>{t(locale, "Where it came from, where it went")}</SectionLabel>
      <div className="mb-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
        {/* By origin. Billing, not P&L revenue — see rule 3 at the top. */}
        <div className="rounded-xl border bg-card p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t(locale, "By origin")}
          </h3>
          {dash.revenue.byOrigin.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t(locale, "Nothing was billed in this period.")}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {dash.revenue.byOrigin.map((row) => (
                <li key={row.origin}>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span>
                      {t(
                        locale,
                        ORIGIN_LABELS[row.origin as keyof typeof ORIGIN_LABELS] ??
                          row.origin
                      )}
                    </span>
                    <span className="tabular font-semibold">
                      {money(row.expectedUsd)}
                    </span>
                  </div>
                  {/* How much of that origin's billing has actually been paid. */}
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{
                        width: `${
                          row.expectedUsd > 0
                            ? Math.min(100, (row.collectedUsd / row.expectedUsd) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {money(row.collectedUsd)} {t(locale, "collected")}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t(
              locale,
              "Billed value, counting a written-off bill in full. It will not total to Revenue above, which counts one at what was paid before it was given up on."
            )}
          </p>
        </div>

        {/* By expense category. */}
        <div className="rounded-xl border bg-card p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t(locale, "By expense category")}
          </h3>
          {dash.expenses.byCategory.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t(locale, "No costs were recorded in this period.")}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {dash.expenses.byCategory.map((row) => (
                <li key={row.category}>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate">
                      {t(
                        locale,
                        EXPENSE_CATEGORY_LABELS[row.category] ?? row.category
                      )}
                    </span>
                    <span className="tabular shrink-0 font-semibold">
                      {money(row.amount)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.min(100, row.share)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* By batch — cost carried against a flight. */}
        <div className="rounded-xl border bg-card p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t(locale, "Spend by batch")}
          </h3>
          {dash.expenses.byBatch.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t(locale, "No cost in this period was carried against a flight.")}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {dash.expenses.byBatch.map((row) => (
                <li
                  key={row.batchNumber}
                  className="flex items-baseline justify-between gap-2 text-[11px]"
                >
                  <span className="min-w-0 truncate font-mono">{row.batchNumber}</span>
                  <span className="tabular shrink-0 font-semibold">
                    {money(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {money(dash.expenses.officeUsd)}{" "}
            {t(
              locale,
              "of this period's cost has no flight against it. That is a proxy for overhead, not a field somebody filled in."
            )}
          </p>
        </div>
      </div>

      {/* ─────────────────────────────── §5 batch performance ────────────── */}
      <SectionLabel count={losing}>
        {t(locale, "Batch performance")}
      </SectionLabel>
      <p className="mb-2 text-[11px] text-muted-foreground">
        {t(
          locale,
          "Every arrived flight, whole — a flight's money does not stop at a month boundary, so these figures are lifetime and do not move with the period above."
        )}
        {losing > 0
          ? ` ${losing} ${t(
              locale,
              losing === 1 ? "flight is losing money." : "flights are losing money."
            )}`
          : ` ${t(locale, "None of them is losing money.")}`}
      </p>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Plane}
          title={t(locale, "No flight has arrived yet")}
          description={t(
            locale,
            "A batch appears here once it lands. Until then it has costs and no billing, and ranking it would say something untrue about it."
          )}
        />
      ) : (
        <>
          {/*
            The comparison table on a desk, the same rows as cards on a phone.

            NOT components/app/data-table.tsx: that is a client component whose
            columns are functions, and functions cannot cross the server/client
            boundary — every caller of it is a client wrapper file of its own,
            which this change is not allowed to add. The two behaviours that
            matter are reproduced here: it sorts (through the URL, so a sorted
            view can be sent to somebody) and it becomes cards below `md`.
          */}
          <div className="hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Batch")}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t(locale, "Origin")}
                  </TableHead>
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className={`${column.align} ${column.hide ?? ""}`}
                      aria-sort={
                        sortKey === column.key
                          ? descending
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                    >
                      <Link
                        href={sortHref(column.key)}
                        className="focus-ring inline-flex items-center gap-1 rounded hover:text-foreground"
                      >
                        {t(locale, column.label)}
                        {sortKey === column.key ? (
                          <IconHint
                            label={t(
                              locale,
                              descending ? "Largest first" : "Smallest first"
                            )}
                          >
                            {descending ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUp className="h-3 w-3" />
                            )}
                          </IconHint>
                        ) : null}
                      </Link>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow
                    key={row.id}
                    className={row.profitUsd < 0 ? "bg-destructive/5" : undefined}
                  >
                    <TableCell className="py-2">
                      <Link
                        href={`/app/batches/${row.id}`}
                        className="focus-ring rounded font-mono text-xs hover:text-brand"
                      >
                        {row.batchNumber}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(row.arrivedAt, locale)} · {row.cargo}{" "}
                        {t(locale, "consignments")}
                      </p>
                    </TableCell>
                    <TableCell className="hidden py-2 text-[11px] lg:table-cell">
                      {t(
                        locale,
                        ORIGIN_LABELS[row.origin as keyof typeof ORIGIN_LABELS] ??
                          row.origin
                      )}
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs lg:table-cell">
                      {row.kg.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="tabular py-2 text-right text-xs">
                      {money(row.expectedUsd)}
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs text-success lg:table-cell">
                      {money(row.collectedUsd)}
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs text-brand xl:table-cell">
                      {money(row.creditUsd)}
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs text-signal lg:table-cell">
                      {money(row.outstandingUsd)}
                    </TableCell>
                    <TableCell className="tabular hidden py-2 text-right text-xs text-destructive xl:table-cell">
                      {money(row.expensesUsd)}
                    </TableCell>
                    <TableCell
                      className={`tabular py-2 text-right text-xs font-semibold ${
                        row.profitUsd < 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {row.profitUsd < 0 ? "− " : ""}
                      {money(Math.abs(row.profitUsd))}
                    </TableCell>
                    <TableCell
                      className={`tabular py-2 text-right text-xs ${
                        (row.marginPct ?? 0) < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {row.marginPct === null ? "—" : `${row.marginPct.toFixed(0)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phones: one card per flight, same order as the table. */}
          <ul className="space-y-2 md:hidden">
            {sorted.map((row) => (
              <li
                key={row.id}
                className={`rounded-xl border p-3 ${
                  row.profitUsd < 0 ? "border-destructive/30 bg-destructive/5" : "bg-card"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/app/batches/${row.id}`}
                    className="focus-ring rounded font-mono text-sm hover:text-brand"
                  >
                    {row.batchNumber}
                  </Link>
                  <span
                    className={`tabular inline-flex items-center gap-1 text-sm font-semibold ${
                      row.profitUsd < 0 ? "text-destructive" : "text-success"
                    }`}
                  >
                    {row.profitUsd < 0 ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    {row.profitUsd < 0 ? "− " : ""}
                    {money(Math.abs(row.profitUsd))}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    locale,
                    ORIGIN_LABELS[row.origin as keyof typeof ORIGIN_LABELS] ??
                      row.origin
                  )}{" "}
                  · {formatDate(row.arrivedAt, locale)} ·{" "}
                  {row.kg.toLocaleString("en-US", { maximumFractionDigits: 0 })} kg ·{" "}
                  {row.marginPct === null
                    ? t(locale, "nothing billed")
                    : `${row.marginPct.toFixed(0)}% ${t(locale, "margin")}`}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {[
                    { k: "Revenue", v: money(row.expectedUsd), tone: "" },
                    { k: "Collected", v: money(row.collectedUsd), tone: "text-success" },
                    { k: "Credit", v: money(row.creditUsd), tone: "text-brand" },
                    {
                      k: "Outstanding",
                      v: money(row.outstandingUsd),
                      tone: "text-signal",
                    },
                    {
                      k: "Expenses",
                      v: money(row.expensesUsd),
                      tone: "text-destructive",
                    },
                  ].map((cell) => (
                    <div
                      key={cell.k}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <dt className="text-muted-foreground">{t(locale, cell.k)}</dt>
                      <dd className={`tabular ${cell.tone}`}>{cell.v}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
