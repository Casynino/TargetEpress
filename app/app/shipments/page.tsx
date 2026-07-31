import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, PackageCheck, Plane, Scale, Warehouse } from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import {
  ShipmentsDashboard,
  type DispatchRow,
} from "@/components/app/shipments-dashboard";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Shipments" };

/**
 * The dispatch archive, as a dashboard.
 *
 * One row per flight-load that has left China, with the numbers that answer
 * "what is in the air and what is waiting on me" before any row is opened.
 * Batches hold what is still in China; everything here has gone.
 */
export default async function ShipmentsPage() {
  await requirePermission("batch.view");

  const dispatches = await prisma.batch.findMany({
    where: { permanent: false },
    orderBy: [{ departedAt: "desc" }, { createdAt: "desc" }],
    take: 300,
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
      shipments: {
        select: { weightKg: true, packages: true, customerId: true },
      },
    },
  });

  const rows: DispatchRow[] = dispatches.map((dispatch) => ({
    id: dispatch.id,
    shipmentNumber: dispatch.batchNumber,
    route: ORIGIN_LABELS[dispatch.origin],
    status: dispatch.status,
    cargoCount: dispatch.shipments.length,
    customerCount: new Set(dispatch.shipments.map((c) => c.customerId)).size,
    weightKg: dispatch.shipments.reduce((sum, c) => sum + toNumber(c.weightKg), 0),
    packages: dispatch.shipments.reduce((sum, c) => sum + c.packages, 0),
    waybillNumber: dispatch.waybillNumber,
    airline: dispatch.airline,
    flightNumber: dispatch.flightNumber,
    departedLabel: dispatch.departureDate ? formatDate(dispatch.departureDate) : null,
    expectedLabel: dispatch.expectedArrival
      ? formatDate(dispatch.expectedArrival)
      : null,
    arrivedLabel: dispatch.arrivalDate ? formatDate(dispatch.arrivalDate) : null,
  }));

  const active = rows.filter(
    (row) => row.status === "IN_TRANSIT" || row.status === "ARRIVED"
  );
  const inTransitCargo = rows
    .filter((row) => row.status === "IN_TRANSIT")
    .reduce((sum, row) => sum + row.cargoCount, 0);
  const arrivedCargo = rows
    .filter((row) => row.status === "ARRIVED" || row.status === "VERIFIED")
    .reduce((sum, row) => sum + row.cargoCount, 0);
  const pendingClearance = rows.filter((row) => row.status === "ARRIVED").length;
  const activeWeight = active.reduce((sum, row) => sum + row.weightKg, 0);

  return (
    <>
      <PageHeader
        title="Shipments"
        description="Every dispatch that has left China. Open one to see its cargo, documents and full timeline."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          delay={0}
          label="Total shipments"
          numeric={rows.length}
          hint="Every dispatch on record"
          icon={Plane}
          tone="brand"
        />
        <KpiCard
          delay={1}
          label="Active"
          numeric={active.length}
          hint="In the air or awaiting clearance"
          icon={Boxes}
          tone="info"
        />
        <KpiCard
          delay={2}
          label="Cargo in transit"
          numeric={inTransitCargo}
          hint="Pieces currently flying"
          icon={Plane}
          tone="signal"
        />
        <KpiCard
          delay={3}
          label="Pending clearance"
          numeric={pendingClearance}
          hint={
            pendingClearance > 0
              ? "Landed, not yet checked in"
              : "Nothing waiting on Dar"
          }
          icon={Warehouse}
          tone={pendingClearance > 0 ? "warning" : "success"}
        />
        <KpiCard
          delay={4}
          label="Weight in motion"
          value={`${activeWeight.toFixed(0)} kg`}
          hint={`${arrivedCargo} pieces landed`}
          icon={Scale}
          tone="brand"
        />
      </div>

      <ShipmentsDashboard rows={rows} />

      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <PackageCheck className="h-4 w-4" />
        Cargo still waiting in China is on the{" "}
        <Link href="/app/batches" className="font-medium text-brand hover:underline">
          two loading tables
        </Link>
        .
      </p>
    </>
  );
}
