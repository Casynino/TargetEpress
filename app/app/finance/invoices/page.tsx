import Link from "next/link";
import type { Metadata } from "next";
import type { InvoiceStatus, Prisma } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Invoices" };

const STATUS_TONE = {
  UNPAID: "destructive",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  VOID: "muted",
} as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string }>;
}) {
  await requirePermission("invoice.manage");
  const { status, view } = await searchParams;

  // "Uninvoiced" is the other half of this job: cargo that has arrived (or is
  // arriving) with no bill against it yet.
  if (view === "uninvoiced") {
    const shipments = await prisma.shipment.findMany({
      where: { invoice: null, status: { in: ["IN_TRANSIT", "RECEIVED_AT_DAR"] } },
      orderBy: { arrivedAt: "asc" },
      include: { customer: { select: { name: true, phone: true } } },
    });

    return (
      <>
        <PageHeader
          title="Cargo not yet invoiced"
          description="Raise the invoice from the shipment page, then take payment."
          actions={
            <Button asChild variant="outline">
              <Link href="/app/finance/invoices">All invoices</Link>
            </Button>
          }
        />

        {shipments.length === 0 ? (
          <EmptyState title="Everything is invoiced" />
        ) : (
          <div className="rounded-xl border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Weight</TableHead>
                  <TableHead className="hidden md:table-cell">Arrived</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((shipment) => (
                  <TableRow key={shipment.id}>
                    <TableCell className="font-mono text-sm tabular">
                      {shipment.trackingNumber}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{shipment.customer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {shipment.customer.phone}
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell tabular">
                      {formatWeight(shipment.weightKg)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {formatDate(shipment.arrivedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="brand">
                        <Link href={`/app/shipments/${shipment.trackingNumber}`}>
                          Raise invoice
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </>
    );
  }

  const statusFilter =
    status && status in STATUS_TONE ? (status as InvoiceStatus) : undefined;
  const where: Prisma.InvoiceWhereInput = statusFilter
    ? { status: statusFilter }
    : {};

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: "desc" },
    take: 100,
    include: {
      customer: { select: { name: true, phone: true } },
      shipment: { select: { trackingNumber: true, status: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Invoices"
        description={`${invoices.length} invoice(s)`}
        actions={
          <Button asChild variant="outline">
            <Link href="/app/finance/invoices?view=uninvoiced">
              Not yet invoiced
            </Link>
          </Button>
        }
      />

      <form className="mb-4 flex gap-2" action="/app/finance/invoices">
        <NativeSelect name="status" defaultValue={status ?? ""} className="sm:w-56">
          <option value="">All statuses</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIALLY_PAID">Partially paid</option>
          <option value="PAID">Paid</option>
          <option value="VOID">Void</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices"
          description="Invoices are raised from a shipment's page."
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Shipment</TableHead>
                <TableHead className="hidden md:table-cell">Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const outstanding =
                  toNumber(invoice.total) - toNumber(invoice.amountPaid);
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-xs tabular">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/app/shipments/${invoice.shipment.trackingNumber}`}
                        className="font-mono text-sm tabular hover:text-brand"
                      >
                        {invoice.shipment.trackingNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-sm">{invoice.customer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.customer.phone}
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular">
                      {formatMoney(invoice.total, invoice.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular">
                      {formatMoney(outstanding, invoice.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_TONE[invoice.status]}>
                        {invoice.status.replace("_", " ").toLowerCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
