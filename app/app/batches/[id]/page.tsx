import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FileText, Plane } from "lucide-react";

import { CargoGrid } from "@/components/app/cargo-grid";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { BatchControls } from "@/components/app/batch-controls";
import { BatchStatusBadge, ShipmentStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Batch" };

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("batch.view");
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      verifications: { select: { shipmentId: true, result: true } },
      createdBy: { select: { name: true } },
      shipments: {
        orderBy: { trackingNumber: "asc" },
        include: { customer: { select: { name: true, phone: true } } },
      },
    },
  });

  if (!batch) notFound();

  const verificationByShipment = new Map(
    batch.verifications.map((v) => [v.shipmentId, v])
  );

  const manageable = can(user.role, "batch.manage");

  // Cargo registered in China that has not been put on any flight yet.
  const unassigned =
    manageable && batch.status === "OPEN"
      ? await prisma.shipment.findMany({
          where: { batchId: null, status: "READY_TO_DEPART" },
          orderBy: { registeredAt: "desc" },
          take: 50,
          select: {
            id: true,
            trackingNumber: true,
            weightKg: true,
            packages: true,
            customer: { select: { name: true } },
          },
        })
      : [];

  const totalWeight = batch.shipments.reduce(
    (sum, s) => sum + toNumber(s.weightKg),
    0
  );
  const totalPackages = batch.shipments.reduce((sum, s) => sum + s.packages, 0);

  return (
    <>
      <PageHeader
        title={batch.batchNumber}
        description={`${ORIGIN_LABELS[batch.origin]} · opened ${formatDate(batch.createdAt)} by ${batch.createdBy?.name ?? "—"}`}
        actions={
          <>
            <BatchStatusBadge status={batch.status} />
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href={`/app/batches/${batch.id}/manifest`}>
                <FileText className="mr-2 h-4 w-4" />
                Manifest
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <h2 className="font-display font-semibold">
                Cargo in this batch
              </h2>
              <p className="text-xs text-muted-foreground tabular">
                {batch.shipments.length} shipment(s) · {totalPackages} package(s) ·{" "}
                {formatWeight(totalWeight)}
              </p>
            </div>

            {batch.shipments.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No cargo loaded yet"
                  description="Add shipments from the panel on the right."
                />
              </div>
            ) : (
              <div className="p-5">
                <CargoGrid
                  cells={batch.shipments.map((shipment) => ({
                    id: shipment.id,
                    trackingNumber: shipment.trackingNumber,
                    cartonRef: shipment.cartonRef,
                    customerName: shipment.customer.name,
                    description: shipment.description,
                    weightKg: toNumber(shipment.weightKg),
                    packages: shipment.packages,
                    status: shipment.status,
                    category: shipment.cargoCategory,
                    verification:
                      verificationByShipment.get(shipment.id)?.result ?? null,
                  }))}
                />
              </div>
            )}
          </section>

          {batch.airline ? (
            <section className="rounded-xl border bg-card shadow-soft">
              <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
                <Plane className="h-4 w-4" />
                Flight details
              </h2>
              <dl className="grid gap-px bg-border sm:grid-cols-4">
                {[
                  { label: "Airline", value: batch.airline },
                  { label: "Flight", value: batch.flightNumber ?? "—" },
                  { label: "Waybill", value: batch.waybillNumber ?? "—" },
                  { label: "Departed", value: formatDate(batch.departureDate) },
                ].map((item) => (
                  <div key={item.label} className="bg-card p-4">
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="mt-1 font-mono text-sm font-medium tabular">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>

        <BatchControls
          batchId={batch.id}
          batchNumber={batch.batchNumber}
          status={batch.status}
          role={user.role}
          shipmentCount={batch.shipments.length}
          unassigned={unassigned.map((s) => ({
            id: s.id,
            trackingNumber: s.trackingNumber,
            customerName: s.customer.name,
            packages: s.packages,
            weightKg: toNumber(s.weightKg),
          }))}
          loaded={batch.shipments.map((s) => ({
            id: s.id,
            trackingNumber: s.trackingNumber,
          }))}
        />
      </div>
    </>
  );
}
