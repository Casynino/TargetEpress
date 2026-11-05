/*
  The owner's and the manager's screen, in a module of its own.

  It lived at the bottom of the dashboard page until the manager needed it too,
  and a page file in the App Router may export nothing but the page — so sharing
  it meant giving it a home rather than making a second copy. The dashboard still
  renders it for the owner; the manager's route renders the same function.
*/
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  CreditCard,
  ClipboardCheck,
  Clock,
  HandCoins,
  Hourglass,
  Landmark,
  Package,
  PackageCheck,
  PackagePlus,
  Plane,
  Printer,
  QrCode,
  Receipt,
  Scale,
  ShieldCheck,
  ScanLine,
  Timer,
  TrendingDown,
  Trash2,
  Truck,
  UserCog,
  Users,
  TrendingUp,
  Wallet,
  Warehouse,
} from "lucide-react";

import { ActivityFeed } from "@/components/app/activity-feed";
import { ActionPills, type ActionPill } from "@/components/app/action-pills";
import { CargoSearch } from "@/components/app/cargo-search";
import { DeskPulsePanel } from "@/components/app/desk-pulse";
import { AlertQueue } from "@/components/app/alert-queue";
import { AttentionCenter, type AttnItem } from "@/components/app/attention-center";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { StatStrip } from "@/components/app/stat-strip";
import { AreaChart } from "@/components/charts/area-chart";
import { AgeingBar } from "@/components/charts/ageing-bar";
import { Donut, DonutLegend, SWATCHES, type DonutSlice } from "@/components/charts/donut";
import { BarChart } from "@/components/charts/bar-chart";
import { FlowBars } from "@/components/charts/flow-bars";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EXCEPTION_OPEN_STATUSES,
  ROLE_LABELS,
  STORAGE_POLICY,
} from "@/lib/constants";
import {
  chinaAgeing,
  chinaComposition,
  chinaFlowByDay,
  chinaProblems,
  floorAgeing,
  floorComposition,
  floorFlowByDay,
  floorSnapshot,
  type FloorSnapshot,
} from "@/lib/floor";
import { monthWindow, profitAndLoss, profitByDispatch } from "@/lib/profit";
import {
  creditAlerts,
  creditCollectionOutlook,
  creditOverview,
} from "@/lib/credit-queries";
import { creditAttention } from "@/lib/support";
import { FlightProfitTable } from "@/components/app/flight-profit-table";
import { MoneyTile } from "@/components/app/money-tile";
import { OwnerMoneyHero } from "@/components/app/owner-money-hero";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatLocal, formatShillingTotal } from "@/lib/money";
import { fitFigure } from "@/lib/figure-size";
import { auditSentence } from "@/lib/audit-humanise";
import { formatMoney, formatRelative, formatWeight, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { currentRate, formatUsd } from "@/lib/fx";
import { activeAccounts } from "@/lib/accounts";
import { COMPANY } from "@/lib/constants";
import { accountBalances } from "@/lib/ledger";
import { managerOverview } from "@/lib/manager-overview";
import {
  agingInWarehouse,
  attentionItems,
  batchUtilisation,
  cargoMix,
  chinaStats,
  corridorPerformance,
  corridorPosition,
  deskPulse,
  executiveStats,
  financeStats,
  monthlyRevenue,
  receivablesAgeing,
  cashFlowByMonth,
  monthlyVolume,
  ownerAttention,
  recentActivity,
} from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { can, linkFor } from "@/lib/rbac";
import { CargoMix } from "@/components/app/cargo-mix";
import {
  FloorChips,
  WarehouseHero,
  type HeroChip,
} from "@/components/app/warehouse-hero";
import { todaySummary } from "@/lib/warehouse-home";
import { requireUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

import type { Role } from "@prisma/client";

import { percentDeltaLabel } from "@/lib/format";

// ---------------------------------------------------------------------------
// CEO — the whole business on one screen
// ---------------------------------------------------------------------------

/**
 * The whole business on one screen.
 *
 * Exported, and taking the manager as well as the owner, because the manager's
 * command centre IS this screen. Building a second one would mean two places
 * deciding what "revenue this month" means, and they would disagree inside a
 * quarter — the figures on a manager's screen and the owner's have to be the
 * same figures or the weekly meeting is an argument about whose page is right.
 *
 * What differs between the two chairs is not what they READ, it is what they
 * can PRESS, and that is already settled a layer down: every action here is
 * gated on a permission, so the five the manager does not hold simply do not
 * render for them.
 *
 * It takes the reader's ACTUAL role rather than a narrowed one, because every
 * `can(role, …)` below is a question about the person looking at the screen. A
 * caller that passed "MANAGER" on behalf of somebody who is not one would be
 * answering those questions about a different person, and the screen would offer
 * an action the reader's own server check then refuses.
 */
export async function ExecutiveDashboard({
  role,
  firstName = "",
}: {
  role: Role;
  firstName?: string;
}) {
  // Before the Promise.all — a const read from a callback that runs first is a
  // temporal dead zone TypeScript cannot see.
  const locale = await viewerLocale();

  const [
    stats,
    volume,
    perf,
    execRateRow,
    position,
    flow,
    owed,
    creditWarnings,
    flights,
    mix,
    money,
  ] = await Promise.all([
    executiveStats(),
    monthlyVolume(new Date(), locale),
    corridorPerformance(),
    currentRate(),
    corridorPosition(),
    cashFlowByMonth(new Date(), locale),
    receivablesAgeing(),
    creditAlerts(),
    profitByDispatch(8),
    cargoMix(30, locale),
    /* The same object the manager's command centre reads — today's money, the
       accounts, the approval queues and this month's analysis — so the two
       screens give one answer. */
    managerOverview(locale),
  ]);
  const execRate = execRateRow ? toNumber(execRateRow.rate) : null;
  const execTsh = (usd: number) =>
    execRate
      ? `TSh ${Math.round(usd * execRate).toLocaleString("en-US")}`
      : formatUsd(usd);
  /* A dollar series for a chart, in shillings at today's rate. */
  const inTsh = (usd: number) => (execRate ? Math.round(usd * execRate) : usd);
  /* A total already added up in shillings, with its dollar figure to fall back on. */
  const tz = (local: number, usd: number) => formatShillingTotal(local, usd, execRate);
  /* Percent change on last month; nothing to compare against is no figure, not 0%. */
  const change = (now: number, before: number) =>
    before > 0.005 ? ((now - before) / before) * 100 : undefined;

  const fin = money.finance;
  const period = money.period;
  const pl = period.pl;
  const prior = period.prior;

  /*
    WHAT WAITS ON THE OWNER — AND NOTHING THAT WAITS ON A DESK.

    The owner's rule (5 Nov 2026): the departments execute their duties. This
    panel shows only what a decision of his moves: the approval queues he may
    rule on (lib/approvals.ts, filtered to what this reader can decide) and
    credit at risk, which is money that left on a promise he granted.
  */
  const decisionItems: AttnItem[] = money.management.queues
    .filter((queue) => queue.count > 0 && can(role, queue.permission))
    .map((queue) => ({
      id: `queue-${queue.key}`,
      group: t(locale, "Decisions"),
      severity:
        queue.key === "claims" || (queue.oldestDays ?? 0) >= 5
          ? ("warning" as const)
          : ("info" as const),
      label: `${queue.count} · ${t(locale, queue.label)}`,
      detail: t(locale, queue.detail),
      href: linkFor(role, queue.href) ?? "/app/manager/approvals",
      value:
        queue.valueUsd !== null && queue.valueUsd > 0 ? execTsh(queue.valueUsd) : undefined,
      valueSub:
        queue.oldestDays !== null && queue.oldestDays > 0
          ? `${t(locale, "oldest")} ${queue.oldestDays}${t(locale, "d")}`
          : undefined,
    }));
  const attention: AttnItem[] = [
    ...decisionItems,
    ...creditAttention(creditWarnings, {
      locale,
      rate: execRate,
      canApprove: can(role, "credit.approve"),
    }),
  ];

  /* The accounts as a ring: the four largest, then everything else together,
     so the ring stays readable however many accounts there are. A balance
     below zero is not a share of what is held, so it is not drawn. */
  const held = fin.accounts.filter((account) => account.tzs > 0.5);
  const moneySlices: DonutSlice[] = [
    ...held.slice(0, 4).map((account, i) => ({
      label: account.name,
      value: account.tzs,
      tone: ([1, 4, 2, 5] as const)[i],
    })),
    ...(held.length > 4
      ? [{ label: t(locale, "Other accounts"), value: held.slice(4).reduce((n, a) => n + a.tzs, 0), tone: 6 as const }]
      : []),
  ];
  /* The ring's centre is small: millions and billions, not every digit — the
     exact figure is in the banner and beside each slice. */
  const compactTsh = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${Math.round(n / 1e3)}K`;
    return String(Math.round(n));
  };

  const positionSlices = [
    { label: t(locale, "In Guangzhou"), value: position.inChina, tone: 2 as const },
    { label: t(locale, "In the air"), value: position.inAir, tone: 1 as const },
    { label: t(locale, "On the Dar floor"), value: position.onFloor, tone: 4 as const },
    { label: t(locale, "Cleared, not collected"), value: position.ready, tone: 5 as const },
    { label: t(locale, "Under investigation"), value: position.flagged, tone: 3 as const },
  ];
  const netThisMonth = flow.net[flow.net.length - 1] ?? 0;
  const healthTone = {
    good: "text-success",
    bad: "text-destructive",
    warn: "text-warning",
    flat: "text-foreground",
  } as const;

  return (
    <div className="space-y-6">
      {/* 1. The greeting, and the money in one sentence. */}
      <OwnerMoneyHero
        firstName={firstName}
        roleLabel={ROLE_LABELS[role]}
        owedTzs={execRate ? stats.outstanding * execRate : stats.outstanding}
        heldTzs={fin.heldTzs}
        inTodayTzs={fin.cashInTodayTzs}
      />

      {/* 2. Where the money is, as a ring, beside today since midnight. Close
          under the banner, where the owner asked for it — not in the banner. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel min-w-0 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display font-semibold">{t(locale, "Where the money is")}</h2>
            <Link href="/app/finance/accounts" className="shrink-0 text-xs font-semibold text-brand hover:underline">
              {t(locale, "Open accounts")}
            </Link>
          </div>
          {moneySlices.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t(locale, "No account holds any money yet.")}</p>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              <Donut
                size={148}
                stroke={20}
                label={compactTsh(fin.heldTzs)}
                caption={t(locale, "TSh in the accounts")}
                slices={moneySlices}
              />
              <ul className="w-full min-w-0 flex-1 space-y-2">
                {moneySlices.map((slice) => {
                  const share = fin.heldTzs > 0 ? (slice.value / fin.heldTzs) * 100 : 0;
                  return (
                    /* The account's name on its own line and its balance under it:
                       side by side, a ten-digit balance left the name "O…". */
                    <li key={slice.label} className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SWATCHES[slice.tone]}`} />
                        <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                        <span className="shrink-0 tabular-nums">
                          {share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`}
                        </span>
                      </div>
                      <p className="pl-[18px] text-sm font-semibold tabular-nums whitespace-nowrap">
                        {formatLocal(slice.value)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="panel min-w-0 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display font-semibold">{t(locale, "Today")}</h2>
            <span
              title={`${t(locale, "In")} ${formatLocal(fin.cashInTodayTzs)} · ${t(locale, "out")} ${formatLocal(fin.cashOutTodayTzs)}`}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                Math.round(fin.netCashTodayTzs) === 0
                  ? "bg-muted text-muted-foreground"
                  : fin.netCashTodayTzs > 0
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive"
              }`}
            >
              {Math.round(fin.netCashTodayTzs) === 0
                ? t(locale, "No change today")
                : `${formatLocal(Math.abs(fin.netCashTodayTzs))} ${fin.netCashTodayTzs > 0 ? t(locale, "up today") : t(locale, "down today")}`}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { k: t(locale, "Billed today"), v: execTsh(fin.revenueTodayUsd), tone: "text-foreground", sub: t(locale, "invoiced today, not yet money"), href: "/app/finance/invoices" },
              { k: t(locale, "Collected today"), v: formatLocal(fin.cashInTodayTzs), tone: "text-success", sub: t(locale, "what customers actually handed over"), href: linkFor(role, "/app/finance/payments") },
              { k: t(locale, "Spent today"), v: formatLocal(fin.cashOutTodayTzs), tone: fin.cashOutTodayTzs > 0 ? "text-warning" : "text-foreground", sub: t(locale, "everything that left an account since midnight"), href: "/app/finance/expenses" },
              {
                k: t(locale, "Net cash today"),
                v: `${fin.netCashTodayTzs < 0 ? "−" : ""}${formatLocal(Math.abs(fin.netCashTodayTzs))}`,
                tone: fin.netCashTodayTzs < 0 ? "text-destructive" : "text-success",
                sub: t(locale, "what came in, less what went out"),
                href: "/app/finance/transactions",
              },
            ].map((cell) => (
              <Link
                key={cell.k}
                href={cell.href ?? "/app/finance"}
                className="min-w-0 rounded-xl border bg-background/40 px-4 py-3 transition-colors hover:bg-accent/40 [container-type:inline-size]"
              >
                <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{cell.k}</p>
                <p
                  className={`mt-1 whitespace-nowrap font-display font-bold tabular-nums ${cell.tone}`}
                  style={{ fontSize: fitFigure(cell.v, 22) }}
                >
                  {cell.v}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{cell.sub}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* 3. The owner's own pages. */}
      <ActionPills
        items={(
          [
            { href: "/app/finance/transactions", label: t(locale, "The Ledger"), icon: Landmark, weight: "primary", tone: "signal" },
            { href: "/app/finance/accounts", label: t(locale, "Accounts"), icon: Wallet, weight: "secondary", tone: "info" },
            { href: "/app/finance/reports", label: t(locale, "Profit & loss"), icon: TrendingUp, tone: "success" },
            { href: linkFor(role, "/app/manager/approvals"), label: t(locale, "Approvals"), icon: ShieldCheck, tone: "brand" },
            { href: "/app/exceptions", label: t(locale, "Issues & Claims"), icon: AlertTriangle, tone: "warning" },
            { href: "/app/admin/deleted", label: t(locale, "Deleted records"), icon: Trash2, tone: "violet" },
          ] satisfies (Omit<ActionPill, "href"> & { href: string | undefined })[]
        ).flatMap((pill) => (pill.href ? [{ ...pill, href: pill.href }] : []))}
      />

      {/* 4. Only what waits on a decision of the owner's. */}
      <AttentionCenter
        items={attention}
        reviewAll={{ href: linkFor(role, "/app/manager/approvals") ?? "/app/exceptions", label: t(locale, "Every decision") }}
        empty={t(locale, "Nothing needs your decision. Every desk is clear.")}
      />

      {/* 5. The month against the last, with a year of each figure behind it. */}
      <div>
        <SectionLabel action={{ href: "/app/finance/reports", label: t(locale, "Profit & loss") }}>
          {`${t(locale, "This month")} · ${t(locale, "against last month")}`}
        </SectionLabel>
        {/* Two to a row on a phone: eight cards one under another was a page of
            scrolling before the first chart. No sparklines or rings beside
            the figures — at half a phone they squeezed the number to nothing,
            and the twelve-month chart below draws the trend properly. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard
            delay={1}
            label={t(locale, "Billed")}
            value={tz(pl.revenueLocal, pl.revenue)}
            delta={change(pl.revenue, prior.revenue)}
            hint={`${t(locale, "last month")} ${tz(prior.revenueLocal, prior.revenue)}`}
            icon={Receipt}
            tone="brand"
            href="/app/finance/reports"
          />
          <KpiCard
            delay={2}
            label={t(locale, "Collected")}
            value={tz(pl.cashInLocal, pl.cashIn)}
            delta={change(pl.cashIn, prior.cashIn)}
            hint={`${t(locale, "last month")} ${tz(prior.cashInLocal, prior.cashIn)}`}
            icon={HandCoins}
            tone="success"
            href="/app/finance/received"
          />
          <KpiCard
            delay={3}
            label={t(locale, "Costs")}
            value={tz(pl.costsLocal, pl.costs)}
            delta={change(pl.costs, prior.costs)}
            invertDelta
            hint={`${t(locale, "last month")} ${tz(prior.costsLocal, prior.costs)}`}
            icon={Banknote}
            tone="warning"
            href="/app/finance/expenses"
          />
          <KpiCard
            delay={4}
            label={t(locale, "Billed less costs")}
            value={tz(pl.profitLocal, pl.profit)}
            delta={change(pl.profit, prior.profit)}
            ringPct={pl.margin ?? undefined}
            ringLabel={t(locale, "Share of this month's billing left after costs")}
            hint={
              pl.margin === null
                ? t(locale, "nothing billed this month yet")
                : `${Math.round(pl.margin)}% ${t(locale, "margin")}`
            }
            icon={ChartNoAxesCombined}
            tone={pl.profit < 0 ? "warning" : (pl.margin ?? 0) >= 20 ? "success" : "brand"}
            href="/app/finance/reports"
          />
          <KpiCard
            delay={5}
            label={t(locale, "Owed to us")}
            value={execTsh(stats.outstanding)}
            hint={t(locale, "Owed on every unpaid bill, not just this month")}
            icon={Wallet}
            tone={stats.outstanding > 0 ? "warning" : "success"}
            href="/app/collections/follow-up"
          />
          <KpiCard
            delay={6}
            label={t(locale, "Collected of what was billed")}
            value={period.collections.rate === null ? "—" : `${Math.round(period.collections.rate)}%`}
            hint={`${execTsh(period.collections.collectedUsd)} ${t(locale, "of")} ${execTsh(period.collections.expectedUsd)}`}
            icon={Scale}
            tone={(period.collections.rate ?? 0) >= 80 ? "success" : "info"}
          />
          <KpiCard
            delay={7}
            label={t(locale, "Cargo this month")}
            value={formatWeight(period.volume.kgReceived)}
            hint={`${period.volume.packages} ${t(locale, "packages")} · ${period.volume.customers} ${t(locale, "customers")}`}
            icon={Package}
            tone="info"
            href="/app/shipments"
          />
          <KpiCard
            delay={8}
            label={`${t(locale, "Within the")} ${COMPANY.promiseDays} ${t(locale, "day promise")}`}
            value={perf.promiseRate === null ? "—" : `${perf.promiseRate.toFixed(0)}%`}
            hint={
              perf.avgToTanzaniaDays === null
                ? `${t(locale, "Over")} ${perf.sample} ${t(locale, "delivered")}`
                : `${t(locale, "China → Dar, averaging")} ${perf.avgToTanzaniaDays.toFixed(1)} ${t(locale, "days")}`
            }
            icon={Timer}
            tone={perf.promiseRate === null ? "info" : perf.promiseRate >= 80 ? "success" : "warning"}
          />
        </div>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {t(
            locale,
            "Billed less costs is what was invoiced this month, not money received. What has not been paid is under Outstanding."
          )}
          {pl.margin !== null && pl.margin > 95 ? (
            <span className="text-warning">
              {" "}
              {t(
                locale,
                "Almost no costs are recorded for this month, so this reads higher than the business earned — the flights' freight, customs and clearing have not been entered."
              )}
            </span>
          ) : null}
        </p>
      </div>

      {/* 6. A year of the business, and how healthy it is. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="panel min-w-0 p-5 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-display font-semibold">{t(locale, "Billed, costs and what was left")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(locale, "The last twelve months")}
                {execRate ? " · TSh" : " · USD"}
              </p>
            </div>
          </div>
          {/* In shillings before it reaches the chart: the chart draws in the
              browser and cannot be handed a formatter from here. */}
          <AreaChart
            labels={period.trend.labels}
            series={[
              { name: t(locale, "Billed"), values: period.trend.revenue.map(inTsh), tone: 1 },
              { name: t(locale, "Costs"), values: period.trend.expenses.map(inTsh), tone: 3 },
              { name: t(locale, "Billed less costs"), values: period.trend.profit.map(inTsh), tone: 5 },
            ]}
          />
        </section>
        <section className="panel min-w-0 p-5">
          <h2 className="font-display font-semibold">{t(locale, "Financial health")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t(locale, "This month, read against the rules the business keeps")}</p>
          <ul className="mt-3 divide-y">
            {period.health.slice(0, 6).map((metric) => (
              <li key={metric.key} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 text-sm text-muted-foreground">{t(locale, metric.label)}</span>
                <span className={`shrink-0 whitespace-nowrap font-display text-base font-bold tabular-nums ${healthTone[metric.tone]}`}>
                  {metric.value}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 7. What each flight earned — the table carries its own card and heading. */}
      <FlightProfitTable flights={flights} />

      {/* 8. Where the money comes from, who brings it, and where it goes. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel min-w-0 p-5">
          <h2 className="font-display font-semibold">{t(locale, "By route")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t(locale, "Billed this month, and how much of it came in")}</p>
          <ul className="mt-3 space-y-3">
            {period.revenue.byOrigin.length === 0 ? (
              <li className="text-sm text-muted-foreground">{t(locale, "Nothing billed this month yet")}</li>
            ) : (
              period.revenue.byOrigin.map((row) => {
                const share = row.expectedUsd > 0 ? Math.min(100, (row.collectedUsd / row.expectedUsd) * 100) : 0;
                return (
                  <li key={row.origin}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium">
                        {t(locale, ORIGIN_LABELS[row.origin as keyof typeof ORIGIN_LABELS] ?? row.origin)}
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{execTsh(row.expectedUsd)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-success" style={{ width: `${share}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {execTsh(row.collectedUsd)} {t(locale, "collected")} · {Math.round(share)}%
                    </p>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="panel min-w-0 p-5">
          <h2 className="font-display font-semibold">{t(locale, "Top customers")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t(locale, "Billed this month, and what they still owe")}</p>
          <ul className="mt-3 divide-y">
            {period.revenue.topCustomers.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">{t(locale, "Nothing billed this month yet")}</li>
            ) : (
              period.revenue.topCustomers.slice(0, 6).map((row, i) => (
                <li key={row.name} className="flex items-center gap-3 py-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="block whitespace-nowrap text-sm font-semibold tabular-nums">{execTsh(row.expectedUsd)}</span>
                    <span className={`block whitespace-nowrap text-[11px] tabular-nums ${row.outstandingUsd > 0.005 ? "text-destructive" : "text-success"}`}>
                      {row.outstandingUsd > 0.005 ? `${execTsh(row.outstandingUsd)} ${t(locale, "owed")}` : t(locale, "settled")}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="panel min-w-0 p-5">
          <h2 className="font-display font-semibold">{t(locale, "Where money is spent")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t(locale, "This month's costs, largest first")}</p>
          <ul className="mt-3 space-y-2.5">
            {period.expenses.byCategory.length === 0 ? (
              <li className="text-sm text-muted-foreground">{t(locale, "No costs recorded this month")}</li>
            ) : (
              period.expenses.byCategory.slice(0, 6).map((row) => (
                <li key={row.category}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {t(locale, EXPENSE_CATEGORY_LABELS[row.category] ?? row.category)}
                    </span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">{tz(row.amountLocal, row.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-destructive/60"
                      style={{ width: `${Math.max(2, Math.min(100, row.share))}%` }}
                    />
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* 9. The money over the year, the debts by age, and the cargo right now. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel min-w-0 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{t(locale, "Money in and out")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(locale, "What arrived against what it cost, this year")}
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span className={`block font-mono text-xs font-semibold ${netThisMonth < 0 ? "text-signal" : "text-success"}`}>
                {netThisMonth < 0 ? "−" : "+"}
                {execTsh(Math.abs(netThisMonth))}
              </span>
              <span className="block text-[10px] text-muted-foreground">{t(locale, "this month")}</span>
            </p>
          </div>
          <FlowBars
            className="mt-3"
            labels={flow.labels}
            valuesIn={flow.moneyIn}
            valuesOut={flow.moneyOut}
            currentIndex={flow.currentIndex}
            format={execTsh}
          />
        </section>

        <section className="panel min-w-0 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{t(locale, "What we are owed, by age")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t(locale, "From the day the bill became real")}</p>
            </div>
            {owed.oldestDays > 0 ? (
              <p className="shrink-0 text-right text-xs text-muted-foreground">
                {t(locale, "oldest")}{" "}
                <span className="font-mono font-semibold text-foreground">{owed.oldestDays}d</span>
              </p>
            ) : null}
          </div>
          <AgeingBar
            className="mt-3"
            segments={owed.buckets.map((bucket) => ({
              key: bucket.key,
              label: t(locale, bucket.label),
              count: bucket.count,
              value: bucket.usd,
            }))}
            format={execTsh}
            unit={{ one: t(locale, "bill"), many: t(locale, "bills") }}
            empty={t(locale, "Nothing is owed. Every bill raised has been settled.")}
          />
          <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
            {t(locale, "Credit outstanding")}{" "}
            <span className="font-semibold text-foreground tabular-nums">{execTsh(fin.creditOutstandingUsd)}</span>
          </p>
        </section>

        <section className="panel min-w-0 p-4">
          <h3 className="text-sm font-semibold">{t(locale, "Where the cargo is")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(locale, "Everything the business is carrying, Guangzhou to the counter")}
          </p>
          <div className="mt-3 flex justify-center">
            <Donut size={118} stroke={18} label={String(position.total)} caption={t(locale, "consignments")} slices={positionSlices} />
          </div>
          <DonutLegend className="mt-3" slices={positionSlices} />
        </section>
      </div>

      {/* 10. What the business carries. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* The mix carries its own card. */}
        <div className="min-w-0">
          <CargoMix
            slices={mix.slices}
            totalShipments={mix.totalShipments}
            totalWeightKg={mix.totalWeightKg}
            periodLabel={`${t(locale, "Registered in the last")} ${mix.days} ${t(locale, "days")}`}
          />
        </div>
        <section className="panel min-w-0 p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold">{t(locale, "Cargo volume")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {volume.year} {t(locale, "against")} {volume.year - 1}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold tabular">{volume.total.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{t(locale, "this year")}</p>
            </div>
          </div>
          <AreaChart
            labels={volume.labels}
            series={[
              { name: String(volume.year), values: volume.current, tone: 1 },
              { name: String(volume.year - 1), values: volume.previous, tone: 2 },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
