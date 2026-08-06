import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CircleHelp,
  FileClock,
  HandCoins,
  PiggyBank,
  Receipt,
  ReceiptText,
  Warehouse,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { MoneyTile } from "@/components/app/money-tile";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatRelative, formatWeight, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { accountBalances } from "@/lib/ledger";
import { agingInWarehouse, financeStats } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Finance" };

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
  const user = await requirePermission("finance.view");
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

  const wherever = [
    { label: "Waiting in China", value: countFor("READY_TO_DEPART") },
    { label: "In the air", value: countFor("IN_TRANSIT") },
    { label: "On the Dar floor", value: countFor("RECEIVED_AT_DAR") },
    { label: "Ready to collect", value: countFor("READY_FOR_PICKUP") },
    { label: "Delivered", value: countFor("DELIVERED") },
  ];

  return (
    <>
      <PageHeader
        title="Finance"
        description="What is owed, what has been collected, and what the company is holding. Priced in dollars, paid in shillings — every figure says both."
        actions={
          <Button asChild variant="brand" className="rounded-lg">
            {/* Prices are reviewed a flight at a time, on the dispatch —
                which is where the Confirm all button lives. */}
            <Link href="/app/shipments">
              <ReceiptText className="mr-2 h-4 w-4" />
              Review prices by flight
            </Link>
          </Button>
        }
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      {/* The rate every figure below is converted at, stated once, at the top.
          It is the single number that moves every shilling figure on this
          page, so it is not left to be discovered on another tab. */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border bg-card px-4 py-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <ArrowLeftRight className="h-4 w-4" />
        </span>
        {rate ? (
          <>
            <div>
              <p className="font-display text-lg font-bold leading-none tabular-nums">
                1 USD ={" "}
                <span className="text-brand">{rate.toLocaleString()}</span> TSh
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Every shilling figure below is converted at this rate
                {rateRow?.effectiveFrom
                  ? ` · set ${formatRelative(rateRow.effectiveFrom)}`
                  : ""}
              </p>
            </div>
          </>
        ) : (
          <div>
            <p className="font-medium text-destructive">
              No exchange rate is published
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing on this page can be quoted in shillings until there is one.
            </p>
          </div>
        )}
        <Link
          href="/app/finance/pricing"
          className="focus-ring ml-auto rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          {rate ? "Change rate" : "Set a rate"}
        </Link>
      </div>

      {/* Cash available, first and biggest.
          This desk's standing question is "have we got the money", asked in
          shillings, and it should never be something you scroll or convert to
          find. The actions beside it are the two things this desk does all day
          — take money in, and record what went out. */}
      {seesCompanyMoney ? (
        <section className="relative mb-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-brand/10 via-card to-card p-6">
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <PiggyBank className="h-4 w-4 text-brand" />
                Cash available
              </p>
              <p className="mt-2 font-display text-[40px] font-bold leading-none tracking-tight tabular-nums">
                {rate ? (
                  <>
                    <span className="text-xl font-semibold text-muted-foreground">
                      TSh{" "}
                    </span>
                    {Math.round(cashOnHand * rate).toLocaleString("en-US")}
                  </>
                ) : (
                  formatUsd(cashOnHand)
                )}
              </p>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Everything the business is holding right now, across the banks,
                the mobile-money tills and the office tin — worked out live from
                the ledger, so it cannot drift.
                {rate ? (
                  <span className="ml-1 font-mono text-xs">
                    ({formatUsd(cashOnHand)} on the invoice rate)
                  </span>
                ) : null}
              </p>
            </div>

            <div className="w-full shrink-0 sm:w-auto">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Quick actions
              </p>
              <div className="flex flex-col gap-2">
                <Button asChild variant="brand" className="justify-start rounded-lg">
                  <Link href="/app/finance/expenses">
                    <Receipt className="mr-2 h-4 w-4" />
                    Record a cost
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start rounded-lg">
                  <Link href="/app/finance/accounts">
                    <ArrowLeftRight className="mr-2 h-4 w-4" />
                    Move money / count cash
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start rounded-lg">
                  <Link href="/app/finance/payments">
                    <Banknote className="mr-2 h-4 w-4" />
                    See payments taken
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── What customers owe us ─────────────────────────────────────────── */}
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Money from customers
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* First, because it is the only queue on this page that nobody else
            in the company can clear. */}
        <MoneyTile
          label="Waiting on your price"
          usd={draftValue}
          rate={rate}
          icon={FileClock}
          tone={drafts._count > 0 ? "warn" : "good"}
          emphasis={drafts._count > 0}
          count={
            drafts._count > 0
              ? `${drafts._count} consignment${drafts._count === 1 ? "" : "s"}`
              : undefined
          }
          hint={
            drafts._count > 0
              ? "Priced by the system, not yet confirmed — cannot be billed or collected"
              : "Every price is confirmed"
          }
          href="/app/shipments"
        />
        <MoneyTile
          label="To collect"
          usd={stats.outstanding}
          rate={rate}
          icon={HandCoins}
          tone={stats.outstanding > 0 ? "warn" : "good"}
          count={
            stats.unpaid + stats.partiallyPaid > 0
              ? `${stats.unpaid} unpaid · ${stats.partiallyPaid} part-paid`
              : undefined
          }
          hint="Confirmed bills the customer still owes"
        />
        <MoneyTile
          label="Collected this month"
          usd={collectedMonth}
          rate={rate}
          icon={Banknote}
          tone="good"
          count={`${collectedThisMonth._count} payment${collectedThisMonth._count === 1 ? "" : "s"}`}
          hint={`${formatUsd(stats.collected)} all time`}
          href="/app/finance/payments"
        />
        <MoneyTile
          label="Cleared, not collected"
          usd={clearedNotCollected}
          rate={rate}
          icon={Warehouse}
          tone={activeNotes.length > 0 ? "brand" : "good"}
          count={
            activeNotes.length > 0
              ? `${activeNotes.length} pickup note${activeNotes.length === 1 ? "" : "s"} open`
              : undefined
          }
          hint="Paid for and released — waiting on the customer to collect"
          href="/app/finance/pickup-notes"
        />
      </div>

      {/* ── The company's own money ───────────────────────────────────────── */}
      {seesCompanyMoney ? (
        <>
          <h2 className="mb-3 mt-6 text-sm font-semibold text-muted-foreground">
            The company&rsquo;s money
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MoneyTile
              label="No account named"
              usd={unattributedUsd}
              rate={rate}
              icon={CircleHelp}
              tone={(unattributed?._count ?? 0) > 0 ? "warn" : "good"}
              count={
                (unattributed?._count ?? 0) > 0
                  ? `${unattributed?._count} payment${unattributed?._count === 1 ? "" : "s"}`
                  : undefined
              }
              hint={
                (unattributed?._count ?? 0) > 0
                  ? "Money we have, but nobody said which account it went into"
                  : "Every payment says where it landed"
              }
              href="/app/finance/payments"
            />
            <MoneyTile
              label="Spent this month"
              usd={spentUsd}
              rate={rate}
              icon={ArrowUpRight}
              tone={spentUsd > 0 ? "warn" : "default"}
              hint="Costs that have actually left an account"
              href="/app/finance/expenses"
            />
            <MoneyTile
              label="Bills to pay"
              usd={owedOutUsd}
              rate={rate}
              icon={FileClock}
              tone={owedOutUsd > 0 ? "warn" : "good"}
              count={
                (unpaidCosts?._count ?? 0) > 0
                  ? `${unpaidCosts?._count} cost${unpaidCosts?._count === 1 ? "" : "s"} waiting`
                  : undefined
              }
              hint="Recorded, not yet disbursed"
              href="/app/finance/expenses"
            />
            <MoneyTile
              label="This month, in minus out"
              usd={netMonth}
              rate={rate}
              icon={Banknote}
              tone={netMonth >= 0 ? "good" : "bad"}
              hint={
                can(user.role, "profit.view")
                  ? "Cash movement only — profit is on Profit & loss"
                  : "Money collected less money paid out this month"
              }
              href="/app/finance/reports"
            />
          </div>
        </>
      ) : null}

      {/* One line, because it is context for the money rather than a report of
          its own. Every figure above hangs off cargo that is somewhere. */}
      <section className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Where the cargo is
        </p>
        {wherever.map((item) => (
          <div key={item.label} className="flex items-baseline gap-2">
            <span className="font-display text-lg font-bold tabular-nums">
              {item.value}
            </span>
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
        <p className="ml-auto text-xs text-muted-foreground">
          {formatWeight(heldWeightKg)} held in Dar
        </p>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-display font-semibold">Longest waiting</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cargo sitting in Dar, oldest first
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/support/follow-up">Full chase queue</Link>
            </Button>
          </div>
          {aging.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nothing waiting" />
            </div>
          ) : (
            <ul className="divide-y">
              {aging.map((shipment) => {
                const invoice = shipment.invoice;
                const owing = invoice
                  ? toNumber(invoice.total) - toNumber(invoice.amountPaid)
                  : null;
                const draft = invoice?.status === "DRAFT";
                return (
                  <li
                    key={shipment.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/app/cargo/${shipment.trackingNumber}`}
                        className="font-mono text-sm tabular hover:text-brand"
                      >
                        {shipment.trackingNumber}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {shipment.customer.name} · {shipment.customer.phone}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-base font-bold tabular-nums">
                        {owing === null ? "Not priced" : formatUsd(owing)}
                      </p>
                      {/* The shilling figure is the one actually read down a
                          phone to a customer, so it is legible rather than a
                          grey caption. */}
                      {rate && owing !== null ? (
                        <p className="font-mono text-xs font-semibold tabular-nums">
                          TSh {Math.round(owing * rate).toLocaleString()}
                        </p>
                      ) : null}
                      {/* Said plainly, because ringing a customer for a figure
                          Finance has not confirmed is how a bill gets argued
                          about. */}
                      {draft ? (
                        <Badge
                          variant="outline"
                          className="mt-1 border-warning/40 font-normal text-warning"
                        >
                          price not confirmed
                        </Badge>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatRelative(shipment.arrivedAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-display font-semibold">Recent payments</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                What was handed over, and where it landed
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/finance/payments">All payments</Link>
            </Button>
          </div>
          {recentPayments.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No payments recorded yet" />
            </div>
          ) : (
            <ul className="divide-y">
              {recentPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm tabular">
                      {payment.invoice.shipment.trackingNumber}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {payment.receipt?.receiptNumber} ·{" "}
                      {payment.account?.name ?? (
                        <span className="text-warning">no account named</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    {/* What the customer actually handed over — usually
                        shillings — with what it settled underneath. */}
                    <p className="text-sm font-medium tabular">
                      {formatMoney(payment.amount, payment.currency)}
                    </p>
                    {payment.currency !== payment.invoice.currency &&
                    payment.creditedAmount !== null ? (
                      <p className="text-xs text-muted-foreground">
                        settled {formatUsd(toNumber(payment.creditedAmount))}
                      </p>
                    ) : (
                      <p className="text-xs capitalize text-muted-foreground">
                        {payment.method.replace("_", " ").toLowerCase()}
                      </p>
                    )}
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
