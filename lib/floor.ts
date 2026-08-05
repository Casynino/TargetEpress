import "server-only";

import type { Prisma } from "@prisma/client";

import { EXCEPTION_OPEN_STATUSES, STORAGE_POLICY } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * What is physically standing in the Dar warehouse right now.
 *
 * This lives on its own because two pages ask the question and they must never
 * answer it differently: the Warehouse Inventory page lists the cargo, the
 * dashboard counts it. A floor supervisor who reads "412 boxes" on one screen
 * and "419 boxes" on the other stops trusting both.
 *
 * "Right now" is exactly two statuses. RECEIVED_AT_DAR is checked in off the
 * manifest; READY_FOR_PICKUP is checked in and paid for. DELIVERED has left the
 * building, IN_TRANSIT has not arrived, and UNDER_INVESTIGATION is cargo we
 * cannot put our hands on — none of the three is stock. Soft-deleted records
 * are excluded like everywhere else.
 *
 * PRICE VISIBILITY: nothing here selects an amount. The warehouse may not see
 * what cargo costs, and a figure never fetched cannot leak through a prop.
 */

const DAY_MS = 86_400_000;

/**
 * Kilos physically on the floor for one shipment.
 *
 * Prefers the per-package weights the desk recorded. When they are absent —
 * the common case, since usually only the shipment total is weighed — it
 * pro-rates the declared weight by the fraction of boxes that arrived. Neither
 * is a guess dressed as a fact: a shipment with every box present returns its
 * declared weight unchanged.
 */
export function weightOnFloor(
  declaredKg: number,
  packages: { receivedAt: Date | null; weightKg: Prisma.Decimal | null }[]
) {
  if (packages.length === 0) return declaredKg;
  const here = packages.filter((pkg) => pkg.receivedAt);
  if (here.length === packages.length) return declaredKg;
  if (here.length === 0) return 0;

  const weighed = packages.every((pkg) => pkg.weightKg !== null);
  if (weighed) {
    return here.reduce((sum, pkg) => sum + toNumber(pkg.weightKg), 0);
  }
  return (declaredKg * here.length) / packages.length;
}

/** Cargo the Dar warehouse is holding. The one definition, used everywhere. */
export const ON_THE_FLOOR = {
  deletedAt: null,
  status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] },
} as const satisfies Prisma.ShipmentWhereInput;

export type FloorSnapshot = {
  /** Consignments standing in the building. */
  shipments: number;
  /**
   * Boxes actually ticked off a manifest — not boxes declared in Guangzhou. A
   * shipment checked in short is on the floor with fewer cartons than its
   * paperwork claims, and this is what is really stacked there.
   */
  packages: number;
  /** What the paperwork claims, for the gap between the two. */
  declaredPackages: number;
  /** Kilos on the floor, per `weightOnFloor` above. */
  weightKg: number;
  /** Held cargo Finance has not cleared — stored, not collectable. */
  unpaid: number;
  /** Held cargo with a live pickup note — collectable today. */
  cleared: number;
  /** Past the free-storage window, so it is costing the customer money. */
  aging: number;
  /** Longest anything has been standing here, in days. */
  longestHeldDays: number;
  /** Held cargo with an unfinished case against it. */
  flagged: number;
};

/**
 * One pass over the held cargo. Deliberately a single query rather than six
 * aggregates: the weight maths needs the package rows anyway, and every figure
 * below has to describe the same instant.
 */
export async function floorSnapshot(): Promise<FloorSnapshot> {
  const held = await prisma.shipment.findMany({
    where: ON_THE_FLOOR,
    select: {
      packages: true,
      weightKg: true,
      arrivedAt: true,
      // Note status only. `amountPaid` is on this relation and is deliberately
      // not selected — the floor gets "cleared or not", never a figure.
      pickupNote: { select: { status: true } },
      packageList: { select: { receivedAt: true, weightKg: true } },
      exceptions: {
        where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } },
        select: { id: true },
      },
    },
  });

  // One clock for the whole snapshot, so two shipments received a minute apart
  // cannot disagree about what day it is.
  const now = Date.now();

  let packages = 0;
  let declaredPackages = 0;
  let weightKg = 0;
  let cleared = 0;
  let aging = 0;
  let longestHeldDays = 0;
  let flagged = 0;

  for (const shipment of held) {
    const pending = shipment.packageList.filter((pkg) => !pkg.receivedAt).length;
    declaredPackages += shipment.packages;
    packages += shipment.packages - pending;
    weightKg += weightOnFloor(toNumber(shipment.weightKg), shipment.packageList);

    // The note is the source of truth for "paid", not the shipment status:
    // cancelling a note reverts the status, but reading the note directly means
    // this cannot drift from what Finance actually issued.
    if (shipment.pickupNote?.status === "ACTIVE") cleared += 1;
    if (shipment.exceptions.length > 0) flagged += 1;

    if (shipment.arrivedAt) {
      const days = Math.max(
        0,
        Math.floor((now - shipment.arrivedAt.getTime()) / DAY_MS)
      );
      if (days > STORAGE_POLICY.freeDays) aging += 1;
      if (days > longestHeldDays) longestHeldDays = days;
    }
  }

  return {
    shipments: held.length,
    packages,
    declaredPackages,
    weightKg,
    unpaid: held.length - cleared,
    cleared,
    aging,
    longestHeldDays,
    flagged,
  };
}
