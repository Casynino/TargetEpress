import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowDownLeft,
  CheckCircle2,
  Hourglass,
  Plane,
  TrendingUp,
  ArrowLeftRight,
  Banknote,
  ArrowUpRight,
  Calculator,
  CircleHelp,
  FileClock,
  HandCoins,
  PiggyBank,
  Receipt,
  ReceiptText,
  Warehouse,
} from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import { MoneyTile } from "@/components/app/money-tile";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { AgeingBar } from "@/components/charts/ageing-bar";
import { FlowBars } from "@/components/charts/flow-bars";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatRelative, formatWeight, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { accountBalances } from "@/lib/ledger";
import {
  agingInWarehouse,
  cashFlowByMonth,
  financeStats,
  receivablesAgeing,
} from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Finance") };
}

/**
 * The whole money position, on one screen.
 *
 * Two things this page is built around, both learned from what the business
 * actually does rather than from what the tables happen to contain:
 *
 * 1. WE PRICE IN DOLLARS AND GET PAID IN SHILLINGS. Every figure carries both.
 *    A page in dollars alone makes somebody at the counter convert in their
 *    head, at whatever rate they remember, while a customer waits.
 *
 * 2. MONEY WAITING ON FINANCE IS STILL MONEY. This page used to say
 *    "Outstanding USD 0.00" while eighty-four consignments worth USD 9,429 sat
 *    in the Dar warehouse with prices nobody had confirmed. Technically true —
 *    a draft is not a demand for payment — and completely wrong about the
 *    business. The queue that only Finance can clear is now the loudest thing
 *    on the page.
 */
