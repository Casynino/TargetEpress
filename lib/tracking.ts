import "server-only";

import type { ShipmentStatus } from "@prisma/client";

import { CATEGORY_LABELS } from "@/lib/cargo";
import {
  SHIPMENT_FLOW,
  SHIPMENT_STATUS_META,
  STORAGE_POLICY,
  storageStatus,
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
  type PublicHoldState,
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
  /**
   * A hold, sitting between two real steps rather than being one of them.
   *
   * Coloured differently because it is not progress. Every other row on this
   * timeline is a step forward; this one is the journey stopping.
   */
  tone?: "hold";
};

/**
 * How far the cargo actually got before it was held.
 *
 * Read from the shipment's own stamps, never from the case. A stamp is a fact
 * about the customer's cargo — it landed, or it did not — and it is the only
 * thing needed to place the hold correctly. Nothing a member of staff typed
 * into the case is consulted; lib/tracking-investigation.ts explains why that
 * boundary is drawn where it is.
 */
export type HoldStage = "IN_CHINA" | "IN_TRANSIT" | "IN_DAR";

function holdStageOf(shipment: {
  departedAt: Date | null;
  arrivedAt: Date | null;
}): HoldStage {
  if (shipment.arrivedAt) return "IN_DAR";
  if (shipment.departedAt) return "IN_TRANSIT";
  return "IN_CHINA";
}

/**
 * What the hold is called, and where it stopped.
 *
 * This is the whole complaint answered: cargo that never landed was reading
 * exactly like cargo sitting damaged on the shelf in Kariakoo, because the
 * timeline went blank either way. Cargo that never arrived must not be shown as
 * arrived. Cargo that DID arrive keeps its arrival — it arrived, and the
 * problem came afterwards.
 */
const HOLD_STEP: Record<
  HoldStage,
  Record<PublicHoldState, { label: string; location: string }>
> = {
  IN_CHINA: {
    UNDER_INVESTIGATION: {
      label: "Held before the flight",
      location: "China warehouse — not loaded",
    },
    COMPENSATION_IN_PROGRESS: {
      label: "Claim being settled",
      location: "China warehouse — not loaded",
    },
  },
  IN_TRANSIT: {
    UNDER_INVESTIGATION: {
      label: "Did not arrive with the flight",
      location: "Being traced between China and Dar es Salaam",
    },
    COMPENSATION_IN_PROGRESS: {
      label: "Claim being settled",
      location: "Did not arrive with the flight",
    },
  },
  IN_DAR: {
    UNDER_INVESTIGATION: {
      label: "Arrived, then held for checking",
      location: "Dar es Salaam warehouse",
    },
    COMPENSATION_IN_PROGRESS: {
      label: "Claim being settled",
      location: "Dar es Salaam warehouse",
    },
  },
};

/** The badge at the top of the page, qualified by where the cargo stopped. */
const HOLD_HEADLINE: Record<HoldStage, Record<PublicHoldState, string>> = {
  IN_CHINA: {
    UNDER_INVESTIGATION: "In China — under investigation",
    COMPENSATION_IN_PROGRESS: "In China — compensation in progress",
  },
  IN_TRANSIT: {
    UNDER_INVESTIGATION: "In transit — under investigation",
    COMPENSATION_IN_PROGRESS: "In transit — compensation in progress",
  },
  IN_DAR: {
    UNDER_INVESTIGATION: "Arrived — under investigation",
    COMPENSATION_IN_PROGRESS: "Arrived — compensation in progress",
  },
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
  /**
   * The rate this invoice was raised at, so a customer can see how the
   * shilling figure was reached rather than being asked to trust it.
   *
   * The invoice's own, never today's — a bill quoted at 2,700 must still read
   * 2,700 next month or the customer believes the price changed.
   */
  exchangeRate: number | null;
  /** Freight, storage and anything added or taken off, as the invoice holds them. */
  lines: { label: string; amount: number }[];
  /**
   * Whether this figure can still move, and why.
   *
   * The owner's instruction: a customer must know the amount is not frozen
   * forever, even after Finance has confirmed it — storage runs daily once the
   * free window closes, and a shilling figure follows the rate. Saying so is
   * not a disclaimer, it is the reason to come and collect.
   *
   * Null once the bill is settled: nothing moves after that.
   */
  mayChange: string | null;
};

/**
 * What the warehouse clock says, for the customer looking at it.
 *
 * The owner's rule: a customer must never be surprised by a storage charge. So
 * the tracking page shows the same four facts the invoice will eventually
 * carry — how long it has been sitting, how much of the free week is left,
 * what has accrued and what a day costs — from the moment it lands, not from
 * the moment somebody is billed for it.
 *
 * Null until the cargo actually arrives in Dar. Cargo in the air has no
 * storage position, and printing "0 days" against it invites the question of
 * whether the clock has started.
 */
