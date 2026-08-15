import type { Metadata } from "next";
import Link from "next/link";
import { Plane, TrendingDown, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { SectionLabel } from "@/components/app/section-label";
import { BarChart } from "@/components/charts/bar-chart";
import { FlowBars } from "@/components/charts/flow-bars";
import { PageHeader } from "@/components/app/page-header";
import { ReportViewer } from "@/components/app/report-viewer";
import { FinanceNav } from "@/components/app/finance-nav";
import { Badge } from "@/components/ui/badge";
import { ORIGIN_LABELS } from "@/lib/constants";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { financeDashboard } from "@/lib/finance-dashboard";
import { profitAndLoss, profitByDispatch, windowFor } from "@/lib/profit";
import { prisma } from "@/lib/prisma";
import { REPORTS, runReport, type ReportKey } from "@/lib/reports";
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
  }>;
}) {
  const user = await requirePermission("profit.view");
  const locale = await viewerLocale();
  const { period, report: rawReport, from, to, batch } = await searchParams;

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

  const [pl, dispatches, report, flights, prior, dash] = await Promise.all([
    profitAndLoss(window),
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
    /* The same figures for the stretch before, so every card can say which
       way it went rather than only how much. */
    profitAndLoss(picked.previous),
    /* Everything else on this page, from the one function Admin reads too. */
    financeDashboard(window, picked.previous, { batchId: batch ?? null }),
  ]);

  const profitable = pl.profit >= 0;
  const biggest = pl.categories[0]?.amount ?? 0;

  return (
    <>
      <PageHeader
        title={t(locale, "Profit & loss")}
        description={t(
          locale,
          "Revenue against costs, for a period and for a batch. Every figure is derived from the operational record — there is no separate set of books."
        )}
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <div className="mb-6">
        <ReportViewer
          report={report}
          query={reportQuery.toString()}
          filters={
            <form
              method="get"
              className="flex flex-wrap items-end gap-3 text-xs"
            >
              <input type="hidden" name="report" value={reportKey} />
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">{t(locale, "From")}</span>
                <input
                  type="date"
                  name="from"
                  defaultValue={from ?? ""}
                  className="focus-ring h-8 rounded-md border bg-card px-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">{t(locale, "To")}</span>
                <input
                  type="date"
                  name="to"
                  defaultValue={to ?? ""}
                  className="focus-ring h-8 rounded-md border bg-card px-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">{t(locale, "Flight")}</span>
                <select
                  name="batch"
                  defaultValue={batch ?? ""}
                  className="focus-ring h-8 rounded-md border bg-card px-2"
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
                className="focus-ring h-8 rounded-md border bg-card px-3 font-medium hover:bg-accent"
              >
                {t(locale, "Apply")}
              </button>
              {from || to || batch ? (
                <a
                  href={`/app/finance/reports?report=${reportKey}`}
                  className="h-8 self-end px-1 leading-8 text-muted-foreground underline"
                >
                  {t(locale, "Clear")}
                </a>
              ) : null}
            </form>
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
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
            href={`/app/finance/reports?report=${reportKey}&period=${option.key}`}
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
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 xl:grid-cols-6">
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
            sub: string;
            tone: string;
            wash: string;
          }[] = [
            {
              k: "Revenue",
              v: formatUsd(pl.revenue),
              sub: change(pl.revenue, prior.revenue),
              tone: "text-foreground",
              wash: pl.revenue >= prior.revenue ? "from-success/10" : "from-destructive/10",
            },
            {
              k: "Total expenses",
              v: formatUsd(pl.costs),
              sub: change(pl.costs, prior.costs),
              tone: "text-destructive",
              wash: pl.costs <= prior.costs ? "from-success/10" : "from-destructive/10",
            },
            {
              k: pl.profit < 0 ? "Net loss" : "Net profit",
              v: formatUsd(Math.abs(pl.profit)),
              sub: change(pl.profit, prior.profit),
              tone: pl.profit < 0 ? "text-destructive" : "text-success",
              wash: pl.profit >= prior.profit ? "from-success/10" : "from-destructive/10",
            },
            {
              k: "Profit margin",
              v: pl.margin === null ? "—" : `${pl.margin.toFixed(1)}%`,
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
              v: formatUsd(pl.cashIn),
              sub: change(pl.cashIn, prior.cashIn),
              tone: "text-success",
              wash: pl.cashIn >= prior.cashIn ? "from-success/10" : "from-destructive/10",
            },
            {
              k: "Paid out",
              v: formatUsd(pl.cashOut),
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
              <p className="mt-0.5 text-[11px] text-muted-foreground">{cell.sub}</p>
            </div>
          ));
        })()}
      </dl>

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
            {formatUsd(pl.profit)}
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
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatUsd(pl.revenue)} {t(locale, "billed on")} {pl.invoices}{" "}
          {t(
            locale,
            pl.invoices === 1 ? "confirmed invoice" : "confirmed invoices"
          )}
          , {t(locale, "less")} {formatUsd(pl.costs)}{" "}
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
              value={formatUsd(pl.revenue)}
            />
            <Row
              label={t(locale, "Costs incurred")}
              value={`− ${formatUsd(pl.costs)}`}
            />
            <Row label={t(locale, "Profit")} value={formatUsd(pl.profit)} strong />
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
            <Row label={t(locale, "Collected")} value={formatUsd(pl.cashIn)} />
            <Row
              label={t(locale, "Paid out")}
              value={`− ${formatUsd(pl.cashOut)}`}
            />
            <Row label={t(locale, "Net cash")} value={formatUsd(pl.netCash)} strong />
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
                      {formatUsd(row.amount)}
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
                        {formatUsd(batch.revenue)} {t(locale, "in")}
                        {batch.hasCosts
                          ? `, ${formatUsd(batch.costs)} ${t(locale, "out")}`
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
                          {formatUsd(batch.profit)}
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
      <div className="mb-6 overflow-x-auto rounded-xl border bg-card shadow-soft">
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
                    {formatUsd(b.expectedUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-success">
                    {formatUsd(b.collectedUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-destructive">
                    {formatUsd(b.outstandingUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-destructive">
                    {formatUsd(b.expensesUsd)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                      b.profitUsd < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {formatUsd(b.profitUsd)}
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
              { k: "Expected", v: formatUsd(dash.revenue.expectedUsd), tone: "" },
              { k: "Collected", v: formatUsd(dash.revenue.collectedUsd), tone: "text-success" },
              {
                k: "Outstanding",
                v: formatUsd(dash.revenue.outstandingUsd),
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
                <span className="tabular-nums">{formatUsd(row.expectedUsd)}</span>
                <span className="w-24 text-right text-xs tabular-nums text-success">
                  {formatUsd(row.collectedUsd)} {t(locale, "in")}
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
                <span className="tabular-nums">{formatUsd(row.expectedUsd)}</span>
                <span className="w-24 text-right tabular-nums text-destructive">
                  {row.outstandingUsd > 0 ? `${formatUsd(row.outstandingUsd)} owed` : "settled"}
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
              { k: "Batch costs", v: formatUsd(dash.expenses.batchUsd) },
              { k: "Office costs", v: formatUsd(dash.expenses.officeUsd) },
              { k: "Special", v: formatUsd(dash.expenses.specialUsd) },
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
                  <span className="tabular-nums">{formatUsd(row.amount)}</span>
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
              { k: "Cash", v: formatUsd(dash.position.cashUsd), tone: "" },
              {
                k: "Owed to us",
                v: formatUsd(dash.position.receivableUsd),
                tone: "text-signal",
              },
              {
                k: "Owed by us",
                v: formatUsd(dash.position.payableUsd),
                tone: "text-destructive",
              },
              {
                k: "Net position",
                v: formatUsd(dash.position.netUsd),
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
            format={(usd: number) => formatUsd(usd)}
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
    </>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${
        strong ? "border-t pt-2 font-semibold" : ""
      }`}
    >
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
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