export default async function FinanceOverviewPage() {
  const user = await requirePermission("accounting.view");
  const locale = await viewerLocale();
  // Support holds finance.view because Support answers questions about a
  // customer's bill. What the COMPANY is worth is a different question, and
  // every tile answering it is gated on this instead.
  const seesCompanyMoney = can(user.role, "account.view");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    stats,
    aging,
    recentPayments,
    rateRow,
    drafts,
    collectedThisMonth,
    activeNotes,
    position,
    balances,
    unattributed,
    spendThisMonth,
    unpaidCosts,
  ] = await Promise.all([
    financeStats(),
    agingInWarehouse(6),
    prisma.payment.findMany({
      orderBy: { paidAt: "desc" },
      take: 6,
      include: {
        receipt: true,
        account: { select: { name: true } },
        invoice: {
          select: {
            currency: true,
            shipment: { select: { trackingNumber: true } },
          },
        },
      },
    }),
    currentRate(),
    // The queue that only this desk can clear: cargo priced by the system and
    // waiting on a human to say yes. Invisible on this page until now.
    prisma.invoice.aggregate({
      where: { status: "DRAFT" },
      _sum: { total: true },
      _count: true,
    }),
    /*
      Cancelled payments are not collections — the aggregate had no voidedAt
      filter, so a payment recorded and then voided kept inflating the month.
      Fetched as rows rather than aggregated because creditedAmount is null on
      early records and SUM would silently drop them; the fallback to amount is
      the same rule the trend chart already applies.
    */
    prisma.payment.findMany({
      where: { paidAt: { gte: monthStart }, voidedAt: null },
      select: { amount: true, creditedAmount: true },
    }),
    // Cargo that is paid for and cleared to go, still sitting on the shelf.
    // Distinct from everything else on this row: the money is already in, and
    // what is left is a customer who has not turned up. It is the one figure
    // here that shrinks by someone making a phone call.
    prisma.pickupNote.findMany({
      where: { status: "ACTIVE" },
      select: { shipment: { select: { invoice: { select: { total: true } } } } },
    }),
    // Where the cargo physically is. On this page because every money figure
    // above is attached to a box sitting somewhere, and a manager reading
    // "TSh 25m waiting on your price" wants to know it is 84 consignments on
    // the Dar floor rather than something still in the air.
    prisma.shipment.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { weightKg: true },
    }),
    seesCompanyMoney ? accountBalances(prisma) : Promise.resolve([]),
    // Money taken with no account named. A job for this desk, not a statistic.
    seesCompanyMoney
      ? prisma.payment.aggregate({
          where: { accountId: null },
          _sum: { creditedAmount: true },
          _count: true,
        })
      : Promise.resolve(null),
    seesCompanyMoney
      ? prisma.expense.aggregate({
          where: { status: "PAID", paidAt: { gte: monthStart } },
          _sum: { amountUsd: true },
        })
      : Promise.resolve(null),
    seesCompanyMoney
      ? prisma.expense.aggregate({
          where: { status: { in: ["PENDING", "APPROVED"] } },
          _sum: { amountUsd: true },
          _count: true,
        })
      : Promise.resolve(null),
  ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const draftValue = toNumber(drafts._sum.total);
  const collectedMonth = collectedThisMonth.reduce(
    (sum, p) => sum + toNumber(p.creditedAmount ?? p.amount),
    0
  );
  const clearedNotCollected = activeNotes.reduce(
    (sum, note) => sum + toNumber(note.shipment.invoice?.total ?? 0),
    0
  );
  const cashOnHand = balances.reduce(
    (sum, row) => sum + toNumber(row.inflowUsd) - toNumber(row.outflowUsd),
    0
  );
  const unattributedUsd = toNumber(unattributed?._sum.creditedAmount ?? 0);
  const spentUsd = toNumber(spendThisMonth?._sum.amountUsd ?? 0);
  const owedOutUsd = toNumber(unpaidCosts?._sum.amountUsd ?? 0);
  const netMonth = collectedMonth - spentUsd;

  const countFor = (...statuses: string[]) =>
    position
      .filter((row) => statuses.includes(row.status))
      .reduce((n, row) => n + row._count._all, 0);
  const heldWeightKg = position
    .filter((row) => ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"].includes(row.status))
    .reduce((n, row) => n + toNumber(row._sum.weightKg), 0);

  /*
    The flights themselves, which this page never mentioned.

    Every figure above hangs off cargo, and cargo arrives on a flight — but the
    overview jumped from a cash balance to individual consignments with nothing
    in between, so the one unit the business is actually run on was missing.
    How many flew, how many are still open, and how many have had a line drawn
    under them.
  */
  const [ageing, flow, statements] = await Promise.all([
    receivablesAgeing(),
    cashFlowByMonth(new Date(), locale),
    /* What the closed flights actually made, and how many are still sitting
       with the boss. Read from the statements rather than recomputed, because
       a statement is the figure he signed. */
    prisma.batchStatement.findMany({
      select: {
        status: true,
        profitUsd: true,
        receivedUsd: true,
        collectedUsd: true,
        expensesUsd: true,
      },
    }),
  ]);

  const confirmed = statements.filter((row) => row.status === "CONFIRMED");
  const awaiting = statements.filter((row) => row.status === "SUBMITTED").length;
  const confirmedProfit = confirmed.reduce(
    (sum, row) => sum + (row.profitUsd === null ? 0 : toNumber(row.profitUsd)),
    0
  );

  const [flightsTotal, flightsOpen, flightsClosed] = await Promise.all([
    prisma.batch.count({ where: { permanent: false } }),
    prisma.batch.count({
      where: { permanent: false, closedAt: null, status: { not: "OPEN" } },
    }),
    prisma.batch.count({ where: { permanent: false, closedAt: { not: null } } }),
  ]);

  const wherever = [
    { label: "Waiting in China", value: countFor("READY_TO_DEPART") },
    { label: "In the air", value: countFor("IN_TRANSIT") },
    { label: "On the Dar floor", value: countFor("RECEIVED_AT_DAR") },
    { label: "Ready to collect", value: countFor("READY_FOR_PICKUP") },
    { label: "Delivered", value: countFor("DELIVERED") },
  ];

  // What actually needs somebody to do something, in the order it matters.
  //
  // This replaced eight equal cards. Three of them were showing the same
  // TSh 462,915 as each other and three more were showing zero, so the page
  // gave a queue of 84 unpriced consignments exactly as much weight as a nil
  // balance. A number nobody has to act on is reference; a number somebody has
  // to act on is work, and work goes first and looks different.
  const jobs = [
    {
      when: drafts._count > 0,
      label: `${drafts._count} ${t(
        locale,
        drafts._count === 1 ? "price to confirm" : "prices to confirm"
      )}`,
      detail: t(
        locale,
        "Priced by the system — cannot be billed until you sign them off"
      ),
      usd: draftValue,
      href: "/app/shipments",
      cta: t(locale, "Review by batch"),
      urgent: true,
    },
    {
      when: (unattributed?._count ?? 0) > 0,
      label: `${unattributed?._count} ${t(
        locale,
        unattributed?._count === 1
          ? "payment with no account"
          : "payments with no account"
      )}`,
      detail: t(locale, "Money we hold that nobody has said where it landed"),
      usd: unattributedUsd,
      href: "/app/finance/payments",
      cta: t(locale, "Say where it landed"),
      urgent: true,
    },
    {
      when: stats.unpaid + stats.partiallyPaid > 0,
      label: `${stats.unpaid + stats.partiallyPaid} ${t(
        locale,
        stats.unpaid + stats.partiallyPaid === 1 ? "bill unpaid" : "bills unpaid"
      )}`,
      detail: t(locale, "Confirmed and sent — the customer still owes it"),
      usd: stats.outstanding,
      href: "/app/collections/follow-up",
      cta: t(locale, "Chase"),
      urgent: false,
    },
    {
      when: activeNotes.length > 0,
      label: `${activeNotes.length} ${t(locale, "cleared, not collected")}`,
      detail: t(
        locale,
        "Paid for and released — waiting on the customer to turn up"
      ),
      usd: clearedNotCollected,
      href: "/app/finance/pickup-notes",
      cta: t(locale, "See notes"),
      urgent: false,
    },
    {
      when: seesCompanyMoney && (unpaidCosts?._count ?? 0) > 0,
      label: `${unpaidCosts?._count} ${t(
        locale,
        unpaidCosts?._count === 1 ? "cost to pay" : "costs to pay"
      )}`,
      detail: t(locale, "Recorded, not yet disbursed"),
      usd: owedOutUsd,
      href: "/app/finance/expenses",
      cta: t(locale, "Settle"),
      urgent: false,
    },
  ].filter((job) => job.when);

  const agingDrafts = aging.filter((s) => s.invoice?.status === "DRAFT").length;

  /**
   * The type size, chosen by how long the figure actually is.
   *
   * These cells were a fixed text-2xl with whitespace-nowrap inside a section
   * that clips its overflow, so the moment a number reached "TSh -10,882,296"
   * it ran under the cell's own edge and lost its last digits. A finance
   * headline that silently drops digits is worse than a smaller one.
   *
   * Sized by string length rather than measured, because the alternative is a
   * layout effect that reflows after paint — and this is server-rendered.
   * Millions and a minus sign step down one notch; billions step down two, and
   * still read as the same row.
   */
  const figureSize = (value: string) => {
    const n = value.length;
    if (n <= 11) return "text-xl 2xl:text-2xl";
    if (n <= 14) return "text-lg 2xl:text-xl";
    if (n <= 17) return "text-base 2xl:text-lg";
    return "text-sm 2xl:text-base";
  };

  const tsh = (usd: number) =>
    rate ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}` : formatUsd(usd);

  return (
    <>
      <PageHeader
        title={t(locale, "Overview")}
        description={t(
          locale,
          "The department at a glance: what the business is holding, what is owed to it, and how the batches are doing. Shown in shillings; the dollar figure is what the invoice says."
        )}
        actions={
          <Button asChild variant="brand" className="rounded-lg">
            <Link href="/app/shipments">
              <ReceiptText className="mr-2 h-4 w-4" />
              {t(locale, "Review prices by batch")}
            </Link>
          </Button>
        }
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      {/* ── One band: what we hold, what moved, and the three things this desk
             does. Everything a manager opens this page to know, above the
             fold and without a card grid to scan. */}
      {/* One band, full width.
             It was split with a "what you do here" column of three stacked
             buttons, two of which only navigated to tabs sitting directly
             above them — a second, heavier copy of the tab row. What is left
             are the three things somebody actually DOES from this desk, named
             as actions, as a toolbar under the figures rather than a column
             competing with them. */}
      {/*
        The money position, as a row rather than a billboard.

        It used to open with a 40px number on a card of its own. Cash available
        is not the most important thing on this page — it is one of four
        figures that only mean anything beside each other, and printing it four
        times the size of the rest pushed everything a finance clerk actually
        DOES below the fold. The four sit on one line now, the same size, and
        the actions sit with them instead of a screen away.
      */}
      <section className="mb-4 overflow-hidden rounded-xl border bg-card shadow-soft">
        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 2xl:grid-cols-6">
          {[
            {
              k: seesCompanyMoney
                ? t(locale, "Cash available")
                : t(locale, "Collected all time"),
              v: tsh(seesCompanyMoney ? cashOnHand : stats.collected),
              usd: formatUsd(seesCompanyMoney ? cashOnHand : stats.collected),
              tone: "text-foreground",
              wash: "from-brand/10",
              hint: seesCompanyMoney
                ? t(locale, "Every bank, till and the office tin")
                : t(locale, "Every payment received"),
            },
            {
              k: t(locale, "In this month"),
              v: tsh(collectedMonth),
              tone: "text-success",
              wash: "from-success/10",
              hint: t(locale, "Money that came in"),
            },
            ...(seesCompanyMoney
              ? [
                  {
                    k: t(locale, "Out this month"),
                    v: tsh(spentUsd),
                    tone: "text-destructive",
                    wash: "from-destructive/10",
                    hint: t(locale, "Costs paid"),
                  },
                  {
                    k: t(locale, "Net this month"),
                    v: tsh(netMonth),
                    tone: netMonth >= 0 ? "text-foreground" : "text-destructive",
                    wash: netMonth >= 0 ? "from-success/10" : "from-destructive/10",
                    hint: netMonth >= 0 ? t(locale, "Ahead") : t(locale, "Behind"),
                  },
                ]
              : []),
            /*
              What is coming, and what is standing in the warehouse.

              Money already banked is only half of what this desk has to know.
              Outstanding is the other half — it is the biggest figure on the
              page most weeks — and the weight held in Dar is what that money
              is actually sitting against. Both were further down the page than
              the cash, which is the wrong way round for the department that
              has to answer "what are we owed and what have we still got".
            */
            {
              k: t(locale, "Expected to come in"),
              v: tsh(stats.outstanding),
              usd: formatUsd(stats.outstanding),
              tone: stats.outstanding > 0 ? "text-signal" : "text-foreground",
              wash: "from-signal/10",
              hint: t(locale, "Billed and not yet paid"),
            },
            {
              k: t(locale, "Held in the warehouse"),
              v: formatWeight(heldWeightKg),
              tone: "text-foreground",
              wash: "from-info/10",
              hint: t(locale, "Landed in Dar, not handed over"),
            },
          ].map((cell) => (
            <div
              key={cell.k}
              className={`min-w-0 bg-gradient-to-b ${cell.wash} to-transparent bg-card px-4 py-4`}
            >
              <dt className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                {cell.k}
              </dt>
              <dd
                className={`mt-1 whitespace-nowrap font-display font-bold leading-tight tabular-nums ${figureSize(cell.v)} ${cell.tone}`}
              >
                {cell.v}
              </dd>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {cell.usd ?? cell.hint}
              </p>
            </div>
          ))}
        </dl>

        {/* The three things done from this desk, and the one number that every
            shilling on the page hangs off. */}
        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-5 py-2.5">
          {seesCompanyMoney ? (
            <>
              {/*
                Money in first, because it happens more often.

                It opens the ledger with the income panel already up rather
                than carrying a second copy of that form — one implementation
                of recording a payment, reachable from wherever somebody
                happens to be standing.
              */}
              <Button asChild variant="brand" size="sm" className="h-8 rounded-lg">
                <Link href="/app/finance/transactions?income=1">
                  <Banknote className="mr-1.5 h-3.5 w-3.5" />
                  {t(locale, "Record an income")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 rounded-lg">
                <Link href="/app/finance/expenses">
                  <Receipt className="mr-1.5 h-3.5 w-3.5" />
                  {t(locale, "Record a cost")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 rounded-lg">
                <Link href="/app/finance/accounts">
                  <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                  {t(locale, "Move money")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 rounded-lg">
                <Link href="/app/finance/accounts">
                  <Calculator className="mr-1.5 h-3.5 w-3.5" />
                  {t(locale, "Count the cash tin")}
                </Link>
              </Button>
            </>
          ) : null}
          <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
            {rate ? (
              <>
                1 USD ={" "}
                <span className="font-semibold text-brand">
                  {rate.toLocaleString()}
                </span>{" "}
                TSh
              </>
            ) : (
              <span className="text-destructive">{t(locale, "No rate set")}</span>
            )}
            <Link
              href="/app/finance/pricing"
              className="ml-2 font-sans font-medium text-brand hover:underline"
            >
              {t(locale, "change")}
            </Link>
          </span>
        </div>
      </section>


      {/*
        The batches, as a strip rather than four tall cards.

        They were the size of the money above them, and a count of three is not
        worth a card the height of a hand — most of each one was empty. The
        weight belongs on the figures at the top, which are the ones that
        change every hour; these three counts and the profit are a line you
        glance at. Same colours, a sixth of the room.
      */}
      <SectionLabel
        action={{ href: "/app/finance/income", label: t(locale, "What each one made") }}
      >
        {t(locale, "Batches")}
      </SectionLabel>
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        {[
          {
            label: t(locale, "Still open"),
            value: String(flightsOpen),
            tone: "text-brand",
            hint: t(locale, "Money can still move"),
            href: "/app/shipments",
          },
          {
            label: t(locale, "With the boss"),
            value: String(awaiting),
            tone: awaiting > 0 ? "text-warning" : "text-muted-foreground",
            hint: t(locale, "Waiting to be read"),
            href: "/app/finance/income",
          },
          {
            label: t(locale, "Confirmed"),
            value: String(confirmed.length),
            tone: "text-success",
            hint: t(locale, "Agreed and final"),
            href: "/app/finance/income",
          },
          {
            label: t(locale, "Profit, confirmed"),
            value: tsh(confirmedProfit),
            tone: confirmedProfit < 0 ? "text-destructive" : "text-success",
            hint: `${confirmed.length} ${t(locale, "batches")}`,
            href: "/app/finance/income",
          },
        ].map((cell) => (
          <Link
            key={cell.label}
            href={cell.href}
            className="group bg-card px-4 py-3 transition-colors hover:bg-accent"
          >
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {cell.label}
            </p>
            <p
              className={`mt-0.5 font-display text-xl font-bold tabular-nums ${cell.tone}`}
            >
              {cell.value}
            </p>
            <p className="text-[11px] text-muted-foreground">{cell.hint}</p>
          </Link>
        ))}
      </div>

      {/* ── The work. A list, not a card grid: each row is one job with the
             money attached and the door to go do it. */}
      <section className="mb-6 overflow-hidden rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t(locale, "Needs you")}
        </h2>
        {jobs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {t(
              locale,
              "Nothing is waiting. Every price is confirmed, every payment says where it landed, and nothing is owed either way."
            )}
          </p>
        ) : (
          <ul className="divide-y">
            {jobs.map((job) => (
              <li key={job.label}>
                <Link
                  href={job.href}
                  className="focus-ring flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-accent/50"
                >
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      job.urgent ? "bg-warning" : "bg-muted-foreground/40"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{job.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {job.detail}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-lg font-bold tabular-nums">
                      {tsh(job.usd)}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {formatUsd(job.usd)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-brand">
                    {job.cta} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        Where to go next, with the reason to go there on it.

        The tab row along the top says only what the pages are CALLED. It
        cannot say that four payments are waiting to be verified or that the
        boss sent a batch back this morning, so somebody had to open each tab
        to find out — which is the opposite of an overview. Every finance
        screen is here with the one number that decides whether it is worth
        opening, and a number that is zero is stated as nothing to do rather
        than left blank.
      */}
      <section className="mb-6">
        <SectionLabel>{t(locale, "The finance desk")}</SectionLabel>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: "/app/finance/payments",
              label: t(locale, "Verify payments"),
              why: t(locale, "What customers say they have sent"),
              count: unattributed?._count ?? 0,
              unit: t(locale, "waiting"),
              urgent: true,
            },
            {
              href: "/app/collections",
              label: t(locale, "Collections"),
              why: t(locale, "Bills nobody has paid yet"),
              count: stats.unpaid,
              unit: t(locale, "unpaid"),
              urgent: true,
            },
            {
              href: "/app/finance/income",
              label: t(locale, "Closed batches"),
              why: t(locale, "What each closed batch made"),
              count: awaiting,
              unit: t(locale, "with the boss"),
            },
            {
              href: "/app/finance/accounts",
              label: t(locale, "Accounts"),
              why: t(locale, "Every bank, till and the office tin"),
            },
            {
              href: "/app/finance/transactions",
              label: t(locale, "General ledger"),
              why: t(locale, "Every shilling in and out, in one register"),
            },
            {
              /* The route is /app/finance/reports — /app/finance/profit never
                 existed, and this door 404'd on the one desk that opens it. */
              href: "/app/finance/reports",
              label: t(locale, "Profit & loss"),
              why: t(locale, "Earned against spent, for a period"),
            },
          ].map((door) => (
            <Link
              key={door.href}
              href={door.href}
              className="group flex items-baseline gap-3 bg-card px-5 py-3.5 transition-colors hover:bg-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium group-hover:text-brand">
                  {door.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {door.why}
                </span>
              </span>
              {door.count === undefined ? null : door.count > 0 ? (
                <span
                  className={`shrink-0 text-xs font-semibold tabular-nums ${
                    door.urgent ? "text-destructive" : "text-signal"
                  }`}
                >
                  {door.count} {door.unit}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t(locale, "nothing waiting")}
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>


      {/* One line, because it is context for the money rather than a report of
          its own. Every figure above hangs off cargo that is somewhere. */}
      <section className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t(locale, "Where the cargo is")}
        </p>
        {wherever.map((item) => (
          <div key={item.label} className="flex items-baseline gap-2">
            <span className="font-display text-lg font-bold tabular-nums">
              {item.value}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(locale, item.label)}
            </span>
          </div>
        ))}
        <p className="ml-auto text-xs text-muted-foreground">
          {formatWeight(heldWeightKg)} {t(locale, "held in Dar")}
        </p>
      </section>

      {/* ── The two shapes the figures make.
             A balance says where the money is; these say which way it is
             going and how old what we are owed has become — the two questions
             a column of totals cannot answer. */}
      <SectionLabel
        action={{ href: "/app/finance/transactions", label: t(locale, "General ledger") }}
      >
        {t(locale, "The money, in shape")}
      </SectionLabel>
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">
              {t(locale, "Money in and out")}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(locale, "What arrived against what it cost, this year")}
            </p>
          </div>
          <FlowBars
            className="mt-3"
            labels={flow.labels}
            valuesIn={flow.moneyIn}
            valuesOut={flow.moneyOut}
            currentIndex={flow.currentIndex}
            format={(usd: number) =>
              rate
                ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}`
                : formatUsd(usd)
            }
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
            {ageing.oldestDays > 0 ? (
              <p className="shrink-0 text-right text-xs text-muted-foreground">
                {t(locale, "oldest")}{" "}
                <span className="font-mono font-semibold text-foreground">
                  {ageing.oldestDays}d
                </span>
              </p>
            ) : null}
          </div>
          <AgeingBar
            className="mt-3"
            segments={ageing.buckets.map((bucket) => ({
              key: bucket.key,
              label: t(locale, bucket.label),
              count: bucket.count,
              value: bucket.usd,
            }))}
            format={(usd: number) =>
              rate
                ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}`
                : formatUsd(usd)
            }
            unit={{ one: t(locale, "bill"), many: t(locale, "bills") }}
            empty={t(locale, "Nothing is owed. Every bill raised has been settled.")}
          />
        </section>
      </div>

      {/* ── Two registers, as tables.
             They were lists of tall rows with the amount, the dollar figure, a
             badge and a timestamp all stacked ragged down the right edge — four
             things in a column, six rows deep, and the same amber badge on
             every single one because every price is unconfirmed. Nothing could
             be compared down a column because nothing shared a column.
             One line per row now, aligned, and the badge that was true of
             everything is said once in the subtitle. */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
            <div className="min-w-0">
              <h2 className="font-semibold">{t(locale, "Longest waiting")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(locale, "On the Dar floor, oldest first")}
                {agingDrafts === aging.length && aging.length > 0
                  ? ` · ${t(
                      locale,
                      "none of these prices are confirmed yet"
                    )}`
                  : agingDrafts > 0
                    ? ` · ${agingDrafts} ${t(
                        locale,
                        agingDrafts === 1
                          ? "price not confirmed"
                          : "prices not confirmed"
                      )}`
                    : ""}
              </p>
            </div>
            <Link
              href="/app/collections/follow-up"
              className="shrink-0 text-xs font-medium text-brand hover:underline"
            >
              {t(locale, "Payment follow-up →")}
            </Link>
          </div>

          {aging.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {t(locale, "Nothing is waiting on the floor.")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Cargo")}</TableHead>
                  <TableHead>{t(locale, "Customer")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t(locale, "Waiting")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Worth")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.map((shipment) => {
                  const invoice = shipment.invoice;
                  const owing = invoice
                    ? toNumber(invoice.total) - toNumber(invoice.amountPaid)
                    : null;
                  const draft = invoice?.status === "DRAFT";
                  return (
                    <TableRow key={shipment.id}>
                      <TableCell className="py-2.5">
                        <Link
                          href={`/app/cargo/${shipment.trackingNumber}`}
                          className="font-mono text-xs tabular hover:text-brand"
                        >
                          {shipment.trackingNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[11rem] py-2.5">
                        <span className="block truncate text-sm">
                          {shipment.customer.name}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {shipment.customer.phone}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell py-2.5 text-xs text-muted-foreground">
                        {formatRelative(shipment.arrivedAt, locale)}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums">
                          {/* An unconfirmed price is marked once, here, rather
                              than with a badge on every row. */}
                          {draft ? (
                            <span
                              aria-label={t(locale, "price not confirmed")}
                              title={t(locale, "Price not confirmed")}
                              className="mr-1.5 text-warning"
                            >
                              •
                            </span>
                          ) : null}
                          {owing === null ? "—" : tsh(owing)}
                        </span>
                        {owing !== null && rate ? (
                          <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                            {formatUsd(owing)}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
            <div className="min-w-0">
              <h2 className="font-semibold">{t(locale, "Recent payments")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(locale, "What was handed over, and where it landed")}
              </p>
            </div>
            <Link
              href="/app/finance/payments"
              className="shrink-0 text-xs font-medium text-brand hover:underline"
            >
              {t(locale, "All payments →")}
            </Link>
          </div>

          {recentPayments.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {t(locale, "No payments recorded yet.")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Receipt")}</TableHead>
                  <TableHead>{t(locale, "Cargo")}</TableHead>
                  <TableHead>{t(locale, "Landed in")}</TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Taken")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="py-2.5 font-mono text-xs tabular text-muted-foreground">
                      {payment.receipt?.receiptNumber ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Link
                        href={`/app/cargo/${payment.invoice.shipment.trackingNumber}`}
                        className="font-mono text-xs tabular hover:text-brand"
                      >
                        {payment.invoice.shipment.trackingNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="py-2.5 text-xs">
                      {payment.account?.name ?? (
                        <span className="text-warning">
                          {t(locale, "no account named")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      {/* What was actually handed over — the receipt says this. */}
                      <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums">
                        {formatMoney(payment.amount, payment.currency)}
                      </span>
                      {payment.currency !== payment.invoice.currency &&
                      payment.creditedAmount !== null ? (
                        <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                          {t(locale, "settled")}{" "}
                          {formatUsd(toNumber(payment.creditedAmount))}
                        </span>
                      ) : (
                        <span className="block text-xs capitalize text-muted-foreground">
                          {t(
                            locale,
                            payment.method.replace("_", " ").toLowerCase()
                          )}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
