import "server-only";

import { Prisma } from "@prisma/client";

import { BUILD_ID } from "@/lib/build-id";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/developer/safe";

/**
 * Everything the Developer Home shows: usage, who signs in, speed, size,
 * sign-in trouble and a plain-language "needs your attention" list.
 *
 * READ-ONLY, and every probe is isolated so one failing query cannot blank the
 * page. Settings are reported as present or missing — never their value.
 */

const TZ = "Africa/Dar_es_Salaam";
const DAYS = 14;

export type Level = "critical" | "warning" | "info";
export type Problem = {
  level: Level;
  title: string;
  detail: string;
  hint: string;
  /** Where to look at it, when there is a screen for it. */
  href?: string;
  /** The specific things found, when there are only a few worth naming. */
  items?: string[];
};

/**
 * 100, less what is wrong: a broken thing costs most, a note costs a little.
 * Each kind has a ceiling, so a long list of small warnings cannot read as
 * "everything is on fire" — only something broken can take the ring to red.
 */
export function scoreOf(problems: Problem[]): number {
  const n = (level: Level) => problems.filter((p) => p.level === level).length;
  return Math.max(
    0,
    100 -
      Math.min(70, n("critical") * 35) -
      Math.min(40, n("warning") * 8) -
      Math.min(10, n("info") * 2),
  );
}
export type Probe = { label: string; ms: number; ok: boolean };
export type Monitor = Awaited<ReturnType<typeof getMonitor>>;

/** The settings the app needs, by name only. `required` ones turn the page red when absent. */
const ENV: {
  name: string;
  title: string;
  required: boolean;
  purpose: string;
  ifMissing: string;
}[] = [
  {
    name: "DATABASE_URL",
    title: "Database link",
    required: true,
    purpose: "How every page reads and writes cargo, money and people.",
    ifMissing: "Nothing can load or be saved.",
  },
  {
    name: "DIRECT_URL",
    title: "Database direct link",
    required: false,
    purpose:
      "Used for schema changes and long jobs that cannot go through the pooled link.",
    ifMissing:
      "Schema changes pushed from this machine would fail. The running site is not affected.",
  },
  {
    name: "AUTH_SECRET",
    title: "Sign-in signing key",
    required: true,
    purpose:
      "Signs sign-in sessions and the “work as” cookie so neither can be forged.",
    ifMissing: "Nobody can sign in, and “work as” cannot start.",
  },
  {
    name: "CRON_SECRET",
    title: "Nightly job key",
    required: true,
    purpose:
      "Lets the nightly jobs (storage charges, salary runs) prove they are the scheduler.",
    ifMissing:
      "The nightly jobs are refused, so storage stops charging by itself.",
  },
  {
    name: "BLOB_READ_WRITE_TOKEN",
    title: "File storage",
    required: true,
    purpose:
      "Stores photos, payment proofs and documents outside the database.",
    ifMissing: "Uploads fail, and files that were uploaded cannot be opened.",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    title: "Public site address",
    required: false,
    purpose: "Used in links and QR codes that leave the app.",
    ifMissing:
      "Links inside messages and QR codes may point to the wrong address.",
  },
];

/** "2026-10-17" for the last N days in Tanzania time, oldest first. */
function lastDays(n: number): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--)
    out.push(fmt.format(new Date(Date.now() - i * 86_400_000)));
  return out;
}

/** Plain-language browser and device from a User-Agent string. */
export function describeAgent(ua: string | null | undefined): {
  browser: string;
  os: string;
  mobile: boolean;
} {
  const s = ua ?? "";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /Firefox\//.test(s)
        ? "Firefox"
        : /Chrome\//.test(s) || /CriOS\//.test(s)
          ? "Chrome"
          : /Safari\//.test(s)
            ? "Safari"
            : s
              ? "Other browser"
              : "Unknown";
  const os = /Windows/.test(s)
    ? "Windows"
    : /Android/.test(s)
      ? "Android"
      : /iPhone|iPad|iOS/.test(s)
        ? "iPhone/iPad"
        : /Mac OS X|Macintosh/.test(s)
          ? "Mac"
          : /Linux/.test(s)
            ? "Linux"
            : "Unknown";
  return { browser, os, mobile: /Android|iPhone|iPad|Mobile/.test(s) };
}

