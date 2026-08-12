import type { ExceptionStatus, ExceptionType } from "@prisma/client";

import {
  EXCEPTION_OPEN_STATUSES,
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_TYPE_LABELS,
} from "@/lib/constants";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import type { TxClient } from "@/lib/prisma";

/**
 * The pickup lock: does an investigation stop this cargo leaving the building?
 *
 * The shipment record says READY_FOR_PICKUP and Finance has issued a note, and
 * both can be true of a box nobody can find. Those two facts are about money
 * and paperwork; whether the cargo may be handed over is a third, separate
 * question, and it is answered here — in one place, so the counter, the queue
 * and the customer's tracking page cannot give three different answers.
 *
 * Two dimensions, both written as exhaustive maps on purpose. Add a value to
 * `ExceptionStatus` or `ExceptionType` in the schema and this file stops
 * compiling until somebody states, for that new value, whether a customer may
 * walk out with the box. Neither answer is guessable, and the cost of guessing
 * wrong is either a released box that should have been held or a warehouse full
 * of cargo nobody is allowed to hand over.
 */

/**
 * WHERE IS THE CASE IN ITS LIFECYCLE?
 *
 * Everything unfinished locks. The three terminal outcomes do not, and
 * CARGO_FOUND is the load-bearing one: the box is back on the shelf, so the
 * lock has to come off by itself the moment the case reaches that status.
 * Nobody has to remember to unlock anything.
 *
 * RESOLVED and WRITTEN_OFF are the pre-lifecycle values. New code never writes
 * them, but old rows carry them and they mean "finished", so they release.
 */
const STATUS_LOCKS_PICKUP = {
  OPEN: true,
  UNDER_INVESTIGATION: true,
  WAITING_CUSTOMER: true,
  // Approved is not paid, and neither is a decision to hand cargo over. The
  // case is still live, so the cargo is still held.
  COMPENSATION_APPROVED: true,
  REPLACEMENT_APPROVED: true,
  // Found. It is on the shelf again and goes back into the normal flow.
  CARGO_FOUND: false,
  CLOSED: false,
  RESOLVED: false,
  WRITTEN_OFF: false,
} as const satisfies Record<ExceptionStatus, boolean>;

/**
 * WHAT KIND OF PROBLEM IS IT?
 *
 * A live case is not automatically a reason to refuse a customer. This map
 * separates "something is wrong with the cargo" from "something is wrong with
 * the paperwork about the cargo", because conflating them is how a warehouse
 * ends up unable to release anything: weight disputes are never closed
 * promptly, and if one of them locked the counter, cargo would sit for weeks
 * over an argument about a billing figure.
 *
 * The rule is physical. Lock when the box the customer would receive is not
 * the box they are owed.
 */
const TYPE_LOCKS_PICKUP = {
  // Nothing to hand over.
  MISSING_SHIPMENT: true,
  // Whether damaged cargo is released, replaced or returned is the
  // investigation's decision, not the counter's. Until it is made, it is held.
  DAMAGED_CARGO: true,
  // The box is here; what is inside it is not what the customer bought.
  WRONG_ITEM: true,
  // Short. Handing over four of five boxes is how a claim starts.
  PACKAGE_COUNT_MISMATCH: true,
  // A deliberate quarantine. Releasing quarantined cargo defeats the point.
  HOLD_FOR_INVESTIGATION: true,

  // Paperwork, not cargo. The right box is on the floor for the right
  // customer, and the pickup note already settled the money — a disagreement
  // about the billed weight is Finance's to close, and holding the customer's
  // goods hostage to it is not this system's job.
  WEIGHT_MISMATCH: false,
  // Recorded against the wrong batch. A filing error about cargo that is
  // physically correct and physically here.
  WRONG_BATCH: false,

  // Unclassified. Somebody wrote free text saying something is wrong with this
  // cargo and did not say what — which is precisely the moment to stop at the
  // counter and read it. Clearing it costs one click for whoever knows what it
  // was; releasing it wrongly costs a claim.
  OTHER: true,
} as const satisfies Record<ExceptionType, boolean>;

