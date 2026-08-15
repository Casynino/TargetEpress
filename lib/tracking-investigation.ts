import "server-only";

import type { ExceptionStatus, ExceptionType, Prisma } from "@prisma/client";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import {
  PICKUP_LOCKING_STATUSES,
  PICKUP_LOCKING_TYPES,
  caseLocksPickup,
} from "@/lib/pickup-lock";
import { prisma } from "@/lib/prisma";

/**
 * What an investigation does to the *customer's* view of their cargo.
 *
 * The rule this file exists to enforce, in the owner's words: a customer must
 * never be told "Ready for Pickup" for cargo that is missing, damaged or
 * otherwise unavailable. Before this, the public page derived everything from
 * `Shipment.status` alone — so a box that was flagged missing at the counter
 * five minutes after Finance issued the pickup note still read "Ready for
 * pickup" on the website, and the customer travelled to Kariakoo for nothing.
 *
 * Two disciplines apply to everything exported here:
 *
 *  1. The state is DERIVED from the open case, never stored a second time on
 *     the shipment. A denormalised "under investigation" flag is a flag that
 *     goes stale the day someone closes a case in a hurry, and the stale copy
 *     is the one the public page would be reading.
 *
 *  2. Nothing a member of staff typed ever leaves this module. The select is an
 *     allow-list of three columns — type, status, raisedAt — plus whether a
 *     compensation record has been paid. Descriptions, notes, severities,
 *     photos, actor names and compensation AMOUNTS are deliberately not read,
 *     so they cannot leak through a spread or a careless `...case`. The public
 *     copy below is written by us and is identical whatever the case type: the
 *     customer learns the state and that someone is on it, nothing more.
 */

export type PublicHoldState = "UNDER_INVESTIGATION" | "COMPENSATION_IN_PROGRESS";

/** Badge tones, matching the six the design system already uses. */
export type PublicTone =
  | "muted"
  | "info"
  | "warning"
  | "success"
  | "brand"
  | "destructive";

export type PublicInvestigation = {
  state: PublicHoldState;
  /** The public status words. Replaces the shipment's own status label. */
  label: string;
  /** Where the cargo is, in a customer's terms. */
  location: string;
  /** One paragraph: the state, and that someone is on it. Written by us. */
  note: string;
  /**
   * When the hold began, as an ISO date. This is a fact about the customer's
   * own cargo — not about who reported it or what they wrote.
   */
  since: string | null;
  /**
   * True when the cargo must not be handed over. The public page must not show
   * "Ready for pickup", and the timeline must not run past "Arrived", while
   * this is set.
   */
  blocksCollection: boolean;
};

/**
 * Which cases hold cargo is NOT decided here.
 *
 * It is decided once, in lib/pickup-lock.ts, and both the counter and this page
 * ask that one module. A second table would agree on the day it was written and
 * drift the first time somebody changed one of them — and the shape of that
 * drift is precisely the bug this work exists to remove: a customer told
 * "Ready for Pickup" for a box the counter will refuse to hand over, or told
 * "Under Investigation" about cargo sitting ready on the shelf.
 *
 * `caseLocksPickup` is exhaustive over both ExceptionType and ExceptionStatus,
 * so a new lifecycle value stops the build there rather than silently reaching
 * the public page as "collectable".
 */
export const PUBLIC_HOLD_TYPES: ExceptionType[] = PICKUP_LOCKING_TYPES;

/**
 * The cases the public page needs to know about.
 *
 * Two arms, because they answer different questions. The first is "can this
 * cargo be collected" — an unfinished case of a type that holds cargo. The
 * second is "does this customer have money coming" — an unpaid compensation
 * record, which stays true for the customer even after the cargo case itself
 * has been closed and the goods released.
 */
export const PUBLIC_TRACKING_CASE_WHERE = {
  OR: [
    {
      status: { in: PICKUP_LOCKING_STATUSES },
      type: { in: PICKUP_LOCKING_TYPES },
    },
    { compensation: { is: { paidAt: null } } },
  ],
} satisfies Prisma.ShipmentExceptionWhereInput;

/**
 * The only four values that may cross into public code.
 *
 * Note what is absent: `description`, `resolutionNote`, `severity`,
 * `raisedBy`, `assignedTo`, `events`, `photos`, and every column of
 * `Compensation` except whether it has been paid. The amount of a settlement
 * is between Finance and the customer's own conversation with them — it is not
 * a fact for a page anyone with a tracking number can load.
 */
