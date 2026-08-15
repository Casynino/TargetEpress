import type { Metadata } from "next";
import Link from "next/link";
import { Plane, TrendingDown, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ReportViewer } from "@/components/app/report-viewer";
import { FinanceNav } from "@/components/app/finance-nav";
import { Badge } from "@/components/ui/badge";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
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

  const [pl, dispatches, report, flights, prior] = await Promise.all([
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
