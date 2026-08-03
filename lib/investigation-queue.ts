import type { Prisma } from "@prisma/client";

import { EXCEPTION_GROUPS } from "@/components/app/exception-card";
import { EXCEPTION_OPEN_STATUSES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * The six numbers the owner asked to see above the investigation queue.
 *
 * Every one is a real count against the database, not a slice of whatever
 * happened to be loaded into the table below — the table is paged and filtered,
 * and a card that only counted the visible rows would read "0 damaged" while
 * three damaged cases sat one pill away.
 *
 * Each card is also a filter. A number nobody can click is a number nobody
 * checks, so pressing "Damaged cargo" puts exactly those cases in the table.
 */

/**
 * Which set of cases a card selects. Orthogonal to the type pills — the pills
 * narrow whatever set is showing, so "Cargo found" + "Damaged" is a legitimate
 * and useful question.
 */
export type QueueSet = "open" | "found" | "compensation" | "closed";

export const QUEUE_SETS: QueueSet[] = ["open", "found", "compensation", "closed"];

export function isQueueSet(value: string | undefined): value is QueueSet {
  return !!value && (QUEUE_SETS as string[]).includes(value);
}

/**
 * Cargo that was soft-deleted is gone from every normal view, and a case on a
 * record nobody can open is a dead end. Every count and every list starts here.
 */
export const LIVE_CARGO: Prisma.ShipmentExceptionWhereInput = {
  shipment: { deletedAt: null },
};

const OPEN: Prisma.ShipmentExceptionWhereInput = {
  status: { in: [...EXCEPTION_OPEN_STATUSES] },
};

/**
 * Finished, minus the ones that ended with the box turning up — those have
 * their own card, and folding them into "closed" would hide the single most
 * reassuring number on the page.
 */
const FINISHED: Prisma.ShipmentExceptionWhereInput = {
  status: { in: ["CLOSED", "RESOLVED", "WRITTEN_OFF"] },
};

export function whereForSet(set: QueueSet): Prisma.ShipmentExceptionWhereInput {
  switch (set) {
    case "found":
      return { status: "CARGO_FOUND" };
    case "compensation":
      // The owner's definition: a payout exists and the money has not gone out.
      return { compensation: { is: { paidAt: null } } };
    case "closed":
      return FINISHED;
    case "open":
    default:
      return OPEN;
  }
}

export type InvestigationCounts = {
  open: number;
  missing: number;
  damaged: number;
  found: number;
  compensationPending: number;
  closed: number;
};

export async function investigationCounts(): Promise<InvestigationCounts> {
  const [open, missing, damaged, found, compensationPending, closed] =
    await Promise.all([
      prisma.shipmentException.count({ where: { ...LIVE_CARGO, ...OPEN } }),
      prisma.shipmentException.count({
        where: {
          ...LIVE_CARGO,
          ...OPEN,
          type: { in: [...EXCEPTION_GROUPS.missing.types] },
        },
      }),
      prisma.shipmentException.count({
        where: {
          ...LIVE_CARGO,
          ...OPEN,
          type: { in: [...EXCEPTION_GROUPS.damaged.types] },
        },
      }),
      prisma.shipmentException.count({
        where: { ...LIVE_CARGO, status: "CARGO_FOUND" },
      }),
      // Counted off the payout itself rather than off a case status: a case can
      // sit at "compensation approved" with nothing recorded, and that is not
      // money pending — it is a decision Finance has not acted on yet.
      prisma.compensation.count({
        where: { paidAt: null, exception: { shipment: { deletedAt: null } } },
      }),
      prisma.shipmentException.count({ where: { ...LIVE_CARGO, ...FINISHED } }),
    ]);

  return { open, missing, damaged, found, compensationPending, closed };
}
