import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowDownLeft,
  CheckCircle2,
  Hourglass,
  Plane,
  TrendingUp,
  ArrowLeftRight,
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
    prisma.payment.aggregate({
      where: { paidAt: { gte: monthStart } },
      _sum: { creditedAmount: true },
      _count: true,
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
  const collectedMonth = toNumber(collectedThisMonth._sum.creditedAmount);
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
      cta: t(locale, "Review by flight"),
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

  const tsh = (usd: number) =>
    rate ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}` : formatUsd(usd);

  return (
    <>
      <PageHeader
        title={t(locale, "Overview")}
        description={t(
          locale,
          "The department at a glance: what the business is holding, what is owed to it, and how the flights are doing. Shown in shillings; the dollar figure is what the invoice says."
        )}
        actions={
          <Button asChild variant="brand" className="rounded-lg">
            <Link href="/app/shipments">
              <ReceiptText className="mr-2 h-4 w-4" />
              {t(locale, "Review prices by flight")}
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
      <section className="mb-6 rounded-2xl border bg-card p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <PiggyBank className="h-4 w-4 text-brand" />
          {seesCompanyMoney
            ? t(locale, "Cash available")
            : t(locale, "Collected all time")}
        </p>
        <p className="mt-2 font-display text-[40px] font-bold leading-none tracking-tight tabular-nums">
          {rate ? (
            <>
              <span className="text-xl font-semibold text-muted-foreground">
                TSh{" "}
              </span>
              {Math.round(
                (seesCompanyMoney ? cashOnHand : stats.collected) * rate
              ).toLocaleString("en-US")}
            </>
          ) : (
            formatUsd(seesCompanyMoney ? cashOnHand : stats.collected)
          )}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {seesCompanyMoney
            ? t(
                locale,
                "Across every bank, till and the office tin — derived from the ledger"
              )
            : t(locale, "Every payment received")}{" "}
          · {formatUsd(seesCompanyMoney ? cashOnHand : stats.collected)}{" "}
          {t(locale, "on the invoice")}
        </p>

        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3 border-t pt-4">
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
              {t(locale, "In this month")}
            </dt>
            <dd className="mt-0.5 font-display text-lg font-bold tabular-nums text-success">
              {tsh(collectedMonth)}
            </dd>
          </div>
          {seesCompanyMoney ? (
            <>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  {t(locale, "Out this month")}
                </dt>
                <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
                  {tsh(spentUsd)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t(locale, "Net")}
                </dt>
                <dd
                  className={`mt-0.5 font-display text-lg font-bold tabular-nums ${
                    netMonth >= 0 ? "" : "text-destructive"
                  }`}
                >
                  {tsh(netMonth)}
                </dd>
              </div>
            </>
          ) : null}
          <div className="ml-auto">
            <dt className="text-xs text-muted-foreground">
              {t(locale, "Rate today")}
            </dt>
            <dd className="mt-0.5 font-mono text-sm tabular-nums">
              {rate ? (
                <>
                  1 USD ={" "}
                  <span className="font-semibold text-brand">
                    {rate.toLocaleString()}
                  </span>{" "}
                  TSh
                </>
              ) : (
                <span className="text-destructive">{t(locale, "not set")}</span>
              )}
              <Link
                href="/app/finance/pricing"
                className="ml-2 text-xs font-medium text-brand hover:underline"
              >
                {t(locale, "change")}
              </Link>
            </dd>
          </div>
        </dl>

        {/* Verbs, and only things that are actually done rather than merely
            looked at. Anything that is just a page lives in the tab row. */}
        {seesCompanyMoney ? (
          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            <Button asChild variant="brand" size="sm" className="rounded-lg">
              <Link href="/app/finance/expenses">
                <Receipt className="mr-2 h-4 w-4" />
                {t(locale, "Record a cost")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href="/app/finance/accounts">
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                {t(locale, "Move money between accounts")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href="/app/finance/accounts">
                <Calculator className="mr-2 h-4 w-4" />
                {t(locale, "Count the cash tin")}
              </Link>
            </Button>
          </div>
        ) : null}
      </section>

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

      {/*
        The flights, as cards rather than a strip.

        Cargo sits on a flight, and a flight is the unit the boss asks about —
        so the page that summarises the department has to answer it in the same
        weight as it answers cash. Three states, because those are the three
        that mean different things: still trading, shut and waiting on the
        boss, and signed off.
      */}
      <SectionLabel
        action={{ href: "/app/finance/income", label: t(locale, "What each one made") }}
      >
        {t(locale, "Flights")}
      </SectionLabel>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/*
          Counts, not money — so they are count cards.

          A MoneyTile leads with a currency figure, and three flights is not a
          currency figure. Rendering them as money put "USD 0.00" in the largest
          type on the card and hid the only number that mattered in the caption
          underneath it.
        */}
        <KpiCard
          label={t(locale, "Still open")}
          numeric={flightsOpen}
          hint={t(
            locale,
            "Flying, landed or being collected. Money can still move on these."
          )}
          icon={Plane}
          tone="brand"
          href="/app/shipments"
        />
        <KpiCard
          label={t(locale, "With the boss")}
          numeric={awaiting}
          hint={t(
            locale,
            "Closed by Finance, and not finished until he has read the statement."
          )}
          icon={Hourglass}
          tone={awaiting > 0 ? "warning" : "info"}
          href="/app/finance/income"
        />
        <KpiCard
          label={t(locale, "Confirmed")}
          numeric={confirmed.length}
          hint={t(locale, "The boss has agreed these figures. They are the record.")}
          icon={CheckCircle2}
          tone="success"
          href="/app/finance/income"
        />
        <MoneyTile
          label={t(locale, "Profit, confirmed flights")}
          usd={confirmedProfit}
          rate={rate}
          icon={TrendingUp}
          tone={confirmedProfit < 0 ? "bad" : "good"}
          count={`${confirmed.length} ${t(locale, "flights")}`}
          hint={t(
            locale,
            "Billed less every cost recorded against the flight, on the ones he has signed."
          )}
          href="/app/finance/income"
        />
      </div>

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
