import "server-only";

import type { Prisma } from "@prisma/client";

import {
  EXCEPTION_OPEN_STATUSES,
  STORAGE_POLICY,
  chargeableStorageDays,
} from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/**
 * What is physically standing in the Dar warehouse right now.
 *
 * This lives on its own because two pages ask the question and they must never
 * answer it differently: the Available Cargo page lists the cargo, the
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
      if (chargeableStorageDays(days) > 0) aging += 1;
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

/**
 * How long each consignment has been standing on the Dar floor.
 *
 * The floor's version of an ageing report. "86 consignments in the warehouse"
 * is a number; how many have been there past the free storage window is the
 * thing that decides what gets chased today, and it was only ever available as
 * a single count.
 *
 * Aged from arrivedAt — stamped once, in verifyShipment, when the box was
 * actually ticked off a manifest. Cargo that has not been checked in is not on
 * the floor and is not counted.
 */
export type FloorAgeBucket = {
  key: string;
  label: string;
  count: number;
  packages: number;
};

export async function floorAgeing(now = new Date(), locale: Locale = "en") {
  const rows = await prisma.shipment.findMany({
    // ON_THE_FLOOR is the one definition of "standing in the building" — a
    // second copy here is how two panels on one page end up disagreeing.
    where: { ...ON_THE_FLOOR, arrivedAt: { not: null } },
    select: { arrivedAt: true, packages: true },
  });

  // The day counts stay outside the translated fragments — "8–14 天" and
  // "超过 14 天" put the number where Chinese wants it, and a bucket label
  // carrying a computed number could never be looked up whole.
  const buckets: FloorAgeBucket[] = [
    {
      key: "fresh",
      label: t(locale, "Landed today or yesterday"),
      count: 0,
      packages: 0,
    },
    {
      key: "week",
      label: `2–${STORAGE_POLICY.freeDays - 1} ${t(locale, "days")}`,
      count: 0,
      packages: 0,
    },
    {
      key: "over",
      /* Starts where the money starts. The bucket a consignment falls into and
         the tile that says it is charging read the same boundary, so the floor
         cannot show a box as comfortable while the meter runs on it. */
      label: `${STORAGE_POLICY.freeDays}–${STORAGE_POLICY.freeDays * 2} ${t(locale, "days")}`,
      count: 0,
      packages: 0,
    },
    {
      key: "stuck",
      label: `${t(locale, "More than")} ${STORAGE_POLICY.freeDays * 2} ${t(locale, "days")}`,
      count: 0,
      packages: 0,
    },
  ];

  for (const row of rows) {
    const days = Math.max(
      0,
      Math.floor((now.getTime() - row.arrivedAt!.getTime()) / 86_400_000)
    );
    const bucket =
      days <= 1
        ? buckets[0]
        : chargeableStorageDays(days) === 0
          ? buckets[1]
          : days <= STORAGE_POLICY.freeDays * 2
            ? buckets[2]
            : buckets[3];
    bucket.count += 1;
    bucket.packages += row.packages ?? 0;
  }

  return buckets;
}

/**
 * What came in and what went out, day by day, for the last two weeks.
 *
 * The floor's throughput. A warehouse with 86 consignments standing might be
 * busy or might be seized up, and the count alone cannot tell you which — only
 * the rate boxes arrive against the rate they leave can.
 *
 * In is arrivedAt (checked in against a manifest), out is deliveredAt (handed
 * to the customer). Both are stamped once, at the moment the thing happened.
 */
export async function floorFlowByDay(days = 14, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));

  const [arrived, released] = await Promise.all([
    prisma.shipment.findMany({
      where: { deletedAt: null, arrivedAt: { gte: start } },
      select: { arrivedAt: true },
    }),
    prisma.shipment.findMany({
      where: { deletedAt: null, deliveredAt: { gte: start } },
      select: { deliveredAt: true },
    }),
  ]);

  const labels: string[] = [];
  const inCounts = Array.from({ length: days }, () => 0);
  const outCounts = Array.from({ length: days }, () => 0);

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    labels.push(d.toLocaleDateString("en-GB", { day: "numeric" }));
  }

  const indexOf = (date: Date) =>
    Math.floor(
      (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
        start.getTime()) /
        86_400_000
    );

  for (const row of arrived) {
    const i = indexOf(row.arrivedAt!);
    if (i >= 0 && i < days) inCounts[i] += 1;
  }
  for (const row of released) {
    const i = indexOf(row.deliveredAt!);
    if (i >= 0 && i < days) outCounts[i] += 1;
  }

  return { labels, inCounts, outCounts, currentIndex: days - 1 };
}

/**
 * What the floor is made of, in slices that add up.
 *
 * The snapshot's `unpaid`, `cleared` and `flagged` overlap — a consignment held
 * for payment can also be under investigation — so they cannot be drawn as a
 * whole split into parts. A chart whose slices do not sum to the total it sits
 * beside is read as a bug, and rightly.
 *
 * These are mutually exclusive, in the order the floor cares about: a case
 * being investigated is not going anywhere whatever its bill says, so it takes
 * precedence; then cleared and collectable; then everything still waiting on
 * Finance.
 */
