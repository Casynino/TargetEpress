import "server-only";

import { prisma } from "@/lib/prisma";
import { cargoLabel } from "@/lib/cargo";
import { PACKAGE_TYPE_LABELS, SHIPMENT_STATUS_META } from "@/lib/constants";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";

/**
 * Everything a warehouse employee's profile shows.
 *
 * All of it is derived — nothing here is a counter that some action has to
 * remember to increment. A tally kept by hand drifts the first time a shipment
 * is deleted or reassigned, and a profile that overstates someone's work is
 * worse than no profile at all.
 *
 * Scoped to one person by `userId` in every query. That is also the security
 * boundary: there is no code path here that can widen to another employee
 * without the caller passing their id, and only an admin route does that.
 */

/** Local midnight, not UTC — a Dar shift ends at midnight in Dar. */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysAgo(days: number) {
  const start = startOfToday();
  start.setDate(start.getDate() - days);
  return start;
}

export type ProfileStats = {
  todayShipments: number;
  todayWeightKg: number;
  weekShipments: number;
  monthShipments: number;
  totalShipments: number;
  totalWeightKg: number;
  totalPackages: number;
  labelsPrinted: number;
  batchesTouched: number;
  /** The loading table this person has most recently put cargo on. */
  activeBatch: string | null;
};

export async function profileStats(userId: string): Promise<ProfileStats> {
  const [today, week, month, all, printed, batches, latest] = await Promise.all([
    prisma.shipment.aggregate({
      where: { createdById: userId, registeredAt: { gte: startOfToday() } },
      _count: true,
      _sum: { weightKg: true },
    }),
    prisma.shipment.count({
      where: { createdById: userId, registeredAt: { gte: daysAgo(6) } },
    }),
    prisma.shipment.count({
      where: { createdById: userId, registeredAt: { gte: daysAgo(29) } },
    }),
    prisma.shipment.aggregate({
      where: { createdById: userId },
      _count: true,
      _sum: { weightKg: true, packages: true },
    }),
    prisma.auditLog.count({
      where: { actorId: userId, action: "label.print" },
    }),
    prisma.shipment.findMany({
      where: { createdById: userId, batchId: { not: null } },
      select: { batchId: true },
      distinct: ["batchId"],
    }),
    prisma.shipment.findFirst({
      where: { createdById: userId, batch: { permanent: true } },
      orderBy: { registeredAt: "desc" },
      select: { batch: { select: { batchNumber: true, origin: true } } },
    }),
  ]);

  return {
    todayShipments: today._count,
    todayWeightKg: toNumber(today._sum.weightKg ?? 0),
    weekShipments: week,
    monthShipments: month,
    totalShipments: all._count,
    totalWeightKg: toNumber(all._sum.weightKg ?? 0),
    totalPackages: all._sum.packages ?? 0,
    labelsPrinted: printed,
    batchesTouched: batches.length,
    activeBatch: latest?.batch?.batchNumber ?? null,
  };
}

export type ActivityEntry = {
  id: string;
  action: string;
  summary: string;
  reference: string | null;
  dateLabel: string;
  timeLabel: string;
};

/**
 * What this person did, most recent first.
 *
 * Read straight off the audit log rather than reconstructed from the records
 * themselves, so an edit that was later undone still shows — the timeline is a
 * record of actions, not of the current state.
 */
export async function profileActivity(
  userId: string,
  take = 25
): Promise<ActivityEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      summary: true,
      entity: true,
      entityId: true,
      metadata: true,
      createdAt: true,
    },
  });

  return rows.map((row) => {
    const meta = row.metadata as { trackingNumber?: string } | null;
    return {
      id: row.id,
      action: row.action,
      summary: row.summary,
      reference:
        meta?.trackingNumber ??
        (row.entity === "Shipment" ? row.entityId : null) ??
        null,
      dateLabel: formatDate(row.createdAt),
      timeLabel: row.createdAt.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  });
}

export type MyShipmentRow = {
  id: string;
  trackingNumber: string;
  customerName: string;
  item: string;
  weightKg: number;
  packagesLabel: string;
  statusLabel: string;
  status: string;
  registeredLabel: string;
};

