import "server-only";

import { prisma } from "@/lib/prisma";
import { cargoLabel } from "@/lib/cargo";
import { PACKAGE_TYPE_LABELS, SHIPMENT_STATUS_META } from "@/lib/constants";
import { auditSentence } from "@/lib/audit-humanise";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { cargoText, selectText } from "@/lib/viewer";

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
  take = 25,
  locale: Locale = "en"
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
      // The stored summary is English — it was written at the moment the thing
      // happened and is never rewritten. Say the event again in the reader's
      // language instead; anything the humaniser does not recognise falls back
      // to the stored English rather than being guessed at.
      summary: auditSentence(locale, { action: row.action, summary: row.summary }),
      reference:
        meta?.trackingNumber ??
        (row.entity === "Shipment" ? row.entityId : null) ??
        null,
      dateLabel: formatDate(row.createdAt, locale),
      // 24-hour clock, which reads the same in both languages.
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
  take = 200,
  locale: Locale = "en"
): Promise<MyShipmentRow[]> {
  const rows = await prisma.shipment.findMany({
    where: { createdById: userId },
    orderBy: { registeredAt: "desc" },
    take,
    select: {
      id: true,
      trackingNumber: true,
      ...selectText("description"),
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
      // Every other field on this row already followed the reader — status,
      // date, the unit on the count — while the one that says what the cargo IS
      // stayed in whatever language it was typed in. That is the wrong field to
      // leave behind: on "My cargo" it is the only thing distinguishing two
      // rows for the same customer.
      item: cargoLabel(
        row.cargoType?.name,
        cargoText(locale, row, "description"),
        locale
      ),
      weightKg: toNumber(row.weightKg),
      // The count is put back in front of a translated unit; a count and its
      // unit joined before the lookup could never be found in a dictionary.
      packagesLabel: `${row.packages} ${t(locale, row.packages === 1 ? unit.one : unit.many)}`,
      statusLabel: t(locale, SHIPMENT_STATUS_META[row.status].label),
      status: row.status,
      registeredLabel: formatDate(row.registeredAt, locale),
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
export async function myBatches(
  userId: string,
  locale: Locale = "en"
): Promise<MyBatchRow[]> {
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
          ? t(locale, "Loading in China")
          : batchStatusWord(locale, batch.status),
        shipments: group._count,
        weightKg: toNumber(group._sum.weightKg ?? 0),
        packages: group._sum.packages ?? 0,
        departedLabel: batch.departureDate
          ? formatDate(batch.departureDate, locale)
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

/**
 * One batch status, in the reader's language.
 *
 * "Loading" is handled here rather than through the dictionary. The interface
 * already renders the English word "Loading" as its own spinner state, and a
 * dictionary keyed by English string can only hold one Chinese rendering per
 * key — putting this word through it would label a batch taking cargo as a
 * page that has not finished loading.
 */
function batchStatusWord(locale: Locale, status: string) {
  const word = BATCH_STATUS_WORDS[status] ?? status;
  if (word === "Loading") return locale === "zh" ? "装货中" : "Loading";
  return t(locale, word);
}

export type DailyPoint = { label: string; shipments: number; weightKg: number };

/**
 * The last fourteen days, one bar each — including the empty ones.
 *
 * Days with nothing on them are the point of the chart: a run of blanks is
 * what a trend looks like before anyone calls it one.
 */
export async function dailyActivity(
  userId: string,
  days = 14,
  locale: Locale = "en"
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

  // A bar's own date label. Chinese reads 8月11日, English 11 Aug — the same
  // two fields in the other order, which the platform formatter already knows.
  return [...buckets.entries()].map(([iso, value]) => ({
    label: new Date(iso).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", {
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
export async function loginHistory(
  userId: string,
  take = 20,
  locale: Locale = "en"
) {
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
    device: shortDevice(row.userAgent, locale),
    atLabel: formatDateTime(row.createdAt, locale),
  }));
}

/** A user agent string is unreadable; the browser and platform are enough. */
function shortDevice(agent: string | null, locale: Locale = "en") {
  if (!agent) return t(locale, "Unknown device");
  // Product names stay as their makers spell them in both languages; only the
  // two "we could not tell" words are ours.
  const platform = /android/i.test(agent)
    ? "Android"
    : /iphone|ipad/i.test(agent)
      ? "iOS"
      : /windows/i.test(agent)
        ? "Windows"
        : /mac os/i.test(agent)
          ? "Mac"
          : t(locale, "Unknown");
  const browser = /edg\//i.test(agent)
    ? "Edge"
    : /chrome/i.test(agent)
      ? "Chrome"
      : /safari/i.test(agent)
        ? "Safari"
        : /firefox/i.test(agent)
          ? "Firefox"
          : t(locale, "Browser");
  // Not a fragment lookup: Chinese puts the platform first and the browser
  // last, so "X on Y" has no split that reads correctly in both.
  return locale === "zh" ? `${platform} 上的 ${browser}` : `${browser} on ${platform}`;
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
