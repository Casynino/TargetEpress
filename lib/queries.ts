import { EXCEPTION_OPEN_STATUSES } from "@/lib/constants";
import "server-only";

import { Prisma } from "@prisma/client";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Shipments registered per month, this year against last.
 *
 * Raw SQL because Prisma's groupBy cannot truncate a timestamp to a month, and
 * pulling every row into JS to bucket it would not survive real volume.
 */
export async function monthlyVolume(now = new Date()) {
  const year = now.getFullYear();
  const from = new Date(Date.UTC(year - 1, 0, 1));

  const rows = await prisma.$queryRaw<{ year: number; month: number; count: bigint }[]>(
    Prisma.sql`
      SELECT
        EXTRACT(YEAR FROM "registeredAt")::int  AS year,
        EXTRACT(MONTH FROM "registeredAt")::int AS month,
        COUNT(*)                                AS count
      FROM "Shipment"
      WHERE "registeredAt" >= ${from}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `
  );

  const bucket = (targetYear: number) => {
    const out = Array.from({ length: 12 }, () => 0);
    for (const row of rows) {
      if (row.year === targetYear) out[row.month - 1] = Number(row.count);
    }
    return out;
  };

  const current = bucket(year);
  const previous = bucket(year - 1);

  // Only chart up to the current month; empty future months read as a crash.
  const upto = now.getMonth() + 1;

  return {
    labels: MONTHS.slice(0, upto),
    current: current.slice(0, upto),
    previous: previous.slice(0, upto),
    total: current.reduce((sum, n) => sum + n, 0),
    lastMonth: current[Math.max(0, now.getMonth() - 1)] ?? 0,
    thisMonth: current[now.getMonth()] ?? 0,
    year,
  };
}

/**
 * Corridor performance, split into the part we control and the part we do not.
 *
 * Deliberately NOT a single "on-time %": the time from arrival to collection
 * depends on the customer paying and turning up, and folding that into our
 * delivery performance would flatter or damn us for someone else's behaviour.
 */
export async function corridorPerformance() {
  const delivered = await prisma.shipment.findMany({
    where: {
      status: "DELIVERED",
      departedAt: { not: null },
      arrivedAt: { not: null },
      deliveredAt: { not: null },
    },
    select: { departedAt: true, arrivedAt: true, deliveredAt: true },
    orderBy: { deliveredAt: "desc" },
    take: 400,
  });

  const days = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 86_400_000;
  const mean = (values: number[]) =>
    values.length === 0
      ? null
      : values.reduce((sum, n) => sum + n, 0) / values.length;

  const flight = delivered.map((s) => days(s.departedAt!, s.arrivedAt!));
  const dwell = delivered.map((s) => days(s.arrivedAt!, s.deliveredAt!));

  // The public promise is three days. Measure it on the leg we own.
  const withinPromise = flight.filter((d) => d <= 3).length;

  return {
    sample: delivered.length,
    avgFlightDays: mean(flight),
    avgDwellDays: mean(dwell),
    promiseRate: flight.length ? (withinPromise / flight.length) * 100 : null,
  };
}

/** Money collected per month, for the CEO's revenue trend. */
export async function monthlyRevenue(now = new Date()) {
  const year = now.getFullYear();
  const from = new Date(Date.UTC(year, 0, 1));

  const rows = await prisma.$queryRaw<{ month: number; total: Prisma.Decimal }[]>(
    Prisma.sql`
      SELECT
        EXTRACT(MONTH FROM "paidAt")::int AS month,
        COALESCE(SUM("amount"), 0)        AS total
      FROM "Payment"
      WHERE "paidAt" >= ${from}
      GROUP BY 1
      ORDER BY 1
    `
  );

  const values = Array.from({ length: 12 }, () => 0);
  for (const row of rows) values[row.month - 1] = toNumber(row.total);

  const upto = now.getMonth() + 1;
  return {
    labels: MONTHS.slice(0, upto),
    values: values.slice(0, upto),
    currentIndex: now.getMonth(),
  };
}

