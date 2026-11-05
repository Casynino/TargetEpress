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
import { Donut, DonutLegend, SWATCHES } from "@/components/charts/donut";
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
  today = "",
}: {
  role: Role;
  firstName?: string;
  today?: string;
}) {
  // Before the Promise.all, not after it — a const read from a callback that
  // runs first is a temporal dead zone TypeScript cannot see.
  const locale = await viewerLocale();

  const [
    stats,
    volume,
    revenue,
    perf,
    execRateRow,
    position,
    flow,
    owed,
    creditWarnings,
    money,
  ] = await Promise.all([
    executiveStats(),
    monthlyVolume(new Date(), locale),
    monthlyRevenue(new Date(), locale),
    corridorPerformance(),
    currentRate(),
    corridorPosition(),
    cashFlowByMonth(new Date(), locale),
    receivablesAgeing(),
    creditAlerts(),
    /* The same object the manager's command centre reads, so the two screens
       give one answer about today's money. */
    managerOverview(locale),
  ]);
  const execRate = execRateRow ? toNumber(execRateRow.rate) : null;
  const execTsh = (usd: number) =>
    execRate
      ? `TSh ${Math.round(usd * execRate).toLocaleString("en-US")}`
      : formatUsd(usd);

  /*
    WHAT WAITS ON THE OWNER — AND NOTHING THAT WAITS ON A DESK.

    The owner's rule (5 Nov 2026): "Admin manages the business… departments
    execute their duties." This panel used to compose every desk's own problem
    set — boxes short of a manifest, prices to confirm — which is the desks'
    work, and the owner asked for it off his screen. What is left is what only
    a decision of his moves: the approval queues he may rule on (the manager's
    board, lib/approvals.ts, filtered to what this reader can decide), and
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
        queue.valueUsd !== null && queue.valueUsd > 0
          ? execTsh(queue.valueUsd)
          : undefined,
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

  const positionSlices = [
    { label: t(locale, "In Guangzhou"), value: position.inChina, tone: 2 as const },
    { label: t(locale, "In the air"), value: position.inAir, tone: 1 as const },
    { label: t(locale, "On the Dar floor"), value: position.onFloor, tone: 4 as const },
    { label: t(locale, "Cleared, not collected"), value: position.ready, tone: 5 as const },
    { label: t(locale, "Under investigation"), value: position.flagged, tone: 3 as const },
  ];

  const netThisMonth = flow.net[flow.net.length - 1] ?? 0;
  const thisMonthRevenue = revenue.values[revenue.values.length - 1] ?? 0;
  const revenueChange = percentDeltaLabel(thisMonthRevenue, revenue.previousMonth);
  const deliveredShare =
    stats.active + stats.deliveredThisMonth > 0
      ? (stats.deliveredThisMonth / (stats.active + stats.deliveredThisMonth)) * 100
      : 0;
  const fin = money.finance;

  return (
    <div className="space-y-7">
      {/* 1. THE MONEY, before anything else. */}
      <OwnerMoneyHero
        firstName={firstName}
        today={today}
        heldTzs={fin.heldTzs}
        inTodayTzs={fin.cashInTodayTzs}
        outTodayTzs={fin.cashOutTodayTzs}
        netTodayTzs={fin.netCashTodayTzs}
        accounts={fin.accounts}
      />

      {/* 2. The owner's own pages: money, decisions, the record. */}
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

      {/* 3. Only what waits on a decision of the owner's. */}
      <AttentionCenter
        items={attention}
        reviewAll={{ href: linkFor(role, "/app/manager/approvals") ?? "/app/exceptions", label: t(locale, "Every decision") }}
        empty={t(locale, "Nothing needs your decision. Every desk is clear.")}
      />

      {/* 4. Today's business, since midnight. */}
      <div>
        <SectionLabel action={{ href: "/app/finance", label: t(locale, "The money, in full") }}>
          {t(locale, "Today's business")}
        </SectionLabel>
        <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-4 lg:grid-cols-4">
          <MoneyTile
            label={t(locale, "Billed today")}
            usd={fin.revenueTodayUsd}
            rate={execRate}
            hint={t(locale, "invoiced today, not yet money")}
            icon={Receipt}
            href="/app/finance/invoices"
          />
          <MoneyTile
            label={t(locale, "Collected today")}
            usd={fin.collectedTodayUsd}
            rate={execRate}
            hint={t(locale, "what customers actually handed over")}
            icon={HandCoins}
            tone={fin.collectedTodayUsd > 0 ? "good" : "default"}
            href={linkFor(role, "/app/finance/payments")}
          />
          <MoneyTile
            label={t(locale, "Spent today")}
            usd={fin.expensesTodayUsd}
            rate={execRate}
            hint={t(locale, "everything that left an account since midnight")}
            icon={Banknote}
            tone={fin.expensesTodayUsd > 0 ? "warn" : "default"}
            href="/app/finance/expenses"
          />
          <KpiCard
            delay={1}
            label={t(locale, "Net cash today")}
            value={
              execRate === null
                ? formatUsd(fin.collectedTodayUsd - fin.expensesTodayUsd)
                : `${fin.netCashTodayTzs < 0 ? "−" : ""}TSh ${Math.abs(Math.round(fin.netCashTodayTzs)).toLocaleString("en-US")}`
            }
            hint={t(locale, "what came in, less what went out")}
            icon={Scale}
            tone={fin.netCashTodayTzs < 0 ? "warning" : "success"}
            href="/app/finance/transactions"
          />
        </div>
      </div>

      {/* 5. The month: what came in, what it earned, what is still owed. */}
      <div>
        <SectionLabel action={{ href: "/app/finance/reports", label: t(locale, "Profit & loss") }}>
          {t(locale, "This month")}
        </SectionLabel>
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          <MoneyTile
            label={t(locale, "Freight collected this month")}
            usd={thisMonthRevenue}
            rate={execRate}
            count={
              revenueChange
                ? `${revenueChange} ${t(locale, "on last month")}`
                : stats.allTimeCollected > thisMonthRevenue
                  ? t(locale, "nothing came in last month")
                  : t(locale, "first month with takings")
            }
            hint={`${execTsh(stats.allTimeCollected)} ${t(locale, "received all time")} · ${t(locale, "the delivery fare is not ours")}`}
            icon={Banknote}
            tone="good"
            trend={revenue.values}
            href="/app/finance"
          />
          {/* Billed less costs — invoiced, not money received; the sentence
              under the row says so, and Outstanding beside it is the rest. */}
          <KpiCard
            delay={2}
            label={t(locale, "Billed this month, less costs")}
            value={execTsh(fin.profitThisMonthUsd)}
            ringPct={fin.marginPct ?? undefined}
            ringLabel={t(locale, "Share of this month's billing left after costs")}
            hint={
              fin.marginPct === null
                ? t(locale, "nothing billed this month yet")
                : `${t(locale, "Billed")} ${execTsh(fin.profitThisMonthUsd + fin.expensesThisMonthUsd)} · ${t(locale, "What it cost")} ${execTsh(fin.expensesThisMonthUsd)}`
            }
            icon={ChartNoAxesCombined}
            tone={
              fin.profitThisMonthUsd < 0
                ? "warning"
                : fin.marginPct !== null && fin.marginPct >= 20
                  ? "success"
                  : "brand"
            }
            href="/app/finance/reports"
          />
          <MoneyTile
            label={t(locale, "Outstanding")}
            usd={stats.outstanding}
            rate={execRate}
            hint={t(locale, "Owed on every unpaid bill, not just this month")}
            icon={Wallet}
            tone={stats.outstanding > 0 ? "warn" : "good"}
            href="/app/collections/follow-up"
          />
          <MoneyTile
            label={t(locale, "Credit outstanding")}
            usd={fin.creditOutstandingUsd}
            rate={execRate}
            hint={t(locale, "cargo released on a promise, never cash")}
            icon={CreditCard}
            tone={fin.creditOutstandingUsd > 0 ? "warn" : "default"}
            href="/app/finance/credit"
          />
          <KpiCard
            delay={3}
            label={t(locale, "Delivered this month")}
            numeric={stats.deliveredThisMonth}
            ringPct={deliveredShare}
            ringLabel={t(locale, "Delivered this month against everything still moving")}
            hint={`${stats.active} ${t(locale, "still moving")}`}
            icon={Truck}
            tone="brand"
          />
          <KpiCard
            delay={4}
            label={`${t(locale, "Within the")} ${COMPANY.promiseDays} ${t(locale, "day promise")}`}
            value={perf.promiseRate === null ? "—" : `${perf.promiseRate.toFixed(0)}%`}
            ringPct={perf.promiseRate ?? undefined}
            ringLabel={t(locale, "Promise adherence")}
            hint={
              perf.avgToTanzaniaDays === null
                ? `${t(locale, "Over")} ${perf.sample} ${t(locale, "delivered")}`
                : `${t(locale, "China → Dar, averaging")} ${perf.avgToTanzaniaDays.toFixed(1)} ${t(locale, "days")}`
            }
            icon={Timer}
            tone={
              perf.promiseRate === null
                ? "info"
                : perf.promiseRate >= 80
                  ? "success"
                  : "warning"
            }
          />
        </div>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {t(
            locale,
            "Billed less costs is what was invoiced this month, not money received. What has not been paid is under Outstanding."
          )}
          {fin.marginPct !== null && fin.marginPct > 95 ? (
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

      {/* 6. How the business is going: money over the year, what is owed, where the cargo is. */}
      <div>
        <SectionLabel action={{ href: "/app/finance/transactions", label: t(locale, "The Ledger") }}>
          {t(locale, "How the business is going")}
        </SectionLabel>
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
                <span
                  className={`block font-mono text-xs font-semibold ${netThisMonth < 0 ? "text-signal" : "text-success"}`}
                >
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
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "From the day the bill became real")}
                </p>
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
          </section>

          <section className="panel min-w-0 p-4">
            <h3 className="text-sm font-semibold">{t(locale, "Where the cargo is")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(locale, "Everything the business is carrying, Guangzhou to the counter")}
            </p>
            <div className="mt-3 flex justify-center">
              <Donut
                size={118}
                stroke={18}
                label={String(position.total)}
                caption={t(locale, "consignments")}
                slices={positionSlices}
              />
            </div>
            <DonutLegend className="mt-3" slices={positionSlices} />
          </section>
        </div>
      </div>

      <section className="panel min-w-0 p-5">
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
  );
}
