import "server-only";

import type {
  ExceptionType,
  Role,
  ShipmentStatus,
} from "@prisma/client";

import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

/**
 * The two rules Cargo Found turns on, and the gate on reading a payout.
 *
 * The rules live here rather than in lib/actions/investigations.ts because a
 * "use server" module can only export async functions, and these two are worth
 * testing on their own — prisma/verify-investigations.ts does exactly that.
 * The action keeps the orchestration; this file keeps the decisions.
 */

/**
 * Did this kind of case say cargo was absent from the floor?
 *
 * Only these three types took boxes off the manifest, so only these three put
 * them back. Marking every package received on, say, a damage case would tick
 * boxes nobody has seen — the exact lie the release counter exists to catch.
 *
 * Exhaustive on purpose, like CARGO_PHYSICALLY_HERE in lib/actions/batches.ts:
 * a new ExceptionType stops this file compiling until somebody answers the
 * question for it.
 */
export const REPORTED_CARGO_ABSENT: Record<ExceptionType, boolean> = {
  // Nothing came off the plane, or nothing could be found at the counter.
  MISSING_SHIPMENT: true,
  // Four of five boxes arrived; finding the fifth is what closes this.
  PACKAGE_COUNT_MISMATCH: true,
  // The cargo travelled on a batch it did not belong to and turned up there.
  WRONG_BATCH: true,
  // Left behind and arriving on the next flight: the boxes were never on the
  // floor, and it is that flight landing which puts them there.
  SHORT_LANDED: true,
  // Released by the authority is the same event as found, for these boxes.
  HELD_BY_CUSTOMS: true,
  // All of these were raised on cargo standing in the warehouse. The boxes were
  // never absent, so finding them is not what resolves the case.
  DAMAGED_CARGO: false,
  WEIGHT_MISMATCH: false,
  WRONG_ITEM: false,
  // These three were raised on boxes already standing in the warehouse.
  // Naming the owner, clearing the item, or working out whose the spare box is
  // settles the question — none of them puts a carton on the floor that was
  // not already there, and ticking one as received would be a lie.
  UNIDENTIFIED_CARGO: false,
  RESTRICTED_ITEM: false,
  OVER_SHIPPED: false,
  HOLD_FOR_INVESTIGATION: false,
  // Unknown problem, so no assumption about boxes. Ticking a package on a guess
  // is worse than leaving the shipment short.
  OTHER: false,
};

/**
 * Where found cargo goes back to.
 *
 * The honest answer comes from ShipmentStatusHistory: the last transition
 * recorded at or before the case was raised is the status the case interrupted.
 * When there is no history at all — old rows, or cargo that never moved — the
 * shipment's current status stands in, and that is the only guess in here.
 *
 * Then it is clamped, and the clamp matters more than the lookup:
 *
 *  - READY_FOR_PICKUP is restored as itself. That is the counter case: the
 *    customer had paid, the note was live, the box could not be found, and now
 *    it can.
 *  - Everything else returns to RECEIVED_AT_DAR. Somebody is standing in the
 *    Dar warehouse holding the cargo — that is what "found" means — so
 *    restoring IN_TRANSIT or READY_TO_DEPART would put a box that is on the
 *    floor back "in the air": invisible to Available Cargo, invisible at
 *    the counter, and a lie on the customer's tracking page. DELIVERED and
 *    CANCELLED never reach here; the action refuses them outright, because
 *    cargo that was handed over or voided is not a warehouse problem.
 *
 * The upgrade to READY_FOR_PICKUP for cargo that is already paid for is the
 * caller's, because it depends on a pickup note and on whether any other case
 * is still open on the same cargo.
 */
export function restoredStatus(
  recorded: ShipmentStatus | null,
  current: ShipmentStatus
): ShipmentStatus {
  const previous = recorded ?? current;
  return previous === "READY_FOR_PICKUP" ? "READY_FOR_PICKUP" : "RECEIVED_AT_DAR";
}

/**
 * Reading a compensation record without leaking it.
 *
 * The owner's rule is short: warehouse users never see prices. Rules like that
 * fail one render at a time — somebody adds a column to a table, or a debug
 * line to a card, and a payout appears on a warehouse phone. So the gate is put
 * here, in the data access, rather than in the markup: for a reader without
 * `finance.view` the figure is never fetched, never serialised into the RSC
 * payload, and simply is not present in the object a component receives.
 *
 * Everything outside `money` is safe for any desk that can open the case: that
 * a settlement exists, whether it has been paid, when and from which account. The
 * Dar floor needs that much to answer a customer at the counter, and none of it
 * is a price.
 */

export type CompensationView = {
  exists: boolean;
  /** Recorded but not yet paid out — the dashboard's "Compensation Pending". */
  pending: boolean;
  paidAt: Date | null;
  note: string | null;
  recordedByName: string | null;
  recordedAt: Date | null;
  /**
   * Null for every reader without finance.view. The amount stays a string all
   * the way out of the database — it is a Decimal in Postgres and a Decimal in
   * Prisma, and turning it into a JavaScript number on the way to a screen is
   * how a shilling goes missing.
   */
  money: { amount: string; currency: string; formatted: string } | null;
};

const EMPTY: CompensationView = {
  exists: false,
  pending: false,
  paidAt: null,
  note: null,
  recordedByName: null,
  recordedAt: null,
  money: null,
};

export async function getCompensation(
  exceptionId: string,
  role: Role | null | undefined
): Promise<CompensationView> {
  const row = await prisma.compensation.findUnique({
    where: { exceptionId },
    select: {
      amount: true,
      currency: true,
      paidAt: true,
      note: true,
      createdAt: true,
      recordedBy: { select: { name: true } },
    },
  });
  if (!row) return EMPTY;

  const money = can(role, "finance.view")
    ? {
        amount: row.amount.toFixed(2),
        currency: row.currency,
        formatted: formatMoney(row.amount, row.currency),
      }
    : null;

  return {
    exists: true,
    pending: row.paidAt === null,
    paidAt: row.paidAt,
    // Free text can quote a figure, so it travels with the figure — the same
    // gate app/app/exceptions/page.tsx applies to this column.
    note: money ? row.note : null,
    recordedByName: row.recordedBy?.name ?? null,
    recordedAt: row.createdAt,
    money,
  };
}

/**
 * The "Compensation Pending" dashboard card: a settlement that exists and has
 * not been paid. A count is not a price, so this one is open to any desk that
 * can see the queue.
 */
export async function compensationPendingCount(): Promise<number> {
  return prisma.compensation.count({ where: { paidAt: null } });
}