/** Batch weight utilisation — how full the batches we flew actually were. */
export async function batchUtilisation(take = 8) {
  const batches = await prisma.batch.findMany({
    where: { status: { in: ["IN_TRANSIT", "ARRIVED", "VERIFIED", "CLOSED"] } },
    orderBy: { departedAt: "desc" },
    take,
    select: {
      batchNumber: true,
      shipments: { select: { weightKg: true } },
    },
  });

  return batches
    .map((batch) => ({
      label: batch.batchNumber.replace(/^BATCH-\d{4}-/, ""),
      value: batch.shipments.reduce((sum, s) => sum + toNumber(s.weightKg), 0),
    }))
    .reverse();
}

/** Counts the China desk cares about. */
export async function chinaStats() {
  const [readyToDepart, inTransitShipments, registeredThisWeek, weight] =
    await Promise.all([
      prisma.shipment.count({ where: { status: "READY_TO_DEPART" } }),
      // Cargo in the air, not flights. "2 batches" says nothing about how much
      // is riding on them; a customer asking is asking about their own piece.
      prisma.shipment.count({ where: { status: "IN_TRANSIT" } }),
      prisma.shipment.count({
        where: {
          registeredAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
        },
      }),
      prisma.shipment.aggregate({
        where: { status: "READY_TO_DEPART" },
        _sum: { weightKg: true },
      }),
    ]);

  return {
    readyToDepart,
    inTransitShipments,
    registeredThisWeek,
    stagedWeightKg: toNumber(weight._sum.weightKg),
  };
}

/** Counts the Dar warehouse cares about. */
export async function darStats() {
  const [incoming, awaitingCheck, inWarehouse, readyForPickup, openExceptions] =
    await Promise.all([
      prisma.batch.count({ where: { status: "IN_TRANSIT" } }),
      prisma.batch.count({ where: { status: "ARRIVED" } }),
      prisma.shipment.count({ where: { status: "RECEIVED_AT_DAR" } }),
      prisma.shipment.count({ where: { status: "READY_FOR_PICKUP" } }),
      prisma.shipmentException.count({ where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } } }),
    ]);

  return { incoming, awaitingCheck, inWarehouse, readyForPickup, openExceptions };
}

/** Counts Finance cares about. */
export async function financeStats() {
  const [unpaid, partiallyPaid, awaitingInvoice, activeNotes, paidAgg, outstandingAgg] =
    await Promise.all([
      prisma.invoice.count({ where: { status: "UNPAID" } }),
      prisma.invoice.count({ where: { status: "PARTIALLY_PAID" } }),
      prisma.shipment.count({
        where: {
          invoice: null,
          status: { in: ["RECEIVED_AT_DAR", "IN_TRANSIT"] },
        },
      }),
      prisma.pickupNote.count({ where: { status: "ACTIVE" } }),
      prisma.invoice.aggregate({
        where: { status: { not: "VOID" } },
        _sum: { amountPaid: true },
      }),
      prisma.invoice.aggregate({
        where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
        _sum: { total: true, amountPaid: true },
      }),
    ]);

  const collected = toNumber(paidAgg._sum.amountPaid);
  const outstanding =
    toNumber(outstandingAgg._sum.total) - toNumber(outstandingAgg._sum.amountPaid);

  return {
    unpaid,
    partiallyPaid,
    awaitingInvoice,
    activeNotes,
    collected,
    outstanding,
  };
}

