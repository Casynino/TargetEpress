import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plane, TrendingDown, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { SectionLabel } from "@/components/app/section-label";
import { BarChart } from "@/components/charts/bar-chart";
import { FlowBars } from "@/components/charts/flow-bars";
import { FinanceWorkspaceHeader } from "@/components/app/finance-workspace-header";
import { ReportViewer } from "@/components/app/report-viewer";
import { Badge } from "@/components/ui/badge";
import { ORIGIN_LABELS } from "@/lib/constants";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { formatDate, formatMonthYear, toNumber } from "@/lib/format";
import {
  currentRate,
  formatShillings,
  formatShillingTotal,
  formatUsd,
} from "@/lib/fx";
import { t } from "@/lib/i18n";
import { financeDashboard } from "@/lib/finance-dashboard";
import { profitAndLoss, profitByDispatch, windowFor } from "@/lib/profit";
import { prisma } from "@/lib/prisma";
import { REPORTS, presentReport, runReport, type ReportKey } from "@/lib/reports";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Profit & loss") };
}

/**
 * What the business actually made.
 *
 * Impossible until expenses existed — revenue with no cost side is a sales
 * report wearing a profit label. Both bases are shown side by side and named,
 * because they always disagree and both are true:
 *
 *   accrual — did this period's WORK make money
 *   cash    — did more money come IN than went out
 */
