import "server-only";

import type { ExceptionType, PackageType, ShipmentStatus } from "@prisma/client";
import { startOfWeek, subWeeks } from "date-fns";

import { formatDayMonth, toNumber } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/**
 * The Dar warehouse's own reporting.
 *
 * Everything here is measured off timestamps the floor itself writes:
 * `Batch.arrivedAt` (the flight landed), `Shipment.arrivedAt` (checked in
 * against the manifest), `Package.receivedAt` (each box ticked off),
 * `Shipment.readyForPickup` (Finance cleared it), `DeliveryRecord.releasedAt`
 * (handed over at the counter). Nothing is derived from an invoice.
 *
 * Deliberately no money. A warehouse user cannot see pricing anywhere else in
 * the app, and a report is the easiest place for freight rates to leak back in
 * through a "value of cargo held" figure. There is none here.
 */

const DAY_MS = 86_400_000;

/** Weeks of history on the throughput chart. */
export const FLOW_WEEKS = 12;

/** The three windows offered. Anything else in the URL falls back to 90. */
export const PERIODS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
] as const;

export function parsePeriod(value: string | undefined): number {
  const asNumber = Number(value);
  return PERIODS.some((p) => p.days === asNumber) ? asNumber : 90;
}

export function periodLabel(days: number): string {
  return PERIODS.find((p) => p.days === days)?.label ?? `${days} days`;
}