/** The CEO's whole-business view. */
export async function executiveStats() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    active,
    inTransit,
    inWarehouse,
    deliveredThisMonth,
    activeBatches,
    openExceptions,
    staff,
    customers,
    revenueThisMonth,
    allTimeCollected,
    outstandingAgg,
  ] = await Promise.all([
    prisma.shipment.count({
      where: { status: { notIn: ["DELIVERED", "CANCELLED"] } },
    }),
    prisma.shipment.count({ where: { status: "IN_TRANSIT" } }),
    prisma.shipment.count({
      where: { status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] } },
    }),
    prisma.shipment.count({
      where: { status: "DELIVERED", deliveredAt: { gte: monthStart } },
    }),
    prisma.batch.count({
      where: { status: { in: ["OPEN", "READY_TO_DEPART", "IN_TRANSIT", "ARRIVED"] } },
    }),
    prisma.shipmentException.count({ where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } } }),
    prisma.user.count({ where: { active: true } }),
    prisma.customer.count(),
    prisma.payment.aggregate({
      where: { paidAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.invoice.aggregate({
      where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      _sum: { total: true, amountPaid: true },
    }),
  ]);

  return {
    active,
    inTransit,
    inWarehouse,
    deliveredThisMonth,
    activeBatches,
    openExceptions,
    staff,
    customers,
    revenueThisMonth: toNumber(revenueThisMonth._sum.amount),
    allTimeCollected: toNumber(allTimeCollected._sum.amount),
    outstanding:
      toNumber(outstandingAgg._sum.total) - toNumber(outstandingAgg._sum.amountPaid),
  };
}

/**
 * The Dar warehouse's inbound queue.
 *
 * Returns everything the receiving desk cares about in one pass: batches in the
 * air, batches on the floor part-checked, and recently closed ones for
 * reference. Sorted so the work that has been waiting longest is first —
 * receiving is a queue, and the oldest carton is the one a customer is already
 * asking about.
 */