export default async function FinanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    report?: string;
    from?: string;
    to?: string;
    batch?: string;
    currency?: string;
  }>;
}) {
  const user = await requirePermission("profit.view");
  const locale = await viewerLocale();
  const {
    period,
    report: rawReport,
    from,
    to,
    batch,
    currency,
  } = await searchParams;

  const asDate0 = (v?: string) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  /*
    One window, read by everything on the page.

    The chip used to move the hero card and nothing else: `period` was written
    into the URL and onto the download link, and neither runReport nor the CSV
    route ever read it — so under a chip saying "This month" the table
    underneath was showing all time, and the download matched the table. A
    reader has no way to see that, which makes it the worst kind of wrong.

    Typing a From/To still wins, because that is somebody being explicit.
  */
  const typedRange = asDate0(from) !== null || asDate0(to) !== null;
  const picked = windowFor(
    typedRange ? "custom" : (period ?? "month"),
    locale,
    { from: asDate0(from), to: null }
  );
  const window = picked.window;

  /*
    The picked report, run with the same filters the download will use.

    Defaulting to the P&L keeps the page opening on the question most people
    came to ask, while the other thirteen are one tap away rather than
    thirteen routes away.
  */
  const reportKey = (REPORTS.some((r) => r.key === rawReport)
    ? rawReport
    : "profit-loss") as ReportKey;

  const asDate = (v?: string) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  // The closing day belongs inside the window; the queries compare with `lt`.
  const toExclusive = (() => {
    const d = asDate(to);
    if (!d) return null;
    const end = new Date(d);
    end.setDate(end.getDate() + 1);
    return end;
  })();

  const reportQuery = new URLSearchParams();
  if (from) reportQuery.set("from", from);
  if (to) reportQuery.set("to", to);
  if (batch) reportQuery.set("batch", batch);
  if (period) reportQuery.set("period", period);
  /*
    Two query strings, because the API and this page use the word differently.

    The DOWNLOAD takes `unit`, which restates money in the reader's currency —
    it must not take `currency`, which the report engine reads as "only ledger
    entries recorded in this currency" and would use to throw away most of the
    register. A LINK back into this page takes `currency`, which is the switch
    at the top. Sharing one string meant the pills lost the currency in dollar
    mode and flipped the reader back to shillings.
  */
  const linkQuery = new URLSearchParams(reportQuery);
  if (currency === "usd") linkQuery.set("currency", "usd");
  if (currency !== "usd") reportQuery.set("unit", "tzs");

  /* `pl` and `prior` come off the dashboard below rather than being run again
     here: financeDashboard already computes both for the same two windows, so
     this page used to run the whole profit and loss four times to print it
     twice. */
  const [dispatches, rawReportResult, flights, dash, rateRow] = await Promise.all([
    profitByDispatch(8),
    runReport(reportKey, {
      /* The chip's window unless somebody typed their own dates. */
      from: typedRange ? asDate(from) : window.from,
      to: typedRange ? toExclusive : window.to,
      batchId: batch ?? null,
    }),
    prisma.batch.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, batchNumber: true },
    }),
    /* Everything else on this page — and the profit and loss for both the
       window and the stretch before it — from the one function Admin reads. */
    financeDashboard(window, picked.previous, { batchId: batch ?? null }),
    /* The published rate, so this page can talk about money in the currency
       the office actually holds. */
    currentRate(),
  ]);

  const { pl, prior } = dash;
  const profitable = pl.profit >= 0;
  const biggest = pl.categories[0]?.amount ?? 0;

  /*
    SHILLINGS LEAD, DOLLARS STAY.

    Every figure in the database is a dollar figure, because that is how air
    freight is priced — and this page printed dollars straight through, so the
    owner read his own profit in a currency nobody in the office holds. The
    ledger, the overview and the customer profile had already been turned round
    to lead in shillings; the profit page had not, which is why the answer to
    "why do I keep seeing USD" was simply "because this page was never
    converted".

    Both currencies stay reachable. The switch decides which one leads, the
    headline cards and the statement print both at once, and the rate that did
    the converting is stamped underneath so nobody has to guess which one was
    used.
  */
  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const inUsd = currency === "usd" || rate === null;
  const money = (amount: number) =>
    inUsd ? formatUsd(amount) : formatShillings(amount, rate);
  /* A figure already added up as shillings. The dollar total is still the one
     shown when this page is being read in dollars, and the one it falls back
     on with no rate published — but it is never multiplied back up, which is
     what turned a TSh 20,000 cost into TSh 20,007. */
  const exact = (local: number, usd: number) =>
    inUsd ? formatUsd(usd) : formatShillingTotal(local, usd, rate);

  /** The same figure in the other currency — null when there is no rate. */
  const alt = (amount: number) =>
    rate === null ? null : inUsd ? formatShillings(amount, rate) : formatUsd(amount);

  /*
    The report table, restated in the currency the page is reading in.

    One currency, never two columns of the same money — and because the table
    on screen and the file that downloads both come from this one call, they
    cannot disagree about which money they are in.
  */
  const report = presentReport(rawReportResult, {
    unit: inUsd ? "USD" : "TZS",
    rate,
  });

  /*
    What the statement can be run for: the last eighteen months, and the last
    three years. Calendar periods only — a statement is a thing with a name
    somebody can ask for ("send me August") rather than an arbitrary stretch,
    and the From/To boxes further down already cover the arbitrary case.
  */
  const statementPeriods = (() => {
    const today = new Date();
    const months = Array.from({ length: 18 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      return {
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: formatMonthYear(d, locale),
      };
    });
    const years = [0, 1, 2].map((i) => today.getFullYear() - i);
    return { months, years };
  })();

  /** Keeps the rest of the URL intact when one control changes. */
  const withParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      report: reportKey,
      period,
      from,
      to,
      batch,
      currency,
      ...next,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/app/finance/reports?${params.toString()}`;
  };

  return (
    <>
      <FinanceWorkspaceHeader role={user.role} />

      {/* What THIS tab is for. The department's name and its
          actions are in the shared header above; this is the one
          sentence that belongs to the list below. */}
      <p className="mb-4 -mt-2 max-w-3xl text-sm text-muted-foreground">
        {t(locale, "Revenue against costs, for a period and for a batch. Every figure is derived from the operational record — there is no separate set of books.")}
      </p>


      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/*
            Every stretch the owner asked for, and each one drives the whole
            page — hero, cards, the table underneath and the download — rather
            than only the figure at the top.
          */}
          {[
            { key: "today", label: "Today" },
            { key: "week", label: "This week" },
            { key: "month", label: "This month" },
            { key: "quarter", label: "This quarter" },
            { key: "year", label: "This year" },
          ].map((option) => (
            <Chip
              key={option.key}
              href={withParams({
                period: option.key,
                from: undefined,
                to: undefined,
              })}
              active={!typedRange && (period ?? "month") === option.key}
            >
              {t(locale, option.label)}
            </Chip>
          ))}
          {typedRange ? (
            <span className="text-xs text-muted-foreground">
              {t(locale, "Showing the dates you typed above.")}
            </span>
          ) : null}
        </div>

        {/*
          Which currency the page reads in.

          Shillings by default, because that is the money the office holds and
          the customer hands over. Dollars are one tap away and never hidden —
          the cards and the statement print both at once — because the invoice,
          the rate book and every stored figure are dollars, and Finance has to
          be able to check one against the other.
        */}
        {rate === null ? null : (
          <div
            className="inline-flex overflow-hidden rounded-full border"
            role="group"
            aria-label={t(locale, "Currency")}
          >
            {[
              { key: "tzs", label: "TSh", on: !inUsd },
              { key: "usd", label: "USD", on: inUsd },
            ].map((option) => (
              <Link
                key={option.key}
                href={withParams({
                  currency: option.key === "usd" ? "usd" : undefined,
                })}
                aria-current={option.on ? "true" : undefined}
                className={`focus-ring px-3 py-1 text-xs font-semibold transition-colors ${
                  option.on
                    ? "bg-brand text-brand-foreground"
                    : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <p className="mb-4 text-[11px] text-muted-foreground">
        {rate === null
          ? t(
              locale,
              "No exchange rate has been published, so every figure is shown in dollars. Publish one on the Accounts tab and this page reads in shillings."
            )
          : `${t(locale, inUsd ? "Reading in dollars" : "Reading in shillings")} · USD 1 = TSh ${rate.toLocaleString("en-US")} · ${t(locale, "in force since")} ${formatDate(rateRow?.effectiveFrom, locale)}${
              rateRow?.setBy?.name ? `, ${t(locale, "set by")} ${rateRow.setBy.name}` : ""
            }`}
      </p>

      {/*
        Six figures, each against the stretch before it.

        A number on its own answers "how much" and never "is that good", which
        is the question somebody opens this page holding. Every card carries
        its own change in words — up, down, or the same — measured against the
        matching stretch: this week against last week, this quarter against the
        one before, a typed range against the same number of days before it.

        Outstanding and cash carry no comparison and say so. Both are "as at
        right now" figures derived from live balances, not sums over a window,
        so putting a period delta on them would be inventing history.
      */}
      <dl className="mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {(() => {
          const change = (now: number, before: number) => {
            if (before === 0) return now === 0 ? "nothing either way" : `new ${window.label}`;
            const pct = Math.round(((now - before) / Math.abs(before)) * 100);
            if (pct === 0) return `same as ${picked.previous.label}`;
            return `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on ${picked.previous.label}`;
          };
          const cells: {
            k: string;
            v: string;
            /** The same money in the other currency, so both are always here. */
            alt: string | null;
            sub: string;
            tone: string;
            wash: string;
          }[] = [
            {
              k: "Revenue",
              v: money(pl.revenue),
              alt: alt(pl.revenue),
              sub: change(pl.revenue, prior.revenue),
              tone: "text-foreground",
              wash: pl.revenue >= prior.revenue ? "from-success/10" : "from-destructive/10",
            },
            {
              k: "Total expenses",
              v: exact(pl.costsLocal, pl.costs),
              alt: alt(pl.costs),
              sub: change(pl.costs, prior.costs),
              tone: "text-destructive",
              wash: pl.costs <= prior.costs ? "from-success/10" : "from-destructive/10",
            },
            {
              k: pl.profit < 0 ? "Net loss" : "Net profit",
              v: exact(Math.abs(pl.profitLocal), Math.abs(pl.profit)),
              alt: alt(Math.abs(pl.profit)),
              sub: change(pl.profit, prior.profit),
              tone: pl.profit < 0 ? "text-destructive" : "text-success",
              wash: pl.profit >= prior.profit ? "from-success/10" : "from-destructive/10",
            },
            {
              k: "Profit margin",
              v: pl.margin === null ? "—" : `${pl.margin.toFixed(1)}%`,
              /* A percentage has no currency. */
              alt: null,
              sub:
                prior.margin === null || pl.margin === null
                  ? "no margin to compare"
                  : `${(pl.margin - prior.margin).toFixed(1)} points on ${picked.previous.label}`,
              tone: (pl.margin ?? 0) < 0 ? "text-destructive" : "text-foreground",
              wash:
                (pl.margin ?? 0) >= (prior.margin ?? 0)
                  ? "from-success/10"
                  : "from-destructive/10",
            },
            {
              k: "Collected",
              v: money(pl.cashIn),
              alt: alt(pl.cashIn),
              sub: change(pl.cashIn, prior.cashIn),
              tone: "text-success",
              wash: pl.cashIn >= prior.cashIn ? "from-success/10" : "from-destructive/10",
            },
            {
              k: "Paid out",
              v: exact(pl.cashOutLocal, pl.cashOut),
              alt: alt(pl.cashOut),
              sub: change(pl.cashOut, prior.cashOut),
              tone: "text-destructive",
              wash: pl.cashOut <= prior.cashOut ? "from-success/10" : "from-destructive/10",
            },
          ];
          return cells.map((cell) => (
            <div
              key={cell.k}
              className={`bg-gradient-to-b ${cell.wash} to-transparent bg-card px-4 py-3.5`}
            >
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t(locale, cell.k)}
              </dt>
              <dd
                className={`mt-1 whitespace-nowrap font-display text-xl font-bold leading-tight tabular-nums ${cell.tone}`}
              >
                {cell.v}
              </dd>
              {/* The other currency, always present and deliberately quiet. */}
              {cell.alt ? (
                <p className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
                  {cell.alt}
                </p>
              ) : null}
              <p className="mt-0.5 text-[11px] text-muted-foreground">{cell.sub}</p>
            </div>
          ));
        })()}
      </dl>

      {/*
        What that revenue line is actually made of.

        A credit sale is revenue the moment the cargo is released — the sale
        happened — and it is not cash. Both facts have to be readable on one
        screen or the same total means a good month to one person and a bank
        balance to another: Revenue above includes the credit, Collected does
        not, and everything in between is standing with customers.

        Six small cells rather than six more cards. The headline has already been
        read by the time anybody gets here; this is the composition, and it is a
        strip.
      */}
      <dl className="mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {[
          { k: "Cash revenue", v: money(pl.cashRevenue), tone: "" },
          { k: "Credit revenue", v: money(pl.creditRevenue), tone: "text-brand" },
          {
            k: "Outstanding receivables",
            v: money(pl.receivable),
            tone: "text-signal",
          },
          /* The credit share of the receivable beside it, and named in full
             rather than as "of that": these cells wrap onto two rows on a phone,
             so a label that depends on which cell it sits next to stops being
             true at 375px. How much of the credit has come BACK is a percentage
             in the line underneath — as an amount it would invite the reader to
             add it to Collected above, which is a different window and a
             different question. */
          {
            k: "Credit still owed",
            v: money(pl.credit.outstandingUsd),
            tone: "text-brand",
          },
          {
            k: "Overdue credit",
            v: money(pl.credit.overdueUsd),
            tone: "text-destructive",
          },
          { k: "Written off", v: money(pl.writtenOff), tone: "text-warning" },
        ].map((cell) => (
          <div key={cell.k} className="bg-card px-4 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t(locale, cell.k)}
            </dt>
            <dd
              className={`whitespace-nowrap font-display text-sm font-bold leading-tight tabular-nums ${cell.tone}`}
            >
              {cell.v}
            </dd>
          </div>
        ))}
      </dl>
      {/* One line, and only the parts that are true: a period with no credit and
          nothing forgiven says neither. */}
      <p className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          {t(
            locale,
            "Credit revenue is inside Revenue above, because the sale happened. It is not in Collected, and none of it is in the bank."
          )}
        </span>
        {pl.credit.count > 0 ? (
          <span>
            {pl.credit.count}{" "}
            {t(locale, pl.credit.count === 1 ? "credit sale" : "credit sales")}
            {pl.credit.collectionRate === null
              ? ""
              : ` · ${pl.credit.collectionRate.toFixed(0)}% ${t(locale, "of it back")}`}
          </span>
        ) : null}
        {pl.writtenOffCount > 0 ? (
          <span className="text-warning">
            {pl.writtenOffCount}{" "}
            {t(
              locale,
              pl.writtenOffCount === 1 ? "bill given up on" : "bills given up on"
            )}
          </span>
        ) : null}
      </p>

      {/* The headline, and the number under it that stops it being misread. */}
      <section
        className={`mb-6 rounded-xl border p-5 ${
          profitable
            ? "border-success/30 bg-success/5"
            : "border-destructive/30 bg-destructive/5"
        }`}
      >
        <p className="text-xs text-muted-foreground">{pl.window.label}</p>
        <p className="mt-1 flex items-baseline gap-3">
          <span className="font-display text-3xl font-bold tabular-nums">
            {exact(pl.profitLocal, pl.profit)}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-sm font-medium ${
              profitable ? "text-success" : "text-destructive"
            }`}
          >
            {profitable ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            {pl.margin === null
              ? t(locale, "no revenue yet")
              : `${pl.margin.toFixed(1)}% ${t(locale, "margin")}`}
          </span>
          {/* The same profit in the other currency, beside the headline rather
              than a page away — this is the one figure somebody quotes. */}
          {alt(pl.profit) ? (
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {alt(pl.profit)}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {money(pl.revenue)} {t(locale, "billed on")} {pl.invoices}{" "}
          {t(
            locale,
            pl.invoices === 1 ? "confirmed invoice" : "confirmed invoices"
          )}
          , {t(locale, "less")} {exact(pl.costsLocal, pl.costs)}{" "}
          {t(
            locale,
            "of costs incurred. Counted from the day the work happened, not the day the money moved."
          )}
        </p>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">
            {t(locale, "Did the work make money")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              locale,
              "Accrual — bills raised and costs incurred in this period, whether or not anyone has paid yet."
            )}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <Row
              label={t(locale, "Revenue billed")}
              value={money(pl.revenue)}
              alt={alt(pl.revenue)}
            />
            <Row
              label={t(locale, "Costs incurred")}
              value={`− ${exact(pl.costsLocal, pl.costs)}`}
              alt={alt(pl.costs)}
            />
            <Row
              label={t(locale, "Profit")}
              value={exact(pl.profitLocal, pl.profit)}
              alt={alt(pl.profit)}
              strong
            />
          </dl>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">{t(locale, "Did the money move")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              locale,
              "Cash — what customers actually paid and what actually left an account. This is the one that decides whether you can make payroll."
            )}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <Row
              label={t(locale, "Collected")}
              value={money(pl.cashIn)}
              alt={alt(pl.cashIn)}
            />
            <Row
              label={t(locale, "Paid out")}
              value={`− ${exact(pl.cashOutLocal, pl.cashOut)}`}
              alt={alt(pl.cashOut)}
            />
            <Row
              label={t(locale, "Net cash")}
              value={money(pl.netCash)}
              alt={alt(pl.netCash)}
              strong
            />
          </dl>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card shadow-soft">
          <h2 className="border-b px-5 py-4 font-semibold">
            {t(locale, "Where the money went")}
          </h2>
          {pl.categories.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={t(locale, "No costs in this period")}
                description={t(
                  locale,
                  "Record costs on the Expenses tab and they appear here, split by what they were for."
                )}
              />
            </div>
          ) : (
            <ul className="divide-y">
              {pl.categories.map((row) => (
                <li key={row.category} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      {t(
                        locale,
                        EXPENSE_CATEGORY_LABELS[row.category] ?? row.category
                      )}
                    </span>
                    <span className="font-mono tabular-nums">
                      {exact(row.amountLocal, row.amount)}
                    </span>
                  </div>
                  {/* A bar against the largest category, so the shape of the
                      spending is readable without doing arithmetic. */}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{
                        width: `${biggest > 0 ? (row.amount / biggest) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card shadow-soft">
          <div className="border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Plane className="h-4 w-4 text-muted-foreground" />
              {t(locale, "Profit per batch")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                locale,
                "Only costs tied to a dispatch count here. Rent and salaries belong to the business, not to one aeroplane."
              )}
            </p>
          </div>
          {dispatches.length === 0 ? (
            <div className="p-5">
              <EmptyState title={t(locale, "No dispatches have flown yet")} />
            </div>
          ) : (
            <ul className="divide-y">
              {dispatches.map((batch) => (
                <li key={batch.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/app/batches/${batch.id}`}
                        className="font-mono text-sm hover:text-brand"
                      >
                        {batch.batchNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {batch.departedAt
                          ? `${t(locale, "flew")} ${formatDate(batch.departedAt, locale)}`
                          : t(locale, "not departed")}
                        {" · "}
                        {exact(batch.revenueLocal, batch.revenue)} {t(locale, "in")}
                        {batch.hasCosts
                          ? `, ${exact(batch.costsLocal, batch.costs)} ${t(locale, "out")}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      {batch.hasCosts ? (
                        <p
                          className={`font-mono text-sm font-medium tabular-nums ${
                            batch.profit >= 0 ? "text-success" : "text-destructive"
                          }`}
                        >
                          {exact(batch.profitLocal, batch.profit)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {t(locale, "no costs recorded")}
                        </p>
                      )}
                      {/* Said plainly: a flight still full of draft prices has a
                          revenue figure that is going to move. */}
                      {batch.unconfirmed > 0 ? (
                        <Badge
                          variant="outline"
                          className="mt-0.5 border-warning/40 font-normal text-warning"
                        >
                          {batch.unconfirmed}{" "}
                          {t(
                            locale,
                            batch.unconfirmed === 1
                              ? "price unconfirmed"
                              : "prices unconfirmed"
                          )}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ──────────────────────── the period, in review ─────────────────── */}
      {/*
        The month as a paragraph, not a dashboard.

        The owner asked for a monthly review he could read out: what came in,
        what it cost, what is left. Every figure here already appears above in
        a card or a table — this is the same set said once, in order, with the
        comparison attached, for somebody who wants the answer rather than the
        instrument panel.
      */}
      <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
          <h2 className="font-display font-semibold">
            {t(locale, "In review")} · {window.label}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(locale, "against")} {picked.previous.label}
          </p>
        </div>
        {/* Seven cells never divide into four or two, so a fixed grid left an
            empty box on the end of the row at most widths. A wrapping row with a
            basis stretches the last line to fill instead. */}
        <dl className="flex flex-wrap gap-px bg-border">
          {(() => {
            const move = (now: number, before: number) => {
              if (before === 0) return null;
              const p = Math.round(((now - before) / Math.abs(before)) * 100);
              return `${p > 0 ? "+" : ""}${p}%`;
            };
            return [
              {
                k: "Cargo received",
                v: `${dash.volume.kgReceived.toFixed(0)} kg`,
                d: null,
              },
              { k: "Batches arrived", v: String(dash.volume.batchesArrived), d: null },
              {
                k: "Revenue",
                v: money(pl.revenue),
                d: move(pl.revenue, prior.revenue),
                up: pl.revenue >= prior.revenue,
              },
              {
                k: "Collected",
                v: money(pl.cashIn),
                d: move(pl.cashIn, prior.cashIn),
                up: pl.cashIn >= prior.cashIn,
              },
              {
                /*
                  The same receivable the strip at the top prints, from the same
                  place. It read dash.revenue.outstandingUsd, which counts a
                  written-off bill's face value as money still owed — so this cell
                  and the P&L above it gave two different answers to "what is
                  outstanding", on one page, differing by exactly the debt the
                  company had already abandoned.
                */
                k: "Outstanding",
                v: money(pl.receivable),
                d: null,
              },
              {
                k: "Expenses",
                v: exact(pl.costsLocal, pl.costs),
                d: move(pl.costs, prior.costs),
                up: pl.costs <= prior.costs,
              },
              {
                k: pl.profit < 0 ? "Net loss" : "Net profit",
                v: exact(Math.abs(pl.profitLocal), Math.abs(pl.profit)),
                d: move(pl.profit, prior.profit),
                up: pl.profit >= prior.profit,
              },
            ].map((cell) => (
              <div key={cell.k} className="min-w-0 flex-1 basis-[9rem] bg-card px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, cell.k)}
                </dt>
                <dd className="mt-0.5 whitespace-nowrap font-display text-base font-bold tabular-nums">
                  {cell.v}
                </dd>
                {cell.d ? (
                  <p
                    className={`text-[11px] tabular-nums ${
                      "up" in cell && cell.up ? "text-success" : "text-destructive"
                    }`}
                  >
                    {cell.d}
                  </p>
                ) : null}
              </div>
            ));
          })()}
        </dl>
      </section>

      {/* ─────────────────── which batches need attention ───────────────── */}
      {dash.batches.length > 0 ? (
        <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {(() => {
            const by = (pick: (b: (typeof dash.batches)[number]) => number, worst = false) =>
              [...dash.batches].sort((a, b) =>
                worst ? pick(a) - pick(b) : pick(b) - pick(a)
              )[0];
            const best = by((b) => b.profitUsd);
            const worst = by((b) => b.profitUsd, true);
            const owed = by((b) => b.outstandingUsd);
            const heaviest = by((b) => b.kg);
            return [
              {
                k: "Most profitable",
                b: best,
                v: money(best.profitUsd),
                tone: "text-success",
              },
              {
                k: worst.profitUsd < 0 ? "Losing money" : "Least profitable",
                b: worst,
                v: money(worst.profitUsd),
                tone: worst.profitUsd < 0 ? "text-destructive" : "",
              },
              {
                k: "Most owed on it",
                b: owed,
                v: money(owed.outstandingUsd),
                tone: "text-signal",
              },
              { k: "Heaviest", b: heaviest, v: `${heaviest.kg.toFixed(0)} kg`, tone: "" },
            ].map((cell) => (
              <Link
                key={cell.k}
                href={`/app/shipments/${cell.b.id}`}
                className="bg-card px-4 py-3 transition-colors hover:bg-accent"
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, cell.k)}
                </p>
                <p className={`mt-0.5 font-display text-lg font-bold tabular-nums ${cell.tone}`}>
                  {cell.v}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {cell.b.batchNumber}
                </p>
              </Link>
            ));
          })()}
        </div>
      ) : null}

      {/* ─────────────────────────── batch performance ─────────────────── */}
      {/*
        Where the money actually comes from.

        Cargo is the business, and a batch is the unit it arrives in — so the
        question "which batches made money and which need attention" is the
        one Finance opens this page holding. Every figure here is derived from
        the same invoices and expenses as the statement above; nothing is
        stored, so correcting a payment or a cost moves this row too.
      */}
      <SectionLabel
        action={{ href: "/app/shipments", label: t(locale, "All batches") }}
      >
        {t(locale, "Batch performance")}
      </SectionLabel>
      {/* A table this wide cannot carry two figures per cell without becoming
          unreadable, so it says which currency it is in and where the switch
          is, rather than leaving the reader to work it out from the symbol. */}
      <p className="mb-2 text-[11px] text-muted-foreground">
        {rate === null
          ? t(locale, "In dollars.")
          : inUsd
            ? t(locale, "In dollars. Switch to shillings at the top of the page.")
            : `${t(locale, "In shillings, converted at")} USD 1 = TSh ${rate.toLocaleString("en-US")}. ${t(locale, "Switch to dollars at the top of the page.")}`}
      </p>
      {/* Ten columns and a 900px floor. That floor is what stopped the page
          body scrolling sideways, but it still meant dragging a table to read
          a batch — below md each batch becomes a card with its figures
          labelled. */}
      <ul className="mb-6 divide-y overflow-hidden rounded-xl border bg-card shadow-soft md:hidden">
        {dash.batches.length === 0 ? (
          <li className="px-4 py-8 text-center text-muted-foreground">
            {t(locale, "No batches to show.")}
          </li>
        ) : (
          dash.batches.map((b) => (
            <li key={b.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/app/shipments/${b.id}`}
                  className="focus-ring rounded font-mono text-sm font-semibold hover:underline"
                >
                  {b.batchNumber}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t(
                    locale,
                    ORIGIN_LABELS[b.origin as keyof typeof ORIGIN_LABELS] ??
                      b.origin
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {b.cargo} {t(locale, "Cargo")} · {b.kg.toFixed(1)}{" "}
                {t(locale, "Kg")}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {[
                  { k: t(locale, "Expected"), v: money(b.expectedUsd), tone: "" },
                  {
                    k: t(locale, "Collected"),
                    v: money(b.collectedUsd),
                    tone: "text-success",
                  },
                  {
                    k: t(locale, "Outstanding"),
                    v: money(b.outstandingUsd),
                    tone: "text-destructive",
                  },
                  {
                    k: t(locale, "Expenses"),
                    v: money(b.expensesUsd),
                    tone: "text-destructive",
                  },
                  {
                    k: t(locale, "Net profit"),
                    v: money(b.profitUsd),
                    tone: b.profitUsd < 0 ? "font-medium text-destructive" : "font-medium",
                  },
                  {
                    k: t(locale, "Margin"),
                    v: b.marginPct === null ? "—" : `${b.marginPct}%`,
                    tone: "text-muted-foreground",
                  },
                ].map((f) => (
                  <div key={f.k} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{f.k}</dt>
                    <dd className={`truncate tabular-nums ${f.tone}`}>{f.v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))
        )}
      </ul>

      <div className="mb-6 hidden overflow-x-auto rounded-xl border bg-card shadow-soft md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">{t(locale, "Batch")}</th>
              <th className="px-4 py-2.5">{t(locale, "From")}</th>
              <th className="px-4 py-2.5 text-right">{t(locale, "Cargo")}</th>
              <th className="px-4 py-2.5 text-right">{t(locale, "Kg")}</th>
              <th className="px-4 py-2.5 text-right">{t(locale, "Expected")}</th>
              <th className="px-4 py-2.5 text-right">{t(locale, "Collected")}</th>
              <th className="px-4 py-2.5 text-right">{t(locale, "Outstanding")}</th>
              <th className="px-4 py-2.5 text-right">{t(locale, "Expenses")}</th>
              <th className="px-4 py-2.5 text-right">{t(locale, "Net profit")}</th>
              <th className="px-4 py-2.5 text-right">{t(locale, "Margin")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {dash.batches.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  {t(locale, "No batches to show.")}
                </td>
              </tr>
            ) : (
              dash.batches.map((b) => (
                <tr key={b.id} className="transition-colors hover:bg-accent/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/app/shipments/${b.id}`}
                      className="font-mono text-xs font-semibold hover:underline"
                    >
                      {b.batchNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {t(locale, ORIGIN_LABELS[b.origin as keyof typeof ORIGIN_LABELS] ?? b.origin)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{b.cargo}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{b.kg.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {money(b.expectedUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-success">
                    {money(b.collectedUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-destructive">
                    {money(b.outstandingUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-destructive">
                    {money(b.expensesUsd)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                      b.profitUsd < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {money(b.profitUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {b.marginPct === null ? "—" : `${b.marginPct}%`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ──────────────────────────── business volume ───────────────────── */}
      <SectionLabel>{t(locale, "Business volume")}</SectionLabel>
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4 xl:grid-cols-7">
        {[
          { k: "Kg received", v: dash.volume.kgReceived.toFixed(1) },
          { k: "Kg billed", v: dash.volume.kgBilled.toFixed(1) },
          { k: "Kg collected", v: dash.volume.kgCollected.toFixed(1) },
          { k: "Packages", v: String(dash.volume.packages) },
          { k: "Customers served", v: String(dash.volume.customers) },
          { k: "Batches arrived", v: String(dash.volume.batchesArrived) },
          { k: "Batches closed", v: String(dash.volume.batchesClosed) },
        ].map((cell) => (
          <div key={cell.k} className="bg-card px-4 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t(locale, cell.k)}
            </dt>
            <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
              {cell.v}
            </dd>
          </div>
        ))}
      </dl>

      {/* ─────────────────────── revenue & expense analysis ──────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">{t(locale, "Where revenue comes from")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                locale,
                "Freight billed in this period. There is no other kind of income in the system — every invoice belongs to a consignment."
              )}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-px border-b bg-border">
            {[
              { k: "Expected", v: money(dash.revenue.expectedUsd), tone: "" },
              { k: "Collected", v: money(dash.revenue.collectedUsd), tone: "text-success" },
              {
                k: "Outstanding",
                v: money(dash.revenue.outstandingUsd),
                tone: "text-destructive",
              },
            ].map((cell) => (
              <div key={cell.k} className="bg-card px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, cell.k)}
                </dt>
                <dd className={`mt-0.5 font-display text-base font-bold tabular-nums ${cell.tone}`}>
                  {cell.v}
                </dd>
              </div>
            ))}
          </dl>
          <ul className="divide-y">
            {dash.revenue.byOrigin.map((row) => (
              <li key={row.origin} className="flex items-baseline gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  {t(locale, ORIGIN_LABELS[row.origin as keyof typeof ORIGIN_LABELS] ?? row.origin)}
                </span>
                <span className="tabular-nums">{money(row.expectedUsd)}</span>
                <span className="w-24 text-right text-xs tabular-nums text-success">
                  {money(row.collectedUsd)} {t(locale, "in")}
                </span>
              </li>
            ))}
            {dash.revenue.topCustomers.slice(0, 5).map((row) => (
              <li
                key={row.name}
                className="flex items-baseline gap-3 bg-muted/20 px-5 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {row.name}
                </span>
                <span className="tabular-nums">{money(row.expectedUsd)}</span>
                <span className="w-24 text-right tabular-nums text-destructive">
                  {row.outstandingUsd > 0 ? `${money(row.outstandingUsd)} owed` : "settled"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">{t(locale, "Where money is spent")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                locale,
                "A cost with a batch against it is a batch cost; one without is treated as office overhead. That is a reading of the record, not a field somebody sets."
              )}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-px border-b bg-border">
            {[
              { k: "Batch costs", v: exact(dash.expenses.batchLocal, dash.expenses.batchUsd) },
              { k: "Office costs", v: exact(dash.expenses.officeLocal, dash.expenses.officeUsd) },
              { k: "Special", v: exact(dash.expenses.specialLocal, dash.expenses.specialUsd) },
            ].map((cell) => (
              <div key={cell.k} className="bg-card px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, cell.k)}
                </dt>
                <dd className="mt-0.5 font-display text-base font-bold tabular-nums text-destructive">
                  {cell.v}
                </dd>
              </div>
            ))}
          </dl>
          <ul className="divide-y">
            {dash.expenses.byCategory.slice(0, 8).map((row) => (
              <li key={row.category} className="px-5 py-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {t(locale, EXPENSE_CATEGORY_LABELS[row.category] ?? row.category)}
                  </span>
                  <span className="tabular-nums">{money(row.amount)}</span>
                  <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                    {Math.round(row.share)}%
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-destructive/60"
                    style={{ width: `${Math.max(2, Math.min(100, row.share))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ─────────────────── position, collections and health ────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">{t(locale, "Financial position")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                locale,
                "Where the money is right now, derived from the ledger. Not a period figure — it is today's answer whichever stretch is chosen above."
              )}
            </p>
          </div>
          <ul className="divide-y">
            {dash.position.accounts.map((a) => (
              <li key={a.name} className="flex items-baseline gap-3 px-5 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="text-xs text-muted-foreground">{a.currency}</span>
                <span
                  className={`tabular-nums ${a.balance < 0 ? "text-destructive" : ""}`}
                >
                  {a.balance.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
            {[
              { k: "Cash", v: money(dash.position.cashUsd), tone: "" },
              {
                k: "Owed to us",
                v: money(dash.position.receivableUsd),
                tone: "text-signal",
              },
              {
                k: "Owed by us",
                v: money(dash.position.payableUsd),
                tone: "text-destructive",
              },
              {
                k: "Net position",
                v: money(dash.position.netUsd),
                tone: dash.position.netUsd < 0 ? "text-destructive" : "text-success",
              },
            ].map((cell) => (
              <div key={cell.k} className="bg-card px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, cell.k)}
                </dt>
                <dd className={`mt-0.5 font-display text-base font-bold tabular-nums ${cell.tone}`}>
                  {cell.v}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">{t(locale, "Collection performance")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(locale, "What was billed in this period against what has come in for it.")}
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{t(locale, "Collection rate")}</span>
              <span className="font-display text-2xl font-bold tabular-nums">
                {dash.collections.rate === null ? "—" : `${dash.collections.rate}%`}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${Math.min(100, dash.collections.rate ?? 0)}%` }}
              />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
            {[
              { k: "Paid", v: dash.collections.paid, href: "/app/collections/follow-up" },
              { k: "Unpaid", v: dash.collections.unpaid, href: "/app/collections/follow-up" },
              {
                k: "Part paid",
                v: dash.collections.partiallyPaid,
                href: "/app/collections/follow-up",
              },
              {
                k: "To verify",
                v: dash.collections.awaitingVerification,
                href: "/app/collections/verify",
              },
            ].map((cell) => (
              <Link key={cell.k} href={cell.href} className="bg-card px-4 py-3 hover:bg-accent">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, cell.k)}
                </dt>
                <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
                  {cell.v}
                </dd>
              </Link>
            ))}
          </dl>
        </section>
      </div>

      {/* ───────────────────────────── financial health ─────────────────── */}
      <SectionLabel>{t(locale, "Financial health")}</SectionLabel>
      <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-3">
        {dash.health.map((metric) => (
          <div key={metric.key} className="bg-card px-5 py-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t(locale, metric.label)}
            </p>
            <p
              className={`mt-0.5 font-display text-2xl font-bold tabular-nums ${
                metric.tone === "good"
                  ? "text-success"
                  : metric.tone === "bad"
                    ? "text-destructive"
                    : metric.tone === "warn"
                      ? "text-warning"
                      : ""
              }`}
            >
              {metric.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.explain}</p>
          </div>
        ))}
      </div>

      {/* ───────────────────────────────── trends ───────────────────────── */}
      <SectionLabel>{t(locale, "Twelve months")}</SectionLabel>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h3 className="text-sm font-semibold">{t(locale, "Billed against spent")}</h3>
          <FlowBars
            className="mt-3"
            labels={dash.trend.labels}
            valuesIn={dash.trend.revenue}
            valuesOut={dash.trend.expenses}
            currentIndex={dash.trend.labels.length - 1}
            format={(usd: number) => money(usd)}
          />
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h3 className="text-sm font-semibold">{t(locale, "Cargo landed, by month")}</h3>
          <BarChart
            className="mt-3"
            data={dash.trend.labels.map((label, i) => ({
              label,
              value: dash.trend.kg[i],
            }))}
            highlightIndex={dash.trend.labels.length - 1}
            formatValue={(kg: number) => `${kg.toFixed(0)} kg`}
          />
        </section>
      </div>
      {/* ─────────────────────────────── reports ───────────────────────── */}
      {/*
        The download shelf, at the bottom where a shelf belongs.

        Fourteen unexplained pills used to sit at the very top of this page,
        above the figures somebody actually came to read, with nothing saying
        what they were. The owner's reaction was the correct one: he could not
        tell what it was for. Every one of them runs the same records the
        dashboard above is built from and hands them over as a file — so it
        goes underneath the reading, and now says so in a sentence.
      */}
      {/*
        The statement, and then the working papers.

        A report is one table. What gets printed, signed and handed to the boss
        or the bank is the whole set of books for a named period — profit and
        loss, cash, revenue, spending, batch by batch, position, collections,
        volume — in both currencies, with the rate it was converted at printed
        on it. That document is chosen by period here rather than inheriting
        whatever the screen happened to be showing, because "send me August"
        is the actual request.
      */}
      <SectionLabel>{t(locale, "Financial statement")}</SectionLabel>
      <section className="mb-6 rounded-xl border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-xl">
            <h2 className="font-display font-semibold">
              {t(locale, "The whole set of books, as one document")}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t(
                locale,
                "Profit and loss, cash, where revenue came from, where money was spent, every batch, the position today, collections and volume — for the month or year you pick, with a line for Finance and a line for approval."
              )}
              {rate === null
                ? ""
                : ` ${t(locale, "Written in")} ${inUsd ? t(locale, "dollars") : t(locale, "shillings")}, ${t(locale, "to match the switch at the top of this page.")}`}
            </p>
          </div>
          <form
            method="get"
            action="/api/finance/statement"
            target="_blank"
            className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-end"
          >
            {/* The statement is written in the currency the page is reading in. */}
            {inUsd ? null : <input type="hidden" name="unit" value="tzs" />}
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{t(locale, "Period")}</span>
              <select
                name="period"
                defaultValue={statementPeriods.months[0]?.value}
                className="focus-ring h-11 w-full rounded-md border bg-card px-2 text-sm sm:h-9 sm:w-auto sm:min-w-[11rem]"
              >
                <optgroup label={t(locale, "Month")}>
                  {statementPeriods.months.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t(locale, "Full year")}>
                  {statementPeriods.years.map((yr) => (
                    <option key={yr} value={String(yr)}>
                      {yr}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <button
              type="submit"
              className="focus-ring inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground transition-colors hover:opacity-90 sm:h-9 sm:w-auto"
            >
              <FileText className="h-4 w-4" />
              {t(locale, "Open the statement")}
            </button>
          </form>
        </div>
      </section>

      <SectionLabel>{t(locale, "Reports to download")}</SectionLabel>
      <p className="mb-3 text-xs text-muted-foreground">
        {t(
          locale,
          "One table each, over the period chosen at the top — the working papers behind the statement. Spreadsheet to work in, PDF to hand over."
        )}
      </p>
      <div className="mb-6">
        <ReportViewer
          report={report}
          note={report.currencyNote}
          query={reportQuery.toString()}
          linkQuery={linkQuery.toString()}
          filters={
            /* The action carries the anchor: a GET form replaces the query
               string but keeps the fragment, so applying a filter comes back
               to the table instead of the top of the page. */
            /* One column on a phone, a filter bar from sm up. Wrapped flex put
               a 32px date field beside a flight picker at 375px, which is two
               controls nobody can hit and a label that wraps under its own
               input. */
            <form
              method="get"
              action="/app/finance/reports#reports"
              className="grid grid-cols-1 gap-3 text-xs sm:flex sm:flex-wrap sm:items-end"
            >
              <input type="hidden" name="report" value={reportKey} />
              {currency === "usd" ? (
                <input type="hidden" name="currency" value="usd" />
              ) : null}
              {period ? (
                <input type="hidden" name="period" value={period} />
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">{t(locale, "From")}</span>
                <input
                  type="date"
                  name="from"
                  defaultValue={from ?? ""}
                  className="focus-ring h-11 w-full rounded-md border bg-card px-2 sm:h-8 sm:w-auto"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">{t(locale, "To")}</span>
                <input
                  type="date"
                  name="to"
                  defaultValue={to ?? ""}
                  className="focus-ring h-11 w-full rounded-md border bg-card px-2 sm:h-8 sm:w-auto"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">{t(locale, "Flight")}</span>
                <select
                  name="batch"
                  defaultValue={batch ?? ""}
                  className="focus-ring h-11 w-full rounded-md border bg-card px-2 sm:h-8 sm:w-auto"
                >
                  <option value="">{t(locale, "Every batch")}</option>
                  {flights.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.batchNumber}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="focus-ring h-11 w-full rounded-md border bg-card px-3 font-medium hover:bg-accent sm:h-8 sm:w-auto"
              >
                {t(locale, "Apply")}
              </button>
              {from || to || batch ? (
                <a
                  href={`${withParams({ from: undefined, to: undefined, batch: undefined })}#reports`}
                  className="inline-flex min-h-[44px] items-center justify-center px-1 text-muted-foreground underline sm:min-h-0 sm:h-8 sm:self-end sm:leading-8"
                >
                  {t(locale, "Clear")}
                </a>
              ) : null}
            </form>
          }
        />
      </div>
    </>
  );
}

function Row({
  label,
  value,
  alt,
  strong,
}: {
  label: string;
  value: string;
  /** The same figure in the other currency, under the leading one. */
  alt?: string | null;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${
        strong ? "border-t pt-2 font-semibold" : ""
      }`}
    >
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="text-right">
        <span className="font-mono tabular-nums">{value}</span>
        {alt ? (
          <span className="block font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
            {alt}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
