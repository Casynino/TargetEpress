import "server-only";

import type { ShipmentStatus } from "@prisma/client";

import { CATEGORY_LABELS } from "@/lib/cargo";
import { SHIPMENT_STATUS_META, SHIPMENT_FLOW } from "@/lib/constants";
import { normaliseCode, toNumber } from "@/lib/format";
import { toLocal } from "@/lib/fx";
import { prisma } from "@/lib/prisma";

/**
 * Public tracking.
 *
 * Everything returned by this module is rendered to anonymous visitors, so it
 * is built by explicit allow-list. Staff names, internal notes, customer
 * contact details, cost inputs and warehouse instructions never appear here.
 *
 * What a customer owes on their own shipment *is* included, by instruction —
 * "how much is it and can I collect it" is the question tracking exists to
 * answer. The figure shown is the invoice's own frozen rate, never today's.
 */

export type PublicTimelineEntry = {
  status: ShipmentStatus;
  label: string;
  location: string;
  at: string | null;
  done: boolean;
  current: boolean;
};

/** What the customer owes. Absent entirely until an invoice exists. */
export type PublicCharge = {
  invoiceNumber: string;
  currency: string;
  total: number;
  paid: number;
  outstanding: number;
  /** Shilling figures at the rate the invoice was raised at. */
  localCurrency: string | null;
  totalLocal: number | null;
  outstandingLocal: number | null;
  status: "PAID" | "PART_PAID" | "UNPAID";
};

export type PublicShipment = {
  kind: "shipment";
  trackingNumber: string;
  status: ShipmentStatus;
  statusLabel: string;
  location: string;
  batchNumber: string | null;
  packages: number;
  /** What was sent, in the words of the price list. */
  description: string;
  weightKg: number | null;
  origin: string;
  lastUpdate: string | null;
  timeline: PublicTimelineEntry[];
  charge: PublicCharge | null;
  /** Cargo has landed, is paid for, and is waiting to be collected. */
  collectable: boolean;
  /** Why not, when it is not — in a customer's terms. */
  collectionNote: string;
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
      weightKg: true,
      cargoCategory: true,
      batch: { select: { batchNumber: true } },
      cargoType: { select: { name: true } },
      // Totals only. Nothing about who raised it or how it was worked out.
      invoice: {
        select: {
          invoiceNumber: true,
          currency: true,
          total: true,
          amountPaid: true,
          exchangeRate: true,
          localCurrency: true,
          totalLocal: true,
        },
      },
    },
  });

  if (shipment) {
    const meta = SHIPMENT_STATUS_META[shipment.status];
    const invoice = shipment.invoice;

    let charge: PublicCharge | null = null;
    if (invoice) {
      const total = toNumber(invoice.total);
      const paid = toNumber(invoice.amountPaid);
      const outstanding = Math.max(0, total - paid);
      const rate = invoice.exchangeRate ? toNumber(invoice.exchangeRate) : null;

      charge = {
        invoiceNumber: invoice.invoiceNumber,
        currency: invoice.currency,
        total,
        paid,
        outstanding,
        localCurrency: rate === null ? null : invoice.localCurrency ?? "TZS",
        totalLocal: invoice.totalLocal
          ? toNumber(invoice.totalLocal)
          : rate === null
            ? null
            : toLocal(total, rate),
        outstandingLocal: rate === null ? null : toLocal(outstanding, rate),
        status: outstanding <= 0 ? "PAID" : paid > 0 ? "PART_PAID" : "UNPAID",
      };
    }

    // Deliberately mirrors the release rule the Dar warehouse enforces, so the
    // page never tells a customer to come and collect cargo that will be
    // refused at the counter.
    const landed =
      shipment.status === "RECEIVED_AT_DAR" ||
      shipment.status === "READY_FOR_PICKUP";
    const collectable = shipment.status === "READY_FOR_PICKUP";

    let collectionNote: string;
    if (shipment.status === "DELIVERED") {
      collectionNote = "Collected. Thank you for shipping with us.";
    } else if (shipment.status === "CANCELLED") {
      collectionNote = "This shipment was cancelled. Talk to us on WhatsApp.";
    } else if (collectable) {
      collectionNote =
        "Paid and ready. Bring your pickup note or this tracking number to our Kariakoo office.";
    } else if (landed && charge && charge.outstanding > 0) {
      collectionNote =
        "Your cargo has landed in Dar es Salaam. Settle the balance and we will release it the same day.";
    } else if (landed) {
      collectionNote =
        "Your cargo has landed and is being checked in. We will message you the moment it is ready.";
    } else if (shipment.status === "IN_TRANSIT") {
      collectionNote =
        "In the air. We will message you the moment it lands in Dar es Salaam.";
    } else {
      collectionNote =
        `Received at our ${ORIGIN_PUBLIC[shipment.origin] ?? shipment.origin} warehouse and ` +
        "waiting for the next flight. Nothing to collect yet.";
    }

    return {
      kind: "shipment",
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      statusLabel: meta.publicLabel,
      location: meta.publicLocation,
      batchNumber: shipment.batch?.batchNumber ?? null,
      packages: shipment.packages,
      description:
        shipment.cargoType?.name ??
        CATEGORY_LABELS[shipment.cargoCategory] ??
        "General cargo",
      weightKg: shipment.weightKg === null ? null : toNumber(shipment.weightKg),
      origin: ORIGIN_PUBLIC[shipment.origin] ?? shipment.origin,
      lastUpdate: shipment.updatedAt.toISOString(),
      timeline: buildTimeline(shipment),
      charge,
      collectable,
      collectionNote,
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