export async function floorComposition() {
  const rows = await prisma.shipment.findMany({
    where: ON_THE_FLOOR,
    select: {
      pickupNote: { select: { status: true } },
      exceptions: {
        where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } },
        select: { id: true },
      },
    },
  });

  let flagged = 0;
  let cleared = 0;
  let held = 0;

  for (const row of rows) {
    if (row.exceptions.length > 0) flagged += 1;
    else if (row.pickupNote?.status === "ACTIVE") cleared += 1;
    else held += 1;
  }

  return { flagged, cleared, held, total: rows.length };
}

// ---------------------------------------------------------------------------
// The China side of the same three questions
// ---------------------------------------------------------------------------

/**
 * Cargo standing in Guangzhou: registered, not yet flown.
 *
 * Dar's ON_THE_FLOOR has a matching job here, and for the same reason — the
 * moment two panels each decide for themselves what "in the warehouse" means,
 * they start disagreeing by a box.
 */
export const IN_CHINA = {
  deletedAt: null,
  status: "READY_TO_DEPART",
} as const satisfies Prisma.ShipmentWhereInput;

/**
 * What the Guangzhou floor is made of, in slices that add up.
 *
 * Mutually exclusive, in the order the desk cares about: cargo nobody has put
 * on a batch is the one thing that will miss a flight, so it leads; then loaded
 * and waiting for the aircraft; then sealed and ready to go.
 */
export async function chinaComposition() {
  const rows = await prisma.shipment.findMany({
    where: IN_CHINA,
    select: { batch: { select: { status: true } } },
  });

  let unassigned = 0;
  let loading = 0;
  let sealed = 0;

  for (const row of rows) {
    if (!row.batch) unassigned += 1;
    else if (row.batch.status === "OPEN" || row.batch.status === "FULL") loading += 1;
    else sealed += 1;
  }

  return { unassigned, loading, sealed, total: rows.length };
}

/** How long each consignment has waited in Guangzhou since it was registered. */
export async function chinaAgeing(now = new Date(), locale: Locale = "en") {
  const rows = await prisma.shipment.findMany({
    where: IN_CHINA,
    select: { registeredAt: true, packages: true },
  });

  const buckets: FloorAgeBucket[] = [
    {
      key: "fresh",
      label: t(locale, "Registered today or yesterday"),
      count: 0,
      packages: 0,
    },
    { key: "week", label: t(locale, "2–7 days"), count: 0, packages: 0 },
    { key: "over", label: `8–14 ${t(locale, "days")}`, count: 0, packages: 0 },
    {
      key: "stuck",
      label: `${t(locale, "More than")} 14 ${t(locale, "days")}`,
      count: 0,
      packages: 0,
    },
  ];

  for (const row of rows) {
    const days = Math.max(
      0,
      Math.floor((now.getTime() - row.registeredAt.getTime()) / 86_400_000)
    );
    const bucket =
      days <= 1 ? buckets[0] : days <= 7 ? buckets[1] : days <= 14 ? buckets[2] : buckets[3];
    bucket.count += 1;
    bucket.packages += row.packages ?? 0;
  }

  return buckets;
}

/**
 * Registered against dispatched, day by day.
 *
 * China's throughput. Cargo booked in is only half the story — a desk that
 * registers thirty a day and flies none is filling a warehouse, and the count
 * standing there cannot tell you which is happening.
 *
 * Out is counted from the batch's departure, because that is the moment cargo
 * actually leaves the building.
 */
export async function chinaFlowByDay(days = 14, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));

  const [registered, flown] = await Promise.all([
    prisma.shipment.findMany({
      where: { deletedAt: null, registeredAt: { gte: start } },
      select: { registeredAt: true },
    }),
    prisma.shipment.findMany({
      where: {
        deletedAt: null,
        batch: { departureDate: { gte: start } },
      },
      select: { batch: { select: { departureDate: true } } },
    }),
  ]);

  const labels: string[] = [];
  const inCounts = Array.from({ length: days }, () => 0);
  const outCounts = Array.from({ length: days }, () => 0);

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    labels.push(d.toLocaleDateString("en-GB", { day: "numeric" }));
  }

  const indexOf = (date: Date) =>
    Math.floor(
      (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
        start.getTime()) /
        86_400_000
    );

  for (const row of registered) {
    const i = indexOf(row.registeredAt);
    if (i >= 0 && i < days) inCounts[i] += 1;
  }
  for (const row of flown) {
    if (!row.batch?.departureDate) continue;
    const i = indexOf(row.batch.departureDate);
    if (i >= 0 && i < days) outCounts[i] += 1;
  }

  return { labels, inCounts, outCounts, currentIndex: days - 1 };
}

/**
 * What is wrong on the Guangzhou floor right now.
 *
 * Registering cargo is this desk's whole job, so the failures are all failures
 * of that: a consignment with no photograph cannot be argued about later, one
 * on no batch will miss the flight, and a batch left open stops being a batch
 * and becomes a shelf.
 */
export async function chinaProblems(now = new Date()) {
  const staleDays = 3;
  const cutoff = new Date(now.getTime() - staleDays * 86_400_000);

  const [noPhotos, unassigned, staleBatches, waiting] = await Promise.all([
    prisma.shipment.count({
      where: { ...IN_CHINA, photos: { none: {} } },
    }),
    prisma.shipment.count({ where: { ...IN_CHINA, batchId: null } }),
    prisma.batch.count({
      where: { status: "OPEN", createdAt: { lt: cutoff } },
    }),
    prisma.shipment.count({
      where: { ...IN_CHINA, registeredAt: { lt: cutoff } },
    }),
  ]);

  return { noPhotos, unassigned, staleBatches, waiting, staleDays };
}
