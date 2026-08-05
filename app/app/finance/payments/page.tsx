import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Banknote } from "lucide-react";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const user = await requirePermission("payment.record");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [payments, monthAgg, byMethod] = await Promise.all([
    prisma.payment.findMany({
      orderBy: { paidAt: "desc" },
      take: 100,
      include: {
        receipt: true,
        receivedBy: { select: { name: true } },
        account: { select: { name: true, code: true } },
        invoice: {
          select: {
            invoiceNumber: true,
            currency: true,
            shipment: { select: { trackingNumber: true } },
            customer: { select: { name: true } },
          },
        },
      },
    }),
    // Both totals sum `creditedAmount`, not `amount`. A customer hands over
    // shillings or dollars as they please; `amount` is whatever was handed
    // over, so adding it up produces a figure in no currency at all.
    // `creditedAmount` is that same money restated in the invoice's currency
    // at the rate frozen onto the invoice — the only version that adds up.
    prisma.payment.aggregate({
      where: { paidAt: { gte: monthStart } },
      _sum: { creditedAmount: true },
    }),
    prisma.payment.groupBy({
      by: ["method"],
      _sum: { creditedAmount: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every payment received, with the receipt it was issued against. Totals are in USD — the currency the bills are raised in — however the customer paid."
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="This month"
          value={formatUsd(toNumber(monthAgg._sum.creditedAmount))}
          icon={Banknote}
          tone="success"
        />
        {byMethod.map((row) => (
          <StatCard
            key={row.method}
            label={PAYMENT_METHOD_LABELS[row.method]}
            value={formatUsd(toNumber(row._sum.creditedAmount))}
            hint="All time"
          />
        ))}
      </div>

      <div className="mt-6">
        {payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Payments are recorded from a shipment's page once an invoice exists."
          />
        ) : (
          <div className="rounded-xl border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Shipment</TableHead>
                  <TableHead className="hidden md:table-cell">Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Method</TableHead>
                  <TableHead className="hidden xl:table-cell">Landed in</TableHead>
                  <TableHead className="hidden lg:table-cell">Received by</TableHead>
                  <TableHead className="hidden lg:table-cell">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs tabular">
                      {payment.receipt?.receiptNumber ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/app/cargo/${payment.invoice.shipment.trackingNumber}`}
                        className="font-mono text-sm tabular hover:text-brand"
                      >
                        {payment.invoice.shipment.trackingNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {payment.invoice.customer.name}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium tabular">
                      {/* What was handed over at the counter — the receipt
                          says this. When that was not the invoice's own
                          currency, what it actually settled is the figure the
                          bill moved by, so both are shown. */}
                      {formatMoney(payment.amount, payment.currency)}
                      {payment.creditedAmount !== null &&
                      payment.currency !== payment.invoice.currency ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          settled {formatUsd(toNumber(payment.creditedAmount))}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">
                      {PAYMENT_METHOD_LABELS[payment.method]}
                      {payment.reference ? (
                        <span className="block text-xs text-muted-foreground">
                          {payment.reference}
                        </span>
                      ) : null}
                    </TableCell>
                    {/* Which of our accounts took it. Blank is a real answer,
                        not a missing one — see the Accounts view, where it
                        adds up under Unattributed rather than disappearing. */}
                    <TableCell className="hidden xl:table-cell text-sm">
                      {payment.account ? (
                        payment.account.name
                      ) : (
                        <span className="text-muted-foreground">
                          Unattributed
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {payment.receivedBy?.name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatDateTime(payment.paidAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