export async function receivingQueue({
  verifiedLimit = 15,
}: { verifiedLimit?: number } = {}) {
  const [live, recent] = await Promise.all([
    prisma.batch.findMany({
      where: { status: { in: ["IN_TRANSIT", "ARRIVED"] } },
      select: {
        id: true,
        batchNumber: true,
        status: true,
        origin: true,
        airline: true,
        flightNumber: true,
        waybillNumber: true,
        departureDate: true,
        arrivedAt: true,
        _count: { select: { shipments: true, verifications: true, exceptions: true } },
        shipments: {
          select: {
            weightKg: true,
            packages: true,
            // Boxes actually ticked off the manifest. A shipment is short
            // until every package has a receivedAt, so this is what the
            // "boxes present" figure counts.
            packageList: { select: { receivedAt: true } },
          },
        },
        // Who has signed lines off on this batch so far.
        verifications: {
          select: { verifiedBy: { select: { name: true } } },
          take: 20,
        },
      },
    }),
    prisma.batch.findMany({
      where: { status: { in: ["VERIFIED", "CLOSED"] } },
      orderBy: { verifiedAt: "desc" },
      take: verifiedLimit,
      select: {
        id: true,
        batchNumber: true,
        status: true,
        origin: true,
        airline: true,
        flightNumber: true,
        waybillNumber: true,
        departureDate: true,
        arrivedAt: true,
        verifiedAt: true,
        _count: { select: { shipments: true, verifications: true, exceptions: true } },
        shipments: {
          select: {
            weightKg: true,
            packages: true,
            // Boxes actually ticked off the manifest. A shipment is short
            // until every package has a receivedAt, so this is what the
            // "boxes present" figure counts.
            packageList: { select: { receivedAt: true } },
          },
        },
        // Who has signed lines off on this batch so far.
        verifications: {
          select: { verifiedBy: { select: { name: true } } },
          take: 20,
        },
      },
    }),
  ]);

  const shape = (batch: (typeof live)[number] & { verifiedAt?: Date | null }) => {
    const weightKg = batch.shipments.reduce((sum, s) => sum + toNumber(s.weightKg), 0);
    const packages = batch.shipments.reduce((sum, s) => sum + s.packages, 0);
    const packagesPresent = batch.shipments.reduce(
      (sum, s) => sum + s.packageList.filter((row) => row.receivedAt).length,
      0
    );
    // Distinct names, so a batch checked by one person twenty times reads as
    // one person rather than a wall of the same name.
    const checkedBy = [
      ...new Set(
        batch.verifications
          .map((v) => v.verifiedBy?.name)
          .filter((n): n is string => Boolean(n))
      ),
    ];
    const unchecked = batch._count.shipments - batch._count.verifications;

    // Days waiting: on the floor since landing, or in the air since departure.
    const since =
      batch.status === "ARRIVED" ? batch.arrivedAt : batch.departureDate;
    const waitDays = since
      ? Math.floor((Date.now() - since.getTime()) / DAY)
      : null;

    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      origin: batch.origin,
      airline: batch.airline,
      flightNumber: batch.flightNumber,
      waybillNumber: batch.waybillNumber,
      departureDate: batch.departureDate?.toISOString() ?? null,
      arrivedAt: batch.arrivedAt?.toISOString() ?? null,
      verifiedAt: batch.verifiedAt?.toISOString() ?? null,
      shipments: batch._count.shipments,
      verified: batch._count.verifications,
      unchecked,
      exceptions: batch._count.exceptions,
      weightKg,
      packages,
      packagesPresent,
      checkedBy,
      waitDays,
    };
  };

  const rows = [...live.map(shape), ...recent.map(shape)];

  // ARRIVED first (it needs hands on cargo), then longest wait, then in-air by
  // how soon it lands.
  const rank = { ARRIVED: 0, IN_TRANSIT: 1, VERIFIED: 2, CLOSED: 3 } as Record<
    string,
    number
  >;
  rows.sort(
    (a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      (b.waitDays ?? -1) - (a.waitDays ?? -1) ||
      a.batchNumber.localeCompare(b.batchNumber)
  );

  const onFloor = rows.filter((r) => r.status === "ARRIVED");

  return {
    rows,
    summary: {
      inAir: rows.filter((r) => r.status === "IN_TRANSIT").length,
      onFloor: onFloor.length,
      uncheckedShipments: onFloor.reduce((sum, r) => sum + r.unchecked, 0),
      oldestWaitDays: onFloor.reduce(
        (max, r) => Math.max(max, r.waitDays ?? 0),
        0
      ),
      openExceptions: rows.reduce((sum, r) => sum + r.exceptions, 0),
      inAirWeightKg: rows
        .filter((r) => r.status === "IN_TRANSIT")
        .reduce((sum, r) => sum + r.weightKg, 0),
    },
  };
}

export type ReceivingRow = Awaited<ReturnType<typeof receivingQueue>>["rows"][number];

export type AttentionItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  meta?: string;
  href?: string;
};

const DAY = 86_400_000;

/**
 * Builds the "needs your attention" queue.
 *
 * Every item is derived from a real operational condition with a threshold, so
 * the queue empties when the work is genuinely done. Filtered by what the role
 * can actually act on — showing Finance a batch it cannot verify is noise.
 */
