import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  ClipboardCheck,
  CreditCard,
  HandCoins,
  Info,
  Package,
  PackageCheck,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Receipt,
  Scale,
  Signature,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { ActivityBars } from "@/components/app/activity-bars";
import { ActivityFeed } from "@/components/app/activity-feed";
import { CargoMix } from "@/components/app/cargo-mix";
import { AttentionCenter, type AttnItem } from "@/components/app/attention-center";
import { DeskHero } from "@/components/app/desk-hero";
import { DeskPulsePanel } from "@/components/app/desk-pulse";
import { FlightProfitTable } from "@/components/app/flight-profit-table";
import { KpiCard } from "@/components/app/kpi-card";
import {
  BandHeading,
  BentoCard,
  CorridorBar,
  Figure,
  MarginRing,
  MoneyFlowChart,
  PipelineStrip,
  ProportionBar,
  QueueList,
  StatRows,
} from "@/components/app/manager-bento";
import { MoneyTile } from "@/components/app/money-tile";
import { Sparkline } from "@/components/charts/sparkline";
import { auditSentence } from "@/lib/audit-humanise";
import { formatMonthYear, formatWeight, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { managerOverview, type Insight, type InsightTone } from "@/lib/manager-overview";
import { formatShillings } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { profitByDispatch } from "@/lib/profit";
import {
  batchUtilisation,
  cargoMix,
  cashFlowByMonth,
  corridorPosition,
  deskPulse,
  ownerAttention,
  monthlyVolume,
  recentActivity,
} from "@/lib/queries";
import { can } from "@/lib/rbac";
import { creditAttention } from "@/lib/support";
import { creditAlerts } from "@/lib/credit-queries";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Command centre" };

/**
 * Sentences this screen already states as a figure, dropped before the briefing
 * is drawn.
 *
 * Every one of these reads as an independent finding while being a number
 * printed elsewhere on the same page — and the revenue one printed a DIFFERENT
 * number for the same claim: the sentence compares what was BILLED (accrual)
 * and a collections figure compares what ARRIVED, so the two disagreed by
 * whatever customers had not yet paid. One claim, two figures, is worse than
 * either being missing.
 *
 * THE PANEL SURVIVES, NOT THE SENTENCE, and that is the general rule here: the
 * briefing is capped at five and ordered by rank, so a figure that has to be on
 * the screen whatever else is happening cannot live in a list that drops its
 * sixth item. Overdue credit goes the other way for the same reason — the
 * attention panel above carries it as a row with the names, the worst age and
 * the money attached, which is more than a percentage in a sentence.
 *
 * Matched on the insight id from lib/manager-overview.ts, which is a plain
 * string the compiler cannot check. Renaming one there quietly brings its
 * duplicate back, which is why each id is named beside the thing it repeats.
 */
const STATED_ELSEWHERE = new Set([
  "loss", //                 the ink panel's headline figure
  "profit", //               the ink panel's headline figure
  "revenue", //              the ink panel's "Billed this month"
  "revenue-first", //        the same figure, in its first-month wording
  "statements", //           "Flights to sign off", in Waiting on you
  "collection-low", //       the "Collected against billed" ring
  "credit-overdue-rate", //  the attention panel's own credit rows, above
]);

/**
 * The manager's command centre.
 *
 * A BENTO GRID, NOT A GRID OF TILES, and the difference is the whole point of
 * this rewrite. This screen was forty numbers set at the same size in the same
 * box, which is a data dump: the eye has to read all of it to find out which
 * part matters, so it reads none of it. Here every band has one cell that owns
 * it — the ink panel carrying the month's money, the corridor bar carrying every
 * consignment in the business — with smaller cells around it. That is what lets
 * somebody answer "how are we doing" from the top of the screen.
 *
 * THE SAME BUSINESS THE OWNER READS, AND NOT THE SAME PAGE. A manager who runs
 * the company day to day and an owner who answers for it need the same figures —
 * asking the two of them to compare notes across two dashboards computing
 * revenue two ways is how a business ends up with two sets of books. So every
 * number below comes off the SAME ENGINES the owner's dashboard reads. What is
 * not shared is the LAYOUT: this page rendered its own blocks and then the whole
 * executive dashboard underneath them, which put two dashboards on one screen
 * and drew half the figures twice. Share the engines, never the layout.
 *
 * WHAT NEEDS YOU, BEFORE WHAT MERELY IS. The attention panel leads, then the
 * five sentences worth reading, and only then the figures — because the first
 * question at this desk is "does anything need me" and every number under it is
 * context for answering that.
 *
 * NO FIGURE TWICE. The rule that shapes what is here and what is deliberately
 * missing. Cargo standing past its free storage, bills unpaid and the money
 * behind them, prices waiting to be confirmed, cases and sourcing requests are
 * all carried by the attention panel with names and ages attached; the four desk
 * cards at the foot carry each desk's own standing count. None of those is drawn
 * a second time as a tile, and the corridor bar states SHARES rather than counts
 * for exactly that reason — see the note on CorridorBar.
 */
export default async function ManagerHome() {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();
  const now = new Date();

  const [me, overview, rateRow] = await Promise.all([
    // Read the name from the record, not the session. The session token carries
    // whatever the name was at sign-in, so someone who renames themselves would
    // be greeted by their old name until they signed out and back in.
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    }),
    managerOverview(locale),
    currentRate(),
  ]);
  const firstName = (me?.name ?? user.name).split(" ")[0];
  const liveRate = rateRow ? toNumber(rateRow.rate) : null;

  /*
    Everything the charts are drawn from, in one round trip.

    These are independent reads of the same instant. Run in sequence the top of
    the screen would describe a different minute from the bottom of it, and on a
    page carrying this many panels the difference is measured in seconds, not
    milliseconds.

    monthlyRevenue() is deliberately absent even though it answers a question
    this page asks. cashFlowByMonth() sums the very same payments by month and
    brings the costs beside them, so calling both would be two queries and one
    answer — and the risk that a chart and a total on one screen disagree.
  */
  const [
    attnItems,
    alerts,
    desks,
    flow,
    position,
    activity,
    mix,
    fill,
    flights,
    volume,
  ] = await Promise.all([
    ownerAttention(liveRate, locale),
    creditAlerts(),
    deskPulse(liveRate, locale),
    cashFlowByMonth(now, locale),
    corridorPosition(),
    recentActivity(8),
    cargoMix(30, locale),
    batchUtilisation(8),
    profitByDispatch(8),
    monthlyVolume(now, locale),
  ]);

  const attention: AttnItem[] = [
    ...attnItems,
    ...creditAttention(alerts, {
      locale,
      rate: liveRate,
      canApprove: can(user.role, "credit.approve"),
    }),
  ];

  const today = now.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const { operations, finance, customers, staff, management, rate } = overview;

  // Shillings lead, everywhere, through the one helper — a per-cell `rate ? … :
  // …` is how one panel on a page ends up quoting a different currency from the
  // panel beside it.
  const money = (usd: number) => formatShillings(usd, rate);
  /*
    Already shillings — print, do not convert.

    The account figures arrive valued in lib/manager-overview.ts, where each
    account's own currency is known. Running them through `money` a second time
    is what printed "TSh -29,382,118,200" on this page: a shilling balance
    multiplied by the rate again. The Tzs suffix on those fields is the only
    thing standing between the two helpers, so it is worth the noise.
  */
  const shillings = (tzs: number) =>
    `TSh ${Math.round(tzs).toLocaleString("en-US")}`;
  const count = (n: number) => n.toLocaleString("en-US");

  /*
    What was billed this month, derived rather than queried.

    profitAndLoss defines profit as revenue less costs and managerOverview
    reports both halves, so revenue is exactly profit + costs — arithmetic on two
    figures already on this page, not a second opinion about what revenue means.
    Asking the database again would put a fourth definition of "revenue this
    month" into the app, and the three that exist are quite enough.
  */
  const billedThisMonth = finance.profitThisMonthUsd + finance.expensesThisMonthUsd;
  const inThisYear = flow.moneyIn.reduce((sum, n) => sum + n, 0);
  const outThisYear = flow.moneyOut.reduce((sum, n) => sum + n, 0);
  const monthLabel = formatMonthYear(now, locale);

  /*
    Four months, not two.

    A zero meaning "we have not started" and a zero meaning "we came out level"
    are different facts, and "in profit by TSh 0" under an up-arrow states the
    second when it is usually the first — on the 1st of the month, every month.
    So a month with nothing billed and nothing spent says so and prints no
    figure at all, because there is no figure to print yet.
  */
  const nothingYet =
    billedThisMonth === 0 && finance.expensesThisMonthUsd === 0;
  const month = nothingYet
    ? {
        icon: Info,
        lead: "Nothing has been billed or spent this month yet",
        figure: "—",
        colour: "text-white",
      }
    : finance.profitThisMonthUsd > 0
      ? {
          icon: TrendingUp,
          lead: "The month is in profit by",
          figure: money(finance.profitThisMonthUsd),
          colour: "text-gold",
        }
      : finance.profitThisMonthUsd < 0
        ? {
            icon: TrendingDown,
            lead: "The month is running at a loss of",
            figure: money(Math.abs(finance.profitThisMonthUsd)),
            colour: "text-signal",
          }
        : {
            icon: Info,
            lead: "Billed and spent have come out exactly level",
            figure: money(0),
            colour: "text-white",
          };
  const MonthIcon = month.icon;

  return (
    <>
      <DeskHero
        firstName={firstName}
        role={user.role}
        today={today}
        // What this chair is for: the whole company, not one department's
        // corner of it — and the half of that which is standing still until
        // this person decides something.
        subtitle={t(
          locale,
          "Here is the whole business, and what is waiting on you."
        )}
        search={{ action: "/app/search" }}
      />

      {/*
        MONEY FIRST. The owner, twice: "give the most important info like money
        situations — the manager needs to know what is really going on."

        Attention led here for a while and the reasoning was sound in isolation
        — do not make somebody scroll to learn something needs them. But it is a
        tall panel, and the briefing sat under it, so the first FIGURE on the
        manager's screen was four hundred pixels down. He was being shown his
        to-do list before he was shown whether the company made money this
        month. The attention panel still sits high, immediately under the money
        band, where it reads as the consequence of the figures above it rather
        than as a list arriving out of nowhere.
      */}

      {/*
        BACK ON TOP, at the owner's instruction, above the money.

        It came out an hour ago on the argument that the control room answers the
        same question in more depth. True, and beside the point: this is the
        screen he opens every morning, and he wants what is waiting before he
        reads anything else. The control room stays as the fuller list — the
        link on this panel goes there — and this is the glance.
      */}
      <div className="mb-6">
        <AttentionCenter
          items={attention}
          reviewAll={{ href: "/app/manager/control", label: t(locale, "Control room") }}
          empty={t(locale, "Nothing needs your decision. Every desk is clear.")}
        />
      </div>

      {/* ----------------------------------------------------------- the money */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "The money")}
          hint={t(locale, "What was billed, what arrived, and what is left of it.")}
          action={{ href: "/app/finance", label: t(locale, "Full position") }}
        />

        {/*
          The row floor sets what a two-row cell RESERVES, not what it needs.

          At 9.5rem a cell spanning two rows held nineteen rems of ground before
          a word was written, so the big cells came out taller than their
          contents and the band read as mostly air. 7.75 still gives a single
          small cell room for a label, a figure and a hint without cramping, and
          takes about three and a half rems off every tall one.
        */}
        {/*
          THE SMALL FIGURES GET THEIR OWN ROW, five across, and that is a fix
          rather than a preference.

          They sat in the same grid as the profit cell and the chart, both of
          which are tall because they have a chart and a pair of bars in them.
          MoneyTile fills its cell and pins its hint to the bottom, so a tile
          holding "Collected today · TSh 0" was stretched to the height of its
          tallest neighbour and came out as four hundred pixels of empty
          ground. items-start should have stopped that and did not, because a
          tile spanning one column still shares a ROW with whatever spans two.

          Separating them removes the shared row entirely: five equal cards,
          each as tall as one label, one figure and one line of hint.
        */}
        <div className="mb-3 grid items-start grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <MoneyTile
              label={t(locale, "Collected today")}
              usd={finance.collectedTodayUsd}
              rate={rate}
              hint={t(locale, "what customers actually handed over")}
              icon={HandCoins}
              tone={finance.collectedTodayUsd > 0 ? "good" : "default"}
              href="/app/finance/payments"
            />
            <MoneyTile
              label={t(locale, "Billed today")}
              usd={finance.revenueTodayUsd}
              rate={rate}
              hint={t(locale, "invoiced today, not yet money")}
              icon={Receipt}
              href="/app/finance/invoices"
            />
            <MoneyTile
              label={t(locale, "Spent today")}
              usd={finance.expensesTodayUsd}
              rate={rate}
              hint={t(locale, "costs booked since midnight")}
              icon={Banknote}
              href="/app/finance/expenses"
            />
            <MoneyTile
              label={t(locale, "Credit outstanding")}
              usd={finance.creditOutstandingUsd}
              rate={rate}
              hint={t(locale, "cargo released on a promise, never cash")}
              icon={CreditCard}
              tone={finance.creditOutstandingUsd > 0 ? "warn" : "default"}
              href="/app/finance/credit"
            />
            <MoneyTile
              label={t(locale, "Owed to us")}
              usd={finance.outstandingUsd}
              rate={rate}
              hint={t(locale, "billed, confirmed, and still not paid")}
              icon={Wallet}
              tone={finance.outstandingUsd > 0 ? "bad" : "good"}
              emphasis={finance.outstandingUsd > 0}
              href="/app/collections/follow-up"
            />
        </div>

        {/* items-STRETCH here, deliberately, unlike every other row. Both cells
            are charts — the loss bars on the left, the year on the right — and a
            chart given more height is still a chart. Two chart cards at different
            heights read as a mistake; two at the same height read as a pair. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch">
          {/*
            THE ONE CELL THAT OWNS THIS SCREEN.

            Ink, at twice the size of anything around it, because the month's
            profit is the single figure that says whether any of the rest was
            worth doing — and on the old page it was a 22px number in a row of
            nine identical ones. The panel is the same deep navy in both themes,
            the way a printed cover is, and the gold is the app's own accent
            rather than a gradient borrowed from somewhere else.
          */}
          <BentoCard
            tone="ink"
            href="/app/finance"
            className=""
          >
            <span
              aria-hidden
              className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.12]"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_110%_at_100%_0%,hsl(var(--gold)/0.20),transparent_58%)]"
            />

            <div className="relative flex flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
                  {monthLabel}
                </p>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                  <MonthIcon className="h-4 w-4" />
                </span>
              </div>

              {/*
                The sentence first, the figure second.

                A loss set in red beside an up-arrow is how a screen tells
                somebody they had a good month while the bank says otherwise.
                The words carry the direction; the colour only agrees with them,
                and nothing here depends on the colour being seen.
              */}
              <p className="mt-4 text-sm text-white/70">
                {t(locale, month.lead)}
              </p>
              <p
                className={cn(
                  "mt-1.5 font-display text-[40px] font-bold leading-none tracking-tight tabular-nums sm:text-[46px]",
                  month.colour
                )}
              >
                {month.figure}
              </p>

              <div className="mt-6">
                {finance.marginPct === null ? (
                  /* No margin, rather than a margin of nothing. A month that has
                     billed nothing has no ratio to draw, and a 0% ring would be
                     a statement about performance instead of about the calendar. */
                  <p className="rounded-lg bg-white/10 px-3 py-2.5 text-xs leading-snug text-white/80">
                    {t(
                      locale,
                      "Nothing has been billed this month yet, so there is no margin to show."
                    )}
                  </p>
                ) : finance.marginPct < 0 ? (
                  /*
                    A LOSS GETS A PICTURE TOO, not just a sentence.

                    This branch used to print one line of text inside a cell two
                    rows tall, so the month that most needs explaining was the
                    month with the emptiest card — the reader was told there was
                    no margin and shown nothing about why. Two bars against a
                    shared scale answer it at a glance: the cost bar runs past
                    the billed bar, and the overspend is the difference.
                  */
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium leading-snug text-white/90">
                      {t(locale, "Costs came in above everything billed.")}
                    </p>
                    {(() => {
                      const billed = billedThisMonth;
                      const cost = finance.expensesThisMonthUsd;
                      const scale = Math.max(billed, cost, 1);
                      const bar = (value: number, className: string) => (
                        <span className="block h-2 rounded-full bg-white/10">
                          <span
                            className={`block h-2 rounded-full ${className}`}
                            style={{ width: `${Math.max(2, (value / scale) * 100)}%` }}
                          />
                        </span>
                      );
                      return (
                        <div className="space-y-2">
                          <div>
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span className="text-[11px] text-white/60">
                                {t(locale, "Billed")}
                              </span>
                              <span className="tabular text-[11px] font-semibold text-white">
                                {money(billed)}
                              </span>
                            </div>
                            {bar(billed, "bg-white/70")}
                          </div>
                          <div>
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span className="text-[11px] text-white/60">
                                {t(locale, "Cost")}
                              </span>
                              <span className="tabular text-[11px] font-semibold text-signal">
                                {money(cost)}
                              </span>
                            </div>
                            {bar(cost, "bg-signal")}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <MarginRing
                    pct={finance.marginPct}
                    label={t(locale, "Margin")}
                    caption={t(
                      locale,
                      "of everything billed this month survives its costs"
                    )}
                  />
                )}
              </div>

              {/* The two halves the figure above is made of. Stated once, here,
                  and never repeated as tiles of their own. */}
              <div className="mt-auto grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                <div className="min-w-0">
                  <p className="text-xs text-white/60">
                    {t(locale, "Billed this month")}
                  </p>
                  <p className="mt-1 truncate font-mono text-sm font-semibold tabular-nums text-white">
                    {money(billedThisMonth)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-white/60">
                    {t(locale, "What it cost")}
                  </p>
                  <p className="mt-1 truncate font-mono text-sm font-semibold tabular-nums text-white">
                    {money(finance.expensesThisMonthUsd)}
                  </p>
                </div>
              </div>
            </div>
          </BentoCard>


          {/*
            THE BIGGEST NUMBER IN THE BUSINESS, and it was not on the money band.

            It was left off because the attention panel names it and the Finance
            desk card repeats it, and the rule here is that no figure appears
            twice. That rule was applied too literally: what a customer owes is
            not a queue item, it is the state of the company, and a money band
            that omits the largest figure in it is a money band the reader
            cannot trust to be complete. The other two mention it in passing —
            this is where somebody comes to READ it.
          */}

          {/* The shape behind every figure above: what arrived against what it
              cost, month by month. */}
          <BentoCard
            href="/app/finance/transactions"
            /* THE CHART IS THE BIG CELL NOW, not a number.

               A figure needs the room it takes to be read once; a
               shape needs room to BE a shape. Handing two rows to
               the profit card meant a 46px number floating in a
               panel of empty ground, while the one thing on this
               band that rewards a second look — twelve months of
               money arriving against money leaving — was squeezed
               into a strip. They have swapped. */
            className=""
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {t(locale, "Money in and out")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Payments received against costs incurred, this year")}
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>

            {flow.labels.length < 2 || (inThisYear === 0 && outThisYear === 0) ? (
              /* A flat pair of lines at zero looks like a chart that failed to
                 load. Said in words instead. */
              <p className="mt-4 text-sm leading-snug text-muted-foreground">
                {t(
                  locale,
                  flow.labels.length < 2
                    ? /* One month of data draws a single point: smoothPath and
                         areaPath both degenerate to a bare move command, so the
                         panel rendered its gridlines with no line on them — which
                         reads as a chart that failed rather than a year that has
                         only just started. */
                      "One month in. A shape needs two, so the chart starts next month."
                    : "No money has come in or gone out yet this year. The chart starts with the first payment."
                )}
              </p>
            ) : (
              <>
                <MoneyFlowChart
                  labels={flow.labels}
                  moneyIn={flow.moneyIn}
                  moneyOut={flow.moneyOut}
                  currentIndex={flow.currentIndex}
                  title={t(locale, "Payments received against costs incurred, this year")}
                />
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-3">
                  <span className="inline-flex items-baseline gap-2 text-xs">
                    <span
                      aria-hidden
                      className="h-2 w-2 translate-y-[1px] rounded-full bg-chart-5"
                    />
                    <span className="text-muted-foreground">
                      {t(locale, "In, this year")}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {money(inThisYear)}
                    </span>
                  </span>
                  <span className="inline-flex items-baseline gap-2 text-xs">
                    <span
                      aria-hidden
                      className="h-2 w-2 translate-y-[1px] rounded-full bg-chart-3"
                    />
                    <span className="text-muted-foreground">
                      {t(locale, "Out, this year")}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {money(outThisYear)}
                    </span>
                  </span>
                </div>
              </>
            )}
          </BentoCard>
        </div>

        {/* The two rings side by side, equal width — neither is more
            important than the other and neither has more in it. */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch">
          <KpiCard
            label={t(locale, "Collected against billed")}
            /*
              A VERDICT, NOT THE NUMBER AGAIN.

              The ring prints the percentage in its own middle, so passing it
              here put the same "62%" twice on one small card, two centimetres
              apart. Today's takings were the obvious substitute and are wrong:
              this card is about the MONTH, and a daily figure under a monthly
              ring is the same mislabelling trap in a new place. So the headline
              says what the percentage MEANS — which is the one thing a ring
              cannot — and the number stays in the ring where it is drawn.
            */
            value={
              finance.collectionRatePct === null
                ? t(locale, "Nothing billed")
                : finance.collectionRatePct >= 80
                  ? t(locale, "Collecting well")
                  : finance.collectionRatePct >= 40
                    ? t(locale, "Half the month is out")
                    : t(locale, "Barely collecting")
            }
            ringPct={finance.collectionRatePct ?? undefined}
            ringLabel={t(locale, "Share of this month's billing already paid")}
            hint={
              finance.collectionRatePct === null
                ? t(locale, "nothing billed this month yet")
                : t(locale, "of this month's billing has come back")
            }
            icon={Wallet}
            tone={
              finance.collectionRatePct === null
                ? "info"
                : finance.collectionRatePct >= 60
                  ? "success"
                  : "warning"
            }
          />
          <KpiCard
            label={t(locale, "Customers using credit")}
            numeric={customers.onCredit}
            hint={t(locale, "carrying a live balance right now")}
            icon={CreditCard}
            tone="info"
            href="/app/finance/credit"
          />

          {/* Where the money actually sits, as one rail. Three tiles cannot say
              "almost all of it is in the bank"; a bar says nothing else. */}
        </div>

        {/* The accounts rail is full width by nature — a proportion bar has to
            be long enough to read. */}
        <div className="mt-3">
          <BentoCard
            href="/app/finance/accounts"
            className=""
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {t(locale, "Where the money sits")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(
                    locale,
                    "Every company account, grouped by kind and added at today's rate"
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-[22px] font-bold leading-none tabular-nums">
                  {shillings(
                    finance.bankTzs + finance.mobileMoneyTzs + finance.cashTzs
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(locale, "held in total")}
                </p>
              </div>
            </div>

            <ProportionBar
              className="mt-4"
              empty={t(locale, "No account is carrying a balance.")}
              parts={[
                {
                  key: "bank",
                  label: t(locale, "In the bank"),
                  display: shillings(finance.bankTzs),
                  value: finance.bankTzs,
                  colour: "hsl(var(--chart-1))",
                },
                {
                  key: "mobile",
                  label: t(locale, "Mobile money"),
                  display: shillings(finance.mobileMoneyTzs),
                  value: finance.mobileMoneyTzs,
                  colour: "hsl(var(--chart-2))",
                },
                {
                  key: "cash",
                  label: t(locale, "Cash, the office tin included"),
                  display: shillings(finance.cashTzs),
                  value: finance.cashTzs,
                  colour: "hsl(var(--chart-5))",
                },
              ]}
            />

            {/*
              Said out loud, because the label above invites the wrong reading.

              There is no petty-cash model in this schema — an account is BANK,
              MOBILE_MONEY or CASH, and the office tin is a CASH account like the
              counter float. Splitting them would mean inventing the rule that
              decides which tin is petty.
            */}
            <p className="mt-3 text-xs leading-snug text-muted-foreground">
              {t(
                locale,
                "There is no separate petty-cash pot. The office tin is a cash account like any other, and is inside the cash figure."
              )}
            </p>
          </BentoCard>
        </div>
      </section>

      {/*
        NO ATTENTION PANEL HERE — the owner removed it, and it was the right
        call.

        It is a tall, scrolling list, and this app already has a screen whose
        entire job is that list: the control room, which gathers the same queues
        plus the account checks and the disputed records, and states how long
        each has waited. Two surfaces answering "what needs me" meant the taller
        one ate the top of a page that is supposed to open on the money, and the
        better one was a click away and easy to miss.

        The queue counts that mattered most survive as figures — "Decisions
        queued" with its oldest age, "Flights to sign off", "Payroll to agree" —
        in the company band below, each linking to the screen that owns it.
      */}

      {/* -------------------------------------------------- batch profitability */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "What each batch is making")}
          hint={t(
            locale,
            "The company earns per flight. A month-level profit cannot tell you which one paid for itself."
          )}
          action={{ href: "/app/manager/batches", label: t(locale, "Every batch") }}
        />
        <FlightProfitTable flights={flights} />
      </section>

      {/* ------------------------------------------------------- the briefing */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "The briefing")}
          hint={t(
            locale,
            "Short readings of the month, hardest-hitting first. A figure says how much; only a comparison says whether that is good."
          )}
        />
        <Briefing
          items={overview.insights.filter((item) => !STATED_ELSEWHERE.has(item.id))}
          locale={locale}
        />
      </section>

      {/* ------------------------------------------------------ cargo in motion */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "Cargo in motion")}
          hint={t(locale, "Everything the business is carrying, Guangzhou to the counter.")}
          action={{ href: "/app/shipments", label: t(locale, "Every consignment") }}
        />

        {/*
          THREE ROWS, EACH OF EQUAL CARDS.

          The nine cards of this band sat in one four-column grid with
          three of them spanning two columns, and the holes the owner kept
          pointing at were exactly the cells left over beside a spanning
          card. Cards are grouped by what they are now: the four small
          figures in one row of four; the two charts in one row of two;
          the two wide panels in one row of two. Nothing spans, so nothing
          leaves a gap.
        */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:items-stretch">
          <BentoCard href="/app/inventory">
            <Figure
              className="flex-1"
              label={t(locale, "Weight on the floor")}
              value={formatWeight(operations.kgOnFloor)}
              hint={t(locale, "checked in off a manifest and standing here")}
              icon={Scale}
              tone="brand"
            />
          </BentoCard>
          <BentoCard href="/app/inventory">
            <Figure
              className="flex-1"
              label={t(locale, "Held, no pickup note")}
              value={count(operations.cargoAwaitingPayment)}
              hint={t(locale, "not paid for, or stopped by a claim")}
              icon={Warehouse}
              tone={operations.cargoAwaitingPayment > 0 ? "warn" : "plain"}
            />
          </BentoCard>
          <BentoCard href="/app/deliveries">
            <Figure
              className="flex-1"
              label={t(locale, "Handed over this month")}
              value={count(operations.cargoCollectedThisMonth)}
              hint={t(locale, "collected by the customer since the 1st")}
              icon={PackageCheck}
              tone="good"
            />
          </BentoCard>
          <BentoCard href="/app/shipments">
            <Figure
              label={t(locale, "Registered this year")}
              value={count(volume.total)}
              icon={ClipboardCheck}
              tone="info"
            />
            {volume.current.length > 1 ? (
              <div className="mt-auto pt-4">
                <Sparkline
                  values={volume.current}
                  tone={2}
                  label={t(locale, "Consignments registered, month by month")}
                  className="w-full"
                />
                {/* The year on its own line rather than inside the sentence: a
                    phrase with a number baked into it can never be looked up
                    whole, so it would never reach a Chinese reader. */}
                <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                  {t(locale, "month by month")} · {volume.year}
                </p>
              </div>
            ) : (
              <p className="mt-auto pt-4 text-xs leading-snug text-muted-foreground">
                {t(locale, "one month in — there is no shape to draw yet")}
              </p>
            )}
          </BentoCard>
        </div>

        {/* Paired by HEIGHT, not by topic. The corridor is a short list and
            the mix donut is tall; putting them side by side left the corridor
            card ending at half the height of its neighbour. Now: two lists
            in one row, two charts in the next. */}
        {/* The flight stages on their own full-width row. Three numbers do not
            fill a card that has been stretched beside a five-row list — they
            were 254px tall holding 65px of nothing. Alone, the row is as tall
            as one stage. */}
        <div className="mt-3">
          <BentoCard>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {t(locale, "The flights themselves")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Batches, not consignments — the aircraft, not the boxes")}
                </p>
              </div>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                <Plane className="h-4 w-4" />
              </span>
            </div>

            <PipelineStrip
              stages={[
                {
                  key: "loading",
                  label: t(locale, "Loading in Guangzhou"),
                  value: count(operations.batchesLoading),
                  hint: t(locale, "open, full or sealed"),
                  icon: PlaneTakeoff,
                  href: "/app/batches",
                  tone: "info",
                },
                {
                  key: "air",
                  label: t(locale, "In the air"),
                  value: count(operations.batchesInAir),
                  hint: t(locale, "departed, not yet landed"),
                  icon: Plane,
                  href: "/app/incoming",
                  tone: "brand",
                },
                {
                  key: "landed",
                  label: t(locale, "Landed, not finished"),
                  value: count(operations.batchesArrived),
                  hint: t(locale, "manifest still being ticked off"),
                  icon: PlaneLanding,
                  href: "/app/receive",
                  tone: operations.batchesArrived > 0 ? "warn" : "plain",
                },
              ]}
            />
          </BentoCard>
        </div>

        {/* The two tall panels together: a five-row list and a donut, both
            genuinely tall, so matching them adds no emptiness to either. */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch">
          <BentoCard
            href="/app/shipments"
           
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {t(locale, "Where the cargo is")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Mutually exclusive, and they add up to everything")}
                </p>
              </div>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Package className="h-4 w-4" />
              </span>
            </div>

            <CorridorBar
              total={position.total}
              totalLabel={t(locale, "consignments in the business")}
              empty={t(
                locale,
                "The business is carrying nothing right now — everything registered has been handed over."
              )}
              caption={t(
                locale,
                "Shares, not counts: each desk states its own count on the cards at the foot of this page."
              )}
              segments={[
                {
                  key: "china",
                  label: t(locale, "In Guangzhou, waiting to fly"),
                  count: position.inChina,
                  tone: 2,
                },
                { key: "air", label: t(locale, "In the air"), count: position.inAir, tone: 1 },
                {
                  key: "floor",
                  label: t(locale, "On the Dar floor"),
                  count: position.onFloor,
                  tone: 4,
                },
                {
                  key: "ready",
                  label: t(locale, "Cleared, not collected"),
                  count: position.ready,
                  tone: 5,
                },
                {
                  key: "flagged",
                  label: t(locale, "Under investigation"),
                  count: position.flagged,
                  tone: 3,
                },
              ]}
            />
          </BentoCard>
          <div className="flex flex-col [&>section]:flex-1">
            <CargoMix
              slices={mix.slices}
              totalShipments={mix.totalShipments}
              totalWeightKg={mix.totalWeightKg}
              periodLabel={`${t(locale, "Registered in the last")} ${mix.days} ${t(locale, "days")}`}
            />
          </div>
        </div>

        <div className="mt-3">
          <BentoCard href="/app/batches">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {t(locale, "What each flight carried")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Weight carried, the last eight batches, oldest first")}
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            {fill.length === 0 ? (
              <p className="mt-4 text-sm leading-snug text-muted-foreground">
                {t(locale, "No batch has flown yet, so there is nothing to compare.")}
              </p>
            ) : (
              <ActivityBars className="mt-4" points={fill} unit={t(locale, "kg")} />
            )}
          </BentoCard>
        </div>
      </section>


      {/* ----------------------------------------------------------- the company */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "The company")}
          hint={t(locale, "What is standing still until you decide, and who it is standing on.")}
          action={{ href: "/app/manager/approvals", label: t(locale, "Every queue") }}
        />

        {/*
          items-start, so a short card stops being stretched to the tallest.

          Grid children default to stretch, which is right when every cell has
          enough in it and wrong here: the staff card carries five rows and a
          strip of department chips, and the two beside it carry three figures
          each. Stretching made those two into tall panels that were mostly
          empty ground, which reads as something failing to load rather than as
          a desk with little on it. A ragged bottom edge is the honest shape of
          unequal content.
        */}
        {/* items-start, not stretch. "Waiting on you" carries three tall queue
            rows; the two beside it carry a figure and three thin lines. Matched
            heights gave each of those 57px of empty ground — the measurement
            that sent me back here. Unequal bottoms, no holes. */}
        <div className="grid items-start grid-cols-1 gap-3 lg:grid-cols-3">
          <BentoCard>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {t(locale, "Waiting on you")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Nothing below moves until this desk says so")}
                </p>
              </div>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <ClipboardCheck className="h-4 w-4" />
              </span>
            </div>

            <QueueList
              lines={[
                {
                  key: "approvals",
                  label: t(locale, "Decisions queued"),
                  value: count(management.pendingApprovals),
                  note:
                    management.oldestApprovalDays === null
                      ? t(locale, "nothing is sitting")
                      : `${t(locale, "oldest")} ${management.oldestApprovalDays}${t(locale, "d")}`,
                  href: "/app/manager/approvals",
                  icon: ClipboardCheck,
                  tone:
                    (management.oldestApprovalDays ?? 0) >= 3
                      ? "bad"
                      : management.pendingApprovals > 0
                        ? "warn"
                        : "plain",
                },
                {
                  /* The empty state says the manager is up to date, because that
                     is what it is. statementSummary leaves oldestDays null in
                     exactly one case — the waiting list is empty — and this once
                     read "Finance has closed nothing new", which told a manager
                     with nothing left to sign that the desk below him had
                     stopped working. */
                  key: "statements",
                  label: t(locale, "Flights to sign off"),
                  value: count(management.statements.waiting),
                  note:
                    management.statements.oldestDays === null
                      ? t(locale, "everything closed is signed off")
                      : `${t(locale, "oldest")} ${management.statements.oldestDays}${t(locale, "d")}`,
                  href: "/app/manager/reconciliation",
                  icon: Signature,
                  tone: management.statements.waiting > 0 ? "warn" : "plain",
                },
                {
                  key: "payroll",
                  label: t(locale, "Payroll to agree"),
                  value: count(management.payrollWaiting),
                  note: staff.payroll
                    ? `${staff.payroll.label} · ${t(locale, PAYROLL_STATUS[staff.payroll.status] ?? "Status unknown")}`
                    : t(locale, "no run has been built yet"),
                  href: "/app/manager/payroll",
                  icon: Wallet,
                  tone: management.payrollWaiting > 0 ? "bad" : "plain",
                },
              ]}
            />
          </BentoCard>

          <BentoCard>
            <Figure
              label={t(locale, "Customers on the books")}
              value={count(customers.total)}
              icon={Users}
              tone="brand"
            />
            <StatRows
              rows={[
                {
                  key: "new",
                  label: t(locale, "New this month"),
                  value: count(customers.newThisMonth),
                  href: "/app/customers",
                },
                {
                  key: "reply",
                  label: t(locale, "Waiting on our reply"),
                  value: count(customers.awaitingReply),
                  tone: customers.awaitingReply > 0 ? "warn" : "plain",
                  href: "/app/support/tickets",
                },
                /* Past their credit due date. A real row, not padding: it is
                   the one customer figure on this page that costs money the
                   longer it sits, and it brings this card to the same three
                   rows as the two beside it. */
                {
                  key: "overdue",
                  label: t(locale, "Overdue on credit"),
                  value: count(customers.overdueOnCredit),
                  tone: customers.overdueOnCredit > 0 ? "bad" : "plain",
                  href: "/app/finance/credit",
                },
              ]}
            />
          </BentoCard>

          <BentoCard>
            <Figure
              label={t(locale, "Signing in and working")}
              value={count(staff.total)}
              icon={Users}
              tone="info"
            />
            <StatRows
              rows={[
                {
                  key: "seen",
                  label: t(locale, "Opened the app today"),
                  value: count(staff.seenToday),
                  href: "/app/admin/users",
                },
                {
                  key: "suspended",
                  label: t(locale, "Suspended"),
                  value: count(staff.suspended),
                  tone: staff.suspended > 0 ? "warn" : "plain",
                  href: "/app/admin/users",
                },
                {
                  key: "salary",
                  label: t(locale, "No salary set"),
                  value: count(staff.withoutSalary),
                  tone: staff.withoutSalary > 0 ? "warn" : "plain",
                  href: "/app/manager/payroll",
                },
              ]}
            />

          </BentoCard>
        </div>

        {/*
          THE SHAPE OF THE COMPANY, AS ONE STRIP UNDER THE THREE CARDS.

          The department chips and the attendance note lived inside the staff
          card, which made it twice the height of the customers card beside it —
          the same content-mismatch that made every other row on this page look
          forced. The three cards hold three rows each now, and the strip below
          carries the rest at full width, where a run of chips has room to be a
          run of chips.
        */}
        <div className="mt-3 flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center">
          {/* The departments as a rail rather than five more figures: this is
              one fact — the shape of the company — not five questions. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {staff.byDepartment.map((row) => (
              <span
                key={row.department}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
              >
                <span className="text-muted-foreground">{t(locale, row.label)}</span>
                <span className="font-semibold tabular-nums">{row.count}</span>
              </span>
            ))}
          </div>

          {/*
            Said out loud, because the figure above invites the wrong reading.

            This schema has no attendance: no shift, no clock-in, no roster of
            who was expected in. `lastActiveAt` is a heartbeat touched on every
            authenticated page load. Somebody on the warehouse floor all day who
            never opened the app is missing from it, and somebody signed in from
            a bus is counted in it. A manager who read this as attendance would
            be disciplining the wrong person.
          */}
          <p className="text-xs leading-snug text-muted-foreground sm:ml-auto sm:max-w-sm sm:text-right">
            {t(
              locale,
              "Attendance is not tracked. Opened the app today means exactly that, and nothing more."
            )}
          </p>
        </div>
      </section>

      {/*
        The four desks, and the only panel here that is about PEOPLE rather than
        figures. It closes the page the way the reader's day runs: what needs
        deciding, what the money did, what is moving, then who is doing it.
      */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "Every desk, right now")}
          hint={t(locale, "Each desk's own standing count, and the one thing wrong on it.")}
          action={{
            href: "/app/manager/operations",
            label: t(locale, "Every desk in full"),
          }}
        />
        <DeskPulsePanel desks={desks} locale={locale} />
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
    </>
  );
}

/** Where a salary run has got to, in the words this desk uses for it. */
const PAYROLL_STATUS: Record<string, string> = {
  DRAFT: "Still with Finance",
  PENDING_APPROVAL: "Waiting on you",
  APPROVED: "Agreed — not yet paid",
  REJECTED: "Sent back to Finance",
  PAID: "Paid",
};

// ---------------------------------------------------------------------------
// The briefing
// ---------------------------------------------------------------------------

const INSIGHT_TONES: Record<
  InsightTone,
  { icon: LucideIcon; chip: string; rule: string; name: string }
> = {
  good: {
    icon: TrendingUp,
    chip: "bg-success/10 text-success",
    rule: "bg-success",
    name: "Good news",
  },
  warn: {
    icon: AlertTriangle,
    chip: "bg-warning/10 text-warning",
    rule: "bg-warning",
    name: "Watch this",
  },
  bad: {
    icon: TrendingDown,
    chip: "bg-destructive/10 text-destructive",
    rule: "bg-destructive",
    name: "Bad news",
  },
  neutral: {
    icon: Info,
    chip: "bg-muted text-muted-foreground",
    rule: "bg-muted-foreground/40",
    name: "Worth knowing",
  },
};

/**
 * The five sentences worth reading before any number.
 *
 * A dashboard states figures; a manager needs the reading of them. These are
 * comparisons and ages — "up 18% on last month", "waiting six days" — because a
 * figure answers how much and only a comparison answers whether that is good.
 * They arrive ordered by how much each ought to change a decision this morning,
 * never by the order a query happened to return.
 *
 * Cards rather than a stack of rows, and the first one twice the width of the
 * others: the ranking is the point, and a list of five identical lines throws
 * the ranking away the moment it is drawn.
 *
 * The tone is NAMED as well as coloured. "Bad news" in red and "Good news" in
 * green are the same card to a reader who cannot separate the two, and this is
 * the one panel on the page whose entire content is a judgement.
 */
function Briefing({ items, locale }: { items: Insight[]; locale: Locale }) {
  if (items.length === 0) {
    /* A clear month still gets a sentence. An empty panel reads as a screen that
       failed to load, not as a business with nothing to report. */
    return (
      <section className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-soft">
        {t(
          locale,
          "Nothing has moved enough to be worth a sentence. The figures below are the whole story."
        )}
      </section>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3",
        // The row is exactly as many columns as it has cards, up to three, so
        // two insights are two halves and never two thirds plus a hole.
        items.length === 1 ? "" : items.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"
      )}
    >
      {items.map((item, index) => {
        const tone = INSIGHT_TONES[item.tone];
        const Icon = tone.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "focus-ring group relative flex items-start gap-3 overflow-hidden rounded-xl border bg-card p-4 pl-5 shadow-soft transition-[transform,box-shadow] duration-200 ease-out-expo hover:scale-[1.015] hover:shadow-lift motion-reduce:hover:scale-100",
              // No lead card. It was made wider "to lead", and with two insights
              // that produced one wide card beside one narrow one — the exact
              // uneven pair the owner kept pointing at. Equal cards, and the
              // ordering carries the hierarchy: the first one is the first one.
              ""
            )}
          >
            <span
              aria-hidden
              className={cn("absolute inset-y-0 left-0 w-1", tone.rule)}
            />
            <span
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                tone.chip
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t(locale, tone.name)}
              </span>
              <span className="mt-1 block text-[15px] font-medium leading-snug">
                {item.text}
              </span>
            </span>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        );
      })}
    </div>
  );
}
