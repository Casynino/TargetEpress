import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowUpRight,
  Banknote,
  FileClock,
  Package,
  PiggyBank,
  QrCode,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { DEFAULT_CURRENCY } from "@/lib/constants";
// Invoices are denominated in USD; formatMoney defaults to TZS and was
// putting a shilling label on dollar figures.
import { formatUsd } from "@/lib/fx";
import { formatMoney, formatRelative, toNumber } from "@/lib/format";
import { accountBalances } from "@/lib/ledger";
import { agingInWarehouse, financeStats } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Finance" };

export default async function FinanceOverviewPage() {
  const user = await requirePermission("finance.view");
  // Support holds finance.view, because Support answers questions about a
  // customer's bill. What the COMPANY is worth is a different question, and
  // every tile below that answers it is gated separately.
  const seesCompanyMoney = can(user.role, "account.view");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [stats, aging, recentPayments, balances, spendThisMonth, unpaidCosts] =
    await Promise.all([
    financeStats(),
    agingInWarehouse(8),
    prisma.payment.findMany({
      orderBy: { paidAt: "desc" },
      take: 8,
      include: {
        receipt: true,
        receivedBy: { select: { name: true } },
        invoice: {
          select: { shipment: { select: { trackingNumber: true } } },
        },
      },
    }),
    seesCompanyMoney ? accountBalances(prisma) : Promise.resolve([]),
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

  // Everything the business holds, across accounts of different currencies,
  // in the one unit they can honestly be added in.
  const cashOnHandUsd = balances.reduce(
    (sum, row) => sum + toNumber(row.inflowUsd) - toNumber(row.outflowUsd),
    0
  );
  const spentUsd = toNumber(spendThisMonth?._sum.amountUsd ?? 0);
  const owedOutUsd = toNumber(unpaidCosts?._sum.amountUsd ?? 0);

  return (
    <>
      <PageHeader
        title="Finance"
        description="Money in, money owed, and the cargo waiting on it."
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Collected"
          value={formatUsd(stats.collected)}
          hint="All time"
          icon={Banknote}
          tone="success"
          href="/app/finance/payments"
        />
        <StatCard
          label="Outstanding"
          value={formatUsd(stats.outstanding)}
          hint={`${stats.unpaid} unpaid · ${stats.partiallyPaid} part-paid`}
          icon={Wallet}
          tone={stats.outstanding > 0 ? "warning" : "success"}
          href="/app/finance/invoices?status=UNPAID"
        />
        <StatCard
          label="Awaiting invoice"
          value={stats.awaitingInvoice}
          hint="Cargo not yet billed"
          icon={Package}
          tone="brand"
          href="/app/finance/invoices?view=uninvoiced"
        />
        <StatCard
          label="Active pickup notes"
          value={stats.activeNotes}
          hint="Cleared, not collected"
          icon={QrCode}
          tone="info"
          href="/app/finance/pickup-notes"
        />
      </div>

      {/* The company's own position, which is a different question from a
          customer's bill. Support reaches this page through finance.view and
          must not see any of it — so the whole row is gated, not restyled. */}
      {seesCompanyMoney ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Cash on hand"
            value={formatUsd(cashOnHandUsd)}
            hint="Across every account"
            icon={PiggyBank}
            tone="brand"
            href="/app/finance/accounts"
          />
          <StatCard
            label="Spent this month"
            value={formatUsd(spentUsd)}
            hint="Costs actually paid"
            icon={ArrowUpRight}
            tone={spentUsd > 0 ? "warning" : "info"}
            href="/app/finance/expenses"
          />
          <StatCard
            label="Bills to pay"
            value={formatUsd(owedOutUsd)}
            hint={`${unpaidCosts?._count ?? 0} cost(s) waiting`}
            icon={FileClock}
            tone={owedOutUsd > 0 ? "warning" : "success"}
            href="/app/finance/expenses"
          />
          {/* Deliberately not called profit. Profit counts a cost from the day
              it was INCURRED; this counts money that actually moved. Both are
              true and they answer different questions — the real P&L is on the
              reports page and says so. */}
          <StatCard
            label="Money in, money out"
            value={formatUsd(stats.collected - spentUsd)}
            hint="Collected all time, less paid out this month"
            icon={Banknote}
            tone={stats.collected - spentUsd >= 0 ? "success" : "danger"}
            href="/app/finance/transactions"
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-display font-semibold">Chase list</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/support/follow-up">Full chase queue</Link>
            </Button>
          </div>
          {aging.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nothing to chase" />
            </div>
          ) : (
            <ul className="divide-y">
              {aging.map((shipment) => {
                const outstanding = shipment.invoice
                  ? toNumber(shipment.invoice.total) -
                    toNumber(shipment.invoice.amountPaid)
                  : null;
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
                    <div className="text-right">
                      <p className="text-sm font-medium tabular">
                        {outstanding === null
                          ? "Not invoiced"
                          : formatMoney(
                              outstanding,
                              shipment.invoice?.currency ?? DEFAULT_CURRENCY
                            )}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
            <h2 className="font-display font-semibold">Recent payments</h2>
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
                  <div>
                    <p className="font-mono text-sm tabular">
                      {payment.invoice.shipment.trackingNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payment.receipt?.receiptNumber} ·{" "}
                      {payment.receivedBy?.name ?? "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular">
                      {formatMoney(payment.amount, payment.currency)}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {payment.method.replace("_", " ").toLowerCase()}
                    </p>
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