export async function attentionItems(
  role: "ADMIN" | "CHINA_WAREHOUSE" | "DAR_WAREHOUSE" | "FINANCE"
): Promise<AttentionItem[]> {
  const sees = {
    exceptions: role !== "CHINA_WAREHOUSE",
    verification: role === "DAR_WAREHOUSE" || role === "ADMIN",
    money: role === "FINANCE" || role === "ADMIN",
    china: role === "CHINA_WAREHOUSE" || role === "ADMIN",
    collection: role === "DAR_WAREHOUSE" || role === "FINANCE" || role === "ADMIN",
  };

  const now = Date.now();
  const items: AttentionItem[] = [];

  const [exceptions, arrivedBatches, uninvoiced, staleUnpaid, staleNotes, staleOpenBatches] =
    await Promise.all([
      sees.exceptions
        ? prisma.shipmentException.findMany({
            where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } },
            orderBy: { raisedAt: "asc" },
            take: 12,
            select: {
              id: true,
              type: true,
              description: true,
              raisedAt: true,
              shipment: { select: { trackingNumber: true } },
            },
          })
        : [],
      sees.verification
        ? prisma.batch.findMany({
            where: { status: "ARRIVED" },
            select: {
              id: true,
              batchNumber: true,
              arrivedAt: true,
              _count: { select: { shipments: true, verifications: true } },
            },
          })
        : [],
      sees.money
        ? prisma.shipment.findMany({
            where: {
              invoice: null,
              status: "RECEIVED_AT_DAR",
              arrivedAt: { lt: new Date(now - 2 * DAY) },
            },
            orderBy: { arrivedAt: "asc" },
            take: 8,
            select: {
              id: true,
              trackingNumber: true,
              arrivedAt: true,
              customer: { select: { name: true } },
            },
          })
        : [],
      sees.money
        ? prisma.shipment.findMany({
            where: {
              status: "RECEIVED_AT_DAR",
              arrivedAt: { lt: new Date(now - 7 * DAY) },
              invoice: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
            },
            orderBy: { arrivedAt: "asc" },
            take: 8,
            select: {
              id: true,
              trackingNumber: true,
              arrivedAt: true,
              customer: { select: { name: true, phone: true } },
              invoice: { select: { total: true, amountPaid: true, currency: true } },
            },
          })
        : [],
      sees.collection
        ? prisma.pickupNote.findMany({
            where: { status: "ACTIVE", issuedAt: { lt: new Date(now - 14 * DAY) } },
            orderBy: { issuedAt: "asc" },
            take: 6,
            select: {
              id: true,
              noteNumber: true,
              issuedAt: true,
              shipment: { select: { trackingNumber: true } },
              customer: { select: { name: true } },
            },
          })
        : [],
      sees.china
        ? prisma.batch.findMany({
            // BatchStatus.OPEN — "still accepting shipments in China".
            // Nothing to do with an investigation status of the same name.
            where: { status: "OPEN", createdAt: { lt: new Date(now - 7 * DAY) } },
            select: {
              id: true,
              batchNumber: true,
              createdAt: true,
              _count: { select: { shipments: true } },
            },
          })
        : [],
    ]);

  const ageDays = (date: Date | null) =>
    date ? Math.floor((now - date.getTime()) / DAY) : 0;

  for (const exception of exceptions) {
    const severe =
      exception.type === "MISSING_SHIPMENT" || exception.type === "DAMAGED_CARGO";
    items.push({
      id: `exc-${exception.id}`,
      severity: severe ? "critical" : "warning",
      title: `${exception.type.replace(/_/g, " ").toLowerCase()} — ${exception.shipment.trackingNumber}`,
      detail: exception.description,
      meta: `Open for ${ageDays(exception.raisedAt)} day(s)`,
      href: "/app/exceptions",
    });
  }

  for (const batch of arrivedBatches) {
    const remaining = batch._count.shipments - batch._count.verifications;
    if (remaining <= 0) continue;
    items.push({
      id: `batch-${batch.id}`,
      severity: ageDays(batch.arrivedAt) >= 2 ? "critical" : "warning",
      title: `${batch.batchNumber} not fully checked in`,
      detail: `${remaining} of ${batch._count.shipments} shipment(s) still unverified against the manifest.`,
      meta: `Landed ${ageDays(batch.arrivedAt)} day(s) ago`,
      href: `/app/receive/${batch.id}`,
    });
  }

  for (const shipment of uninvoiced) {
    items.push({
      id: `noinv-${shipment.id}`,
      severity: "warning",
      title: `${shipment.trackingNumber} has no invoice`,
      detail: `${shipment.customer.name}'s cargo is in the warehouse but has not been billed.`,
      meta: `Waiting ${ageDays(shipment.arrivedAt)} day(s)`,
      href: `/app/cargo/${shipment.trackingNumber}`,
    });
  }

  for (const shipment of staleUnpaid) {
    const outstanding =
      toNumber(shipment.invoice?.total) - toNumber(shipment.invoice?.amountPaid);
    items.push({
      id: `unpaid-${shipment.id}`,
      severity: "critical",
      title: `${shipment.trackingNumber} unpaid for ${ageDays(shipment.arrivedAt)} days`,
      detail: `${shipment.customer.name} (${shipment.customer.phone}) owes ${shipment.invoice?.currency ?? "TZS"} ${outstanding.toLocaleString()}.`,
      meta: "Occupying warehouse space",
      href: `/app/cargo/${shipment.trackingNumber}`,
    });
  }

  for (const note of staleNotes) {
    items.push({
      id: `note-${note.id}`,
      severity: "warning",
      title: `${note.shipment.trackingNumber} paid but not collected`,
      detail: `${note.customer.name} was cleared for collection but has not come in.`,
      meta: `Pickup note issued ${ageDays(note.issuedAt)} day(s) ago`,
      href: "/app/release",
    });
  }

  for (const batch of staleOpenBatches) {
    if (batch._count.shipments === 0) continue;
    items.push({
      id: `open-${batch.id}`,
      severity: "info",
      title: `${batch.batchNumber} still open`,
      detail: `${batch._count.shipments} shipment(s) waiting in China. Seal it to get them on a flight.`,
      meta: `Opened ${ageDays(batch.createdAt)} day(s) ago`,
      href: `/app/batches/${batch.id}`,
    });
  }

  return items;
}

