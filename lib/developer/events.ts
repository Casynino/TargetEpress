import "server-only";

import { Prisma } from "@prisma/client";

import { DEVELOPER_LOCKOUT } from "@/lib/developer-shared";
import type { Problem } from "@/lib/developer/monitor";
import { guard } from "@/lib/developer/safe";
import { prisma } from "@/lib/prisma";

/* The Tanzania calendar day of a row, as a fragment `$queryRaw` accepts. */
const TZ_DAY_SQL = Prisma.sql`to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dar_es_Salaam')::date, 'YYYY-MM-DD')`;

function lastDays(n: number): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return Array.from({ length: n }, (_, i) =>
    fmt.format(new Date(Date.now() - (n - 1 - i) * 86_400_000)),
  );
}

export type Security = Awaited<ReturnType<typeof getSecurity>>;

/** Who is trying to get in, from where, and what was refused to the Developer. */
export async function getSecurity() {
  const { safe, failures } = guard();
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const since14 = new Date(Date.now() - 14 * 86_400_000);
  const window = new Date(
    Date.now() - DEVELOPER_LOCKOUT.windowMinutes * 60_000,
  );

  const [failed14, ok14, byAddress, refused, recent] = await Promise.all([
    safe(
      () =>
        prisma.loginEvent.count({
          where: { ok: false, createdAt: { gte: since14 } },
        }),
      0,
    ),
    safe(
      () =>
        prisma.loginEvent.count({
          where: { ok: true, createdAt: { gte: since14 } },
        }),
      0,
    ),
    safe(
      () =>
        prisma.$queryRaw<
          { ip: string | null; tries: number; accounts: number; last: Date }[]
        >`
          SELECT "ipAddress" AS ip, count(*)::int AS tries, count(DISTINCT email)::int AS accounts, max("createdAt") AS last
          FROM "LoginEvent" WHERE "ok" = false AND "createdAt" >= ${since7}
          GROUP BY 1 ORDER BY tries DESC, last DESC LIMIT 5`,
      [],
    ),
    safe(
      () =>
        prisma.auditLog.findMany({
          where: {
            action: { in: ["developer.denied", "developer.workas.refused"] },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, createdAt: true, summary: true },
        }),
      [],
    ),
    /* The same two numbers lib/developer.ts counts before it compares a password. */
    safe(
      () =>
        prisma.$queryRaw<{ per_ip: number; total: number }[]>`
          SELECT coalesce(max(c), 0)::int AS per_ip, coalesce(sum(c), 0)::int AS total FROM (
            SELECT count(*) AS c FROM "LoginEvent"
            WHERE "ok" = false AND "createdAt" >= ${window}
              AND email IN (SELECT email FROM "User" WHERE role::text = 'DEVELOPER')
            GROUP BY "ipAddress") x`,
      [{ per_ip: 0, total: 0 }],
    ),
  ]);
  const r = recent[0] ?? { per_ip: 0, total: 0 };
  return {
    failed14,
    ok14,
    byAddress,
    refused,
    lockedNow:
      r.per_ip >= DEVELOPER_LOCKOUT.perAddress ||
      r.total >= DEVELOPER_LOCKOUT.anywhere,
    readFailures: failures,
  };
}

export type Errors = Awaited<ReturnType<typeof getErrors>>;

/** Server errors the app recorded for itself, grouped so a repeat is one line. */
export async function getErrors() {
  const { safe, failures } = guard();
  const since24 = new Date(Date.now() - 86_400_000);
  const since14 = new Date(Date.now() - 14 * 86_400_000);
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const days = lastDays(14);

  const [kinds24, byDay, grouped, last] = await Promise.all([
    safe(
      async () =>
        (
          await prisma.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM (
              SELECT DISTINCT summary, metadata ->> 'path' FROM "AuditLog"
              WHERE action = 'system.error' AND "createdAt" >= ${since24}) x`
        )[0]?.n ?? 0,
      0,
    ),
    safe(
      () =>
        prisma.$queryRaw<{ day: string; n: number }[]>`
          SELECT ${TZ_DAY_SQL} AS day, count(*)::int AS n FROM "AuditLog"
          WHERE action = 'system.error' AND "createdAt" >= ${since14} GROUP BY 1`,
      [],
    ),
    safe(
      () =>
        prisma.$queryRaw<
          { message: string; path: string | null; n: number; last: Date }[]
        >`
          SELECT summary AS message, metadata ->> 'path' AS path, count(*)::int AS n, max("createdAt") AS last
          FROM "AuditLog" WHERE action = 'system.error' AND "createdAt" >= ${since30}
          GROUP BY 1, 2 ORDER BY max("createdAt") DESC LIMIT 6`,
      [],
    ),
    safe(
      () =>
        prisma.auditLog.findFirst({
          where: { action: "system.error" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      null,
    ),
  ]);

  const problems: Problem[] = [];
  if (kinds24 > 0)
    problems.push({
      level: kinds24 >= 5 ? "critical" : "warning",
      title: `${kinds24} different server error${kinds24 === 1 ? "" : "s"} in the last 24 hours`,
      detail: grouped[0]
        ? `Most recent: “${grouped[0].message.slice(0, 120)}” on ${grouped[0].path ?? "an unknown page"}.`
        : "See the errors table below.",
      hint: "Open Errors & jobs on this page. Work as someone who uses that page to reproduce it, then read the same time in Vercel → Logs for the full stack.",
      href: "/app/developer#errors",
    });

  return {
    kinds24,
    series: days.map((day) => ({
      day,
      n: byDay.find((x) => x.day === day)?.n ?? 0,
    })),
    grouped,
    last: last?.createdAt ?? null,
    problems,
    readFailures: failures,
  };
}
