import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { InvoicesTable, type InvoiceRow } from "@/components/app/invoices-table";
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
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Invoices" };


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
                        <Link href={`/app/cargo/${shipment.trackingNumber}`}>
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

  const invoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: "desc" },
    take: 250,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      shipment: { select: { trackingNumber: true } },
    },
  });

  const rows: InvoiceRow[] = invoices.map((invoice) => {
    const total = toNumber(invoice.total);
    const paid = toNumber(invoice.amountPaid);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      trackingNumber: invoice.shipment.trackingNumber,
      customerId: invoice.customer.id,
      customerName: invoice.customer.name,
      customerPhone: invoice.customer.phone,
      currency: invoice.currency,
      total,
      amountPaid: paid,
      outstanding: Math.max(0, total - paid),
      status: invoice.status,
      issuedAt: invoice.issuedAt.toISOString(),
      sentAt: invoice.sentAt?.toISOString() ?? null,
      storageDays: invoice.storageDays,
    };
  });

  return (
    <>
      <PageHeader
        title="Invoices"
        description={`${rows.length} invoice(s)`}
        actions={
          <Button asChild variant="outline">
            <Link href="/app/finance/invoices?view=uninvoiced">
              Not yet invoiced
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No invoices"
          description="Invoices are raised from a shipment's page."
        />
      ) : (
        <InvoicesTable rows={rows} />
      )}
    </>
  );
}