async function timed(
  label: string,
  fn: () => Promise<unknown>,
): Promise<Probe> {
  const t0 = Date.now();
  try {
    await fn();
    return { label, ms: Date.now() - t0, ok: true };
  } catch {
    return { label, ms: Date.now() - t0, ok: false };
  }
}

const count = (rows: { n: bigint | number }[]) => Number(rows[0]?.n ?? 0);

/** A line written by the Developer account, by either of its two marks. */
const DEV_LINE_SQL = Prisma.sql`(action LIKE 'developer.%' OR coalesce("metadata" ->> 'developer', '') = 'true')`;

/**
 * Real queries timed one by one against the live database, after warming the
 * connection. Run ALONE and before anything else on the page: timed while a
 * dozen other reads are in flight they would measure the queue, not the
 * database, and "the database is slow" would be a lie of our own making.
 */
export async function runProbes(): Promise<{ dbOk: boolean; probes: Probe[] }> {
  const since24 = new Date(Date.now() - 86_400_000);
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(
    () => true,
    () => false,
  );
  const probes: Probe[] = [];
  probes.push(await timed("Simple ping", () => prisma.$queryRaw`SELECT 1`));
  probes.push(
    await timed("Find one account", () =>
      prisma.user.findFirst({ select: { id: true } }),
    ),
  );
  probes.push(
    await timed("Count today's activity", () =>
      prisma.auditLog.count({ where: { createdAt: { gte: since24 } } }),
    ),
  );
  probes.push(
    await timed("Load latest 50 activity lines", () =>
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    ),
  );
  probes.push(
    await timed("Count cargo", () =>
      prisma.shipment.count({ where: { deletedAt: null } }),
    ),
  );
  probes.push(
    await timed("Load 50 customers", () =>
      prisma.customer.findMany({ take: 50, select: { id: true } }),
    ),
  );
  return { dbOk, probes };
}