type LockingStatus = {
  [K in keyof typeof STATUS_LOCKS_PICKUP]: (typeof STATUS_LOCKS_PICKUP)[K] extends true
    ? K
    : never;
}[keyof typeof STATUS_LOCKS_PICKUP];

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Compile-time cross-check: the counter's idea of "still live" is exactly the
 * queue's `EXCEPTION_OPEN_STATUSES`.
 *
 * Two lists that must agree will eventually stop agreeing. This makes the
 * disagreement a build error instead of a customer being told "Under
 * Investigation" for cargo the counter is happily handing over.
 */
const _lockAgreesWithQueue: Same<
  LockingStatus,
  (typeof EXCEPTION_OPEN_STATUSES)[number]
> = true;
void _lockAgreesWithQueue;

export function statusLocksPickup(status: ExceptionStatus): boolean {
  return STATUS_LOCKS_PICKUP[status];
}

export function typeLocksPickup(type: ExceptionType): boolean {
  return TYPE_LOCKS_PICKUP[type];
}

/**
 * The single question. Both dimensions must say "hold" for the cargo to be
 * locked: a live case about the wrong billed weight does not stop a handover,
 * and a closed case about a missing box does not either.
 */
export function caseLocksPickup(kase: {
  type: ExceptionType;
  status: ExceptionStatus;
}): boolean {
  return statusLocksPickup(kase.status) && typeLocksPickup(kase.type);
}

/** For Prisma `status: { in: … }`. Derived, so it can never drift from the map. */
export const PICKUP_LOCKING_STATUSES: ExceptionStatus[] = (
  Object.keys(STATUS_LOCKS_PICKUP) as ExceptionStatus[]
).filter((status) => STATUS_LOCKS_PICKUP[status]);

/** For Prisma `type: { in: … }`. Derived, same reason. */
export const PICKUP_LOCKING_TYPES: ExceptionType[] = (
  Object.keys(TYPE_LOCKS_PICKUP) as ExceptionType[]
).filter((type) => TYPE_LOCKS_PICKUP[type]);

export type PickupLock = {
  id: string;
  type: ExceptionType;
  status: ExceptionStatus;
  description: string;
};

/**
 * The case holding this cargo, if there is one.
 *
 * Oldest first: when several problems are live, the one to put in front of the
 * operator is the one that has been unanswered longest. Never ordered by
 * status — Postgres appended the new lifecycle values after the legacy two, so
 * enum sort order is not lifecycle order.
 */
export async function findPickupLock(
  tx: TxClient,
  shipmentId: string
): Promise<PickupLock | null> {
  return tx.shipmentException.findFirst({
    where: {
      shipmentId,
      status: { in: PICKUP_LOCKING_STATUSES },
      type: { in: PICKUP_LOCKING_TYPES },
    },
    orderBy: { raisedAt: "asc" },
    select: { id: true, type: true, status: true, description: true },
  });
}

/** Short human handle for a case, e.g. "#K3F9QZ". Cuids are not readable aloud. */
export function caseReference(exceptionId: string) {
  return `#${exceptionId.slice(-6).toUpperCase()}`;
}

/**
 * What the operator at the counter is told. Names the case, because "release
 * refused" with no reason is how somebody talks themselves into overriding it.
 */
export function pickupLockMessage(
  lock: PickupLock,
  trackingNumber: string,
  locale: Locale = "en"
) {
  // The tracking number and the case reference are data and stay put; every
  // word around them goes through the dictionary, so the sentence reads in one
  // language rather than two. The brackets close in the reader's punctuation.
  const closer = locale === "zh" ? "）。" : ").";
  const comma = locale === "zh" ? "，" : ", ";
  return (
    `${trackingNumber} ${t(locale, "is under investigation —")} ${t(locale, EXCEPTION_TYPE_LABELS[lock.type])}${comma}` +
    `${t(locale, "currently")} "${t(locale, EXCEPTION_STATUS_LABELS[lock.status])}" ${t(locale, "(case")} ${caseReference(lock.id)}${closer} ` +
    `${t(locale, "Do not hand this cargo over. The case has to be closed in Issues & Claims first.")}`
  );
}