export async function myShipments(
  userId: string,
  take = 200
): Promise<MyShipmentRow[]> {
  const rows = await prisma.shipment.findMany({
    where: { createdById: userId },
    orderBy: { registeredAt: "desc" },
    take,
    select: {
      id: true,
      trackingNumber: true,
      description: true,
      weightKg: true,
      packages: true,
      packageType: true,
      status: true,
      registeredAt: true,
      customer: { select: { name: true } },
      cargoType: { select: { name: true } },
    },
  });

  return rows.map((row) => {
    const unit =
      PACKAGE_TYPE_LABELS[row.packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;
    return {
      id: row.id,
      trackingNumber: row.trackingNumber,
      customerName: row.customer.name,
      item: cargoLabel(row.cargoType?.name, row.description),
      weightKg: toNumber(row.weightKg),
      packagesLabel: `${row.packages} ${row.packages === 1 ? unit.one : unit.many}`,
      statusLabel: SHIPMENT_STATUS_META[row.status].label,
      status: row.status,
      registeredLabel: formatDate(row.registeredAt),
    };
  });
}

export type MyBatchRow = {
  id: string;
  batchNumber: string;
  permanent: boolean;
  statusLabel: string;
  shipments: number;
  weightKg: number;
  packages: number;
  departedLabel: string | null;
};

/**
 * Batches this person put cargo on, and how much of each is theirs.
 *
 * "Registered by you: 34" is the number that matters — a batch of 86 pieces
 * says nothing about the person looking at it.
 */
export async function myBatches(userId: string): Promise<MyBatchRow[]> {
  const grouped = await prisma.shipment.groupBy({
    by: ["batchId"],
    where: { createdById: userId, batchId: { not: null } },
    _count: true,
    _sum: { weightKg: true, packages: true },
  });
  if (grouped.length === 0) return [];

  const batches = await prisma.batch.findMany({
    where: { id: { in: grouped.map((g) => g.batchId!) } },
    select: {
      id: true,
      batchNumber: true,
      permanent: true,
      status: true,
      departureDate: true,
    },
  });
  const byId = new Map(batches.map((b) => [b.id, b]));

  return grouped
    .map((group) => {
      const batch = byId.get(group.batchId!);
      if (!batch) return null;
      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        permanent: batch.permanent,
        statusLabel: batch.permanent
          ? "Loading in China"
          : BATCH_STATUS_WORDS[batch.status] ?? batch.status,
        shipments: group._count,
        weightKg: toNumber(group._sum.weightKg ?? 0),
        packages: group._sum.packages ?? 0,
        departedLabel: batch.departureDate
          ? formatDate(batch.departureDate)
          : null,
      };
    })
    .filter((row): row is MyBatchRow => row !== null)
    .sort((a, b) => b.shipments - a.shipments);
}

const BATCH_STATUS_WORDS: Record<string, string> = {
  OPEN: "Loading",
  FULL: "Full",
  READY_TO_DEPART: "Sealed",
  IN_TRANSIT: "Dispatched",
  ARRIVED: "Arrived in Dar",
  VERIFIED: "Checked in",
  CLOSED: "Closed",
};

export type DailyPoint = { label: string; shipments: number; weightKg: number };

/**
 * The last fourteen days, one bar each — including the empty ones.
 *
 * Days with nothing on them are the point of the chart: a run of blanks is
 * what a trend looks like before anyone calls it one.
 */
export async function dailyActivity(
  userId: string,
  days = 14
): Promise<DailyPoint[]> {
  const from = daysAgo(days - 1);
  const rows = await prisma.shipment.findMany({
    where: { createdById: userId, registeredAt: { gte: from } },
    select: { registeredAt: true, weightKg: true },
  });

  const buckets = new Map<string, { shipments: number; weightKg: number }>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(from);
    day.setDate(day.getDate() + i);
    buckets.set(key(day), { shipments: 0, weightKg: 0 });
  }
  for (const row of rows) {
    const bucket = buckets.get(key(row.registeredAt));
    if (!bucket) continue;
    bucket.shipments += 1;
    bucket.weightKg += toNumber(row.weightKg);
  }

  return [...buckets.entries()].map(([iso, value]) => ({
    label: new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    ...value,
  }));
}

function key(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toISOString()
    .slice(0, 10);
}

/** Sign-in history, for the admin's view of an account. */
export async function loginHistory(userId: string, take = 20) {
  const rows = await prisma.loginEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      ok: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    ok: row.ok,
    ipAddress: row.ipAddress,
    device: shortDevice(row.userAgent),
    atLabel: formatDateTime(row.createdAt),
  }));
}

/** A user agent string is unreadable; the browser and platform are enough. */
function shortDevice(agent: string | null) {
  if (!agent) return "Unknown device";
  const platform = /android/i.test(agent)
    ? "Android"
    : /iphone|ipad/i.test(agent)
      ? "iOS"
      : /windows/i.test(agent)
        ? "Windows"
        : /mac os/i.test(agent)
          ? "Mac"
          : "Unknown";
  const browser = /edg\//i.test(agent)
    ? "Edge"
    : /chrome/i.test(agent)
      ? "Chrome"
      : /safari/i.test(agent)
        ? "Safari"
        : /firefox/i.test(agent)
          ? "Firefox"
          : "Browser";
  return `${browser} on ${platform}`;
}

/**
 * Someone is "online" if the app has heard from them in the last five minutes.
 *
 * There is no socket and no heartbeat — `lastActiveAt` is touched on page
 * loads. Five minutes is long enough that reading one long page does not turn
 * someone grey, and short enough that it means something.
 */
export function isOnline(lastActiveAt: Date | null) {
  if (!lastActiveAt) return false;
  return Date.now() - lastActiveAt.getTime() < 5 * 60 * 1000;
}
