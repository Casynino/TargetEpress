import Link from "next/link";
import type { Metadata } from "next";
import type { ExceptionType, Prisma, Role } from "@prisma/client";
import { Clock, PackageX, Search, ShieldCheck, UserX, X } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import {
  EXCEPTION_GROUPS,
  groupOf,
  type ExceptionGroupKey,
} from "@/components/app/exception-card";
import { ExceptionTable } from "@/components/app/exception-table";
import { InvestigationCards } from "@/components/app/investigation-cards";
import type { InvestigationAllowances } from "@/components/app/investigation-actions";
import { PageHeader } from "@/components/app/page-header";
import { StatStrip } from "@/components/app/stat-strip";
import {
  EXCEPTION_OPEN_STATUSES,
  ROLE_LABELS,
} from "@/lib/constants";
import { activeAccounts } from "@/lib/accounts";
import { formatMoney, normaliseCode } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { InvestigationRecord } from "@/lib/investigation-lifecycle";
import {
  investigationCounts,
  isQueueSet,
  whereForSet,
  type QueueSet,
} from "@/lib/investigation-queue";
import { prisma } from "@/lib/prisma";
import { ROLE_PERMISSIONS, can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";
import type { Locale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Issues & Claims") };
}

/**
 * The one place flagged cargo lands.
 *
 * A flag never stops a flight being received — the boxes that came are checked
 * in and the ones that did not are recorded short. What must not happen is the
 * problem quietly disappearing, so every missing, damaged or wrong item is
 * parked here with its shipment, its flight and, above all, where its boxes
 * physically are, until somebody closes it out.
 *
 * Two filters, and they answer different questions. The six cards choose the
 * *set* of cases — open, found, waiting on a payout, finished — and the pills
 * underneath narrow that set by *what went wrong*. Keeping them apart is what
 * makes "damaged cargo that was later found" askable.
 *
 * The live queue is sorted oldest first on purpose. A shortage that has sat for
 * two weeks is the one costing the company a customer; a flag raised this
 * morning can wait.
 */

const GROUP_FILTERS: { key: ExceptionGroupKey | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "missing", label: EXCEPTION_GROUPS.missing.label },
  { key: "damaged", label: EXCEPTION_GROUPS.damaged.label },
  { key: "mismatch", label: EXCEPTION_GROUPS.mismatch.label },
  { key: "hold", label: EXCEPTION_GROUPS.hold.label },
  { key: "other", label: EXCEPTION_GROUPS.other.label },
];

const SET_COPY: Record<
  QueueSet,
  { heading: string; note: string; emptyTitle: string; emptyBody: string }
> = {
  open: {
    heading: "Under investigation",
    note: "oldest first",
    emptyTitle: "Nothing outstanding",
    emptyBody:
      "Every flagged item has been accounted for. Cargo flagged at check-in lands here on its own.",
  },
  found: {
    heading: "Cargo found",
    note: "most recent first",
    emptyTitle: "Nothing has turned up yet",
    emptyBody:
      "Cases marked Cargo found appear here — the boxes are back in the warehouse and the cargo reads as received again.",
  },
  compensation: {
    heading: "Waiting on a payout",
    note: "oldest first",
    emptyTitle: "No payouts outstanding",
    emptyBody:
      "A case lands here once a compensation payment has been recorded against it and the money has not gone out yet.",
  },
  closed: {
    heading: "Closed cases",
    note: "most recently closed first",
    emptyTitle: "Nothing closed yet",
    emptyBody: "Cases signed off by management are kept here permanently.",
  },
};

const PHOTO_SELECT = {
  select: {
    id: true,
    url: true,
    kind: true,
    caption: true,
    createdAt: true,
    exceptionId: true,
  },
  orderBy: { createdAt: "asc" as const },
  take: 24,
};

