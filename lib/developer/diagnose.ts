import "server-only";

import { Prisma } from "@prisma/client";

import type { Problem } from "@/lib/developer/monitor";
import { describe } from "@/lib/developer/safe";
import { prisma } from "@/lib/prisma";

/**
 * WHAT IS WRONG IN THE SYSTEM, AND WHAT TO DO ABOUT IT.
 *
 * The Developer's job is that the SYSTEM WORKS — not the business's operations.
 * A ticket nobody answered, a flight nobody marked landed or a payment Finance
 * has not verified yet are somebody else's work and are NOT listed here; they
 * stay visible as data on the Cargo, Money and Messages tabs, and never raise
 * an alert. What is listed is a promise the system broke or a thing the system
 * should have done by itself and did not.
 *
 * Every check here is a rule the system promises (see CLAUDE.md) or a queue that
 * should never sit for long. A check that finds nothing says nothing. One that
 * finds something names how many, says why it matters, and says exactly what to
 * do — and what NOT to do: money records are never edited by hand, so every
 * money hint ends in "tell me", because the fix is a code change plus a
 * correcting line, not a typed number.
 *
 * READ-ONLY. Each check runs on its own, so one that cannot run (a missing
 * column) is reported as "could not check" rather than hiding the others.
 */

type Check = {
  label: string;
  sql: Prisma.Sql;
  make: (n: number) => Problem | null;
};

const s = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const CHECKS: Check[] = [
  /* ─── The money book: promises that must always hold ─── */
  {
    label: "Payments missing from the money book",
    sql: Prisma.sql`
      SELECT count(*)::bigint AS n FROM "Payment" p
      WHERE p."voidedAt" IS NULL AND p."accountId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l WHERE l."paymentId" = p.id)`,
    make: (n) =>
      n > 0
        ? {
            level: "critical",
            title: `${s(n, "payment")} not in the money book`,
            detail:
              "Money was recorded as received into an account, but no ledger line was written. The account balance and every report are short by that amount.",
            hint: "Do not add the line by hand. Open Business → Payments to find it, then tell me: the save was cut short, and the fix is a code change plus a correcting line.",
            href: "/app/developer/business?tab=payments",
          }
        : null,
  },
  {
    label: "Cancelled payments with no reversing line",
    sql: Prisma.sql`
      SELECT count(*)::bigint AS n FROM "Payment" p
      WHERE p."voidedAt" IS NOT NULL AND p."accountId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "LedgerEntry" r JOIN "LedgerEntry" o ON r."reversesId" = o.id
          WHERE o."paymentId" = p.id)`,
    make: (n) =>
      n > 0
        ? {
            level: "critical",
            title: `${s(n, "cancelled payment")} still counted in the money book`,
            detail:
              "A payment was cancelled but the ledger line that recorded it was never reversed, so the account still holds money that was given back.",
            hint: "Do not delete anything. Open Business → Payments, note the payments marked cancelled, and tell me. The fix is a reversing line pointing back at the original.",
            href: "/app/developer/business?tab=payments",
          }
        : null,
  },
  {
    label: "Ledger lines reversed twice",
    sql: Prisma.sql`
      SELECT count(*)::bigint AS n FROM (
        SELECT "reversesId" FROM "LedgerEntry" WHERE "reversesId" IS NOT NULL
        GROUP BY 1 HAVING count(*) > 1) x`,
    make: (n) =>
      n > 0
        ? {
            level: "critical",
            title: `${s(n, "ledger line")} reversed more than once`,
            detail:
              "A line can only be answered by one reversing line. Reversing it twice takes the money out twice.",
            hint: "Do not edit the book. Tell me which account looks short; the double reversal needs a correcting line and a look at what allowed it.",
          }
        : null,
  },
  {
    label: "Ledger lines with a zero or negative amount",
    sql: Prisma.sql`SELECT count(*)::bigint AS n FROM "LedgerEntry" WHERE amount <= 0`,
    make: (n) =>
      n > 0
        ? {
            level: "warning",
            title: `${s(n, "ledger line")} with no amount or a negative one`,
            detail:
              "Direction (in or out) carries the sign, so every amount should be above zero.",
            hint: "Do not edit it. Tell me; it is a sign a screen accepted a bad figure.",
          }
        : null,
  },
  {
    label: "Bill status that disagrees with its payments",
    sql: Prisma.sql`
      SELECT count(*)::bigint AS n FROM "Invoice"
      WHERE (status::text = 'PAID' AND "total" > 0 AND "amountPaid" < "total")
         OR (status::text IN ('UNPAID', 'PARTIALLY_PAID') AND "total" > 0 AND "amountPaid" >= "total")
         OR (status::text = 'PARTIALLY_PAID' AND "amountPaid" <= 0)
         OR (status::text = 'UNPAID' AND "amountPaid" > 0)`,
    make: (n) =>
      n > 0
        ? {
            level: "warning",
            title: `${s(n, "bill")} whose status disagrees with the money paid`,
            detail:
              "For example a bill marked Paid with less paid than the total, or Unpaid with money against it. Staff may be releasing cargo on a wrong status.",
            hint: "Open Business → Bills and compare Status, Total and Paid. Do not change the bill; tell me the numbers and I will find which path left it that way.",
            href: "/app/developer/business?tab=bills",
          }
        : null,
  },

  /* ─── Billing: things the system should make impossible ─── */
  {
    label: "Cargo ready or delivered with no bill",
    sql: Prisma.sql`
      SELECT count(*)::bigint AS n FROM "Shipment" s
      LEFT JOIN "Invoice" i ON i."shipmentId" = s.id
      WHERE s."deletedAt" IS NULL AND i.id IS NULL
        AND s.status::text IN ('READY_FOR_PICKUP', 'DELIVERED')`,
    make: (n) =>
      n > 0
        ? {
            level: "warning",
            title: `${s(n, "piece")} of cargo ready or delivered with no bill`,
            detail:
              "Cargo can only be handed out against a bill. These have none, so nothing was charged or can be collected.",
            hint: "Open Business → Cargo and look for the tracking numbers. Older rows from before billing existed can be harmless; recent ones mean a path released cargo without a bill. Tell me which are recent.",
            href: "/app/developer/business?tab=cargo",
          }
        : null,
  },

  /* ─── Who can do everything ─── */
  {
    label: "Owner accounts",
    sql: Prisma.sql`SELECT count(*)::bigint AS n FROM "User" WHERE role::text = 'ADMIN' AND active = true`,
    make: (n) =>
      n > 1
        ? {
            level: "info",
            title: `${n} accounts hold the owner role`,
            detail:
              "The owner role can see and do everything, money included. It is worth knowing exactly who has it.",
            hint: "Open Access and check the Owner (Admin) group. Suspend any you do not recognise.",
            href: "/app/developer/accounts",
          }
        : null,
  },
];

