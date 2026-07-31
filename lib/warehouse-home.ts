import "server-only";

import type { Origin } from "@prisma/client";

import { cargoLabel } from "@/lib/cargo";
import { PACKAGE_TYPE_SHORT } from "@/lib/constants";
import { formatRelative, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * The warehouse's own view of today.
 *
 * Everything here answers a question someone on the floor actually asks:
 * how much have we taken in, what still needs doing before the flight, who
 * else is working, and what is wrong. Nothing is a vanity number — if a figure
 * cannot change what somebody does next, it is not here.
 */

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export type TodaySummary = {
  shipments: number;
  weightKg: number;
  packages: number;
  photos: number;
  labelsPrinted: number;
  awaitingDispatch: number;
};

export async function todaySummary(): Promise<TodaySummary> {
  const since = startOfToday();
  const [cargo, photos, labels, waiting] = await Promise.all([
    prisma.shipment.aggregate({
      where: { registeredAt: { gte: since } },
      _count: true,
      _sum: { weightKg: true, packages: true },
    }),
    prisma.shipmentPhoto.count({ where: { createdAt: { gte: since } } }),
    prisma.auditLog.count({
      where: { action: "label.print", createdAt: { gte: since } },
    }),
    prisma.shipment.count({ where: { status: "READY_TO_DEPART" } }),
  ]);

  return {
    shipments: cargo._count,
    weightKg: toNumber(cargo._sum.weightKg ?? 0),
    packages: cargo._sum.packages ?? 0,
    photos,
    labelsPrinted: labels,
    awaitingDispatch: waiting,
  };
}

export type LoadingTable = {
  id: string;
  batchNumber: string;
  origin: Origin;
  title: string;
  carries: string;
  shipments: number;
  packages: number;
  weightKg: number;
  customers: number;
  lastUpdatedLabel: string | null;
  oldestDays: number | null;
  /** Share of the cargo that is photographed, weighed and classified. */
  readiness: number;
};

const TABLE_TITLES: Record<string, { title: string; carries: string }> = {
  GUANGZHOU: { title: "Guangzhou Batch", carries: "Normal goods" },
  HONG_KONG: { title: "Hong Kong Batch", carries: "Electronics & special goods" },
};

/**
 * The two permanent loading tables, with enough detail to decide whether one is
 * worth sealing.
 *
 * "Readiness" is the share of cargo on the table that could actually go: it has
 * a photo, a weight and a classified item. A table that is 60% ready is a
 * table where sealing now means chasing forty cartons later.
 */
export async function loadingTables(): Promise<LoadingTable[]> {
  const tables = await prisma.batch.findMany({
    where: { permanent: true },
    orderBy: { origin: "asc" },
    select: {
      id: true,
      batchNumber: true,
      origin: true,
      shipments: {
        select: {
          id: true,
          weightKg: true,
          packages: true,
          customerId: true,
          cargoTypeId: true,
          registeredAt: true,
          updatedAt: true,
          _count: { select: { photos: true } },
        },
      },
    },
  });

  const now = Date.now();

  return tables.map((table) => {
    const rows = table.shipments;
    const ready = rows.filter(
      (row) => row._count.photos > 0 && toNumber(row.weightKg) > 0 && row.cargoTypeId
    ).length;
    const oldest = rows.reduce<Date | null>(
      (min, row) => (!min || row.registeredAt < min ? row.registeredAt : min),
      null
    );
    const latest = rows.reduce<Date | null>(
      (max, row) => (!max || row.updatedAt > max ? row.updatedAt : max),
      null
    );

    return {
      id: table.id,
      batchNumber: table.batchNumber,
      origin: table.origin,
      title: TABLE_TITLES[table.origin]?.title ?? table.batchNumber,
      carries: TABLE_TITLES[table.origin]?.carries ?? "Cargo",
      shipments: rows.length,
      packages: rows.reduce((sum, row) => sum + row.packages, 0),
      weightKg: rows.reduce((sum, row) => sum + toNumber(row.weightKg), 0),
      customers: new Set(rows.map((row) => row.customerId)).size,
      lastUpdatedLabel: latest ? formatRelative(latest) : null,
      oldestDays: oldest
        ? Math.floor((now - oldest.getTime()) / (24 * 60 * 60 * 1000))
        : null,
      readiness: rows.length === 0 ? 1 : ready / rows.length,
    };
  });
}

export type ProgressLine = {
  label: string;
  done: number;
  total: number;
  hint: string;
};

/**
 * How much of today's work is finished.
 *
 * Each line is a real ratio over today's cargo, not a target somebody invented.
 * When nothing has been registered yet they all read 0 of 0, which is honest:
 * there is no work done because there is no work.
 */
export async function todayProgress(): Promise<ProgressLine[]> {
  const since = startOfToday();
  const rows = await prisma.shipment.findMany({
    where: { registeredAt: { gte: since } },
    select: {
      id: true,
      weightKg: true,
      cargoTypeId: true,
      _count: { select: { photos: true } },
    },
  });
  const total = rows.length;

  const printedIds = new Set(
    (
      await prisma.auditLog.findMany({
        where: { action: "label.print", createdAt: { gte: since } },
        select: { entityId: true },
      })
    )
      .map((row) => row.entityId)
      .filter((id): id is string => id !== null)
  );

  return [
    {
      label: "Cargo photographed",
      done: rows.filter((row) => row._count.photos > 0).length,
      total,
      hint: "Proof taken at the counter",
    },
    {
      label: "Weight recorded",
      done: rows.filter((row) => toNumber(row.weightKg) > 0).length,
      total,
      hint: "What the customer is billed on",
    },
    {
      label: "Item classified",
      done: rows.filter((row) => row.cargoTypeId).length,
      total,
      hint: "So Finance can price it",
    },
    {
      label: "Labels printed",
      done: rows.filter((row) => printedIds.has(row.id)).length,
      total,
      hint: "One sticker per package",
    },
  ];
}

export type FeedEntry = {
  id: string;
  timeLabel: string;
  actor: string;
  summary: string;
  href: string | null;
};

/** What everyone in the warehouse has been doing, newest first. */
export async function warehouseFeed(take = 12): Promise<FeedEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          "shipment.create",
          "shipment.update",
          "label.print",
          "batch.dispatch",
          "batch.verifyShipment",
          "cargo.delete",
          "photo.upload",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      summary: true,
      entity: true,
      entityId: true,
      createdAt: true,
      actor: { select: { name: true } },
      metadata: true,
    },
  });

  return rows.map((row) => {
    const meta = row.metadata as { trackingNumber?: string } | null;
    return {
      id: row.id,
      timeLabel: row.createdAt.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      actor: row.actor?.name ?? "System",
      summary: row.summary,
      href: meta?.trackingNumber ? `/app/cargo/${meta.trackingNumber}` : null,
    };
  });
}