function elapsedDays(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

/**
 * Average *and* median, because warehouse dwell times are skewed: one crate
 * nobody collected for four months drags an average somewhere no real box has
 * ever been. `sample` is carried so the page can refuse to draw a conclusion
 * from three data points.
 */
export type Spread = {
  sample: number;
  average: number | null;
  median: number | null;
  longest: number | null;
};

export function spread(values: number[]): Spread {
  const clean = values
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  if (clean.length === 0) {
    return { sample: 0, average: null, median: null, longest: null };
  }

  const middle = Math.floor(clean.length / 2);
  return {
    sample: clean.length,
    average: clean.reduce((total, n) => total + n, 0) / clean.length,
    median:
      clean.length % 2 === 1
        ? clean[middle]
        : (clean[middle - 1] + clean[middle]) / 2,
    longest: clean[clean.length - 1],
  };
}

export type WeekBucket = { label: string; received: number; released: number };

/**
 * Twelve Monday-to-Sunday buckets ending with the week we are standing in.
 *
 * Split out from the query so the date arithmetic can be exercised on its own:
 * off-by-one week boundaries are the classic way a throughput chart quietly
 * lies, and they are invisible against a warehouse that has not opened yet.
 */
export function bucketWeeks(
  now: Date,
  received: Date[],
  released: Date[],
  locale: Locale = "en"
): WeekBucket[] {
  const first = startOfWeek(subWeeks(now, FLOW_WEEKS - 1), { weekStartsOn: 1 });

  const weeks: WeekBucket[] = Array.from({ length: FLOW_WEEKS }, (_, i) => ({
    label: formatDayMonth(
      startOfWeek(subWeeks(now, FLOW_WEEKS - 1 - i), { weekStartsOn: 1 }),
      locale
    ),
    received: 0,
    released: 0,
  }));

  const index = (at: Date) => {
    const start = startOfWeek(at, { weekStartsOn: 1 });
    // Rounded because a DST shift makes a week 167 or 169 hours long.
    const offset = Math.round(elapsedDays(first, start) / 7);
    return offset >= 0 && offset < FLOW_WEEKS ? offset : -1;
  };

  for (const at of received) {
    const i = index(at);
    if (i >= 0) weeks[i].received += 1;
  }
  for (const at of released) {
    const i = index(at);
    if (i >= 0) weeks[i].released += 1;
  }

  return weeks;
}

export type StaffRow = {
  id: string;
  name: string;
  released: number;
  shipmentsCheckedIn: number;
  packagesCheckedIn: number;
  exceptionsRaised: number;
};

export type HeldRow = {
  id: string;
  trackingNumber: string;
  customerName: string;
  status: ShipmentStatus;
  packages: number;
  packageType: PackageType;
  arrivedAt: Date | null;
  daysHeld: number;
};

export type WarehouseReport = Awaited<ReturnType<typeof warehouseReport>>;

export async function warehouseReport(periodDays: number, locale: Locale = "en") {
  const now = new Date();
  const since = new Date(now.getTime() - periodDays * DAY_MS);
  const chartFrom = startOfWeek(subWeeks(now, FLOW_WEEKS - 1), {
    weekStartsOn: 1,
  });

  // Deleted cargo is filtered automatically on `prisma.shipment` reads (see
  // lib/prisma.ts). Tables that only reach a shipment through a relation are
  // not covered by that extension, so they say so explicitly.
  const liveShipment = { shipment: { deletedAt: null } };

  const [
    receivedAgg,
    packagesCheckedIn,
    released,
    receivedForChart,
    releasedForChart,
    checkInLagRows,
    dwellRows,
    verifications,
    exceptions,
    heldNow,
    heldWeight,
    oldestHeld,
    shortPackages,
    releasedBy,
    verifiedBy,
    packagesBy,
    exceptionsBy,
    darStaff,
  ] = await Promise.all([
    prisma.shipment.aggregate({
      where: { arrivedAt: { gte: since } },
      _count: true,
      _sum: { weightKg: true },
    }),
    prisma.package.count({
      where: { receivedAt: { gte: since }, ...liveShipment },
    }),
    prisma.deliveryRecord.count({
      where: { releasedAt: { gte: since }, ...liveShipment },
    }),
    prisma.shipment.findMany({
      where: { arrivedAt: { gte: chartFrom } },
      select: { arrivedAt: true },
    }),
    prisma.deliveryRecord.findMany({
      where: { releasedAt: { gte: chartFrom }, ...liveShipment },
      select: { releasedAt: true },
    }),
    // The desk's own clock: the flight landed, how long until the box was
    // ticked off the manifest. The only leg on this page Dar fully controls.
    prisma.shipment.findMany({
      where: { arrivedAt: { gte: since }, batch: { arrivedAt: { not: null } } },
      select: { arrivedAt: true, batch: { select: { arrivedAt: true } } },
    }),
    prisma.shipment.findMany({
      where: {
        status: "DELIVERED",
        deliveredAt: { gte: since },
        arrivedAt: { not: null },
      },
      select: { arrivedAt: true, readyForPickup: true, deliveredAt: true },
    }),
    prisma.batchVerification.groupBy({
      by: ["result"],
      where: { verifiedAt: { gte: since }, ...liveShipment },
      _count: { _all: true },
    }),
    prisma.shipmentException.groupBy({
      by: ["type", "status"],
      where: { raisedAt: { gte: since }, ...liveShipment },
      _count: { _all: true },
    }),
    prisma.shipment.groupBy({
      by: ["status"],
      where: { status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] } },
      _count: { _all: true },
    }),
    prisma.shipment.aggregate({
      where: { status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] } },
      _sum: { weightKg: true },
    }),
    prisma.shipment.findMany({
      where: {
        status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] },
        arrivedAt: { not: null },
      },
      orderBy: { arrivedAt: "asc" },
      take: 10,
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        packages: true,
        packageType: true,
        arrivedAt: true,
        customer: { select: { name: true } },
      },
    }),
    // Boxes still missing off shipments the floor has already opened. This is
    // the shortage that stops a release at the counter.
    prisma.package.count({
      where: {
        receivedAt: null,
        shipment: {
          deletedAt: null,
          status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] },
        },
      },
    }),
    prisma.deliveryRecord.groupBy({
      by: ["releasedById"],
      where: { releasedAt: { gte: since }, ...liveShipment },
      _count: { _all: true },
    }),
    prisma.batchVerification.groupBy({
      by: ["verifiedById"],
      where: { verifiedAt: { gte: since }, result: "VERIFIED", ...liveShipment },
      _count: { _all: true },
    }),
    prisma.package.groupBy({
      by: ["receivedById"],
      where: { receivedAt: { gte: since }, ...liveShipment },
      _count: { _all: true },
    }),
    prisma.shipmentException.groupBy({
      by: ["raisedById"],
      where: { raisedAt: { gte: since }, ...liveShipment },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { role: "DAR_WAREHOUSE", active: true, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // --- Weekly flow ---------------------------------------------------------
  const weeks = bucketWeeks(
    now,
    receivedForChart
      .map((row) => row.arrivedAt)
      .filter((at): at is Date => at !== null),
    releasedForChart.map((row) => row.releasedAt),
    locale
  );

  // --- Speed ---------------------------------------------------------------
  const checkInLag = spread(
    checkInLagRows
      .filter((row) => row.arrivedAt && row.batch?.arrivedAt)
      .map((row) => elapsedDays(row.batch!.arrivedAt!, row.arrivedAt!))
  );

  const arrivalToCollection = spread(
    dwellRows.map((row) => elapsedDays(row.arrivedAt!, row.deliveredAt!))
  );

  const arrivalToCleared = spread(
    dwellRows
      .filter((row) => row.readyForPickup)
      .map((row) => elapsedDays(row.arrivedAt!, row.readyForPickup!))
  );

  const clearedToCollection = spread(
    dwellRows
      .filter((row) => row.readyForPickup)
      .map((row) => elapsedDays(row.readyForPickup!, row.deliveredAt!))
  );

  // --- Exceptions ----------------------------------------------------------
  const checksPassed =
    verifications.find((row) => row.result === "VERIFIED")?._count._all ?? 0;
  const checksFlagged =
    verifications.find((row) => row.result === "EXCEPTION")?._count._all ?? 0;
  const checksTotal = checksPassed + checksFlagged;

  const byType = new Map<ExceptionType, { total: number; open: number }>();
  let exceptionsRaised = 0;
  let exceptionsOpen = 0;
  for (const row of exceptions) {
    const count = row._count._all;
    const entry = byType.get(row.type) ?? { total: 0, open: 0 };
    entry.total += count;
    if (row.status === "OPEN") entry.open += count;
    byType.set(row.type, entry);
    exceptionsRaised += count;
    if (row.status === "OPEN") exceptionsOpen += count;
  }

  const exceptionTypes = [...byType.entries()]
    .map(([type, value]) => ({ type, ...value }))
    .sort((a, b) => b.total - a.total);

  // --- Staff ---------------------------------------------------------------
  const tally = new Map<string, Omit<StaffRow, "name">>();
  const blank = (id: string): Omit<StaffRow, "name"> => ({
    id,
    released: 0,
    shipmentsCheckedIn: 0,
    packagesCheckedIn: 0,
    exceptionsRaised: 0,
  });
  const bump = (
    id: string | null,
    field: keyof Omit<StaffRow, "id" | "name">,
    count: number
  ) => {
    if (!id) return; // the actor's account was deleted; the work still happened
    const entry = tally.get(id) ?? blank(id);
    entry[field] += count;
    tally.set(id, entry);
  };

  for (const row of releasedBy) bump(row.releasedById, "released", row._count._all);
  for (const row of verifiedBy)
    bump(row.verifiedById, "shipmentsCheckedIn", row._count._all);
  for (const row of packagesBy)
    bump(row.receivedById, "packagesCheckedIn", row._count._all);
  for (const row of exceptionsBy)
    bump(row.raisedById, "exceptionsRaised", row._count._all);

  // Everyone currently on the Dar roster appears even at zero — a name with no
  // numbers is itself worth seeing — plus anyone else who touched the floor in
  // the window (a manager covering a shift, the CEO releasing on a Sunday).
  for (const staff of darStaff) {
    if (!tally.has(staff.id)) tally.set(staff.id, blank(staff.id));
  }

  const names = new Map(darStaff.map((s) => [s.id, s.name]));
  const unknown = [...tally.keys()].filter((id) => !names.has(id));
  if (unknown.length > 0) {
    const extra = await prisma.user.findMany({
      where: { id: { in: unknown } },
      select: { id: true, name: true },
    });
    for (const user of extra) names.set(user.id, user.name);
  }

  const staff: StaffRow[] = [...tally.values()]
    .map((row) => ({ ...row, name: names.get(row.id) ?? "Unknown" }))
    .sort(
      (a, b) =>
        b.released - a.released ||
        b.packagesCheckedIn - a.packagesCheckedIn ||
        a.name.localeCompare(b.name)
    );

  // --- Held right now ------------------------------------------------------
  const awaitingPayment =
    heldNow.find((row) => row.status === "RECEIVED_AT_DAR")?._count._all ?? 0;
  const readyForPickup =
    heldNow.find((row) => row.status === "READY_FOR_PICKUP")?._count._all ?? 0;

  const held: HeldRow[] = oldestHeld.map((row) => ({
    id: row.id,
    trackingNumber: row.trackingNumber,
    customerName: row.customer.name,
    status: row.status,
    packages: row.packages,
    packageType: row.packageType,
    arrivedAt: row.arrivedAt,
    daysHeld: row.arrivedAt ? elapsedDays(row.arrivedAt, now) : 0,
  }));

  return {
    periodDays,
    since,
    throughput: {
      shipmentsCheckedIn: receivedAgg._count,
      weightCheckedInKg: toNumber(receivedAgg._sum.weightKg),
      packagesCheckedIn,
      released,
    },
    weeks,
    speed: {
      checkInLag,
      arrivalToCollection,
      arrivalToCleared,
      clearedToCollection,
    },
    quality: {
      checksTotal,
      checksFlagged,
      exceptionRate: checksTotal === 0 ? null : (checksFlagged / checksTotal) * 100,
      exceptionsRaised,
      exceptionsOpen,
      exceptionTypes,
      shortPackages,
    },
    staff,
    holding: {
      awaitingPayment,
      readyForPickup,
      total: awaitingPayment + readyForPickup,
      weightKg: toNumber(heldWeight._sum.weightKg),
      oldest: held,
    },
  };
}
