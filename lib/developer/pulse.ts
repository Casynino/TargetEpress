import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * WHAT IS REALLY GOING ON IN THE BUSINESS, FOR THE DEVELOPER.
 *
 * Cargo moving, bills waiting, payments arriving, who is online. READ-ONLY, and
 * every query is isolated so one failing does not blank the tab.
 *
 * Money is shown the way the system holds it: outstanding is DERIVED here as
 * total − amountPaid per bill and added up in that bill's own currency, never
 * across currencies. Payments are COUNTED, not summed: a payment's credited
 * figure and the bill's currency can differ, and a total that mixes them would
 * be a figure nobody could defend.
 */

const TZ = "Africa/Dar_es_Salaam";
const DAYS = 14;

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

function lastDays(n: number): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return Array.from({ length: n }, (_, i) =>
    fmt.format(new Date(Date.now() - (n - 1 - i) * 86_400_000)),
  );
}

export type Pulse = Awaited<ReturnType<typeof getPulse>>;

export async function getPulse() {
  const days = lastDays(DAYS);
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const online = new Date(Date.now() - 10 * 60_000);

  const [
    cargoByDay,
    paymentsByDay,
    cargoByStatus,
    billsByStatus,
    batchesByStatus,
    methods,
    owed,
    oldestUnpaid,
    batches,
    busiest,
    customers,
    newCustomers,
    cargoAdded7,
    payments7,
    lastCharge,
    charged7,
    onlineNow,
  ] = await Promise.all([
    safe(
      () =>
        prisma.$queryRaw<{ day: string; n: number }[]>`
          SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dar_es_Salaam')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
          FROM "Shipment" WHERE "deletedAt" IS NULL AND "createdAt" >= ${since} GROUP BY 1`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<{ day: string; n: number }[]>`
          SELECT to_char((("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dar_es_Salaam')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
          FROM "Payment" WHERE "paidAt" >= ${since} GROUP BY 1`,
      [],
    ),
    safe(
      () =>
        prisma.shipment.groupBy({
          by: ["status"],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
      [],
    ),
    safe(
      () => prisma.invoice.groupBy({ by: ["status"], _count: { _all: true } }),
      [],
    ),
    safe(
      () => prisma.batch.groupBy({ by: ["status"], _count: { _all: true } }),
      [],
    ),
    safe(
      () =>
        prisma.payment.groupBy({
          by: ["method"],
          where: { paidAt: { gte: since30 } },
          _count: { _all: true },
        }),
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<{ currency: string; n: number; owed: number }[]>`
          SELECT currency, count(*)::int AS n, coalesce(sum("total" - "amountPaid"), 0)::float AS owed
          FROM "Invoice"
          WHERE status::text IN ('UNPAID', 'PARTIALLY_PAID') AND "total" > "amountPaid"
          GROUP BY currency ORDER BY owed DESC`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<
          {
            number: string;
            customer: string;
            currency: string;
            owed: number;
            issued: Date;
          }[]
        >`
          SELECT i."invoiceNumber" AS number, c."name" AS customer, i.currency,
                 (i."total" - i."amountPaid")::float AS owed, i."issuedAt" AS issued
          FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
          WHERE i.status::text IN ('UNPAID', 'PARTIALLY_PAID') AND i."total" > i."amountPaid"
          ORDER BY i."issuedAt" ASC LIMIT 8`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<
          {
            number: string;
            origin: string;
            status: string;
            departedAt: Date | null;
            arrivedAt: Date | null;
            createdAt: Date;
            cargo: number;
          }[]
        >`
          SELECT b."batchNumber" AS number, b.origin::text AS origin, b.status::text AS status,
                 b."departedAt", b."arrivedAt", b."createdAt",
                 count(s.id) FILTER (WHERE s."deletedAt" IS NULL)::int AS cargo
          FROM "Batch" b LEFT JOIN "Shipment" s ON s."batchId" = b.id
          GROUP BY b.id ORDER BY b."createdAt" DESC LIMIT 8`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<{ name: string; n: number }[]>`
          SELECT c."name" AS name, count(*)::int AS n
          FROM "Shipment" s JOIN "Customer" c ON c.id = s."customerId"
          WHERE s."deletedAt" IS NULL AND s."createdAt" >= ${since30}
          GROUP BY c.id, c."name" ORDER BY n DESC LIMIT 8`,
      [],
    ),
    safe(() => prisma.customer.count(), 0),
    safe(
      () => prisma.customer.count({ where: { createdAt: { gte: since30 } } }),
      0,
    ),
    safe(
      () =>
        prisma.shipment.count({
          where: { deletedAt: null, createdAt: { gte: since7 } },
        }),
      0,
    ),
    safe(() => prisma.payment.count({ where: { paidAt: { gte: since7 } } }), 0),
    safe(
      () =>
        prisma.auditLog.findFirst({
          where: { action: "storage.charged" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      null,
    ),
    safe(
      () =>
        prisma.auditLog.count({
          where: { action: "storage.charged", createdAt: { gte: since7 } },
        }),
      0,
    ),
    safe(
      () =>
        prisma.user.findMany({
          where: {
            active: true,
            role: { not: "DEVELOPER" },
            lastActiveAt: { gte: online },
          },
          orderBy: { lastActiveAt: "desc" },
          select: { id: true, name: true, role: true, lastActiveAt: true },
        }),
      [],
    ),
  ]);

  const count = (rows: { _count: { _all: number } }[]) =>
    rows.reduce((s, r) => s + r._count._all, 0);
  const activeCargo = cargoByStatus
    .filter((r) => r.status !== "DELIVERED" && r.status !== "CANCELLED")
    .reduce((s, r) => s + r._count._all, 0);
  const unpaidBills = owed.reduce((s, r) => s + r.n, 0);

  return {
    cargoSeries: days.map((day) => ({
      day,
      n: cargoByDay.find((x) => x.day === day)?.n ?? 0,
    })),
    paymentSeries: days.map((day) => ({
      day,
      n: paymentsByDay.find((x) => x.day === day)?.n ?? 0,
    })),
    cargoByStatus: cargoByStatus.map((r) => ({
      name: r.status,
      n: r._count._all,
    })),
    billsByStatus: billsByStatus.map((r) => ({
      name: r.status,
      n: r._count._all,
    })),
    batchesByStatus: batchesByStatus.map((r) => ({
      name: r.status,
      n: r._count._all,
    })),
    methods: methods.map((r) => ({ name: r.method, n: r._count._all })),
    owed,
    unpaidBills,
    oldestUnpaid,
    batches,
    busiest,
    totalCargo: count(cargoByStatus),
    activeCargo,
    customers,
    newCustomers,
    cargoAdded7,
    payments7,
    lastCharge: lastCharge?.createdAt ?? null,
    charged7,
    onlineNow,
  };
}
