import "server-only";

import { Prisma } from "@prisma/client";

import { invoiceStatusFor } from "@/lib/invoice-status";
import type { Monitor, Problem } from "@/lib/developer/monitor";
import { humanize } from "@/lib/developer/format";
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
  /** What is true when it is fine — shown under the label in the checked list. */
  fine: string;
  /** Where it sits in the list the Developer reads. */
  group: string;
  sql: Prisma.Sql;
  make: (n: number) => Problem | null;
};

/** One line of the "System checks" list: what was asked, and how it came out. */
export type CheckResult = {
  label: string;
  group: string;
  status: "ok" | "fix" | "look" | "unknown";
  /** One line under the label: what is true when fine, what was found when not. */
  detail: string;
};

const s = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const CHECKS: Check[] = [
  /* ─── The money book: promises that must always hold ─── */
  {
    label: "Every received payment is in the money book",
    fine: "No payment is missing its ledger line.",
    group: "Money book",
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
    label: "Cancelled payments are reversed in the book",
    fine: "Every cancelled payment has its reversing line.",
    group: "Money book",
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
    label: "No ledger line is reversed twice",
    fine: "Each line has at most one reversal.",
    group: "Money book",
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
    label: "Every ledger amount is above zero",
    fine: "No line has a zero or negative amount.",
    group: "Money book",
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

  /* ─── Billing: things the system should make impossible ─── */
  {
    label: "Cargo that is ready or delivered has a bill",
    fine: "Every such piece of cargo is billed.",
    group: "Billing",
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

  /* ─── Billing: figures that can never be negative ─── */
  {
    label: "No bill has a negative total",
    fine: "All totals are zero or more.",
    group: "Billing",
    sql: Prisma.sql`SELECT count(*)::bigint AS n FROM "Invoice" WHERE total < 0`,
    make: (n) =>
      n > 0
        ? {
            level: "warning",
            title: `${s(n, "bill")} with a negative total`,
            detail:
              "A bill can be zero (no charge) but never below zero. Something wrote a bad figure.",
            hint: "Do not edit the bill. Open Business → Bills, note the numbers, and tell me which screen produced it.",
            href: "/app/developer/business?tab=bills",
          }
        : null,
  },
  {
    label: "Every ledger line has a dollar value",
    fine: "No line is worth zero or less in dollars.",
    group: "Money book",
    sql: Prisma.sql`SELECT count(*)::bigint AS n FROM "LedgerEntry" WHERE "amountUsd" <= 0`,
    make: (n) =>
      n > 0
        ? {
            level: "warning",
            title: `${s(n, "ledger line")} worth nothing in dollars`,
            detail:
              "Every line carries its dollar value for the reports. A zero or negative one makes totals wrong.",
            hint: "Do not edit the book. Tell me; it usually means a missing exchange rate when the line was written.",
          }
        : null,
  },
  /* ─── Time: nothing is written in the future ─── */
  {
    label: "Nothing is dated in the future",
    fine: "No payment or ledger line is dated ahead.",
    group: "Time",
    sql: Prisma.sql`
      SELECT ((SELECT count(*) FROM "Payment" WHERE "paidAt" > now() + interval '1 day')
            + (SELECT count(*) FROM "LedgerEntry" WHERE "occurredAt" > now() + interval '1 day'))::bigint AS n`,
    make: (n) =>
      n > 0
        ? {
            level: "warning",
            title: `${s(n, "record")} dated more than a day ahead`,
            detail:
              "A payment or ledger line with a future date usually means a time-zone slip or a mistyped date. It will not appear in today's reports.",
            hint: "Open Business → Payments and look for dates ahead of today. Do not edit them; tell me which screen wrote them.",
            href: "/app/developer/business?tab=payments",
          }
        : null,
  },
  /* ─── Setup: things the system cannot run without ─── */
  {
    label: "An active owner account exists",
    fine: "At least one owner can sign in.",
    group: "Setup",
    sql: Prisma.sql`SELECT count(*)::bigint AS n FROM "User" WHERE role::text = 'ADMIN' AND active = true`,
    make: (n) =>
      n === 0
        ? {
            level: "critical",
            title: "There is no active owner account",
            detail:
              "Nobody can approve what only the owner may approve, or change company settings.",
            hint: "Add an owner from Home → Add an account, or reactivate the owner's account in Access.",
            href: "/app/developer/accounts",
          }
        : null,
  },
  {
    label: "The rate book has active rules",
    fine: "Cargo can be priced.",
    group: "Setup",
    sql: Prisma.sql`SELECT count(*)::bigint AS n FROM "PricingRule" WHERE active = true`,
    make: (n) =>
      n === 0
        ? {
            level: "critical",
            title: "The rate book is empty",
            detail:
              "No cargo can be priced: every rule is switched off or missing.",
            hint: "Rates are changed by Finance in Price configuration. If they cannot be restored there, tell me before anyone prices cargo.",
          }
        : null,
  },
  {
    label: "An exchange rate is in force",
    fine: "Dollar amounts can be shown in shillings.",
    group: "Setup",
    sql: Prisma.sql`SELECT count(*)::bigint AS n FROM "ExchangeRate" WHERE active = true`,
    make: (n) =>
      n === 0
        ? {
            level: "warning",
            title: "No exchange rate is in force",
            detail:
              "Dollar amounts cannot be shown in shillings, and new ledger lines cannot be valued.",
            hint: "Finance sets the rate in Finance → Exchange rate. If the page will not save, tell me.",
          }
        : null,
  },
  {
    label: "A company account exists to receive money",
    fine: "Payments have an account to land in.",
    group: "Setup",
    sql: Prisma.sql`SELECT count(*)::bigint AS n FROM "CompanyAccount" WHERE active = true`,
    make: (n) =>
      n === 0
        ? {
            level: "warning",
            title: "There is no active company account",
            detail:
              "Payments have nowhere to land, so the money book cannot record them.",
            hint: "Finance adds accounts in Finance → Accounts. If that page fails, tell me.",
          }
        : null,
  },
];

/** Postgres/Prisma codes that mean "the database does not have what the code expects". */
const MISSING = /P2021|P2022|42703|42P01|does not exist/i;

/**
 * A bill whose stored status is not what the system itself would work out.
 *
 * Asked of `invoiceStatusFor`, the ONE place that decides a status, and not of
 * a hand-written rule here: the real rule counts what Finance cleared without
 * money arriving (a write-off, a waiver, a discount), so a bill can honestly be
 * PAID with less paid than the total. A first version of this check ignored
 * that and raised 26 false alarms on the live books — a check that cries wolf
 * is worse than none, so it now defers to the function that writes the status.
 */
async function billStatusCheck(): Promise<Problem | null> {
  const bills = await prisma.invoice.findMany({
    where: { status: { in: ["UNPAID", "PARTIALLY_PAID", "PAID"] } },
    select: {
      invoiceNumber: true,
      status: true,
      total: true,
      amountPaid: true,
      amountAdjusted: true,
    },
  });
  const wrong = bills.flatMap((b) => {
    const expected = invoiceStatusFor(
      b.status,
      Number(b.amountPaid),
      Number(b.total),
      Number(b.amountAdjusted),
    );
    return expected && expected !== b.status
      ? [
          `${b.invoiceNumber}: stored ${humanize(b.status)}, the figures say ${humanize(expected)}`,
        ]
      : [];
  });
  if (wrong.length === 0) return null;
  return {
    level: "warning",
    title: `${s(wrong.length, "bill")} whose status disagrees with its figures`,
    detail:
      "The status stored on these bills is not what the system's own rule works out from the total, the money paid and what was cleared. Cargo is released on that status, so it may be wrong.",
    hint: "Open Business → Bills and compare Status, Total and Paid for the ones listed. Do not change a bill; tell me the numbers and I will find which path left it that way.",
    href: "/app/developer/business?tab=bills",
    items: wrong.slice(0, 8),
  };
}

/**
 * The checks themselves. Independent of every other read on the Home, so the
 * page can run them alongside the rest instead of after it.
 */
export async function runChecks() {
  const problems: Problem[] = [];
  const couldNot: string[] = [];
  const checks: CheckResult[] = [];

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
      checks.push({
        label: r.check.label,
        group: r.check.group,
        status: "unknown",
        detail: r.error ?? "",
      });
      continue;
    }
    const p = r.check.make(r.n);
    if (p) problems.push({ ...p, group: r.check.group });
    checks.push({
      label: r.check.label,
      group: r.check.group,
      status: !p ? "ok" : p.level === "critical" ? "fix" : "look",
      detail: p ? p.title : r.check.fine,
    });
  }

  try {
    const billProblem = await billStatusCheck();
    if (billProblem) problems.push({ ...billProblem, group: "Billing" });
    checks.push({
      label: "Every bill's status agrees with its figures",
      group: "Billing",
      status: billProblem ? "look" : "ok",
      detail: billProblem
        ? billProblem.title
        : "Status, total and paid all match.",
    });
  } catch (error) {
    couldNot.push(`Bill status — ${describe(error)}`);
    checks.push({
      label: "Every bill's status agrees with its figures",
      group: "Billing",
      status: "unknown",
      detail: describe(error),
    });
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
        group: "Billing",
        level: "warning",
        title: "Storage does not seem to be charging",
        detail: `${s(n, "piece")} of cargo has been in Dar for over 10 days (past the free week), yet no storage charge has been written ${
          last ? "for more than 3 days" : "ever"
        }.`,
        hint: "Storage charges itself every night and at each warehouse scan. Check that CRON_SECRET is set (Settings), then Vercel → Cron Jobs → /api/cron/storage for a failed run and its log.",
        href: "/app/developer",
      });
    checks.push({
      label: "Storage is charged on cargo past its free days",
      group: "Billing",
      status: n > 0 && stale ? "look" : "ok",
      detail:
        n > 0 && stale
          ? "Cargo is past its free days but no charge has been written."
          : "Storage charges are being written.",
    });
  } catch (error) {
    couldNot.push(`Storage charging — ${describe(error)}`);
    checks.push({
      label: "Storage is charged on cargo past its free days",
      group: "Billing",
      status: "unknown",
      detail: describe(error),
    });
  }

  return { problems, couldNot, checks };
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

