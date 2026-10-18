import "server-only";

import { BUILD_ID } from "@/lib/build-id";
import { prisma } from "@/lib/prisma";

/**
 * WHAT THE DEVELOPER NEEDS TO KNOW BEFORE ASKING ANYONE ANYTHING.
 *
 * Read-only, and it reports whether a thing is PRESENT — never what it is. The
 * environment list below is names only: a dashboard that printed a connection
 * string or a signing secret would be a place to copy them from, in a screen
 * that is rendered to a browser. "Set" or "missing" is the whole of what is
 * said about a secret.
 */

/** The configuration the app cannot run properly without, by name only. */
const REQUIRED_ENV = [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "NEXT_PUBLIC_SITE_URL",
] as const;

export type SystemHealth = {
  build: string;
  environment: string;
  database: {
    reachable: boolean;
    latencyMs: number | null;
    /** The Developer role exists in the database — the one migration this
        account needs, and the first thing to check when it cannot be created. */
    developerRoleApplied: boolean | null;
  };
  config: { name: string; set: boolean }[];
  maintenanceMode: boolean;
  counts: {
    activeStaff: number;
    developerAccounts: number | null;
    shipments: number;
    invoices: number;
    payments: number;
    auditEntries: number;
  };
  security: {
    failedSignIns24h: number;
    lockedDeveloperSignIns24h: number;
    refusedDeveloperActions24h: number;
  };
};

export async function systemHealth(): Promise<SystemHealth> {
  const started = Date.now();
  let reachable = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
  }
  const latencyMs = reachable ? Date.now() - started : null;

  /* Asked of Postgres itself rather than inferred: the enum's own values are
     the truth about whether the migration ran. */
  let developerRoleApplied: boolean | null = null;
  if (reachable) {
    try {
      const values = await prisma.$queryRaw<{ v: string }[]>`
        SELECT unnest(enum_range(NULL::"Role"))::text AS v`;
      developerRoleApplied = values.some((row) => row.v === "DEVELOPER");
    } catch {
      developerRoleApplied = null;
    }
  }

  const since = new Date(Date.now() - 24 * 3_600_000);
  const [
    activeStaff,
    shipments,
    invoices,
    payments,
    auditEntries,
    failedSignIns,
    lockedSignIns,
    refusedActions,
  ] = reachable
    ? await Promise.all([
        prisma.user.count({ where: { active: true } }),
        prisma.shipment.count({ where: { deletedAt: null } }),
        prisma.invoice.count(),
        prisma.payment.count(),
        prisma.auditLog.count(),
        prisma.loginEvent.count({ where: { ok: false, createdAt: { gte: since } } }),
        prisma.auditLog.count({
          where: {
            action: "developer.login.failed",
            createdAt: { gte: since },
            summary: { contains: "locked" },
          },
        }),
        prisma.auditLog.count({
          where: { action: "developer.denied", createdAt: { gte: since } },
        }),
      ])
    : [0, 0, 0, 0, 0, 0, 0, 0];

  /* Counted only once the enum is known to carry the value, so a database that
     has not had the migration reports "not yet" instead of failing the page. */
  const developerAccounts =
    reachable && developerRoleApplied
      ? await prisma.user.count({ where: { role: "DEVELOPER" } })
      : null;

  return {
    build: BUILD_ID,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    database: { reachable, latencyMs, developerRoleApplied },
    config: REQUIRED_ENV.map((name) => ({
      name,
      set: Boolean(process.env[name]),
    })),
    maintenanceMode: process.env.MAINTENANCE_MODE === "1",
    counts: {
      activeStaff,
      developerAccounts,
      shipments,
      invoices,
      payments,
      auditEntries,
    },
    security: {
      failedSignIns24h: failedSignIns,
      lockedDeveloperSignIns24h: lockedSignIns,
      refusedDeveloperActions24h: refusedActions,
    },
  };
}