/** Postgres/Prisma codes that mean "the database does not have what the code expects". */
const MISSING = /P2021|P2022|42703|42P01|does not exist/i;

/**
 * The checks themselves. Independent of every other read on the Home, so the
 * page can run them alongside the rest instead of after it.
 */
export async function runChecks() {
  const problems: Problem[] = [];
  const couldNot: string[] = [];

  const results = await Promise.all(
    CHECKS.map(async (check) => {
      try {
        const rows = await prisma.$queryRaw<{ n: bigint | number }[]>(
          check.sql,
        );
        return {
          check,
          n: Number(rows[0]?.n ?? 0),
          error: null as string | null,
        };
      } catch (error) {
        return { check, n: 0, error: describe(error) };
      }
    }),
  );
  for (const r of results) {
    if (r.error) {
      couldNot.push(`${r.check.label} — ${r.error}`);
      continue;
    }
    const p = r.check.make(r.n);
    if (p) problems.push(p);
  }

  /* Storage that should be charging and is not: needs two facts, so it is asked
     separately. Cargo past its free days AND no charge written for 3 days. */
  try {
    const [overdue] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "Shipment" s
      WHERE s."deletedAt" IS NULL AND s."deliveredAt" IS NULL
        AND s.status::text IN ('RECEIVED_AT_DAR', 'READY_FOR_PICKUP')
        AND s."arrivedAt" IS NOT NULL AND s."arrivedAt" < now() - interval '10 days'`;
    const last = await prisma.auditLog.findFirst({
      where: { action: "storage.charged" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const n = Number(overdue?.n ?? 0);
    const stale =
      !last || last.createdAt.getTime() < Date.now() - 3 * 86_400_000;
    if (n > 0 && stale)
      problems.push({
        level: "warning",
        title: "Storage does not seem to be charging",
        detail: `${s(n, "piece")} of cargo has been in Dar for over 10 days (past the free week), yet no storage charge has been written ${
          last ? "for more than 3 days" : "ever"
        }.`,
        hint: "Storage charges itself every night and at each warehouse scan. Check that CRON_SECRET is set (Settings tab), then Vercel → Cron Jobs → /api/cron/storage for a failed run and its log.",
        href: "/app/developer",
      });
  } catch (error) {
    couldNot.push(`Storage charging — ${describe(error)}`);
  }

  return { problems, couldNot };
}

/**
 * Reads that failed on the Home itself, plus checks that could not run. If the
 * reason is a missing column or table, say so plainly: it is the one failure
 * that means a deploy went out before its schema push.
 */
export function failureProblem(
  readFailures: string[],
  couldNot: string[],
): Problem | null {
  const all = [...new Set([...readFailures, ...couldNot])];
  if (all.length === 0) return null;
  {
    const missing = all.some((m) => MISSING.test(m));
    return {
      level: missing ? "critical" : "warning",
      title: missing
        ? "The database is missing something the code expects"
        : `${s(all.length, "reading")} could not be made`,
      detail: missing
        ? "A column or table the code reads is not in the database. Pages that touch it will fail for staff. First: " +
          all.find((m) => MISSING.test(m))
        : "Some numbers on this page may show as empty because the database refused the question. First: " +
          all[0],
      hint: missing
        ? "Push the schema to Neon now (npx prisma db push, against the production DIRECT_URL) — schema changes must go to Neon BEFORE the deploy that reads them. Then refresh this page."
        : "Refresh in a minute. If it keeps happening, open the Neon dashboard for an outage or a slow query, and send me this message.",
    };
  }
}
