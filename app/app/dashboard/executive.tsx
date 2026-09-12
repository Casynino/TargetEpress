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
import { can } from "@/lib/rbac";
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
export async function ExecutiveDashboard({ role }: { role: Role }) {
  // Before the Promise.all, not after it. deskPulse() inside that block reads
  // `locale`, and a const referenced from a callback that runs first is a
  // temporal dead zone — TypeScript allows it because the reference sits in a
  // closure it cannot prove runs early, and the page then dies at runtime.
  const locale = await viewerLocale();

  const [
    stats,
    volume,
    revenue,
    perf,
    activity,
    aging,
    execRateRow,
    position,
    desks,
    ownerItems,
    flow,
    owed,
    creditWarnings,
    money,
  ] = await Promise.all([
    executiveStats(),
    monthlyVolume(new Date(), locale),
    monthlyRevenue(new Date(), locale),
    corridorPerformance(),
    recentActivity(10),
    agingInWarehouse(5),
    currentRate(),
    // The three the owner asks and nobody else can answer from one page:
    // where is all of it, how is each desk, and is the money keeping up.
    corridorPosition(),
    currentRate().then((row) => deskPulse(row ? toNumber(row.rate) : null, locale)),
    currentRate().then((row) => ownerAttention(row ? toNumber(row.rate) : null, locale)),
    cashFlowByMonth(new Date(), locale),
    receivablesAgeing(),
    /* §19. ownerAttention composes each desk's own problem set, and credit is the
       one exposure that belongs to no desk's cargo: it is not a box anybody is
       holding, it is money that left the building on a promise. */
    creditAlerts(),
    /*
      THE SAME OBJECT THE COMMAND CENTRE READS.

      The owner told us he sees less on his own home screen than the manager
      does, and he was right: today's takings, today's billing, today's
      spending, the credit out on trust and the month's margin were all on
      /app/manager and none of them here. Read from managerOverview rather
      than re-derived, because two screens deriving the same day's money two
      ways is how they end up disagreeing — which is the other half of what he
      reported.
    */
    managerOverview(locale),
  ]);
  const execRate = execRateRow ? toNumber(execRateRow.rate) : null;
  const execTsh = (usd: number) =>
    execRate
      ? `TSh ${Math.round(usd * execRate).toLocaleString("en-US")}`
      : formatUsd(usd);

  /**
   * Everything waiting on the owner, in one bounded panel.
   *
   * ownerAttention composes each desk's own problem set rather than the named,
   * thresholded list every other role gets — this chair answers for all four,
   * and a desk quietly failing at scale must not read as a clear desk. Grouped
   * by the department that owns the fix, because "which of my desks" is the
   * first thing this reader needs.
   *
   * Credit is appended as its own group rather than folded into Finance's, and
   * the reason is what the rows are: cargo the company let go of before being
   * paid. The owner grants the facilities, so the two limit warnings are his
   * question before they are anybody else's — and they are rows in this one
   * bounded panel, never a new section, which is the standing rule about it.
   */
  const attention: AttnItem[] = [
    ...ownerItems,
    ...creditAttention(creditWarnings, {
      locale,
      rate: execRate,
      canApprove: can(role, "credit.approve"),
    }),
  ];

  const positionSlices = [
    { label: t(locale, "In Guangzhou"), value: position.inChina, tone: 2 as const },
    { label: t(locale, "In the air"), value: position.inAir, tone: 1 as const },
    {
      label: t(locale, "On the Dar floor"),
      value: position.onFloor,
      tone: 4 as const,
    },
    {
      label: t(locale, "Cleared, not collected"),
      value: position.ready,
      tone: 5 as const,
    },
    {
      label: t(locale, "Under investigation"),
      value: position.flagged,
      tone: 3 as const,
    },
  ];

  const netThisMonth = flow.net[flow.net.length - 1] ?? 0;

  const thisMonthRevenue = revenue.values[revenue.values.length - 1] ?? 0;
  /* Across the year boundary too — read from the query rather than by
     stepping back one slot in a list that starts at January. */
  const lastMonthRevenue = revenue.previousMonth;
  const revenueChange = percentDeltaLabel(thisMonthRevenue, lastMonthRevenue);
  const deliveredShare =
    stats.active + stats.deliveredThisMonth > 0
      ? (stats.deliveredThisMonth / (stats.active + stats.deliveredThisMonth)) * 100
      : 0;

  return (
    <div className="space-y-7">
      {/*
        The six the owner alone decides, or reads.

        Shipments, Batches and Customers came out. Every one is a sidebar row
        one press away, and none of them is a decision — this desk does not
        register cargo, load a batch or open a customer record, it answers for
        what the four desks did with them. A shortcut row that lists places is a
        second sidebar; this one lists the things that stop without this chair.

        Claims wait on exception.approve, and Deleted records on
        records.viewDeleted — the one register nobody else can read.

        The Ledger and Verify payments are not exclusive — Finance reads one and
        works the other every day. They lead anyway: this row is what the owner
        presses, and money moving and money standing still are the two things
        they check before anything else.

        Profit & loss and Company settings came out at the owner's request. Both
        are still a press away in the sidebar.
      */}
      <ActionPills
        items={[
          { href: "/app/finance/transactions", label: t(locale, "The Ledger"), icon: Landmark, weight: "primary", tone: "signal" },
          { href: "/app/finance/verify", label: t(locale, "Verify payments"), icon: ShieldCheck, weight: "secondary", tone: "info" },
          { href: "/app/exceptions", label: t(locale, "Issues & Claims"), icon: AlertTriangle, tone: "warning" },
          // Brand and violet wherever these two appear — the support desk, the
          // warehouse floors and here. Colour is only a landmark while it means
          // the same thing on every screen.
          //
          // Named apart, in the sidebar's own words. Both of these read
          // "Batches", which is one word for two different places: what has
          // left China, and the two tables cargo is still waiting on there.
          { href: "/app/shipments", label: t(locale, "Arrived batches"), icon: Package, tone: "brand" },
          { href: "/app/batches", label: t(locale, "Loading batches"), icon: Plane, tone: "violet" },
          // records.viewDeleted is management's alone: restoring something a
          // desk deleted, or purging it for good, is the one action in this app
          // nobody else can take back.
          { href: "/app/admin/deleted", label: t(locale, "Deleted records"), icon: Trash2, tone: "success" },
        ]}
      />

      {/* Top of the page, same as every other desk. It used to sit two thirds
          of the way down beside a chart. */}
      <AttentionCenter
        items={attention}
        reviewAll={{ href: "/app/exceptions", label: t(locale, "Every case") }}
        empty={t(locale, "Nothing needs your decision. Every desk is clear.")}
      />

      {/* The panel that belongs only to this desk. Four departments cannot be
          compared by opening four dashboards one at a time. */}
      <div>
        <SectionLabel>{t(locale, "Every desk, right now")}</SectionLabel>
        <DeskPulsePanel desks={desks} locale={locale} />
      </div>

      {/* In transit, In Dar and Exceptions came out: the corridor ring below
          shows all three as proportions of one whole, and a figure twice on one
          screen reads as a bug. What is left is not on any chart. */}
      <StatStrip
        chips={[
          { label: t(locale, "Active"), value: String(stats.active), icon: Package, tone: "brand" },
          { label: t(locale, "Batches"), value: String(stats.activeBatches), icon: Boxes },
          { label: t(locale, "Customers"), value: String(stats.customers), icon: Users },
          { label: t(locale, "Staff"), value: String(stats.staff), icon: UserCog },
        ]}
      />

      {/*
        TODAY'S MONEY, ON THE OWNER'S OWN SCREEN.

        Everything on this row already existed — on /app/manager, which the
        owner can open and which is titled for somebody else. He said it
        plainly: the owner should see more than the manager, not less. These
        are the five figures a person who owns the business asks about before
        anything else, and the one thing his home screen could not answer was
        "what came in today".

        Same source as the command centre's row, so the two cannot drift.
      */}
      <div>
        <SectionLabel
          action={{ href: "/app/finance", label: t(locale, "The money, in full") }}
        >
          {t(locale, "The money · today")}
        </SectionLabel>
        <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyTile
            label={t(locale, "Collected today")}
            usd={money.finance.collectedTodayUsd}
            rate={execRate}
            hint={t(locale, "what customers actually handed over")}
            icon={HandCoins}
            tone={money.finance.collectedTodayUsd > 0 ? "good" : "default"}
            href="/app/finance/payments"
          />
          <MoneyTile
            label={t(locale, "Billed today")}
            usd={money.finance.revenueTodayUsd}
            rate={execRate}
            hint={t(locale, "invoiced today, not yet money")}
            icon={Receipt}
            href="/app/finance/invoices"
          />
          <MoneyTile
            label={t(locale, "Spent today")}
            usd={money.finance.expensesTodayUsd}
            rate={execRate}
            hint={t(locale, "everything that left an account since midnight")}
            icon={Banknote}
            tone={money.finance.expensesTodayUsd > 0 ? "warn" : "default"}
            href="/app/finance/expenses"
          />
          <MoneyTile
            label={t(locale, "Credit outstanding")}
            usd={money.finance.creditOutstandingUsd}
            rate={execRate}
            hint={t(locale, "cargo released on a promise, never cash")}
            icon={CreditCard}
            tone={money.finance.creditOutstandingUsd > 0 ? "warn" : "default"}
            href="/app/finance/credit"
          />
        </div>
      </div>

      <div>
        <SectionLabel
          action={{ href: "/app/finance", label: t(locale, "Full position") }}
        >
          {t(locale, "Business health · right now")}
        </SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/*
          Shillings lead here too.

          This was the one money card on the page still reading in dollars. The
          reason was real — payments arrive in either currency and are summed at
          the rate frozen onto each invoice, so the dollar figure is exact and a
          shilling one is today's rate applied to it. But that is precisely what
          the tile beside it does, and what every money figure in this app does:
          the shilling leads because it is the money in the room, and the exact
          dollar figure sits underneath labelled as the invoice's.

          One card in dollars in a row of shillings does not read as more
          precise. It reads as a different unit nobody warned you about.
        */}
        {/*
          FREIGHT, NAMED — BECAUSE THE BAR BELOW IT COUNTS MORE.

          A customer often sends the freight and the delivery fare in one
          transfer. This tile and its trend are the cargo half only; "Money in
          and out" further down adds the fare back, because the fare leaving
          again is counted in the same chart's Money out. Both are right and
          they do not match, so the tile says which one it is instead of
          leaving the owner to find two figures for one month.
        */}
        <MoneyTile
          label={t(locale, "Freight collected this month")}
          usd={thisMonthRevenue}
          rate={execRate}
          count={
            revenueChange
              ? `${revenueChange} ${t(locale, "on last month")}`
              : /* Only genuinely the first month if nothing was ever
                   collected. A quiet month after busy ones is not the
                   business's first, and saying so made the owner doubt a
                   figure that was right. */
                stats.allTimeCollected > thisMonthRevenue
                ? t(locale, "nothing came in last month")
                : t(locale, "first month with takings")
          }
          hint={`${execTsh(stats.allTimeCollected)} ${t(locale, "received all time")} · ${t(locale, "the delivery fare is not ours")}`}
          icon={Banknote}
          tone="good"
          trend={revenue.values}
          href="/app/finance"
        />
        {/* Shillings lead. Freight is priced in dollars and paid in
            shillings, and the owner reads this the way the till does. */}
        <MoneyTile
          label={t(locale, "Outstanding")}
          usd={stats.outstanding}
          rate={execRate}
          /* Every open bill, not this month's — it sits between two tiles
             that are both month figures, and read as one. */
          hint={t(locale, "Owed on every unpaid bill, not just this month")}
          icon={Wallet}
          tone={stats.outstanding > 0 ? "warn" : "good"}
          href="/app/finance/invoices?status=UNPAID"
        />
        <KpiCard
          delay={2}
          label={t(locale, "Delivered this month")}
          numeric={stats.deliveredThisMonth}
          ringPct={deliveredShare}
          /* The ring divides this month's deliveries by everything still
             moving plus them — and "still moving" is the whole corridor, not
             this month's registrations. Said as "the month's cargo", it named
             a population the figure was never measured against. */
          ringLabel={t(locale, "Delivered this month against everything still moving")}
          hint={`${stats.active} ${t(locale, "still moving")}`}
          icon={Truck}
          tone="brand"
        />
        {/*
          THE PROMISE THE BUSINESS ACTUALLY MAKES.

          This said "Within 3-day promise" and measured departure → Dar
          check-in, so it graded the corridor against a promise retired months
          ago, on the wrong leg, and showed the owner 0%. It now counts the
          span the customer counts: handed over in China → reached our Dar
          warehouse, against the 3-10 days on the rate card.
        */}
        <KpiCard
          delay={3}
          label={`${t(locale, "Within the")} ${COMPANY.promiseDays} ${t(locale, "day promise")}`}
          value={perf.promiseRate === null ? "—" : `${perf.promiseRate.toFixed(0)}%`}
          /* No ring where there is nothing measured. A `?? 0` drew a full
             0% ring beside a dash, which reads as "we met the promise on
             none of it" rather than "no cargo has completed the journey
             yet" — the first thing the owner saw and called wrong. */
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
        {/*
          BILLED LESS COSTS — WHICH IS NOT MONEY IN THE BANK.

          The owner asked how the month could show a profit of 48m when 8.3m
          had come in. It could because this figure counts bills RAISED, not
          money RECEIVED: the other 39.8m was standing with customers, most of
          it against cargo still on our own Dar floor.

          Nothing about the arithmetic was wrong. The card said "Profit", sat
          in a row headed "the money · today" beside three cash tiles, and
          showed one term of a three-term sum with the other two nowhere on the
          page. So it now says what it is, stands with the other month figures
          rather than the day's cash, and prints both halves underneath —
          billed and cost — which is the only way the figure can be checked.

          `billed` is arithmetic on two numbers already here, not a fourth
          opinion about what revenue means: profitAndLoss defines profit as
          revenue less costs and managerOverview returns both.
        */}
        <KpiCard
          delay={4}
          label={t(locale, "Billed this month, less costs")}
          value={execTsh(money.finance.profitThisMonthUsd)}
          ringPct={money.finance.marginPct ?? undefined}
          ringLabel={t(locale, "Share of this month's billing left after costs")}
          hint={
            money.finance.marginPct === null
              ? t(locale, "nothing billed this month yet")
              : /* "cost" alone is already a row counter in the dictionary
                   ("3 costs"), so the two halves reuse the labels the manager
                   page prints under the same figure. */
                `${t(locale, "Billed")} ${execTsh(
                  money.finance.profitThisMonthUsd + money.finance.expensesThisMonthUsd
                )} · ${t(locale, "What it cost")} ${execTsh(money.finance.expensesThisMonthUsd)}`
          }
          icon={ChartNoAxesCombined}
          tone={
            money.finance.profitThisMonthUsd < 0
              ? "warning"
              : money.finance.marginPct !== null && money.finance.marginPct >= 20
                ? "success"
                : "brand"
          }
          href="/app/manager/reports"
        />
        </div>
        {/*
          THE SENTENCE THAT STOPS THE CARD BEING MISREAD.

          Said once, under the row, rather than crammed into a 48px ring: the
          money figure above is what was invoiced, and Outstanding beside it is
          how much of that nobody has paid yet.

          The second half only appears when it is true. A margin above 95% on a
          corridor that buys space from an airline means the flight's own costs
          have not been entered — the app warns about this per flight already
          ("A batch with no costs recorded reads as pure profit"), and this is
          the screen the owner actually opens.
        */}
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {t(
            locale,
            "Billed less costs is what was invoiced this month, not money received. What has not been paid is under Outstanding."
          )}
          {money.finance.marginPct !== null && money.finance.marginPct > 95 ? (
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

      {/* Where all of it is, whether the money is keeping up, and how old the
          debt is — the three the owner cannot get from any one desk's page. */}
      <div>
        <SectionLabel
          action={{ href: "/app/shipments", label: t(locale, "Every consignment") }}
        >
          {t(locale, "The corridor, right now")}
        </SectionLabel>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="panel p-4">
            <h3 className="text-sm font-semibold">
              {t(locale, "Where the cargo is")}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                locale,
                "Everything the business is carrying, Guangzhou to the counter"
              )}
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

          <section className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {t(locale, "Money in and out")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "What arrived against what it cost, this year")}
                </p>
              </div>
              {/* The bars run across the year; this figure is THIS MONTH
                  alone. Unlabelled beside a caption ending "this year", it
                  read as the year's net — which is a different and much
                  larger number. */}
              <p className="shrink-0 text-right">
                <span
                  className={`block font-mono text-xs font-semibold ${
                    netThisMonth < 0 ? "text-signal" : "text-success"
                  }`}
                >
                  {netThisMonth < 0 ? "−" : "+"}
                  {execTsh(Math.abs(netThisMonth))}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {t(locale, "this month")}
                </span>
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

          <section className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {t(locale, "What we are owed, by age")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "From the day the bill became real")}
                </p>
              </div>
              {owed.oldestDays > 0 ? (
                <p className="shrink-0 text-right text-xs text-muted-foreground">
                  {t(locale, "oldest")}{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {owed.oldestDays}d
                  </span>
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
        </div>
      </div>

      <div>
        <SectionLabel
          action={{ href: "/app/shipments", label: t(locale, "All batches") }}
        >
          {t(locale, "Volume")}
        </SectionLabel>
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold">
                {t(locale, "Cargo volume")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {volume.year} {t(locale, "against")} {volume.year - 1}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold tabular">
                {volume.total.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(locale, "this year")}
              </p>
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

      <div>
        <SectionLabel
          action={{
            href: "/app/finance/transactions",
            label: t(locale, "The Ledger"),
          }}
        >
          {t(locale, "Cargo behind the money, and who did what")}
        </SectionLabel>
        {/* No "Collections by month" bar. Money in and out above draws the same
            payments, against the costs they have to cover — one series where
            there were two charts, and the one that could never answer whether
            any of it was kept. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display font-semibold">
            {t(locale, "Unpaid in warehouse")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(locale, "Cargo we are storing for free")}
          </p>
          <ul className="mt-4 divide-y">
            {aging.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted-foreground">
                {t(locale, "Nothing outstanding.")}
              </li>
            ) : (
              aging.map((shipment) => (
                <li
                  key={shipment.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <Link
                    href={`/app/cargo/${shipment.trackingNumber}`}
                    className="font-mono text-sm tabular hover:text-brand"
                  >
                    {shipment.trackingNumber}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(shipment.arrivedAt, locale)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
        <ActivityFeed
          entries={activity.map((entry) => ({
            id: entry.id,
            action: entry.action,
            summary: auditSentence(locale, entry),
            createdAt: entry.createdAt,
            actorName: entry.actor?.name ?? entry.actorEmail ?? null,
          }))}
          title={t(locale, "Company activity")}
          description={t(locale, "Every privileged action, newest first")}
          href="/app/admin/audit"
        />
        </div>
      </div>

    </div>
  );
}