export type Insight = { label: string; value: string };

/** Small facts about today that make the floor legible. */
export async function warehouseInsights(): Promise<Insight[]> {
  const since = startOfToday();
  const rows = await prisma.shipment.findMany({
    where: { registeredAt: { gte: since } },
    select: {
      weightKg: true,
      packages: true,
      packageType: true,
      description: true,
      trackingNumber: true,
      cargoType: { select: { name: true } },
    },
  });

  if (rows.length === 0) {
    return [{ label: "Nothing registered yet today", value: "—" }];
  }

  const weights = rows.map((row) => toNumber(row.weightKg));
  const heaviest = rows[weights.indexOf(Math.max(...weights))];
  const lightest = rows[weights.indexOf(Math.min(...weights))];

  const itemCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.cargoType?.name ?? "Not listed";
    itemCounts.set(key, (itemCounts.get(key) ?? 0) + 1);
  }
  const commonest = [...itemCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const unitCounts = new Map<string, number>();
  for (const row of rows) {
    unitCounts.set(
      row.packageType,
      (unitCounts.get(row.packageType) ?? 0) + row.packages
    );
  }

  return [
    { label: "Most common item", value: `${commonest[0]} (${commonest[1]})` },
    {
      label: "Packages taken in",
      value:
        [...unitCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => `${count} ${PACKAGE_TYPE_SHORT[type] ?? "unit"}`)
          .join(" · ") || "—",
    },
    {
      label: "Average weight",
      value: `${(weights.reduce((a, b) => a + b, 0) / rows.length).toFixed(1)} kg`,
    },
    {
      label: "Heaviest",
      value: `${Math.max(...weights).toFixed(1)} kg · ${heaviest.trackingNumber}`,
    },
    {
      label: "Lightest",
      value: `${Math.min(...weights).toFixed(1)} kg · ${lightest.trackingNumber}`,
    },
  ];
}