/**
 * The page-level facts as lines of the same list: the database answering, the
 * settings, maintenance mode, the audit protection. They are decided by the
 * monitor; this only states them in the form the "What was checked" list reads.
 */
export function systemChecks(
  m: Monitor,
  readFailureCount: number,
): CheckResult[] {
  const missing = m.env.filter((e) => e.required && !e.set);
  const [negative, trigger] = m.checks;
  const out: CheckResult[] = [
    {
      label: "The database can be reached",
      group: "Servers",
      status: m.dbOk ? "ok" : "fix",
      detail: m.dbOk ? `Answers in ${m.dbMs} ms.` : "It did not answer.",
    },
    {
      label: "The database is fast",
      group: "Servers",
      status:
        !m.dbOk || m.avgMs >= 400 ? "fix" : m.avgMs >= 150 ? "look" : "ok",
      detail: `Average ${m.avgMs} ms (healthy is under 150 ms).`,
    },
    ...(process.env.VERCEL
      ? [
          {
            label: "The database link is the pooled one",
            group: "Servers",
            status: m.pooled ? "ok" : "look",
            detail: m.pooled
              ? "Pooled."
              : "A direct link can run out of connections.",
          } as CheckResult,
        ]
      : []),
    {
      label: "Required settings are in place",
      group: "Servers",
      status: missing.length ? "fix" : "ok",
      detail: missing.length
        ? `${missing.map((x) => x.title).join(", ")} missing.`
        : "All required settings are set.",
    },
    {
      label: "The site is open",
      group: "Servers",
      status: m.maintenance ? "fix" : "ok",
      detail: m.maintenance
        ? "Maintenance mode is ON."
        : "Maintenance mode is off.",
    },
    {
      label: "No bill has a negative paid amount",
      group: "Billing",
      status:
        negative.bad === null ? "unknown" : negative.bad === 0 ? "ok" : "look",
      detail:
        negative.bad === null
          ? "Could not be read just now."
          : negative.bad === 0
            ? "All paid amounts are zero or more."
            : `${negative.bad} found.`,
    },
    {
      label: "Developer audit lines are protected",
      group: "Security",
      status:
        trigger.bad === null ? "unknown" : trigger.bad === 0 ? "ok" : "fix",
      detail:
        trigger.bad === 0
          ? "The database refuses to edit or delete them."
          : trigger.bad === null
            ? "Could not be read just now."
            : "The protecting rule is missing.",
    },
    {
      label: "Every reading on this page could be made",
      group: "Servers",
      status: readFailureCount ? "look" : "ok",
      detail: readFailureCount
        ? `${readFailureCount} reading(s) failed.`
        : "Nothing failed to read.",
    },
  ];
  return out;
}
