import Link from "next/link";
import type { Metadata } from "next";
import { Clock, Phone } from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { invoicesAwaitingPayment } from "@/lib/collections";
import { formatMoney, formatRelative, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Awaiting payment" };

/**
 * The call list: bills raised and not settled, oldest first.
 *
 * Every row opens the one screen where the collection is completed. Nothing is
 * typed here — the desk picks the customer and the form on the other side
 * already knows the bill, the cargo and the balance.
 *
 * A bill with a claim already sitting with Finance says so, because ringing
 * that customer again is a nuisance and makes the business look disorganised.
 */
export default async function AwaitingPaymentPage() {
  await requirePermission("collections.view");

  const [rows, rateRow] = await Promise.all([
    invoicesAwaitingPayment(),
    currentRate(),
  ]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const total = rows.reduce((sum, row) => sum + row.outstanding, 0);

  return (
    <>
      <PageHeader
        title="Awaiting payment"
        description="Bills the customer has been told about and not settled. Oldest first, because storage is running on every one."
      />

      <CollectionsNav />

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
        <p className="text-muted-foreground">
          {rows.length} bill{rows.length === 1 ? "" : "s"} outstanding
        </p>
        <p className="font-mono tabular-nums">
          <span className="text-muted-foreground">Owed </span>
          <span className="font-semibold text-warning">
            {rate
              ? `TSh ${Math.round(total * rate).toLocaleString("en-US")}`
              : formatMoney(total, "USD")}
          </span>
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to chase"
          description="Every bill that has been raised is settled."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Cargo</TableHead>
                <TableHead className="hidden lg:table-cell">Bill</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="hidden sm:table-cell text-right">
                  Waiting
                </TableHead>
                <TableHead className="text-right">Collect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="group">
                  <TableCell className="min-w-[12rem] py-2.5">
                    <Link
                      href={`/app/customers/${row.customer.id}`}
                      className="block truncate text-sm font-medium group-hover:text-brand"
                    >
                      {row.customer.name}
                    </Link>
                    <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {row.customer.phone}
                    </span>
                  </TableCell>
                  <TableCell className="hidden py-2.5 md:table-cell">
                    <span className="block font-mono text-xs">
                      {row.shipment.trackingNumber}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {row.shipment.description}
                    </span>
                  </TableCell>
                  <TableCell className="hidden py-2.5 lg:table-cell">
                    <span className="block font-mono text-xs">
                      {row.invoiceNumber}
                    </span>
                    {row.sentAt ? null : (
                      <Badge
                        variant="outline"
                        className="mt-0.5 border-warning/40 font-normal text-warning"
                      >
                        never sent
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 text-right">
                    <span className="block text-sm font-semibold tabular">
                      {rate
                        ? `TSh ${Math.round(row.outstanding * rate).toLocaleString("en-US")}`
                        : formatMoney(row.outstanding, row.currency)}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {formatMoney(row.outstanding, row.currency)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap py-2.5 text-right text-xs text-muted-foreground sm:table-cell">
                    {row.issuedAt ? formatRelative(row.issuedAt) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2.5 text-right">
                    {row.pendingSubmission ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {row.pendingSubmission} with Finance
                      </span>
                    ) : (
                      <Link
                        href={`/app/collections/record/${row.id}`}
                        className="focus-ring inline-flex items-center rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
                      >
                        Record payment
                      </Link>
                    )}
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
