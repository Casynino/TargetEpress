import Link from "next/link";
import type { Metadata } from "next";
import { Boxes, ClipboardCheck, Package, Plane, Scale, Warehouse } from "lucide-react";

import {
  IncomingShipmentsTable,
  type IncomingLine,
  type IncomingRow,
} from "@/components/app/incoming-shipments-table";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { cargoLabel } from "@/lib/cargo";
import { ORIGIN_LABELS, formatPackagesShort } from "@/lib/constants";
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Incoming shipments" };

const DAY = 86_400_000;

/** The floor's own name for each loading table. */
const BATCH_LABELS: Record<keyof typeof ORIGIN_LABELS, string> = {
  GUANGZHOU: "Guangzhou Batch",
  HONG_KONG: "Hong Kong Batch",
};

/**
 * Incoming shipments — the Dar arrivals board.
 *
 * Everything that has left China and has not been checked in yet: still flying,
 * or landed and waiting on the receiving desk. Read-only by design. Dar's
 * responsibility starts when cargo arrives, and the China manifest is the
 * document being checked against, so this page shows it and offers no way to
 * change it. Anything that disagrees with the physical box is raised as an
 * exception at check-in.
 *
 * Guarded by `batch.receive`, not just by middleware — a page that only trusts
 * the route table is one refactor away from being open.
 */
