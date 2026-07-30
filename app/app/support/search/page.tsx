import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { SupportSearch } from "@/components/app/support-forms";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { searchShipments } from "@/lib/support";

export const metadata: Metadata = { title: "Find a shipment" };

/**
 * One box, every handle.
 *
 * A customer on the phone has whatever they have — their name, the number they
 * are calling from, a batch number from a WhatsApp group. All of it goes in the
 * same box.
 */
export default async function SupportSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission("shipment.view");
  const { q } = await searchParams;
  const showMoney = can(user.role, "finance.view");

  const results = q ? await searchShipments(q) : [];

  return (
    <>
      <PageHeader
        title="Find a shipment"
        description="Search by tracking number, customer name, phone number, batch or invoice."
      />

      <div className="mb-6 rounded-xl border bg-card p-4 shadow-soft">
        <SupportSearch action="/app/support/search" defaultValue={q} />
      </div>

      {q ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {results.length} result{results.length === 1 ? "" : "s"} for{" "}
          <span className="font-medium text-foreground">{q}</span>
        </p>
      ) : null}

      {q && results.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center shadow-soft">
          <SearchX className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">Nothing matched</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Try a shorter piece of it — part of a name, or the last few digits of
            the phone number they are calling from.
          </p>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Tracking</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Cargo</th>
                <th className="p-3 font-medium">Status</th>
                <th className="hidden p-3 font-medium lg:table-cell">Batch</th>
                {showMoney ? <th className="p-3 font-medium">Owed</th> : null}
              </tr>
            </thead>
            <tbody>
              {results.map((shipment) => {
                const outstanding = shipment.invoice
                  ? Math.max(
                      0,
                      toNumber(shipment.invoice.total) -
                        toNumber(shipment.invoice.amountPaid)
                    )
                  : null;
                return (
                  <tr key={shipment.id} className="border-t align-top">
                    <td className="p-3">
                      <Link
                        href={`/app/shipments/${shipment.trackingNumber}`}
                        className="font-mono text-xs hover:text-brand hover:underline"
                      >
                        {shipment.trackingNumber}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDate(shipment.arrivedAt)}
                      </div>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/app/customers/${shipment.customer.id}`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {shipment.customer.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {shipment.customer.phone ?? "no phone"}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="max-w-[16rem] truncate">{shipment.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatWeight(shipment.weightKg)} · {shipment.packages} pkg ·{" "}
                        {shipment.origin === "GUANGZHOU" ? "Guangzhou" : "Hong Kong"}
                      </div>
                    </td>
                    <td className="p-3">
                      <ShipmentStatusBadge status={shipment.status} />
                    </td>
                    <td className="hidden p-3 font-mono text-xs text-muted-foreground lg:table-cell">
                      {shipment.batch?.batchNumber ?? "—"}
                    </td>
                    {showMoney ? (
                      <td className="p-3 font-mono text-xs tabular-nums">
                        {outstanding === null ? (
                          <span className="text-muted-foreground">not billed</span>
                        ) : outstanding > 0 ? (
                          <span className="text-destructive">{formatUsd(outstanding)}</span>
                        ) : (
                          <span className="text-success">paid</span>
                        )}
                        {shipment.invoice && !shipment.invoice.sentAt ? (
                          <Badge
                            variant="outline"
                            className="mt-1 block w-fit border-warning/40 text-[10px] text-warning"
                          >
                            never sent
                          </Badge>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
