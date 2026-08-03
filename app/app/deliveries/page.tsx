import type { Metadata } from "next";
import { Camera, History, Truck, UserCheck } from "lucide-react";

import {
  DeliveryHistoryTable,
  type DeliveryHistoryRow,
} from "@/components/app/delivery-history-table";
import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { formatPackages } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Delivery history" };

/** How far back the table reaches in one page load. */
const WINDOW = 300;

/**
 * Every handover the Dar warehouse has made, newest first.
 *
 * This is the floor's own audit trail rather than a management report: what
 * left, who took it, who at the counter let them, when, and the photo taken as
 * it changed hands. Those five facts together are what answers a claim, so they
 * are read straight off `DeliveryRecord` — the row `releaseShipment` writes
 * inside the same transaction that flips the shipment to DELIVERED, which means
 * a delivered shipment cannot exist without one.
 *
 * No money anywhere: the pickup note is named because the note number is how a
 * dispute is traced back to Finance, but what was paid is Finance's screen.
 */
export default async function DeliveryHistoryPage() {
  await requirePermission("delivery.history");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  // Soft-deleted cargo is filtered at the client for `prisma.shipment`, but this
  // query starts at DeliveryRecord, so the relation filter is spelled out.
  const visible = { shipment: { deletedAt: null } };

  const [records, todayCount, weekCount, totalCount] = await Promise.all([
    prisma.deliveryRecord.findMany({
      where: visible,
      orderBy: { releasedAt: "desc" },
      take: WINDOW,
      select: {
        id: true,
        receiverName: true,
        receiverPhone: true,
        receiverIdNumber: true,
        relationship: true,
        note: true,
        releasedAt: true,
        releasedBy: { select: { name: true } },
        pickupNote: { select: { noteNumber: true, issuedAt: true } },
        shipment: {
          select: {
            trackingNumber: true,
            description: true,
            packages: true,
            packageType: true,
            weightKg: true,
            customer: { select: { id: true, name: true, phone: true } },
            batch: { select: { batchNumber: true } },
            photos: {
              where: { kind: "PROOF_OF_DELIVERY" },
              orderBy: { createdAt: "asc" },
              select: { id: true, url: true, caption: true },
            },
          },
        },
      },
    }),
    prisma.deliveryRecord.count({
      where: { ...visible, releasedAt: { gte: startOfToday } },
    }),
    prisma.deliveryRecord.count({
      where: { ...visible, releasedAt: { gte: weekAgo } },
    }),
    prisma.deliveryRecord.count({ where: visible }),
  ]);

  const rows: DeliveryHistoryRow[] = records.map((record) => ({
    id: record.id,
    releasedAt: record.releasedAt.toISOString(),
    trackingNumber: record.shipment.trackingNumber,
    description: record.shipment.description,
    packagesLabel: formatPackages(
      record.shipment.packages,
      record.shipment.packageType
    ),
    weightKg: toNumber(record.shipment.weightKg),
    customerId: record.shipment.customer.id,
    customerName: record.shipment.customer.name,
    customerPhone: record.shipment.customer.phone,
    batchNumber: record.shipment.batch?.batchNumber ?? null,
    receiverName: record.receiverName,
    receiverPhone: record.receiverPhone,
    receiverIdNumber: record.receiverIdNumber,
    relationship: record.relationship,
    note: record.note,
    releasedByName: record.releasedBy?.name ?? null,
    pickupNoteNumber: record.pickupNote.noteNumber,
    pickupNoteIssuedAt: record.pickupNote.issuedAt.toISOString(),
    photos: record.shipment.photos,
  }));

  // Computed over the loaded window rather than the whole table, and the hint
  // says so — a percentage that silently means "of the last 300" is a lie.
  const byAgent = rows.filter((row) => row.relationship !== "SELF").length;
  const withPhoto = rows.filter((row) => row.photos.length > 0).length;
  const windowHint = `of the last ${rows.length}`;

  return (
    <>
      <PageHeader
        title="Delivery history"
        description="Every handover this warehouse has made — what left, who took it, and who released it."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          delay={0}
          label="Handed over today"
          numeric={todayCount}
          hint="Cargo that left the building today"
          icon={Truck}
          tone="brand"
        />
        <KpiCard
          delay={1}
          label="Last 7 days"
          numeric={weekCount}
          hint={`${totalCount.toLocaleString()} on record in total`}
          icon={History}
          tone="info"
        />
        <KpiCard
          delay={2}
          label="Collected by an agent"
          numeric={byAgent}
          hint={`${windowHint} — not the customer in person`}
          icon={UserCheck}
          tone="signal"
        />
        <KpiCard
          delay={3}
          label="Handover photo on file"
          value={`${withPhoto} / ${rows.length}`}
          hint={`${windowHint} handovers`}
          icon={Camera}
          tone="success"
          ringPct={rows.length > 0 ? (withPhoto / rows.length) * 100 : 0}
          ringLabel="Handovers with a photo"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nothing has been handed over yet"
          description="Every release recorded at the counter appears here, newest first, with the photo taken as the cargo changed hands."
        />
      ) : (
        <DeliveryHistoryTable rows={rows} />
      )}

      {totalCount > rows.length ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Showing the {rows.length.toLocaleString()} most recent handovers of{" "}
          {totalCount.toLocaleString()}. Older cargo is on its own page — search
          for it under{" "}
          <span className="font-medium text-foreground">Search Cargo</span>.
        </p>
      ) : null}
    </>
  );
}
