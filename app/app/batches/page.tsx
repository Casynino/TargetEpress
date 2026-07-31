import type { Metadata } from "next";
import { Boxes, Package, Plane, Warehouse } from "lucide-react";

import { BatchesTable, type BatchRow } from "@/components/app/batches-table";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { StatStrip } from "@/components/app/stat-strip";
import { formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Batches" };

export default async function BatchesPage() {
  const user = await requirePermission("batch.view");

  const batches = await prisma.batch.findMany({
    orderBy: { createdAt: "desc" },
    take: 400,
    select: {
      id: true,
      batchNumber: true,
      status: true,
      origin: true,
      airline: true,
      flightNumber: true,
      waybillNumber: true,
      createdAt: true,
      departureDate: true,
      arrivalDate: true,
      _count: { select: { shipments: true, verifications: true } },
      shipments: { select: { weightKg: true, packages: true } },
    },
  });

  const rows: BatchRow[] = batches.map((batch) => ({
    id: batch.id,
    batchNumber: batch.batchNumber,
    status: batch.status,
    origin: batch.origin,
    airline: batch.airline,
    flightNumber: batch.flightNumber,
    waybillNumber: batch.waybillNumber,
    createdAt: batch.createdAt.toISOString(),
    departureDate: batch.departureDate?.toISOString() ?? null,
    arrivalDate: batch.arrivalDate?.toISOString() ?? null,
    shipments: batch._count.shipments,
    verified: batch._count.verifications,
    packages: batch.shipments.reduce((sum, s) => sum + s.packages, 0),
    weightKg: batch.shipments.reduce((sum, s) => sum + toNumber(s.weightKg), 0),
  }));

  const live = rows.filter(
    (r) => !["VERIFIED", "CLOSED"].includes(r.status)
  );
  const open = rows.filter((r) => r.status === "OPEN");
  const inAir = rows.filter((r) => r.status === "IN_TRANSIT");
  const gz = live.filter((r) => r.origin === "GUANGZHOU");
  const hk = live.filter((r) => r.origin === "HONG_KONG");
  const liveWeight = live.reduce((sum, r) => sum + r.weightKg, 0);
  const liveShipments = live.reduce((sum, r) => sum + r.shipments, 0);

  return (
    <>
      <PageHeader
        title="Batches"
        description="Cargo grouped by the flight it travels on. Guangzhou and Hong Kong run as separate routes — work here when you are loading, sealing or receiving a whole flight."
      />

      <StatStrip
        className="mb-5"
        chips={[
          { label: "Live batches", value: String(live.length), icon: Boxes, tone: "brand" },
          { label: "Loading", value: String(open.length), icon: Warehouse, tone: "warning" },
          { label: "In the air", value: String(inAir.length), icon: Plane, tone: "success" },
          { label: "Guangzhou", value: String(gz.length), icon: Warehouse },
          { label: "Hong Kong", value: String(hk.length), icon: Plane },
          { label: "Shipments live", value: String(liveShipments), icon: Package },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          delay={0}
          label="Live batches"
          numeric={live.length}
          hint={`${rows.length} on record`}
          icon={Boxes}
          tone="brand"
        />
        <KpiCard
          delay={1}
          label="Cargo in play"
          numeric={liveShipments}
          hint={formatWeight(liveWeight)}
          icon={Package}
          tone="info"
        />
        <KpiCard
          delay={2}
          label="Loading in China"
          numeric={open.length}
          hint="Still taking cargo"
          icon={Warehouse}
          tone={open.length > 0 ? "warning" : "success"}
        />
        <KpiCard
          delay={3}
          label="In the air"
          numeric={inAir.length}
          hint="Flying to Dar"
          icon={Plane}
          tone="success"
        />
      </div>

      <BatchesTable rows={rows} canCreate={can(user.role, "batch.create")} />
    </>
  );
}
