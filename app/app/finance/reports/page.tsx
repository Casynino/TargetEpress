import type { Metadata } from "next";
import Link from "next/link";
import { Plane, TrendingDown, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { Badge } from "@/components/ui/badge";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { monthWindow, profitAndLoss, profitByDispatch, yearWindow } from "@/lib/profit";
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
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requirePermission("profit.view");
  const locale = await viewerLocale();
  const { period } = await searchParams;

  const window =
    period === "last"
      ? monthWindow(1)
      : period === "year"
        ? yearWindow()
        : monthWindow(0);

  const [pl, dispatches] = await Promise.all([
    profitAndLoss(window),
    profitByDispatch(8),
  ]);

  const profitable = pl.profit >= 0;
  const biggest = pl.categories[0]?.amount ?? 0;

  return (
    <>
      <PageHeader
        title={t(locale, "Profit & loss")}
        description={t(
          locale,
          "Revenue against costs, for a period and for a flight. Every figure is derived from the operational record — there is no separate set of books."
        )}
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip href="/app/finance/reports" active={!period || period === "month"}>
          {t(locale, "This month")}
        </Chip>
        <Chip href="/app/finance/reports?period=last" active={period === "last"}>
          {t(locale, "Last month")}
        </Chip>
        <Chip href="/app/finance/reports?period=year" active={period === "year"}>
          {t(locale, "This year")}
        </Chip>
      </div>

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
              {t(locale, "Profit per flight")}
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