export default async function IncomingShipmentsPage() {
  await requirePermission("batch.receive");

  const dispatches = await prisma.batch.findMany({
    // Loading tables are still in China and are China's to manage; only real
    // dispatches that have actually gone belong on an arrivals board.
    where: { permanent: false, status: { in: ["IN_TRANSIT", "ARRIVED"] } },
    orderBy: [{ departureDate: "desc" }, { departedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      batchNumber: true,
      status: true,
      origin: true,
      airline: true,
      flightNumber: true,
      waybillNumber: true,
      departureDate: true,
      departedAt: true,
      expectedArrival: true,
      arrivalDate: true,
      arrivedAt: true,
      createdAt: true,
      shipments: {
        // The soft-delete filter in lib/prisma.ts only covers top-level reads of
        // `shipment`; a relation loaded through `batch` is part of the batch
        // query and never sees it. Deleted cargo would otherwise reappear on the
        // manifest the warehouse counts against.
        where: { deletedAt: null },
        orderBy: { registeredAt: "desc" },
        select: {
          id: true,
          trackingNumber: true,
          description: true,
          cartonRef: true,
          packages: true,
          packageType: true,
          weightKg: true,
          customerId: true,
          customer: { select: { name: true, phone: true } },
          cargoType: { select: { name: true } },
          photos: {
            // China registration photos only. Proof-of-delivery and damage
            // shots are taken in Dar and belong to a later step.
            where: { kind: { in: ["CARGO", "PACKAGING"] } },
            orderBy: { createdAt: "asc" },
            select: { id: true, url: true, caption: true },
          },
        },
      },
    },
  });

  const now = Date.now();

  const rows: IncomingRow[] = dispatches.map((dispatch) => {
    const lines: IncomingLine[] = dispatch.shipments.map((item) => ({
      id: item.id,
      trackingNumber: item.trackingNumber,
      customerName: item.customer.name,
      customerPhone: item.customer.phone,
      description: cargoLabel(item.cargoType?.name, item.description),
      packagesLabel: formatPackagesShort(item.packages, item.packageType),
      weightLabel: formatWeight(item.weightKg),
      cartonRef: item.cartonRef,
      photos: item.photos,
    }));

    // Age is measured from whichever clock is actually running: time on the
    // floor once it has landed, time in the air before that.
    const since =
      dispatch.status === "ARRIVED"
        ? (dispatch.arrivedAt ?? dispatch.arrivalDate)
        : (dispatch.departureDate ?? dispatch.departedAt);
    const days = since ? Math.floor((now - since.getTime()) / DAY) : null;
    const ageLabel =
      days === null
        ? ""
        : `${days} day${days === 1 ? "" : "s"} ${
            dispatch.status === "ARRIVED" ? "on the floor" : "in the air"
          }`;

    const departure = dispatch.departureDate ?? dispatch.departedAt;
    // Once it is down, "lands" means when it actually landed; before that, when
    // it is due. Sorted on the timestamp, never on the printed label.
    const lands =
      dispatch.status === "ARRIVED"
        ? (dispatch.arrivalDate ?? dispatch.arrivedAt)
        : dispatch.expectedArrival;

    return {
      id: dispatch.id,
      shipmentNumber: dispatch.batchNumber,
      batchLabel: BATCH_LABELS[dispatch.origin],
      origin: dispatch.origin,
      route: `${ORIGIN_LABELS[dispatch.origin]} → Dar es Salaam`,
      status: dispatch.status === "ARRIVED" ? "ARRIVED" : "IN_TRANSIT",
      airline: dispatch.airline,
      flightNumber: dispatch.flightNumber,
      waybillNumber: dispatch.waybillNumber,
      cargoCount: lines.length,
      customerCount: new Set(dispatch.shipments.map((item) => item.customerId)).size,
      packages: dispatch.shipments.reduce((sum, item) => sum + item.packages, 0),
      weightKg: dispatch.shipments.reduce(
        (sum, item) => sum + toNumber(item.weightKg),
        0
      ),
      photoCount: lines.reduce((sum, line) => sum + line.photos.length, 0),
      departedLabel: formatDate(departure),
      expectedLabel: formatDate(dispatch.expectedArrival),
      arrivedLabel: formatDate(dispatch.arrivalDate ?? dispatch.arrivedAt),
      ageLabel,
      sortAt: (departure ?? dispatch.createdAt).getTime(),
      landsAt: lands ? lands.getTime() : null,
      lines,
    } satisfies IncomingRow;
  });

  const inAir = rows.filter((row) => row.status === "IN_TRANSIT");
  const landed = rows.filter((row) => row.status === "ARRIVED");
  const pieces = rows.reduce((sum, row) => sum + row.cargoCount, 0);
  const packages = rows.reduce((sum, row) => sum + row.packages, 0);
  const weightKg = rows.reduce((sum, row) => sum + row.weightKg, 0);
  const landedPieces = landed.reduce((sum, row) => sum + row.cargoCount, 0);

  return (
    <>
      <PageHeader
        title="Incoming shipments"
        description="Everything that has left China and is not checked in yet. Read-only — the China manifest is what you count against, not something you correct here."
        actions={
          landed.length > 0 ? (
            <Button asChild variant="signal" className="rounded-lg">
              <Link href="/app/receive">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Check in landed cargo
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          delay={0}
          label="In the air"
          numeric={inAir.length}
          hint="Dispatches still flying"
          icon={Plane}
          tone="info"
        />
        <KpiCard
          delay={1}
          label="Landed, not checked in"
          numeric={landed.length}
          hint={
            landed.length > 0
              ? `${landedPieces} piece(s) waiting on the desk`
              : "Nothing waiting on the desk"
          }
          icon={Warehouse}
          tone={landed.length > 0 ? "warning" : "success"}
        />
        <KpiCard
          delay={2}
          label="Cargo pieces inbound"
          numeric={pieces}
          hint="Across every inbound dispatch"
          icon={Boxes}
          tone="brand"
        />
        <KpiCard
          delay={3}
          label="Packages inbound"
          numeric={packages}
          hint="What the manifest says you will count"
          icon={Package}
          tone="brand"
        />
        <KpiCard
          delay={4}
          label="Weight inbound"
          value={formatWeight(weightKg)}
          hint="Total on the manifests"
          icon={Scale}
          tone="signal"
        />
      </div>

      <IncomingShipmentsTable rows={rows} />
    </>
  );
}