export const PUBLIC_TRACKING_CASE_SELECT = {
  type: true,
  status: true,
  raisedAt: true,
  compensation: { select: { paidAt: true } },
} satisfies Prisma.ShipmentExceptionSelect;

/** Exactly what PUBLIC_TRACKING_CASE_SELECT returns. */
export type PublicTrackingCase = {
  type: ExceptionType;
  status: ExceptionStatus;
  raisedAt: Date;
  compensation: { paidAt: Date | null } | null;
};

/** A settlement has been agreed and the money has not gone out yet. */
function claimPending(row: PublicTrackingCase) {
  return row.compensation !== null && row.compensation.paidAt === null;
}

/**
 * The case has moved past "what happened" into "how we put it right".
 *
 * REPLACEMENT_APPROVED is deliberately NOT counted here. It is a remedy, but it
 * is not compensation, and a customer who reads "compensation in progress" has
 * been told they are getting money. Replacement cases stay under investigation
 * on the public page until they are closed.
 */
function inRemedyPhase(row: PublicTrackingCase) {
  return row.status === "COMPENSATION_APPROVED" || claimPending(row);
}

function earliest(rows: PublicTrackingCase[]): string | null {
  if (rows.length === 0) return null;
  return rows
    .reduce((oldest, row) => (row.raisedAt < oldest.raisedAt ? row : oldest))
    .raisedAt.toISOString();
}

/**
 * Turn a shipment's cases into the one thing the customer is shown.
 *
 * Pure and synchronous so the shipment query can select the cases inline and so
 * this can be unit-checked against rows nobody had to create in the database.
 *
 * `locale` is last and defaults to English so the public tracking page — which
 * has always been English — is unchanged by adding it. A staff screen that
 * renders the same derived hold passes the reader's language and gets Chinese.
 */
export function derivePublicInvestigation(
  cases: PublicTrackingCase[],
  locale: Locale = "en"
): PublicInvestigation | null {
  // Unfinished, and of a kind that means the cargo is not available. Exactly
  // the set the counter refuses to release — same function, same answer.
  const holding = cases.filter(caseLocksPickup);

  if (holding.length > 0) {
    // Only call it compensation when every open case is at that stage. One
    // carton still being looked for outranks a settlement agreed on another —
    // "we are still checking" is the more honest headline of the two.
    const state: PublicHoldState = holding.every(inRemedyPhase)
      ? "COMPENSATION_IN_PROGRESS"
      : "UNDER_INVESTIGATION";

    return state === "COMPENSATION_IN_PROGRESS"
      ? {
          state,
          label: t(locale, "Compensation in progress"),
          location: t(locale, "With our claims team"),
          note: t(
            locale,
            "We have agreed how to put this right and your claim is being processed. There is nothing to collect in the meantime — we will contact you with the outcome."
          ),
          since: earliest(holding),
          blocksCollection: true,
        }
      : {
          state,
          label: t(locale, "Under investigation"),
          location: t(locale, "Held by our team"),
          note: t(
            locale,
            "This cargo is on hold while our team checks a problem with it, so it cannot be collected yet. We are working on it and will contact you as soon as it is settled."
          ),
          since: earliest(holding),
          blocksCollection: true,
        };
  }

  // No hold on the cargo, but money is still owed to the customer — a damaged
  // shipment released to them with a settlement agreed, for instance. They
  // should be able to see that it has not been forgotten.
  const owed = cases.filter(claimPending);
  if (owed.length > 0) {
    return {
      state: "COMPENSATION_IN_PROGRESS",
      label: t(locale, "Compensation in progress"),
      location: t(locale, "With our claims team"),
      note: t(
        locale,
        "A claim on this cargo is being processed. We will contact you with the outcome."
      ),
      since: earliest(owed),
      blocksCollection: false,
    };
  }

  return null;
}

/**
 * The same answer, for callers that have a shipment id rather than its rows.
 *
 * `trackByCode` selects the cases inline instead of calling this, to keep the
 * public page on one round trip.
 */
export async function publicInvestigationForShipment(
  shipmentId: string,
  locale: Locale = "en"
): Promise<PublicInvestigation | null> {
  const cases = await prisma.shipmentException.findMany({
    where: { shipmentId, ...PUBLIC_TRACKING_CASE_WHERE },
    select: PUBLIC_TRACKING_CASE_SELECT,
  });
  return derivePublicInvestigation(cases, locale);
}