export type PublicStorage = {
  arrivedAt: string;
  daysInWarehouse: number;
  freeDays: number;
  freeDaysRemaining: number;
  chargeableDays: number;
  chargeUsd: number;
  perDayUsd: number;
  expired: boolean;
  lastFreeDay: boolean;
  collected: boolean;
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
  /** The warehouse clock, once the cargo has landed. Null before then. */
  storage: PublicStorage | null;
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

function buildTimeline(
  shipment: {
    status: ShipmentStatus;
    registeredAt: Date;
    departedAt: Date | null;
    arrivedAt: Date | null;
    readyForPickup: Date | null;
    deliveredAt: Date | null;
  },
  /** An open hold, if there is one. Null is the ordinary journey. */
  hold: { state: PublicHoldState; since: string | null } | null
): PublicTimelineEntry[] {
  const stamps: Record<string, Date | null> = {
    READY_TO_DEPART: shipment.registeredAt,
    IN_TRANSIT: shipment.departedAt,
    RECEIVED_AT_DAR: shipment.arrivedAt,
    READY_FOR_PICKUP: shipment.readyForPickup,
    DELIVERED: shipment.deliveredAt,
  };

  const step = (status: ShipmentStatus, done: boolean, current: boolean) => {
    const meta = SHIPMENT_STATUS_META[status];
    return {
      status,
      label: meta.publicLabel,
      location: meta.publicLocation,
      at: stamps[status]?.toISOString() ?? null,
      done,
      current,
    };
  };

  if (!hold) {
    const currentIndex = SHIPMENT_FLOW.indexOf(shipment.status);
    return SHIPMENT_FLOW.map((status, index) =>
      // A cancelled shipment has no current step at all.
      step(status, currentIndex >= 0 && index < currentIndex, currentIndex >= 0 && index === currentIndex)
    );
  }

  /**
   * Held: the timeline runs on the stamps, not on the status.
   *
   * UNDER_INVESTIGATION is not a point on SHIPMENT_FLOW, so indexOf returned
   * -1 and every step came back neither done nor current — the whole journey
   * greyed out, with no way to tell a consignment that never left the aircraft
   * from one sitting damaged on the shelf in Kariakoo. A stamp cannot lie about
   * that: the cargo either was checked in at Dar or it was not.
   */
  const stage = holdStageOf(shipment);
  const reached = SHIPMENT_FLOW.reduce(
    (last, status, index) => (stamps[status] ? index : last),
    -1
  );

  const entries: PublicTimelineEntry[] = SHIPMENT_FLOW.map((status, index) =>
    step(status, index <= reached, false)
  );

  const words = HOLD_STEP[stage][hold.state];
  entries.splice(reached + 1, 0, {
    status: "UNDER_INVESTIGATION",
    label: words.label,
    location: words.location,
    at: hold.since,
    done: false,
    current: true,
    tone: "hold",
  });

  return entries;
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
      /**
       * The bill, and how it was reached.
       *
       * The components are here now because the customer is sent a link that
       * says "see your full invoice" — and a page showing only a total cannot
       * answer the question that link promises to answer. Still nothing about
       * who raised it, who priced it or what anything cost us.
       */
      invoice: {
        select: {
          status: true,
          invoiceNumber: true,
          currency: true,
          total: true,
          amountPaid: true,
          exchangeRate: true,
          localCurrency: true,
          totalLocal: true,
          freightCost: true,
          freightOverride: true,
          storageDays: true,
          storageCharge: true,
          otherCharges: true,
          discount: true,
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
    // A draft is the system's working figure — nobody in Finance has looked at
    // it. Showing one here would put an unreviewed number in front of the
    // customer and then change it, so as far as this page is concerned a draft
    // is no invoice at all, and the rate-book estimate below stands instead.
    const invoice =
      shipment.invoice && shipment.invoice.status !== "DRAFT"
        ? shipment.invoice
        : null;

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
        exchangeRate: rate,
        /**
         * Read off the invoice, never recomputed.
         *
         * The figures the pricing engine produced are already stored on the
         * row; multiplying a weight by a rate here would be a second opinion
         * about what a customer owes, and the two would disagree the first
         * time Finance adjusted a freight charge by hand.
         */
        lines: [
          {
            // Finance's own figure when they set one, the rate book's when
            // they did not — the same precedence the invoice total was built
            // from, so the parts add up to the whole.
            label: "Usafirishaji (freight)",
            amount: toNumber(invoice.freightOverride ?? invoice.freightCost),
          },
          ...(toNumber(invoice.storageCharge) > 0
            ? [
                {
                  label: `Storage (siku ${invoice.storageDays})`,
                  amount: toNumber(invoice.storageCharge),
                },
              ]
            : []),
          ...(toNumber(invoice.otherCharges) > 0
            ? [{ label: "Gharama nyingine", amount: toNumber(invoice.otherCharges) }]
            : []),
          ...(toNumber(invoice.discount) > 0
            ? [{ label: "Punguzo", amount: -toNumber(invoice.discount) }]
            : []),
        ],
        mayChange:
          outstanding <= 0
            ? null
            : `This amount can still change — storage is charged for every day after the first ${STORAGE_POLICY.freeDays}, and the shilling figure follows the exchange rate on the day you pay. Collecting sooner keeps it lower.`,
      };
    }

    // The one thing that overrides the shipment's own status. A shipment can
    // sit at READY_FOR_PICKUP with a carton nobody can find — the record was
    // true when Finance issued the note and stopped being true at the counter.
    const investigation = derivePublicInvestigation(shipment.exceptions);
    const held = investigation?.blocksCollection ?? false;

    // Where the cargo actually stopped, read off its own stamps. Used for the
    // badge, the "Now at" line, the money note and the point the hold is
    // pinned to on the timeline, so all four agree.
    const stage = holdStageOf(shipment);

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
      baseNote = "This cargo was cancelled. Talk to us on WhatsApp.";
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

    /**
     * A hold replaces the note — "settle the balance and we will release it the
     * same day" is a promise nobody can keep on cargo that is being looked for.
     *
     * It does NOT repeat the investigation paragraph. That paragraph is already
     * printed at the top of the page, in the panel a held customer reads first;
     * printing it again over the money made the page say the same three
     * sentences twice, which reads as a fault in the page rather than emphasis.
     * This slot answers the question it sits next to — what happens to the
     * bill — and nothing else.
     *
     * A claim that is not holding anything (goods released, money still owed)
     * is added to the ordinary note instead of replacing it.
     */
    const HOLD_MONEY_NOTE: Record<HoldStage, string> = {
      IN_CHINA:
        "Nothing is owed while this is open — the cargo has not flown, so no freight has been billed.",
      IN_TRANSIT:
        "Nothing is due from you while we trace it. No invoice is raised on cargo that has not been checked in at Dar es Salaam.",
      IN_DAR:
        charge && charge.outstanding > 0
          ? "Your balance is frozen while this is open. Storage days are not counted against you, and nothing needs to be paid until it is settled."
          : "There is nothing to pay while this is open, and storage days are not counted against you.",
    };

    const collectionNote = investigation
      ? held
        ? HOLD_MONEY_NOTE[stage]
        : `${baseNote} ${investigation.note}`
      : baseNote;


    return {
      kind: "shipment",
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      // "Under investigation" alone could not tell a customer whether their
      // cargo is in Dar or somewhere over the Indian Ocean. The stage says.
      statusLabel: investigation
        ? held
          ? HOLD_HEADLINE[stage][investigation.state]
          : investigation.label
        : meta.publicLabel,
      statusTone: investigation
        ? investigation.state === "COMPENSATION_IN_PROGRESS"
          ? "info"
          : "warning"
        : meta.tone,
      // Only a hold moves the cargo somewhere else. A settlement being paid on
      // goods the customer already has does not.
      location: held
        ? HOLD_STEP[stage][investigation!.state].location
        : meta.publicLocation,
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
      /* The warehouse clock, once there is one to read. */
      storage: ((): PublicStorage | null => {
        if (!shipment.arrivedAt) return null;
        const st = storageStatus(shipment.arrivedAt, shipment.deliveredAt);
        return {
          arrivedAt: shipment.arrivedAt.toISOString(),
          daysInWarehouse: st.daysInWarehouse,
          freeDays: st.freeDays,
          freeDaysRemaining: st.freeDaysRemaining,
          chargeableDays: st.chargeableDays,
          chargeUsd: st.chargeUsd,
          perDayUsd: st.perDayUsd,
          expired: st.expired,
          lastFreeDay: st.lastFreeDay,
          collected: st.collected,
        };
      })(),
      origin: ORIGIN_PUBLIC[shipment.origin] ?? shipment.origin,
      lastUpdate: shipment.updatedAt.toISOString(),
      timeline: buildTimeline(
        {
          ...shipment,
          // A held shipment must not show "Ready for pickup" as reached. The
          // stamp is real — Finance issued the note before the problem was
          // found — but it no longer describes anything the customer can act
          // on, and the timeline is built from the stamps.
          readyForPickup: held ? null : shipment.readyForPickup,
        },
        held && investigation
          ? { state: investigation.state, since: investigation.since }
          : null
      ),
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