export async function recentActivity(limit = 12) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      summary: true,
      action: true,
      createdAt: true,
      actorEmail: true,
      actor: { select: { name: true } },
    },
  });
}

/**
 * Shipments that have been sitting in the Dar warehouse unpaid the longest —
 * the single most useful list for both Finance and the CEO.
 */
export async function agingInWarehouse(limit = 8) {
  return prisma.shipment.findMany({
    where: { status: "RECEIVED_AT_DAR" },
    orderBy: { arrivedAt: "asc" },
    take: limit,
    select: {
      id: true,
      trackingNumber: true,
      arrivedAt: true,
      customer: { select: { name: true, phone: true } },
      invoice: { select: { total: true, amountPaid: true, currency: true } },
    },
  });
}

/**
 * What the desk has been sending, by item.
 *
 * Grouped by the priced item rather than the free-text description, because
 * "Clothes" is a rate on a price list and "nguo" is one person's handwriting.
 * The tail is collapsed into "Other" at six slices — beyond that a donut is
 * decoration.
 */
export async function cargoMix(days = 30) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const rows = await prisma.shipment.findMany({
    where: { registeredAt: { gte: since } },
    select: {
      weightKg: true,
      cargoType: { select: { name: true } },
      cargoCategory: true,
    },
  });

  const byItem = new Map<string, { shipments: number; weightKg: number }>();
  for (const row of rows) {
    const key = row.cargoType?.name ?? "Not classified";
    const entry = byItem.get(key) ?? { shipments: 0, weightKg: 0 };
    entry.shipments += 1;
    entry.weightKg += toNumber(row.weightKg);
    byItem.set(key, entry);
  }

  const sorted = [...byItem.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.shipments - a.shipments);

  const TOP = 5;
  const head = sorted.slice(0, TOP);
  const tail = sorted.slice(TOP);
  if (tail.length > 0) {
    head.push({
      name: `Other (${tail.length} items)`,
      shipments: tail.reduce((sum, item) => sum + item.shipments, 0),
      weightKg: tail.reduce((sum, item) => sum + item.weightKg, 0),
    });
  }

  return {
    slices: head,
    totalShipments: rows.length,
    totalWeightKg: rows.reduce((sum, row) => sum + toNumber(row.weightKg), 0),
    days,
  };
}