const EXCEPTION_INCLUDE = {
  raisedBy: { select: { name: true } },
  resolvedBy: { select: { name: true } },
  assignedTo: { select: { id: true, name: true } },
  batch: {
    select: {
      id: true,
      batchNumber: true,
      airline: true,
      flightNumber: true,
      waybillNumber: true,
      arrivalDate: true,
    },
  },
  // The permanent audit trail. Oldest first so it reads as a story.
  events: {
    select: {
      id: true,
      action: true,
      note: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" as const },
    take: 100,
  },
  compensation: {
    select: {
      amount: true,
      currency: true,
      paidAt: true,
      method: true,
      note: true,
      accountId: true,
      account: { select: { name: true } },
      recordedBy: { select: { name: true } },
    },
  },
  shipment: {
    select: {
      trackingNumber: true,
      status: true,
      ...selectText("description"),
      packages: true,
      packageType: true,
      customer: { select: { name: true, phone: true } },
      packageList: {
        select: { sequence: true, receivedAt: true, deliveredAt: true },
        orderBy: { sequence: "asc" as const },
      },
      // Every photo on the cargo, whichever end took it. Split by kind on the
      // way out: China's registration shots and the Dar floor's arrival shots
      // are what an investigation is decided by comparing.
      photos: PHOTO_SELECT,
      // Payment STATUS only. Dar never sees what anything cost, but "the
      // customer has already paid for the carton we cannot find" changes how
      // hard this gets chased.
      invoice: { select: { status: true } },
    },
  },
} satisfies Prisma.ShipmentExceptionInclude;

type ExceptionRow = Prisma.ShipmentExceptionGetPayload<{
  include: typeof EXCEPTION_INCLUDE;
}>;

/**
 * One database row, as the queue renders it.
 *
 * `canSeeMoney` is applied here rather than in the component. A figure that is
 * hidden with CSS is a figure that was sent to a warehouse phone, so the amount
 * is simply never built for anybody without `finance.view`.
 */
function toRecord(
  row: ExceptionRow,
  canSeeMoney: boolean,
  locale: Locale
): InvestigationRecord {
  const photos = row.shipment.photos.map((photo) => ({
    id: photo.id,
    url: photo.url,
    kind: photo.kind,
    caption: photo.caption,
    createdAt: photo.createdAt,
    onCase: photo.exceptionId === row.id,
  }));

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    description: row.description,
    raisedAt: row.raisedAt,
    raisedByName: row.raisedBy?.name ?? null,
    resolvedAt: row.resolvedAt,
    resolvedByName: row.resolvedBy?.name ?? null,
    resolutionNote: row.resolutionNote,
    severity: row.severity,
    assignedToId: row.assignedTo?.id ?? null,
    assignedToName: row.assignedTo?.name ?? null,
    chinaPhotos: photos.filter(
      (p) => p.kind === "CARGO" || p.kind === "PACKAGING"
    ),
    arrivalPhotos: photos.filter(
      (p) => p.kind === "ARRIVAL" || p.kind === "DAMAGE"
    ),
    events: row.events.map((event) => ({
      id: event.id,
      action: event.action,
      note: event.note,
      actorName: event.actor?.name ?? null,
      createdAt: event.createdAt,
    })),
    compensation: row.compensation
      ? {
          exists: true,
          paidAt: row.compensation.paidAt,
          amount: canSeeMoney
            ? formatMoney(row.compensation.amount, row.compensation.currency)
            : null,
          // Free text can quote a figure, so it travels with the figure.
          note: canSeeMoney ? row.compensation.note : null,
          recordedByName: row.compensation.recordedBy?.name ?? null,
          accountName: canSeeMoney
            ? (row.compensation.account?.name ?? null)
            : null,
          raw: canSeeMoney
            ? {
                amount: row.compensation.amount.toFixed(2),
                currency: row.compensation.currency,
                accountId: row.compensation.accountId,
              }
            : null,
        }
      : null,
    shipment: {
      trackingNumber: row.shipment.trackingNumber,
      status: row.shipment.status,
      description: cargoText(locale, row.shipment, "description"),
      customerName: row.shipment.customer.name,
      customerPhone: row.shipment.customer.phone,
      packageType: row.shipment.packageType,
      declaredPackages: row.shipment.packages,
      packages: row.shipment.packageList,
      // Whether the customer has settled their bill is finance information,
      // and it travels with the rest of it. Not merely unrendered for other
      // desks — absent from the payload, so it cannot leak through a prop, an
      // expanded row or a future edit to the table.
      settled: !canSeeMoney
        ? null
        : row.shipment.invoice?.status === "PAID"
          ? "PAID"
          : row.shipment.invoice?.status === "PARTIALLY_PAID"
            ? "PARTIALLY_PAID"
            : null,
    },
    batch: row.batch,
  };
}

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; group?: string; tracking?: string }>;
}) {
  // Read, not raise. Every department reaches this page — Dar found the
  // problem, China packed the box, Support is on the phone, Finance may owe
  // money — and what each may *do* to a case is decided below, case by case,
  // rather than at the door.
  const user = await requirePermission("exception.view");
  const locale = await viewerLocale();
  const params = await searchParams;

  const set: QueueSet = isQueueSet(params.set) ? params.set : "open";
  const group = (GROUP_FILTERS.find((f) => f.key === params.group)?.key ??
    "all") as ExceptionGroupKey | "all";
  const tracking = params.tracking ? normaliseCode(params.tracking) : "";

  // Cargo that was soft-deleted is gone from every normal view, and a case on a
  // record nobody can open is a dead end.
  const scope: Prisma.ShipmentExceptionWhereInput = {
    shipment: {
      deletedAt: null,
      ...(tracking ? { trackingNumber: tracking } : {}),
    },
  };

  const setWhere = { ...whereForSet(set), ...scope };
  const typeWhere =
    group === "all" ? {} : { type: { in: EXCEPTION_GROUPS[group].types } };

  // A live queue is chased oldest first; a history is read newest first.
  const orderBy: Prisma.ShipmentExceptionOrderByWithRelationInput =
    set === "open" || set === "compensation"
      ? { raisedAt: "asc" }
      : { resolvedAt: "desc" };

  const allow: InvestigationAllowances = {
    investigate: can(user.role, "exception.investigate"),
    approve: can(user.role, "exception.approve"),
    close: can(user.role, "exception.close"),
    // Finance holds exception.compensate and had no control anywhere on this
    // page: the case would say "Finance has not recorded a payout yet" to the
    // one desk that could, and offer it nothing to press.
    compensate: can(user.role, "exception.compensate"),
  };
  const canSeeMoney = can(user.role, "finance.view");

  const [counts, rows, closedRows, pillCounts, unassigned, assigneeRows, accounts] =
    await Promise.all([
      investigationCounts(),
      prisma.shipmentException.findMany({
        where: { ...setWhere, ...typeWhere },
        orderBy,
        take: 100,
        include: EXCEPTION_INCLUDE,
      }),
      // The second section only exists on the live queue: an open list next to
      // what was recently signed off is how a desk sees its own progress. The
      // history views are already a history.
      set === "open"
        ? prisma.shipmentException.findMany({
            where: {
              status: { in: ["CARGO_FOUND", "CLOSED", "RESOLVED", "WRITTEN_OFF"] },
              ...scope,
              ...typeWhere,
            },
            orderBy: { resolvedAt: "desc" },
            take: 25,
            include: EXCEPTION_INCLUDE,
          })
        : Promise.resolve([]),
      // Pill counts come from the database, not from the rows on screen. The
      // list is capped and already filtered by type, so counting it would make
      // every pill read either its own size or zero.
      prisma.shipmentException.groupBy({
        by: ["type"],
        where: setWhere,
        _count: { _all: true },
      }),
      prisma.shipmentException.count({
        where: {
          status: { in: [...EXCEPTION_OPEN_STATUSES] },
          assignedToId: null,
          ...scope,
        },
      }),
      // Only the people who could actually work a case, and only fetched for
      // the one role that may reassign.
      can(user.role, "exception.approve")
        ? prisma.user.findMany({
            where: {
              active: true,
              role: {
                in: (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) =>
                  can(role, "exception.investigate")
                ),
              },
            },
            select: { id: true, name: true, role: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      // The payout form's "Paid from" picker. Only fetched for a desk that can
      // actually record a payout — everyone else gets an empty list and no
      // control renders.
      allow.compensate ? activeAccounts() : Promise.resolve([]),
    ]);

  const records = rows.map((row) => toRecord(row, canSeeMoney, locale));
  const closedRecords = closedRows.map((row) =>
    toRecord(row, canSeeMoney, locale)
  );
  const assignees = assigneeRows.map((person) => ({
    id: person.id,
    name: person.name,
    roleLabel: t(locale, ROLE_LABELS[person.role]),
  }));

  const countFor = (key: ExceptionGroupKey | "all") =>
    pillCounts
      .filter(
        (bucket) =>
          key === "all" || groupOf(bucket.type as ExceptionType) === key
      )
      .reduce((total, bucket) => total + bucket._count._all, 0);

  const copy = SET_COPY[set];

  // Boxes, not flags: two exceptions on one shipment must not count its missing
  // cartons twice.
  const unaccounted = new Map<string, number>();
  for (const record of records) {
    unaccounted.set(
      record.shipment.trackingNumber,
      record.shipment.packages.filter((p) => !p.receivedAt).length
    );
  }
  const missingPieces = [...unaccounted.values()].reduce((a, b) => a + b, 0);
  const oldest =
    set === "open" && records.length > 0
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - records[0].raisedAt.getTime()) / 86_400_000
          )
        )
      : 0;

  return (
    <>
      <PageHeader
        title={t(locale, "Issues & Claims")}
        description={t(
          locale,
          "Every item flagged missing, damaged or wrong on arrival — held here, with the boxes it belongs to, until someone closes it out."
        )}
      />

      <InvestigationCards
        counts={counts}
        set={set}
        group={group}
        tracking={tracking}
      />

      {/* The cards count cases. These count the things a case does not: boxes
          on the floor, days lost, and cases with nobody's name on them. */}
      <StatStrip
        className="mb-5"
        chips={[
          {
            label: t(locale, "Packages unaccounted for"),
            value: String(missingPieces),
            icon: PackageX,
            tone: missingPieces > 0 ? "danger" : "success",
          },
          {
            label: t(locale, "Oldest open"),
            value: oldest > 0 ? `${oldest}d` : "—",
            icon: Clock,
            tone: oldest >= 7 ? "danger" : oldest >= 2 ? "warning" : "neutral",
          },
          {
            label: t(locale, "Nobody carrying"),
            value: String(unassigned),
            icon: UserX,
            tone: unassigned > 0 ? "warning" : "success",
          },
        ]}
      />

      {tracking ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            {t(locale, "Showing flags on")}{" "}
            <span className="font-mono font-semibold tabular">{tracking}</span>
          </p>
          <Link
            href={queryHref(set, group, "")}
            className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            {t(locale, "Show the whole queue")}
          </Link>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {GROUP_FILTERS.map((option) => {
          const count = countFor(option.key);
          const active = option.key === group;
          return (
            <Link
              key={option.key}
              href={queryHref(set, option.key, tracking)}
              className={`focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "border-brand bg-brand text-brand-foreground" : "hover:bg-accent"
              }`}
            >
              {t(locale, option.label)}
              <span
                className={`rounded-full px-1.5 text-xs tabular ${
                  active ? "bg-white/20" : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {t(locale, copy.heading)} ({records.length})
          {records.length > 1 ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {t(locale, copy.note)}
            </span>
          ) : null}
        </h2>

        {records.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={
              group === "all"
                ? tracking
                  ? `${t(locale, "Nothing on")} ${tracking}`
                  : t(locale, copy.emptyTitle)
                : t(locale, "Nothing of this kind here")
            }
            description={
              group === "all"
                ? tracking
                  ? t(
                      locale,
                      "This cargo has no case in this view. Try another card above."
                    )
                  : t(locale, copy.emptyBody)
                : t(
                    locale,
                    "Other cases are in this view — switch the filter above to see them."
                  )
            }
          />
        ) : (
          <ExceptionTable
            exceptions={records}
            allow={allow}
            assignees={assignees}
            accounts={accounts}
            closed={set !== "open" && set !== "compensation"}
          />
        )}
      </section>

      {closedRecords.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold">
            {t(locale, "Recently closed")} ({closedRecords.length})
          </h2>
          {/* Closed cases stay on the page but read back: they are a record,
              not a queue. Same table so the eye does not have to re-learn the
              columns halfway down. */}
          <ExceptionTable
            exceptions={closedRecords}
            allow={allow}
            assignees={assignees}
            accounts={accounts}
            closed
          />
        </section>
      ) : null}
    </>
  );
}

function queryHref(
  set: QueueSet,
  group: ExceptionGroupKey | "all",
  tracking: string
) {
  const query = new URLSearchParams();
  if (set !== "open") query.set("set", set);
  if (group !== "all") query.set("group", group);
  if (tracking) query.set("tracking", tracking);
  const search = query.toString();
  return search ? `/app/exceptions?${search}` : "/app/exceptions";
}
