import "server-only";

import { cache } from "react";

import { Prisma } from "@prisma/client";

import {
  BILLED_INVOICE_STATUSES,
  EXCEPTION_OPEN_STATUSES,
  EXCEPTION_TYPE_LABELS,
  STORAGE_POLICY,
  DRAFT_INVOICE,
  storageChargingSince,
} from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { chinaProblems, floorSnapshot } from "@/lib/floor";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { REJECTED_NEEDING_A_CALL } from "@/lib/collections";
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
 * The month names down a chart axis, in the reader's language.
 *
 * Translated here rather than at the chart, because every caller of these
 * series hands the labels straight to a component that draws them without
 * reading them — a chart axis is the one place a stray English word survives
 * for months without anybody filing it.
 */
function monthLabels(locale: Locale, upto: number) {
  return MONTHS.slice(0, upto).map((month) => t(locale, month));
}

/**
 * Shipments registered per month, this year against last.
 *
 * Raw SQL because Prisma's groupBy cannot truncate a timestamp to a month, and
 * pulling every row into JS to bucket it would not survive real volume.
 */
export async function monthlyVolume(now = new Date(), locale: Locale = "en") {
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
    labels: monthLabels(locale, upto),
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
/**
 * What moved inside one stretch of time.
 *
 * THE ONE PLACE that answers "how much cargo was registered / delivered / flown
 * between these two dates". The management report grew its own three counts and
 * the dashboard already had `deliveredThisMonth`, so the same question had two
 * answers on two screens with nothing to say which was right.
 *
 * The report's version wrote `deletedAt: null` explicitly, which looked like a
 * filter the engines lacked — it is not. lib/prisma.ts adds that condition to
 * every shipment read already, and naming it merely opts out of the automatic
 * filter to apply the identical one by hand. Both counted the same population
 * all along, which is what made converging them safe.
 */
export async function volumeInWindow(from: Date, to: Date) {
  const range = { gte: from, lt: to };
  const [registered, delivered, batchesFlown] = await Promise.all([
    prisma.shipment.count({ where: { registeredAt: range } }),
    prisma.shipment.count({ where: { deliveredAt: range } }),
    prisma.batch.count({ where: { departedAt: range } }),
  ]);
  return { registered, delivered, batchesFlown };
}

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

/**
 * Money collected per month, in USD, for the CEO's revenue trend.
 *
 * Sums `creditedAmount`, never `amount`. A customer may hand over shillings or
 * dollars, and `amount` is whatever they handed over — adding those together
 * produces a number in no currency at all. `creditedAmount` is the same money
 * expressed in the invoice's currency at the rate frozen onto that invoice,
 * which is the only figure that can honestly be summed across payments.
 */
export async function monthlyRevenue(now = new Date(), locale: Locale = "en") {
  const year = now.getFullYear();
  const from = new Date(Date.UTC(year, 0, 1));

  const rows = await prisma.$queryRaw<{ month: number; total: Prisma.Decimal }[]>(
    Prisma.sql`
      SELECT
        EXTRACT(MONTH FROM "paidAt")::int                  AS month,
        COALESCE(SUM(COALESCE("creditedAmount", "amount")), 0) AS total
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
    labels: monthLabels(locale, upto),
    values: values.slice(0, upto),
    currentIndex: now.getMonth(),
  };
}

/**
 * How old the money owed to us is.
 *
 * "84 bills unpaid, TSh 25.4m" is a number nobody can act on. The first
 * question a finance desk asks about it is how much is genuinely late, because
 * a bill sent on Tuesday and a bill sent in March are not the same problem and
 * only one of them is a bad debt forming.
 *
 * Aged from confirmedAt, falling back to issuedAt — the moment the bill became
 * real. It deliberately does NOT age from sentAt: every invoice is generated
 * automatically now, so "sent" is a step in a workflow that no longer exists,
 * and clocking from it would have aged 4 bills out of 84 and quietly ignored
 * 99% of the money owed.
 *
 * Drafts are still excluded — a price Finance has not confirmed is not a debt,
 * and counting it would inflate the one figure on this page that people make
 * decisions from.
 */
export type AgeingBucket = {
  key: string;
  label: string;
  /** Days since the customer was told, inclusive lower bound. */
  from: number;
  /** Exclusive upper bound; null means open-ended. */
  to: number | null;
  count: number;
  usd: number;
};

export async function receivablesAgeing(
  now = new Date(),
  locale: Locale = "en"
) {
  const rows = await prisma.invoice.findMany({
    where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
    select: {
      total: true,
      amountPaid: true,
      confirmedAt: true,
      issuedAt: true,
    },
  });

  // `key` is what the page switches on and never changes language; `label` is
  // the only part of a bucket anybody reads.
  const buckets: AgeingBucket[] = [
    {
      key: "current",
      label: t(locale, "Billed this week"),
      from: 0,
      to: 8,
      count: 0,
      usd: 0,
    },
    { key: "week2", label: t(locale, "8–14 days"), from: 8, to: 15, count: 0, usd: 0 },
    { key: "month", label: t(locale, "15–30 days"), from: 15, to: 31, count: 0, usd: 0 },
    {
      key: "overdue",
      label: t(locale, "Over 30 days"),
      from: 31,
      to: null,
      count: 0,
      usd: 0,
    },
  ];

  let oldestDays = 0;
  for (const row of rows) {
    const outstanding = toNumber(row.total) - toNumber(row.amountPaid);
    // A rounding tail is not a debt. Anything under a cent is settled.
    if (outstanding <= 0.005) continue;

    const since = row.confirmedAt ?? row.issuedAt;
    const days = Math.max(
      0,
      Math.floor((now.getTime() - since.getTime()) / 86_400_000)
    );
    if (days > oldestDays) oldestDays = days;

    const bucket =
      buckets.find((b) => days >= b.from && (b.to === null || days < b.to)) ??
      buckets[buckets.length - 1];
    bucket.count += 1;
    bucket.usd += outstanding;
  }

  const totalUsd = buckets.reduce((sum, b) => sum + b.usd, 0);
  const lateUsd = buckets
    .filter((b) => b.key !== "current")
    .reduce((sum, b) => sum + b.usd, 0);

  return {
    buckets,
    totalUsd,
    lateUsd,
    /** The share of what is owed that is already past a week. */
    latePct: totalUsd > 0 ? (lateUsd / totalUsd) * 100 : 0,
    oldestDays,
    count: buckets.reduce((sum, b) => sum + b.count, 0),
  };
}

/**
 * Money in against money out, month by month.
 *
 * Collections alone answered "are we billing", never "are we keeping any of
 * it". A month where TSh 30m came in and TSh 29m went out looks identical to a
 * quiet one on a chart with a single series, and those are the two months a
 * business most needs to tell apart.
 *
 * In is what actually arrived (payments, cancelled ones excluded), not what
 * was billed. Out is expenses by the date they were incurred, voided ones
 * excluded — the same basis the ledger uses, so this chart and the register
 * cannot disagree.
 */
export async function cashFlowByMonth(now = new Date(), locale: Locale = "en") {
  const year = now.getFullYear();
  const from = new Date(Date.UTC(year, 0, 1));

  const [inRows, outRows] = await Promise.all([
    prisma.$queryRaw<{ month: number; total: Prisma.Decimal }[]>(
      Prisma.sql`
        SELECT
          EXTRACT(MONTH FROM "paidAt")::int                      AS month,
          COALESCE(SUM(COALESCE("creditedAmount", "amount")), 0) AS total
        FROM "Payment"
        WHERE "paidAt" >= ${from}
          AND "voidedAt" IS NULL
        GROUP BY 1
        ORDER BY 1
      `
    ),
    prisma.$queryRaw<{ month: number; total: Prisma.Decimal }[]>(
      Prisma.sql`
        SELECT
          EXTRACT(MONTH FROM "incurredAt")::int AS month,
          COALESCE(SUM("amountUsd"), 0)         AS total
        FROM "Expense"
        WHERE "incurredAt" >= ${from}
          AND "status" <> 'VOID'
        GROUP BY 1
        ORDER BY 1
      `
    ),
  ]);

  const moneyIn = Array.from({ length: 12 }, () => 0);
  const moneyOut = Array.from({ length: 12 }, () => 0);
  for (const row of inRows) moneyIn[row.month - 1] = toNumber(row.total);
  for (const row of outRows) moneyOut[row.month - 1] = toNumber(row.total);

  const upto = now.getMonth() + 1;
  return {
    labels: monthLabels(locale, upto),
    moneyIn: moneyIn.slice(0, upto),
    moneyOut: moneyOut.slice(0, upto),
    net: moneyIn.slice(0, upto).map((v, i) => v - moneyOut[i]),
    currentIndex: now.getMonth(),
  };
}

/**
 * Every consignment in the business, by where it physically is.
 *
 * The one question only this desk asks: not "how is my floor" but "where is all
 * of it". Mutually exclusive and summing to the total, because a ring whose
 * slices do not add up to the number in the middle is read as a bug.
 *
 * Delivered is deliberately absent. This is what the business is currently
 * carrying — cargo already handed over is not a position, it is history, and
 * including it would swamp every slice that still needs somebody to act.
 */
export async function corridorPosition() {
  const [inChina, inAir, onFloor, ready, flagged] = await Promise.all([
    prisma.shipment.count({
      where: { deletedAt: null, status: "READY_TO_DEPART" },
    }),
    prisma.shipment.count({ where: { deletedAt: null, status: "IN_TRANSIT" } }),
    prisma.shipment.count({
      where: { deletedAt: null, status: "RECEIVED_AT_DAR" },
    }),
    prisma.shipment.count({
      where: { deletedAt: null, status: "READY_FOR_PICKUP" },
    }),
    prisma.shipment.count({
      where: { deletedAt: null, status: "UNDER_INVESTIGATION" },
    }),
  ]);

  return {
    inChina,
    inAir,
    onFloor,
    ready,
    flagged,
    total: inChina + inAir + onFloor + ready + flagged,
  };
}

/**
 * Every desk, side by side, with the one thing wrong on each.
 *
 * The CEO's own view and nobody else's: each department already has a page that
 * answers "how am I doing", and none of them answers "which of my four desks
 * needs me this morning". Four separate dashboards cannot be compared by
 * opening them one at a time.
 *
 * Each row carries a headline figure, a second fact for context, and a problem
 * — the problem being the reason the row is worth reading at all. A desk with
 * nothing wrong says so.
 */
export type DeskPulse = {
  key: string;
  desk: string;
  href: string;
  headline: string;
  headlineLabel: string;
  detail: string;
  /** What is wrong. Null when the desk is clean. */
  problem: string | null;
  tone: "brand" | "signal" | "success" | "warning" | "info";
};

export async function deskPulse(
  rate: number | null = null,
  locale: Locale = "en"
): Promise<DeskPulse[]> {
  const [
    chinaStanding,
    chinaNoPhotos,
    darStanding,
    darAging,
    unpaidCount,
    unpaidValue,
    openTickets,
    openCases,
    readyNotCollected,
  ] = await Promise.all([
    prisma.shipment.count({ where: { deletedAt: null, status: "READY_TO_DEPART" } }),
    prisma.shipment.count({
      where: { deletedAt: null, status: "READY_TO_DEPART", photos: { none: {} } },
    }),
    prisma.shipment.count({ where: { deletedAt: null, status: "RECEIVED_AT_DAR" } }),
    prisma.shipment.count({
      where: {
        deletedAt: null,
        status: "RECEIVED_AT_DAR",
        /* The fee engine's boundary, asked of the database: the eighth day is
           charged from the moment it starts, so cargo that landed seven days
           ago is already on the meter. lib/floor.ts applies the same rule to
           the same tile. */
        arrivedAt: { lte: storageChargingSince() },
      },
    }),
    prisma.invoice.count({ where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } } }),
    prisma.invoice.aggregate({
      where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.supportTicket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
    }),
    prisma.shipmentException.count({
      where: { status: { in: [...EXCEPTION_OPEN_STATUSES] }, shipment: { deletedAt: null } },
    }),
    prisma.shipment.count({ where: { deletedAt: null, status: "READY_FOR_PICKUP" } }),
  ]);

  const owedUsd =
    toNumber(unpaidValue._sum.total ?? 0) - toNumber(unpaidValue._sum.amountPaid ?? 0);

  // A sentence with a count in it can never be looked up whole — the number is
  // baked in before anything sees the string. Composed from a translated
  // fragment plus the figure, which is the only way these reach Chinese.
  const count = (n: number, phrase: string) => `${n} ${t(locale, phrase)}`;

  return [
    {
      key: "china",
      desk: t(locale, "Guangzhou"),
      href: "/app/shipments",
      headline: String(chinaStanding),
      headlineLabel: t(locale, "standing"),
      detail: t(locale, "registered, waiting to fly"),
      problem:
        chinaNoPhotos > 0
          ? count(chinaNoPhotos, "with no photograph")
          : null,
      tone: "info",
    },
    {
      key: "dar",
      desk: t(locale, "Dar floor"),
      href: "/app/inventory",
      headline: String(darStanding),
      headlineLabel: t(locale, "on the floor"),
      detail: count(readyNotCollected, "cleared and waiting to be collected"),
      problem:
        darAging > 0
          ? count(darAging, "past the free storage window")
          : null,
      tone: "brand",
    },
    {
      key: "finance",
      desk: t(locale, "Finance"),
      href: "/app/finance",
      headline: String(unpaidCount),
      headlineLabel: t(locale, unpaidCount === 1 ? "bill unpaid" : "bills unpaid"),
      detail: t(locale, "confirmed and still owed"),
      // Shillings lead. The owner reads this the way the till does; the dollar
      // figure is what the invoice says and lives on the finance desk's page.
      problem:
        owedUsd > 0
          ? rate
            ? `TSh ${Math.round(owedUsd * rate).toLocaleString("en-US")} ${t(locale, "outstanding")}`
            : `USD ${owedUsd.toFixed(2)} ${t(locale, "outstanding")}`
          : null,
      tone: "warning",
    },
    {
      key: "support",
      desk: t(locale, "Support"),
      href: "/app/support",
      headline: String(openTickets),
      headlineLabel: t(locale, openTickets === 1 ? "open ticket" : "open tickets"),
      detail: t(locale, "customers waiting on an answer"),
      problem:
        openCases > 0
          ? count(openCases, openCases === 1 ? "open case" : "open cases")
          : null,
      tone: "signal",
    },
  ];
}

/**
 * Everything wrong anywhere in the business, for the one chair that answers for
 * all of it.
 *
 * attentionItems() gives the owner the *named* problems — this case, that
 * batch — and thresholds them, so a desk can be quietly failing at scale and
 * show nothing: forty consignments registered with no photograph produced not
 * one row, because no rule in it looks at photographs.
 *
 * This composes each desk's own problem set instead. Every count here is the
 * same query that desk's own panel runs, so the owner cannot be told something
 * different from the person responsible for it — and a new kind of problem is
 * added to a department once, not twice.
 *
 * Ordered by severity inside the panel; grouped by the desk that owns the fix,
 * because "which of my desks" is the first thing this reader needs.
 */
export type OwnerAttn = {
  id: string;
  group: string;
  severity: "critical" | "warning" | "info";
  label: string;
  detail: string;
  href: string;
  value?: string;
};

export async function ownerAttention(
  rate: number | null = null,
  locale: Locale = "en"
): Promise<OwnerAttn[]> {
  const [china, floor, darProblems, finance, support] = await Promise.all([
    chinaProblems(),
    floorSnapshot(),
    (async () => {
      const [openCases, readyForPickup, unfinishedBatches] = await Promise.all([
        prisma.shipmentException.count({
          where: { status: { in: [...EXCEPTION_OPEN_STATUSES] }, shipment: { deletedAt: null } },
        }),
        prisma.shipment.count({ where: { deletedAt: null, status: "READY_FOR_PICKUP" } }),
        prisma.batch.count({
          where: { status: "ARRIVED" },
        }),
      ]);
      return { openCases, readyForPickup, unfinishedBatches };
    })(),
    (async () => {
      const [drafts, unattributed, unpaid, unpaidValue] = await Promise.all([
        /* Shared clause — see DRAFT_INVOICE in lib/constants.ts. The approvals
           board counts the same set and must not drift from this one. */
        prisma.invoice.count({ where: DRAFT_INVOICE }),
        /* Unattributed money still waiting to be told which account it went
           into — but a cancelled payment went into none of them by definition,
           so chasing it would be chasing nothing. */
        prisma.payment.count({ where: { accountId: null, voidedAt: null } }),
        prisma.invoice.count({ where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } } }),
        prisma.invoice.aggregate({
          where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
          _sum: { total: true, amountPaid: true },
        }),
      ]);
      const owedUsd =
        toNumber(unpaidValue._sum.total ?? 0) - toNumber(unpaidValue._sum.amountPaid ?? 0);
      return { drafts, unattributed, unpaid, owedUsd };
    })(),
    (async () => {
      const [urgentTickets, openRequests, rejected, pending] = await Promise.all([
        prisma.supportTicket.count({
          where: { priority: "URGENT", status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
        }),
        prisma.sourcingRequest.count({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
        /* Only the ones somebody still has to ring about. A claim Finance
           refused whose bill has since been settled — at the counter, against
           a batch, by Finance directly — is finished work, and counting it
           kept twenty-six dead rows at the top of this desk's day. */
        prisma.paymentSubmission.count({ where: REJECTED_NEEDING_A_CALL }),
        prisma.paymentSubmission.count({ where: { status: "PENDING" } }),
      ]);
      return { urgentTickets, openRequests, rejected, pending };
    })(),
  ]);

  const money = (usd: number) =>
    rate ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}` : `USD ${usd.toFixed(2)}`;
  const shortBoxes = floor.declaredPackages - floor.packages;

  // Every label on this panel is a count and a phrase. The count is baked in
  // before the dictionary could ever see the sentence, so the phrase is looked
  // up on its own and the figure put back in front of it — the same trick
  // deskPulse uses, and the only way these reach a Chinese reader.
  const count = (n: number, phrase: string) => `${n} ${t(locale, phrase)}`;

  return [
    // ---- Guangzhou ----
    {
      when: china.noPhotos > 0,
      id: "cn-photos",
      group: t(locale, "Guangzhou"),
      severity: "critical" as const,
      label: count(china.noPhotos, "registered with no photograph"),
      detail: t(
        locale,
        "Nothing to show a customer whose cargo arrives damaged, and nothing to argue with when they say it did."
      ),
      href: "/app/shipments",
    },
    {
      when: china.unassigned > 0,
      id: "cn-unassigned",
      group: t(locale, "Guangzhou"),
      severity: "critical" as const,
      label: count(china.unassigned, "on no batch"),
      detail: t(
        locale,
        "Registered and sitting loose. Cargo on no batch does not get on an aircraft."
      ),
      href: "/app/batches",
    },
    {
      when: china.staleBatches > 0,
      id: "cn-batches",
      group: t(locale, "Guangzhou"),
      severity: "warning" as const,
      // Two figures in one sentence, so it splits twice.
      label: `${china.staleBatches} ${t(locale, "batch(es) open more than")} ${china.staleDays} ${t(locale, "days")}`,
      detail: t(
        locale,
        "A batch left open stops being a batch and becomes a shelf."
      ),
      href: "/app/batches",
    },
    // ---- Dar floor ----
    {
      when: shortBoxes > 0,
      id: "dar-short",
      group: t(locale, "Dar floor"),
      severity: "critical" as const,
      label: count(shortBoxes, "box(es) short of the manifest"),
      detail: t(
        locale,
        "Checked in with fewer cartons than the Guangzhou paperwork claims."
      ),
      href: "/app/receive",
    },
    {
      when: darProblems.unfinishedBatches > 0,
      id: "dar-unfinished",
      group: t(locale, "Dar floor"),
      severity: "warning" as const,
      label: count(darProblems.unfinishedBatches, "landed batch(es) not finished"),
      detail: t(
        locale,
        "The plane is down and the manifest is not fully ticked off."
      ),
      href: "/app/receive",
    },
    {
      when: floor.aging > 0,
      id: "dar-aging",
      group: t(locale, "Dar floor"),
      severity: "warning" as const,
      label: count(floor.aging, "past the free storage window"),
      detail: `${t(locale, "Standing more than")} ${STORAGE_POLICY.freeDays} ${t(locale, "days, and the customer usually does not know.")}`,
      href: "/app/inventory",
      value: `${t(locale, "longest")} ${floor.longestHeldDays}d`,
    },
    {
      when: darProblems.readyForPickup > 0,
      id: "dar-ready",
      group: t(locale, "Dar floor"),
      severity: "info" as const,
      label: count(darProblems.readyForPickup, "paid, not collected"),
      detail: t(locale, "Cleared by Finance and still on our shelves."),
      href: "/app/pickup-queue",
    },
    // ---- Finance ----
    {
      when: finance.drafts > 0,
      id: "fin-drafts",
      group: t(locale, "Finance"),
      severity: "critical" as const,
      label: count(finance.drafts, "price(s) to confirm"),
      detail: t(
        locale,
        "Nothing can be invoiced, and no cargo released, until they are signed off."
      ),
      href: "/app/shipments",
    },
    {
      when: finance.unattributed > 0,
      id: "fin-unattributed",
      group: t(locale, "Finance"),
      severity: "warning" as const,
      label: count(finance.unattributed, "payment(s) in no account"),
      detail: t(locale, "Money we hold that nobody has said where it landed."),
      href: "/app/finance/payments",
    },
    {
      when: finance.unpaid > 0,
      id: "fin-unpaid",
      group: t(locale, "Finance"),
      severity: "warning" as const,
      label: count(finance.unpaid, "bill(s) unpaid"),
      detail: t(
        locale,
        "Confirmed and sent to the customer. The money has not arrived."
      ),
      href: "/app/collections/follow-up",
      value: money(finance.owedUsd),
    },
    {
      when: support.pending > 0,
      id: "fin-verify",
      group: t(locale, "Finance"),
      severity: "warning" as const,
      label: count(support.pending, "collection(s) to verify"),
      detail: t(
        locale,
        "Customer Support collected these at the counter and handed them up."
      ),
      href: "/app/finance/verify",
    },
    // ---- Support ----
    {
      when: support.urgentTickets > 0,
      id: "sup-urgent",
      group: t(locale, "Support"),
      severity: "critical" as const,
      label: count(support.urgentTickets, "ticket(s) marked urgent"),
      detail: t(
        locale,
        "A customer is waiting on an answer somebody flagged as important."
      ),
      href: "/app/support/tickets?priority=high",
    },
    {
      when: support.rejected > 0,
      id: "sup-rejected",
      group: t(locale, "Support"),
      severity: "critical" as const,
      label: count(support.rejected, "payment(s) sent back by Finance"),
      detail: t(
        locale,
        "The customer was told their payment went through and it did not."
      ),
      href: "/app/collections/submissions?status=REJECTED",
    },
    {
      when: support.openRequests > 0,
      id: "sup-sourcing",
      group: t(locale, "Support"),
      severity: "info" as const,
      label: count(support.openRequests, "sourcing request(s) open"),
      detail: t(locale, "Somebody asked us to find them something in China."),
      href: "/app/support/sourcing",
    },
    {
      when: darProblems.openCases > 0,
      id: "cases",
      group: t(locale, "Cases"),
      severity: "critical" as const,
      label: count(darProblems.openCases, "open case(s)"),
      detail: t(locale, "Cargo reported missing, damaged or wrong on arrival."),
      href: "/app/exceptions",
    },
  ].filter((row) => row.when) as OwnerAttn[];
}

/** Batch weight utilisation — how full the batches we flew actually were. */
export async function batchUtilisation(take = 8) {
  const batches = await prisma.batch.findMany({
    where: { status: { in: ["IN_TRANSIT", "ARRIVED", "VERIFIED", "CLOSED"] } },
    orderBy: { departedAt: "desc" },
    take,
    select: {
      batchNumber: true,
      shipments: { where: { deletedAt: null }, select: { weightKg: true } },
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
          // Cargo whose only invoice is a draft is still waiting on Finance —
          // auto-drafting must not empty this queue by answering a different
          // question than the one it asks.
          OR: [{ invoice: null }, { invoice: { status: "DRAFT" } }],
          status: { in: ["RECEIVED_AT_DAR", "IN_TRANSIT"] },
        },
      }),
      prisma.pickupNote.count({ where: { status: "ACTIVE" } }),
      prisma.invoice.aggregate({
        where: { status: { in: [...BILLED_INVOICE_STATUSES] } },
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

/**
 * The CEO's whole-business view.
 *
 * Wrapped in React's request cache because the manager's home renders this
 * twice — once inside managerOverview's Promise.all and once inside the shared
 * ExecutiveDashboard — and the second call was eleven duplicate count queries
 * per page load. cache() deduplicates within one request and holds nothing
 * across requests, so the figures stay live; the alternative was passing the
 * result down through the dashboard's props, which would have forced every
 * OTHER caller of the dashboard to fetch stats it may not want.
 */
export const executiveStats = cache(async function executiveStats() {
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
    collectedAgg,
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
    /* Both collected figures in one statement, on the discipline every money
       total reads: COALESCE(creditedAmount, amount) — a USD payment recorded
       before the credited column existed is its own USD value, not zero.
       Cancelled payments are money that turned out never to have arrived, so
       they are excluded rather than subtracted later. */
    prisma.$queryRaw<{ month: Prisma.Decimal; allTime: Prisma.Decimal }[]>(
      Prisma.sql`
        SELECT
          COALESCE(SUM(COALESCE("creditedAmount", "amount"))
            FILTER (WHERE "paidAt" >= ${monthStart}), 0) AS "month",
          COALESCE(SUM(COALESCE("creditedAmount", "amount")), 0) AS "allTime"
        FROM "Payment"
        WHERE "voidedAt" IS NULL
      `
    ),
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
    revenueThisMonth: toNumber(collectedAgg[0]?.month ?? 0),
    allTimeCollected: toNumber(collectedAgg[0]?.allTime ?? 0),
    outstanding:
      toNumber(outstandingAgg._sum.total) - toNumber(outstandingAgg._sum.amountPaid),
  };
});

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
        _count: { select: { shipments: { where: { deletedAt: null } }, verifications: true, exceptions: true } },
        shipments: {
          where: { deletedAt: null },
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
        _count: { select: { shipments: { where: { deletedAt: null } }, verifications: true, exceptions: true } },
        shipments: {
          where: { deletedAt: null },
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
  role: "ADMIN" | "CHINA_WAREHOUSE" | "DAR_WAREHOUSE" | "FINANCE",
  locale: Locale = "en"
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
              _count: { select: { shipments: { where: { deletedAt: null } }, verifications: true } },
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
              _count: { select: { shipments: { where: { deletedAt: null } } } },
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
      // The enum name was previously de-underscored and lowercased on the spot,
      // which produces a phrase no dictionary can hold. The shared label map is
      // the same wording the case screens use, and it translates.
      title: `${t(locale, EXCEPTION_TYPE_LABELS[exception.type])} — ${exception.shipment.trackingNumber}`,
      detail: exception.description,
      meta: `${t(locale, "Open for")} ${ageDays(exception.raisedAt)} ${t(locale, "day(s)")}`,
      href: "/app/exceptions",
    });
  }

  for (const batch of arrivedBatches) {
    const remaining = batch._count.shipments - batch._count.verifications;
    if (remaining <= 0) continue;
    items.push({
      id: `batch-${batch.id}`,
      severity: ageDays(batch.arrivedAt) >= 2 ? "critical" : "warning",
      title: `${batch.batchNumber} ${t(locale, "not fully checked in")}`,
      detail: `${remaining} ${t(locale, "of")} ${batch._count.shipments} ${t(locale, "consignment(s) still unverified against the manifest.")}`,
      meta: `${t(locale, "Landed")} ${ageDays(batch.arrivedAt)} ${t(locale, "day(s) ago")}`,
      href: `/app/receive/${batch.id}`,
    });
  }

  for (const shipment of uninvoiced) {
    items.push({
      id: `noinv-${shipment.id}`,
      severity: "warning",
      title: `${shipment.trackingNumber} ${t(locale, "has no invoice")}`,
      detail: `${shipment.customer.name}${t(locale, "'s cargo is in the warehouse but has not been billed.")}`,
      meta: `${t(locale, "Waiting")} ${ageDays(shipment.arrivedAt)} ${t(locale, "day(s)")}`,
      href: `/app/cargo/${shipment.trackingNumber}`,
    });
  }

  for (const shipment of staleUnpaid) {
    const outstanding =
      toNumber(shipment.invoice?.total) - toNumber(shipment.invoice?.amountPaid);
    items.push({
      id: `unpaid-${shipment.id}`,
      severity: "critical",
      title: `${shipment.trackingNumber} ${t(locale, "unpaid for")} ${ageDays(shipment.arrivedAt)} ${t(locale, "days")}`,
      detail: `${shipment.customer.name} (${shipment.customer.phone}) ${t(locale, "owes")} ${shipment.invoice?.currency ?? "TZS"} ${outstanding.toLocaleString()}.`,
      meta: t(locale, "Occupying warehouse space"),
      href: `/app/cargo/${shipment.trackingNumber}`,
    });
  }

  for (const note of staleNotes) {
    items.push({
      id: `note-${note.id}`,
      severity: "warning",
      title: `${note.shipment.trackingNumber} ${t(locale, "paid but not collected")}`,
      detail: `${note.customer.name} ${t(locale, "was cleared for collection but has not come in.")}`,
      meta: `${t(locale, "Pickup note issued")} ${ageDays(note.issuedAt)} ${t(locale, "day(s) ago")}`,
      href: "/app/release",
    });
  }

  for (const batch of staleOpenBatches) {
    if (batch._count.shipments === 0) continue;
    items.push({
      id: `open-${batch.id}`,
      severity: "info",
      title: `${batch.batchNumber} ${t(locale, "still open")}`,
      detail: `${batch._count.shipments} ${t(locale, "consignment(s) waiting in China. Seal it to get them on a flight.")}`,
      meta: `${t(locale, "Opened")} ${ageDays(batch.createdAt)} ${t(locale, "day(s) ago")}`,
      href: `/app/batches/${batch.id}`,
    });
  }

  return items;
}

/**
 * The audit log, read back as a feed.
 *
 * `actorId` scopes it to one person, and every department dashboard passes it.
 * A warehouse clerk's own screen is not where you learn that Finance signed in
 * or that somebody in Guangzhou renamed themselves — that is another desk's
 * day, on a page headed with your own name.
 *
 * Omitting it returns the whole company, and only the CEO's dashboard does
 * that. The scope is a where-clause rather than a filter applied afterwards,
 * so another department's row never leaves the database.
 */
export async function recentActivity(limit = 12, actorId?: string) {
  return prisma.auditLog.findMany({
    where: actorId ? { actorId } : {},
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
      // `status` matters here as much as the amount. A DRAFT is the system's
      // price, not a confirmed bill, and a chase list that presents the two
      // identically has somebody ringing a customer to ask for a figure
      // Finance has not signed off on yet.
      invoice: {
        select: { total: true, amountPaid: true, currency: true, status: true },
      },
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
export async function cargoMix(days = 30, locale: Locale = "en") {
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
    // A product name is the customer's own words and stays as registered; only
    // the "no product chosen" bucket is ours to word.
    const key = row.cargoType?.name ?? t(locale, "Not classified");
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
      name: `${t(locale, "Other")} (${tail.length} ${t(locale, "items")})`,
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
