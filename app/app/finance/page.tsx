import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowDownLeft,
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

import { MoneyTile } from "@/components/app/money-tile";
import { PageHeader } from "@/components/app/page-header";
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
      label: `${drafts._count} price${drafts._count === 1 ? "" : "s"} to confirm`,
      detail: "Priced by the system — cannot be billed until you sign them off",
      usd: draftValue,
      href: "/app/shipments",
      cta: "Review by flight",
      urgent: true,
    },
    {
      when: (unattributed?._count ?? 0) > 0,
      label: `${unattributed?._count} payment${unattributed?._count === 1 ? "" : "s"} with no account`,
      detail: "Money we hold that nobody has said where it landed",
      usd: unattributedUsd,
      href: "/app/finance/payments",
      cta: "Say where it landed",
      urgent: true,
    },
    {
      when: stats.unpaid + stats.partiallyPaid > 0,
      label: `${stats.unpaid + stats.partiallyPaid} bill${stats.unpaid + stats.partiallyPaid === 1 ? "" : "s"} unpaid`,
      detail: "Confirmed and sent — the customer still owes it",
      usd: stats.outstanding,
      href: "/app/support/follow-up",
      cta: "Chase",
      urgent: false,
    },
    {
      when: activeNotes.length > 0,
      label: `${activeNotes.length} cleared, not collected`,
      detail: "Paid for and released — waiting on the customer to turn up",
      usd: clearedNotCollected,
      href: "/app/finance/pickup-notes",
      cta: "See notes",
      urgent: false,
    },
    {
      when: seesCompanyMoney && (unpaidCosts?._count ?? 0) > 0,
      label: `${unpaidCosts?._count} cost${unpaidCosts?._count === 1 ? "" : "s"} to pay`,
      detail: "Recorded, not yet disbursed",
      usd: owedOutUsd,
      href: "/app/finance/expenses",
      cta: "Settle",
      urgent: false,
    },
  ].filter((job) => job.when);

  const agingDrafts = aging.filter((s) => s.invoice?.status === "DRAFT").length;

  const tsh = (usd: number) =>
    rate ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}` : formatUsd(usd);

  return (
    <>
      <PageHeader
        title="General ledger"
        description="What the business is holding, what is owed to it, and what has moved. Shown in shillings; the dollar figure is what the invoice says."
        actions={
          <Button asChild variant="brand" className="rounded-lg">
            <Link href="/app/shipments">
              <ReceiptText className="mr-2 h-4 w-4" />
              Review prices by flight
            </Link>
          </Button>
        }
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      {/* ── One band: what we hold, what moved, and the three things this desk
             does. Everything a manager opens this page to know, above the
             fold and without a card grid to scan. */}
      <section className="mb-6 overflow-hidden rounded-2xl border bg-card">
        <div className="grid lg:grid-cols-[1.35fr_1fr]">
          <div className="border-b p-6 lg:border-b-0 lg:border-r">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <PiggyBank className="h-4 w-4 text-brand" />
              {seesCompanyMoney ? "Cash available" : "Collected all time"}
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
                ? "Across every bank, till and the office tin — derived from the ledger"
                : "Every payment received"}{" "}
              · {formatUsd(seesCompanyMoney ? cashOnHand : stats.collected)} on
              the invoice
            </p>

            {/* This month, as a movement rather than two more cards. */}
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t pt-4">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                  In this month
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
                      Out this month
                    </dt>
                    <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
                      {tsh(spentUsd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Net</dt>
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
                <dt className="text-xs text-muted-foreground">Rate today</dt>
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
                    <span className="text-destructive">not set</span>
                  )}
                  <Link
                    href="/app/finance/pricing"
                    className="ml-2 text-xs font-medium text-brand hover:underline"
                  >
                    change
                  </Link>
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-muted/20 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              What you do here
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {seesCompanyMoney ? (
                <Button asChild variant="brand" className="justify-start rounded-lg">
                  <Link href="/app/finance/expenses">
                    <Receipt className="mr-2 h-4 w-4" />
                    Record a cost
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" className="justify-start rounded-lg">
                <Link href="/app/finance/payments">
                  <Banknote className="mr-2 h-4 w-4" />
                  Payments taken
                </Link>
              </Button>
              {seesCompanyMoney ? (
                <Button asChild variant="outline" className="justify-start rounded-lg">
                  <Link href="/app/finance/accounts">
                    <ArrowLeftRight className="mr-2 h-4 w-4" />
                    Move money · count cash
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── The work. A list, not a card grid: each row is one job with the
             money attached and the door to go do it. */}
      <section className="mb-6 overflow-hidden rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Needs you
        </h2>
        {jobs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Nothing is waiting. Every price is confirmed, every payment says
            where it landed, and nothing is owed either way.
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
                    <span className="block font-mono text-[11px] text-muted-foreground">
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

      {/* ── Two registers, as tables.
             They were lists of tall rows with the amount, the dollar figure, a
             badge and a timestamp all stacked ragged down the right edge — four
             things in a column, six rows deep, and the same amber badge on
             every single one because every price is unconfirmed. Nothing could
             be compared down a column because nothing shared a column.
             One line per row now, aligned, and the badge that was true of
             everything is said once in the subtitle. */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
            <div className="min-w-0">
              <h2 className="font-semibold">Longest waiting</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                On the Dar floor, oldest first
                {agingDrafts === aging.length && aging.length > 0
                  ? " · none of these prices are confirmed yet"
                  : agingDrafts > 0
                    ? ` · ${agingDrafts} price${agingDrafts === 1 ? "" : "s"} not confirmed`
                    : ""}
              </p>
            </div>
            <Link
              href="/app/support/follow-up"
              className="shrink-0 text-xs font-medium text-brand hover:underline"
            >
              Full chase queue →
            </Link>
          </div>

          {aging.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              Nothing is waiting on the floor.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Waiting</TableHead>
                  <TableHead className="text-right">Worth</TableHead>
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
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {shipment.customer.phone}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell py-2.5 text-xs text-muted-foreground">
                        {formatRelative(shipment.arrivedAt)}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums">
                          {/* An unconfirmed price is marked once, here, rather
                              than with a badge on every row. */}
                          {draft ? (
                            <span
                              aria-label="price not confirmed"
                              title="Price not confirmed"
                              className="mr-1.5 text-warning"
                            >
                              •
                            </span>
                          ) : null}
                          {owing === null ? "—" : tsh(owing)}
                        </span>
                        {owing !== null && rate ? (
                          <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
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
              <h2 className="font-semibold">Recent payments</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                What was handed over, and where it landed
              </p>
            </div>
            <Link
              href="/app/finance/payments"
              className="shrink-0 text-xs font-medium text-brand hover:underline"
            >
              All payments →
            </Link>
          </div>

          {recentPayments.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Landed in</TableHead>
                  <TableHead className="text-right">Taken</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="py-2.5 font-mono text-[11px] tabular text-muted-foreground">
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
                        <span className="text-warning">no account named</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      {/* What was actually handed over — the receipt says this. */}
                      <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums">
                        {formatMoney(payment.amount, payment.currency)}
                      </span>
                      {payment.currency !== payment.invoice.currency &&
                      payment.creditedAmount !== null ? (
                        <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                          settled {formatUsd(toNumber(payment.creditedAmount))}
                        </span>
                      ) : (
                        <span className="block text-[11px] capitalize text-muted-foreground">
                          {payment.method.replace("_", " ").toLowerCase()}
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
