import "server-only";

import type { ShipmentStatus } from "@prisma/client";

import { SHIPMENT_STATUS_META, SHIPMENT_FLOW } from "@/lib/constants";
import { normaliseCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Public tracking.
 *
 * Everything returned by this module is rendered to anonymous visitors, so it
 * is built by explicit allow-list. Staff names, internal notes, prices,
 * customer contact details and warehouse instructions never appear here.
 */

export type PublicTimelineEntry = {
  status: ShipmentStatus;
  label: string;
  location: string;
  at: string | null;
  done: boolean;
  current: boolean;
};

export type PublicShipment = {
  kind: "shipment";
  trackingNumber: string;
  status: ShipmentStatus;
  statusLabel: string;
  location: string;
  batchNumber: string | null;
  packages: number;
  origin: string;
  lastUpdate: string | null;
  timeline: PublicTimelineEntry[];
};

export type PublicBatch = {
  kind: "batch";
  batchNumber: string;
  statusLabel: string;
  shipmentCount: number;
  departureDate: string | null;
  arrivalDate: string | null;
  origin: string;
};

export type TrackingResult =
  | PublicShipment
  | PublicBatch
  | { kind: "not-found"; query: string };

const ORIGIN_PUBLIC: Record<string, string> = {
  GUANGZHOU: "Guangzhou, China",
  HONG_KONG: "Hong Kong",
};

function buildTimeline(shipment: {
  status: ShipmentStatus;
  registeredAt: Date;
  departedAt: Date | null;
  arrivedAt: Date | null;
  readyForPickup: Date | null;
  deliveredAt: Date | null;
}): PublicTimelineEntry[] {
  const stamps: Record<string, Date | null> = {
    READY_TO_DEPART: shipment.registeredAt,
    IN_TRANSIT: shipment.departedAt,
    RECEIVED_AT_DAR: shipment.arrivedAt,
    READY_FOR_PICKUP: shipment.readyForPickup,
    DELIVERED: shipment.deliveredAt,
  };

  const currentIndex = SHIPMENT_FLOW.indexOf(shipment.status);

  return SHIPMENT_FLOW.map((status, index) => {
    const meta = SHIPMENT_STATUS_META[status];
    return {
      status,
      label: meta.publicLabel,
      location: meta.publicLocation,
      at: stamps[status]?.toISOString() ?? null,
      // A cancelled shipment has no current step at all.
      done: currentIndex >= 0 && index < currentIndex,
      current: currentIndex >= 0 && index === currentIndex,
    };
  });
}

export async function trackByCode(rawQuery: string): Promise<TrackingResult> {
  const query = normaliseCode(rawQuery);
  if (!query) return { kind: "not-found", query: rawQuery };

  const shipment = await prisma.shipment.findUnique({
    where: { trackingNumber: query },
    select: {
      trackingNumber: true,
      status: true,
      packages: true,
      origin: true,
      registeredAt: true,
      departedAt: true,
      arrivedAt: true,
      readyForPickup: true,
      deliveredAt: true,
      updatedAt: true,
      batch: { select: { batchNumber: true } },
    },
  });

  if (shipment) {
    const meta = SHIPMENT_STATUS_META[shipment.status];
    return {
      kind: "shipment",
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      statusLabel: meta.publicLabel,
      location: meta.publicLocation,
      batchNumber: shipment.batch?.batchNumber ?? null,
      packages: shipment.packages,
      origin: ORIGIN_PUBLIC[shipment.origin] ?? shipment.origin,
      lastUpdate: shipment.updatedAt.toISOString(),
      timeline: buildTimeline(shipment),
    };
  }

  const batch = await prisma.batch.findUnique({
    where: { batchNumber: query },
    select: {
      batchNumber: true,
      status: true,
      origin: true,
      departureDate: true,
      arrivalDate: true,
      _count: { select: { shipments: true } },
    },
  });

  if (batch) {
    // Deliberately batch-level only. Listing the shipments inside a batch would
    // expose one customer's cargo to anyone who knows the batch number.
    const label: Record<string, string> = {
      OPEN: "Loading in China",
      READY_TO_DEPART: "Sealed, awaiting flight",
      IN_TRANSIT: "In transit to Tanzania",
      ARRIVED: "Arrived in Dar es Salaam",
      VERIFIED: "Arrived and checked in",
      CLOSED: "Completed",
    };
    return {
      kind: "batch",
      batchNumber: batch.batchNumber,
      statusLabel: label[batch.status] ?? batch.status,
      shipmentCount: batch._count.shipments,
      departureDate: batch.departureDate?.toISOString() ?? null,
      arrivalDate: batch.arrivalDate?.toISOString() ?? null,
      origin: ORIGIN_PUBLIC[batch.origin] ?? batch.origin,
    };
  }

  return { kind: "not-found", query: rawQuery };
}