export type WarehouseAlert = {
  id: string;
  tone: "warn" | "block" | "info";
  title: string;
  detail: string;
  href: string;
};

/**
 * What is wrong right now.
 *
 * Every one of these is something a person can fix in the next ten minutes.
 * A warning nobody can act on trains people to ignore the panel, so anything
 * that is merely interesting belongs in Insights instead.
 */
export async function warehouseAlerts(): Promise<WarehouseAlert[]> {
  const [noPhotos, noWeight, unclassified, tables] = await Promise.all([
    prisma.shipment.findMany({
      where: { status: "READY_TO_DEPART", photos: { none: {} } },
      select: { id: true, trackingNumber: true },
      take: 50,
    }),
    prisma.shipment.findMany({
      where: { status: "READY_TO_DEPART", weightKg: { lte: 0 } },
      select: { id: true, trackingNumber: true },
      take: 50,
    }),
    prisma.shipment.count({
      where: { status: "READY_TO_DEPART", cargoTypeId: null },
    }),
    loadingTables(),
  ]);

  const alerts: WarehouseAlert[] = [];

  if (noWeight.length > 0) {
    alerts.push({
      id: "no-weight",
      tone: "block",
      title: `${noWeight.length} shipment(s) have no weight`,
      detail:
        "Finance cannot price these, and they will hold up the invoice after the flight lands.",
      href: "/app/batches",
    });
  }

  if (unclassified > 0) {
    alerts.push({
      id: "unclassified",
      tone: "warn",
      title: `${unclassified} shipment(s) have no item chosen`,
      detail:
        "Without an item they are billed on the general rate, which is usually wrong.",
      href: "/app/batches",
    });
  }

  if (noPhotos.length > 0) {
    alerts.push({
      id: "no-photos",
      tone: "warn",
      title: `${noPhotos.length} shipment(s) have no photo`,
      detail:
        "Proof of condition is what settles a damage claim. Add one before the cargo leaves.",
      href: "/app/batches",
    });
  }

  for (const table of tables) {
    if (table.oldestDays !== null && table.oldestDays >= 14 && table.shipments > 0) {
      alerts.push({
        id: `stale-${table.id}`,
        tone: "info",
        title: `${table.title} has cargo ${table.oldestDays} days old`,
        detail: `${table.shipments} pieces are waiting. Seal it and put them on a flight.`,
        href: `/app/batches/${table.id}`,
      });
    }
  }

  return alerts;
}

export type ActiveStaff = {
  id: string;
  name: string;
  photoUrl: string | null;
  online: boolean;
  lastSeenLabel: string;
};

/** Who else is on the floor. */
export async function activeStaff(department: string): Promise<ActiveStaff[]> {
  const rows = await prisma.user.findMany({
    where: { active: true, department: department as never },
    orderBy: { lastActiveAt: "desc" },
    take: 8,
    select: {
      id: true,
      name: true,
      photoUrl: true,
      lastActiveAt: true,
    },
  });

  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    photoUrl: row.photoUrl,
    online: row.lastActiveAt
      ? now - row.lastActiveAt.getTime() < 5 * 60 * 1000
      : false,
    lastSeenLabel: row.lastActiveAt ? formatRelative(row.lastActiveAt) : "Never",
  }));
}

/** The next flight out, if one has been recorded. */
export async function nextDeparture() {
  const batch = await prisma.batch.findFirst({
    where: { permanent: false, status: { in: ["READY_TO_DEPART", "IN_TRANSIT"] } },
    orderBy: { departureDate: "desc" },
    select: {
      id: true,
      batchNumber: true,
      airline: true,
      flightNumber: true,
      waybillNumber: true,
      departureDate: true,
      expectedArrival: true,
      _count: { select: { shipments: true } },
    },
  });
  return batch;
}

/** What the desk most recently took in — the top of the register. */
export async function latestArrivals(take = 5) {
  const rows = await prisma.shipment.findMany({
    orderBy: { registeredAt: "desc" },
    take,
    select: {
      id: true,
      trackingNumber: true,
      description: true,
      weightKg: true,
      registeredAt: true,
      customer: { select: { name: true } },
      cargoType: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    trackingNumber: row.trackingNumber,
    customerName: row.customer.name,
    item: cargoLabel(row.cargoType?.name, row.description),
    weightKg: toNumber(row.weightKg),
    atLabel: formatRelative(row.registeredAt),
  }));
}
