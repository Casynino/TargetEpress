import type { Metadata } from "next";
import Link from "next/link";
import { PlaneTakeoff } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { formatDate, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Shipments" };

/**
 * The dispatch archive.
 *
 * One row per flight-load that has left China. This is the permanent history —
 * batches are the live work area and hold only what is still waiting, so
 * everything that has actually shipped ends up here and stays.
 */
export default async function ShipmentsPage() {
  await requirePermission("batch.view");

  const dispatches = await prisma.batch.findMany({
    where: { permanent: false },
    orderBy: [{ departedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      batchNumber: true,
      status: true,
      origin: true,
      airline: true,
      flightNumber: true,
      waybillNumber: true,
      departureDate: true,
      expectedArrival: true,
      arrivalDate: true,
      shipments: { select: { weightKg: true, packages: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Shipments"
        description="Every dispatch that has left China, newest first. Each one carries its waybill, its flight and all the cargo that travelled on it."
      />

      {dispatches.length === 0 ? (
        <EmptyState
          title="Nothing dispatched yet"
          description="Dispatch a batch from the Batches page and it appears here permanently."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Shipment</th>
                <th className="p-3 font-medium">Route</th>
                <th className="hidden p-3 font-medium md:table-cell">Waybill</th>
                <th className="hidden p-3 font-medium lg:table-cell">Flight</th>
                <th className="p-3 text-right font-medium">Cargo</th>
                <th className="hidden p-3 text-right font-medium xl:table-cell">Weight</th>
                <th className="hidden p-3 font-medium lg:table-cell">Departed</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.map((dispatch) => {
                const weight = dispatch.shipments.reduce(
                  (sum, cargo) => sum + toNumber(cargo.weightKg),
                  0
                );
                return (
                  <tr key={dispatch.id} className="border-t">
                    <td className="p-3">
                      <Link
                        href={`/app/shipments/${dispatch.id}`}
                        className="font-mono text-xs font-medium hover:text-brand hover:underline"
                      >
                        {dispatch.batchNumber}
                      </Link>
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {dispatch.origin === "HONG_KONG" ? "Hong Kong" : "Guangzhou"}
                    </td>
                    <td className="hidden p-3 font-mono text-xs md:table-cell">
                      {dispatch.waybillNumber ?? "—"}
                    </td>
                    <td className="hidden p-3 text-xs lg:table-cell">
                      {dispatch.airline ?? "—"}
                      {dispatch.flightNumber ? ` ${dispatch.flightNumber}` : ""}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {dispatch.shipments.length}
                    </td>
                    <td className="hidden p-3 text-right font-mono tabular-nums xl:table-cell">
                      {weight.toFixed(1)} kg
                    </td>
                    <td className="hidden p-3 whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                      {formatDate(dispatch.departureDate)}
                    </td>
                    <td className="p-3">
                      <BatchStatusBadge status={dispatch.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <PlaneTakeoff className="h-4 w-4" />
        Cargo still waiting in China is on the{" "}
        <Link href="/app/batches" className="font-medium text-brand hover:underline">
          two loading tables
        </Link>
        .
      </p>
    </>
  );
}
