import "server-only";

import type { ShipmentStatus } from "@prisma/client";

import { CATEGORY_LABELS } from "@/lib/cargo";
import {
  SHIPMENT_FLOW,
  SHIPMENT_STATUS_META,
  formatPackages,
} from "@/lib/constants";
import { normaliseCode, toNumber } from "@/lib/format";
import { toLocal } from "@/lib/fx";
import { quote } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import {
  PUBLIC_TRACKING_CASE_SELECT,
  PUBLIC_TRACKING_CASE_WHERE,
  derivePublicInvestigation,
  type PublicInvestigation,
  type PublicTone,
} from "@/lib/tracking-investigation";

export type { PublicInvestigation, PublicTone } from "@/lib/tracking-investigation";

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

/**
 * A price worked out from the rate book, for cargo Finance has not billed yet.
 *
 * Explicitly an estimate. The real invoice can differ on the exchange rate of
 * the day, a discount, special handling, or simply because the scale said
 * something different from what the customer expected.
 */
export type PublicEstimate = {
  currency: string;
  total: number;
  basis: string;
};

export type PublicShipment = {
  kind: "shipment";
  trackingNumber: string;
  /**
   * Initials, not the full name. Tracking numbers run in sequence, so anyone
   * who has one can count upwards; publishing names against them would turn
   * this page into a customer directory. Initials are enough to confirm you
   * are looking at your own cargo.
   */
  customerInitials: string;
  registeredAt: string | null;
  expectedArrival: string | null;
  /** Proof-of-condition photos taken at the counter. */
  photos: { id: string; url: string }[];
  /** Only when there is no invoice yet — otherwise the real charge is shown. */
  estimate: PublicEstimate | null;
  status: ShipmentStatus;
  /**
   * What the customer is told, which is NOT always the shipment's own status.
   * An open investigation speaks over it — see `investigation`.
   */
  statusLabel: string;
  /** Badge tone for `statusLabel`, decided here so the page cannot re-derive it
   *  from `status` and contradict the label sitting next to it. */
  statusTone: PublicTone;
  location: string;
  batchNumber: string | null;
  packages: number;
  /** With its unit — a customer should never have to ask "20 what?". */
  packagesLabel: string;
  /**
   * How many of the customer's packages have arrived in Dar, and how many have
   * been collected. Null while the cargo is still in China, where a
   * package-by-package count would only invite questions nobody can answer yet.
   */
  packageProgress: {
    total: number;
    arrived: number;
    collected: number;
    label: string;
  } | null;
  /** What was sent, in the words of the price list. */
  description: string;
  weightKg: number | null;
  origin: string;
  lastUpdate: string | null;
  timeline: PublicTimelineEntry[];
  charge: PublicCharge | null;
  /**
   * Cargo has landed, is paid for, is waiting to be collected — and no open
   * investigation is holding it. All four, or this is false.
   */
  collectable: boolean;
  /** Why not, when it is not — in a customer's terms. */
  collectionNote: string;
  /**
   * The state, and that someone is on it. Null when there is nothing open.
   * Derived from the case on every request, never stored on the shipment.
   */
  investigation: PublicInvestigation | null;
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
      packageType: true,
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
      cargoType: { select: { id: true, name: true } },
      cargoTypeId: true,
      customer: { select: { name: true } },
      batchId: true,
      photos: {
        // Condition on arrival at the China counter. Delivery photos are
        // deliberately excluded: they show a person's face at a handover.
        where: { kind: "CARGO" },
        orderBy: { createdAt: "asc" },
        take: 6,
        select: { id: true, url: true },
      },
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
      packageList: {
        select: { sequence: true, receivedAt: true, deliveredAt: true },
        orderBy: { sequence: "asc" },
      },
      // Open investigations, read through an allow-list that carries no staff
      // words at all — type, status, when it started, and whether a settlement
      // has been paid. See lib/tracking-investigation.ts.
      exceptions: {
        where: PUBLIC_TRACKING_CASE_WHERE,
        select: PUBLIC_TRACKING_CASE_SELECT,
      },
    },
  });

  if (shipment) {
    const meta = SHIPMENT_STATUS_META[shipment.status];
    const invoice = shipment.invoice;

    // What the flight is expected to land, when the cargo is on one.
    const expectedArrival = shipment.batchId
      ? (
          await prisma.batch.findUnique({
            where: { id: shipment.batchId },
            select: { expectedArrival: true },
          })
        )?.expectedArrival ?? null
      : null;

    // Finance has not billed it yet, so price it from the published rate book.
    // This is the number a customer wants long before an invoice exists, and
    // withholding it just sends them to WhatsApp to ask.
    let estimate: PublicEstimate | null = null;
    if (!invoice && shipment.weightKg) {
      const priced = await quote({
        category: shipment.cargoCategory,
        cargoTypeId: shipment.cargoTypeId,
        weightKg: toNumber(shipment.weightKg),
        // Pieces, for per-item cargo. The estimate a customer reads here and
        // the invoice Finance raises have to be the same arithmetic, or we
        // quote one number and bill another.
        quantity: shipment.packages,
      });
      if (priced.ok) {
        estimate = {
          currency: priced.currency,
          total: priced.total,
          basis: priced.basis,
        };
      }
    }

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

    // The one thing that overrides the shipment's own status. A shipment can
    // sit at READY_FOR_PICKUP with a carton nobody can find — the record was
    // true when Finance issued the note and stopped being true at the counter.
    const investigation = derivePublicInvestigation(shipment.exceptions);
    const held = investigation?.blocksCollection ?? false;

    // Deliberately mirrors the release rule the Dar warehouse enforces, so the
    // page never tells a customer to come and collect cargo that will be
    // refused at the counter.
    const landed =
      shipment.status === "RECEIVED_AT_DAR" ||
      shipment.status === "READY_FOR_PICKUP";
    const collectable = shipment.status === "READY_FOR_PICKUP" && !held;

    let baseNote: string;
    if (shipment.status === "DELIVERED") {
      baseNote = "Collected. Thank you for shipping with us.";
    } else if (shipment.status === "CANCELLED") {
      baseNote = "This shipment was cancelled. Talk to us on WhatsApp.";
    } else if (collectable) {
      baseNote =
        "Paid and ready. Bring your pickup note or this tracking number to our Kariakoo office.";
    } else if (landed && charge && charge.outstanding > 0) {
      baseNote =
        "Your cargo has landed in Dar es Salaam. Settle the balance and we will release it the same day.";
    } else if (landed) {
      baseNote =
        "Your cargo has landed and is being checked in. We will message you the moment it is ready.";
    } else if (shipment.status === "IN_TRANSIT") {
      baseNote =
        "In the air. We will message you the moment it lands in Dar es Salaam.";
    } else {
      baseNote =
        `Received at our ${ORIGIN_PUBLIC[shipment.origin] ?? shipment.origin} warehouse and ` +
        "waiting for the next flight. Nothing to collect yet.";
    }

    // A hold replaces the note outright — "settle the balance and we will
    // release it the same day" is a promise nobody can keep on cargo that is
    // being looked for. A claim that is not holding anything (the goods were
    // released, the money was not) is added to it instead.
    const collectionNote = investigation
      ? held
        ? investigation.note
        : `${baseNote} ${investigation.note}`
      : baseNote;

    // The timeline must not run past what is true either. A held shipment is
    // shown as far as "Arrived in Tanzania" — its pickup stamp is real but it
    // no longer describes anything the customer can act on.
    const timelineStatus: ShipmentStatus =
      held && shipment.status === "READY_FOR_PICKUP"
        ? "RECEIVED_AT_DAR"
        : shipment.status;

    return {
      kind: "shipment",
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      statusLabel: investigation ? investigation.label : meta.publicLabel,
      statusTone: investigation
        ? investigation.state === "COMPENSATION_IN_PROGRESS"
          ? "info"
          : "warning"
        : meta.tone,
      // Only a hold moves the cargo somewhere else. A settlement being paid on
      // goods the customer already has does not.
      location: held ? investigation!.location : meta.publicLocation,
      batchNumber: shipment.batch?.batchNumber ?? null,
      packages: shipment.packages,
      packagesLabel: formatPackages(shipment.packages, shipment.packageType),
      customerInitials: initialsOf(shipment.customer.name),
      registeredAt: shipment.registeredAt.toISOString(),
      expectedArrival: expectedArrival ? expectedArrival.toISOString() : null,
      photos: shipment.photos,
      estimate,
      packageProgress: landed || shipment.status === "DELIVERED"
        ? (() => {
            const arrived = shipment.packageList.filter(
              (pkg) => pkg.receivedAt
            ).length;
            const collected = shipment.packageList.filter(
              (pkg) => pkg.deliveredAt
            ).length;
            const total = shipment.packageList.length;
            return {
              total,
              arrived,
              collected,
              label:
                collected === total && total > 0
                  ? `All ${formatPackages(total, shipment.packageType)} collected`
                  : `${arrived} of ${formatPackages(total, shipment.packageType)} arrived in Dar es Salaam`,
            };
          })()
        : null,
      description:
        shipment.cargoType?.name ??
        CATEGORY_LABELS[shipment.cargoCategory] ??
        "General cargo",
      weightKg: shipment.weightKg === null ? null : toNumber(shipment.weightKg),
      origin: ORIGIN_PUBLIC[shipment.origin] ?? shipment.origin,
      lastUpdate: shipment.updatedAt.toISOString(),
      timeline: buildTimeline({
        ...shipment,
        status: timelineStatus,
        // Dropped with the step it belongs to: a "ready for pickup" date under
        // a step the customer has not reached yet reads as a contradiction.
        readyForPickup:
          timelineStatus === shipment.status ? shipment.readyForPickup : null,
      }),
      charge,
      collectable,
      collectionNote,
      investigation,
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


/**
 * "John Mwanga" → "J. M."
 *
 * Enough for someone to recognise their own shipment, not enough to harvest a
 * name against every tracking number in sequence.
 */
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  if (parts.length === 0) return "—";
  return parts.map((part) => `${part[0].toUpperCase()}.`).join(" ");
}