export async function getMonitor(
  ready?: Awaited<ReturnType<typeof runProbes>>,
) {
  const { safe, failures } = guard();
  const days = lastDays(DAYS);
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const since24 = new Date(Date.now() - 86_400_000);
  const since30 = new Date(Date.now() - 30 * 86_400_000);

  const { dbOk, probes } = ready ?? (await runProbes());

  const [
    loginsByDay,
    activityByDay,
    activityByHour,
    topActors,
    modules,
    recentLogins,
    signedIn24,
    signedIn7,
    dbSize,
    tables,
    inactive,
    neverSignedIn,
    suspended,
    overpaid,
    triggerPresent,
    failed24,
    failedByDay,
    recentFailed,
    devLocked24,
    devFailed24,
    devRefused24,
    refusedByDay,
    usersByRole,
    recentDev,
    activity24h,
  ] = await Promise.all([
    safe(
      () =>
        prisma.$queryRaw<{ day: string; role: string; n: number }[]>`
          SELECT to_char(((l."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dar_es_Salaam')::date, 'YYYY-MM-DD') AS day,
                 u."role"::text AS role, count(*)::int AS n
          FROM "LoginEvent" l JOIN "User" u ON u.id = l."userId"
          WHERE l."ok" = true AND l."createdAt" >= ${since}
          GROUP BY 1, 2`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<{ day: string; staff: number; dev: number }[]>`
          SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dar_es_Salaam')::date, 'YYYY-MM-DD') AS day,
                 count(*) FILTER (WHERE NOT ${DEV_LINE_SQL})::int AS staff,
                 count(*) FILTER (WHERE ${DEV_LINE_SQL})::int AS dev
          FROM "AuditLog"
          WHERE "createdAt" >= ${since} AND action NOT LIKE 'auth.%'
          GROUP BY 1`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<{ h: number; n: number }[]>`
          SELECT extract(hour FROM (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dar_es_Salaam'))::int AS h, count(*)::int AS n
          FROM "AuditLog"
          WHERE "createdAt" >= ${since} AND action NOT LIKE 'auth.%' AND NOT ${DEV_LINE_SQL}
          GROUP BY 1`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<{ name: string; n: number }[]>`
          SELECT coalesce(u."name", a."actorEmail", 'System') AS name, count(*)::int AS n
          FROM "AuditLog" a LEFT JOIN "User" u ON u.id = a."actorId"
          WHERE a."createdAt" >= ${since7} AND a.action NOT LIKE 'auth.%'
            AND NOT (a.action LIKE 'developer.%' OR coalesce(a."metadata" ->> 'developer', '') = 'true')
          GROUP BY 1 ORDER BY n DESC LIMIT 5`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<{ name: string; n: number }[]>`
          SELECT entity AS name, count(*)::int AS n
          FROM "AuditLog"
          WHERE "createdAt" >= ${since7} AND action NOT LIKE 'auth.%' AND NOT ${DEV_LINE_SQL}
          GROUP BY 1 ORDER BY n DESC LIMIT 6`,
      [],
    ),
    safe(
      () =>
        prisma.loginEvent.findMany({
          where: { ok: true },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
            user: { select: { name: true, role: true } },
          },
        }),
      [],
    ),
    safe(
      async () =>
        (
          await prisma.loginEvent.groupBy({
            by: ["userId"],
            where: {
              ok: true,
              userId: { not: null },
              createdAt: { gte: since24 },
            },
          })
        ).length,
      0,
    ),
    safe(
      async () =>
        (
          await prisma.loginEvent.groupBy({
            by: ["userId"],
            where: {
              ok: true,
              userId: { not: null },
              createdAt: { gte: since7 },
            },
          })
        ).length,
      0,
    ),
    safe(
      async () =>
        Number(
          (
            await prisma.$queryRaw<
              { b: bigint }[]
            >`SELECT pg_database_size(current_database())::bigint AS b`
          )[0].b,
        ),
      0,
    ),
    safe(
      async () =>
        (
          await prisma.$queryRaw<
            { name: string; bytes: bigint; rows: bigint }[]
          >`
            SELECT relname AS name, pg_total_relation_size(relid)::bigint AS bytes, n_live_tup::bigint AS rows
            FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 8`
        ).map((t) => ({
          name: t.name,
          bytes: Number(t.bytes),
          rows: Number(t.rows),
        })),
      [] as { name: string; bytes: number; rows: number }[],
    ),
    safe(
      () =>
        prisma.user.findMany({
          where: {
            status: "ACTIVE",
            active: true,
            role: { not: "DEVELOPER" },
            lastLoginAt: { lt: since30 },
          },
          orderBy: { lastLoginAt: "asc" },
          take: 8,
          select: { id: true, name: true, role: true, lastLoginAt: true },
        }),
      [],
    ),
    safe(
      () =>
        prisma.user.findMany({
          where: {
            status: "ACTIVE",
            active: true,
            role: { not: "DEVELOPER" },
            lastLoginAt: null,
          },
          take: 8,
          select: { id: true, name: true, role: true },
        }),
      [],
    ),
    safe(
      () =>
        prisma.user.count({
          where: { OR: [{ active: false }, { status: "SUSPENDED" }] },
        }),
      0,
    ),
    safe(
      async () =>
        count(
          await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*)::bigint AS n FROM "Invoice" WHERE "amountPaid" < 0`,
        ),
      null as number | null,
    ),
    safe(
      async () =>
        count(
          await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*)::bigint AS n FROM pg_trigger WHERE tgname = 'tx_protect_developer_audit_trg'`,
        ) > 0,
      null as boolean | null,
    ),
    safe(
      () =>
        prisma.loginEvent.count({
          where: { ok: false, createdAt: { gte: since24 } },
        }),
      0,
    ),
    safe(
      () =>
        prisma.$queryRaw<{ day: string; n: number }[]>`
          SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dar_es_Salaam')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
          FROM "LoginEvent" WHERE "ok" = false AND "createdAt" >= ${since} GROUP BY 1`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<
          {
            id: string;
            email: string;
            ip: string | null;
            createdAt: Date;
            count: number;
          }[]
        >`
          SELECT max(id) AS id, email, "ipAddress" AS ip, max("createdAt") AS "createdAt", count(*)::int AS count
          FROM "LoginEvent" WHERE "ok" = false AND "createdAt" >= ${since7}
          GROUP BY email, "ipAddress", date_trunc('minute', "createdAt")
          ORDER BY max("createdAt") DESC LIMIT 5`,
      [],
    ),
    safe(
      () =>
        prisma.auditLog.count({
          where: {
            action: "developer.login.failed",
            summary: { contains: "locked" },
            createdAt: { gte: since24 },
          },
        }),
      0,
    ),
    safe(
      () =>
        prisma.auditLog.count({
          where: {
            action: "developer.login.failed",
            createdAt: { gte: since24 },
          },
        }),
      0,
    ),
    safe(
      () =>
        prisma.auditLog.count({
          where: {
            action: { in: ["developer.denied", "developer.workas.refused"] },
            createdAt: { gte: since24 },
          },
        }),
      0,
    ),
    safe(
      () =>
        prisma.$queryRaw<{ day: string; n: number }[]>`
          SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dar_es_Salaam')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
          FROM "AuditLog"
          WHERE action IN ('developer.denied', 'developer.workas.refused') AND "createdAt" >= ${since} GROUP BY 1`,
      [],
    ),
    safe(
      () =>
        prisma.user.groupBy({ by: ["role", "active"], _count: { _all: true } }),
      [] as { role: string; active: boolean; _count: { _all: number } }[],
    ),
    safe(
      () =>
        prisma.auditLog.findMany({
          where: {
            OR: [
              { actorRole: "DEVELOPER" },
              { action: { startsWith: "developer." } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { id: true, createdAt: true, summary: true, metadata: true },
        }),
      [],
    ),
    safe(
      () =>
        prisma.auditLog.count({
          where: {
            createdAt: { gte: since24 },
            NOT: { action: { startsWith: "auth." } },
          },
        }),
      0,
    ),
  ]);

  // ── Day-by-day series. ──
  const ROLES = [
    "ADMIN",
    "MANAGER",
    "FINANCE",
    "CUSTOMER_CARE",
    "CHINA_WAREHOUSE",
    "DAR_WAREHOUSE",
    "DEVELOPER",
  ] as const;
  const loginSeries = days.map((day) => {
    const row: Record<string, number> = {};
    for (const r of ROLES)
      row[r] = loginsByDay.find((x) => x.day === day && x.role === r)?.n ?? 0;
    return { day, ...row } as { day: string } & Record<
      (typeof ROLES)[number],
      number
    >;
  });
  const activitySeries = days.map((day) => {
    const x = activityByDay.find((a) => a.day === day);
    return { day, staff: x?.staff ?? 0, dev: x?.dev ?? 0 };
  });
  const securitySeries = days.map((day) => ({
    day,
    failed: failedByDay.find((e) => e.day === day)?.n ?? 0,
    refused: refusedByDay.find((e) => e.day === day)?.n ?? 0,
  }));
  const hourSeries = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    n: activityByHour.find((a) => a.h === h)?.n ?? 0,
  }));

  // ── The settings that exist, never their values. ──
  const dbUrl = process.env.DATABASE_URL ?? "";
  const pooled = dbUrl.includes("-pooler");
  const env = ENV.map((e) => ({ ...e, set: Boolean(process.env[e.name]) }));
  const maintenance = process.env.MAINTENANCE_MODE === "1";

  // ── Problems found. ──
  const problems: Problem[] = [];
  const slowest = probes.reduce((m, p) => Math.max(m, p.ms), 0);
  const failedProbes = probes.filter((p) => !p.ok);
  const avgMs = Math.round(
    probes.reduce((s, p) => s + p.ms, 0) / Math.max(1, probes.length),
  );
  if (!dbOk || failedProbes.length === probes.length)
    problems.push({
      level: "critical",
      title: "The database cannot be reached",
      detail: "People cannot sign in or load pages right now.",
      hint: "Check the Neon dashboard for an outage and confirm DATABASE_URL in Vercel.",
    });
  else if (failedProbes.length)
    problems.push({
      level: "warning",
      title: `${failedProbes.length} database check${failedProbes.length > 1 ? "s" : ""} failed`,
      detail: failedProbes.map((p) => p.label).join(", "),
      hint: "Check the database in the Neon dashboard. If it keeps happening, tell me.",
    });
  if (dbOk && avgMs > 400)
    problems.push({
      level: "warning",
      title: "The database is slow",
      detail: `Checks averaged ${avgMs} ms (healthy is under 150 ms; slowest was ${slowest} ms).`,
      hint: "One spike after a quiet spell is normal (the database wakes up). If it stays slow, check Neon.",
    });
  if (dbOk && dbUrl && !pooled && process.env.VERCEL)
    problems.push({
      level: "warning",
      title: "The database link is not the pooled one",
      detail:
        "The site uses a direct connection, which can run out of connections when many people are online.",
      hint: "Use the “pooled” connection string for DATABASE_URL in Vercel.",
    });
  const missing = env.filter((e) => e.required && !e.set);
  if (missing.length)
    problems.push({
      level: "critical",
      title: `Required setting missing: ${missing.map((m) => m.title).join(", ")}`,
      detail: missing.map((m) => m.ifMissing).join(" "),
      hint: "Add it in Vercel → Settings → Environment Variables, then redeploy.",
    });
  if (maintenance)
    problems.push({
      level: "critical",
      title: "Maintenance mode is ON",
      detail: "The site is closed to staff and customers.",
      hint: "Remove MAINTENANCE_MODE in Vercel and redeploy when the work is finished.",
    });
  if (triggerPresent === false)
    problems.push({
      level: "critical",
      title: "Developer audit lines are no longer protected",
      detail:
        "The database rule that stops Developer audit lines being edited or deleted is missing.",
      hint: "Run scripts/neon-developer-account.sql on this database again.",
    });
  if (failed24 >= 10)
    problems.push({
      level: "warning",
      title: `${failed24} failed sign-ins in 24 hours`,
      detail:
        "That is more than normal typing mistakes and may be someone guessing passwords.",
      hint: "Open the “Sign-ins & security” tab. If it looks like an attack, suspend the targeted account from Access.",
    });
  if (devFailed24 > 0)
    problems.push({
      level: devLocked24 > 0 ? "warning" : "info",
      title: `${devFailed24} failed Developer sign-in${devFailed24 > 1 ? "s" : ""} in 24 hours`,
      detail:
        devLocked24 > 0
          ? "The Developer sign-in locked itself after repeated wrong passwords."
          : "Wrong-password tries on your own account. After 5 from one place it locks for 15 minutes.",
      hint: "If these were not you, change your password.",
    });
  if (overpaid && overpaid > 0)
    problems.push({
      level: "warning",
      title: "Some bills show a negative paid amount",
      detail: `${overpaid} bill${overpaid > 1 ? "s have" : " has"} a paid amount below zero, which should never happen.`,
      hint: "Open Business → Bills to find them. Money records must not be edited by hand; tell me and we fix the cause.",
    });
  if (dbSize > 400 * 1024 * 1024)
    problems.push({
      level: "warning",
      title: "The database is getting large",
      detail: `Total size is ${(dbSize / 1048576).toFixed(0)} MB.`,
      hint: "Check the Speed & size tab to see which table is growing.",
    });
  if (overpaid === null || triggerPresent === null)
    problems.push({
      level: "info",
      title: "Some numbers could not be read just now",
      detail:
        "A data check did not answer. This is usually a short database hiccup.",
      hint: "Refresh in a minute. If it keeps happening, check the database in the Neon dashboard.",
    });

  const score = scoreOf(problems);

  return {
    dbOk,
    pooled,
    dbMs: probes[0]?.ms ?? 0,
    build: BUILD_ID,
    node: process.version,
    nodeEnv: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    env,
    maintenance,
    probes,
    avgMs,
    loginSeries,
    activitySeries,
    securitySeries,
    hourSeries,
    topActors,
    modules,
    recentLogins: recentLogins.map((l) => ({
      ...l,
      agent: describeAgent(l.userAgent),
    })),
    signedIn24,
    signedIn7,
    activity24h,
    dbSize,
    tables,
    inactive,
    neverSignedIn,
    suspended,
    checks: [
      { label: "No bill has a negative paid amount", bad: overpaid },
      {
        label: "Developer audit lines are protected by the database",
        bad: triggerPresent === null ? null : triggerPresent ? 0 : 1,
      },
    ],
    security: {
      failed24,
      devFailed24,
      devLocked24,
      devRefused24,
      recentFailed,
    },
    usersByRole,
    recentDev,
    problems,
    score,
    readFailures: failures,
  };
}
