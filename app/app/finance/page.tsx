import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, Package, QrCode, ReceiptText, Wallet } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { formatMoney, formatRelative, toNumber } from "@/lib/format";
import { agingInWarehouse, financeStats } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Finance" };

export default async function FinanceOverviewPage() {
  await requirePermission("finance.view");

  const [stats, aging, recentPayments] = await Promise.all([
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
  ]);

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Collected"
          value={formatMoney(stats.collected)}
          hint="All time"
          icon={Banknote}
          tone="success"
          href="/app/finance/payments"
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(stats.outstanding)}
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
