import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import {
  AlertTriangle,
  Clock,
  PackageOpen,
  PackageX,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import {
  EXCEPTION_GROUPS,
  ExceptionCard,
  type ExceptionCardData,
  type ExceptionGroupKey,
  daysOpen,
  groupOf,
} from "@/components/app/exception-card";
import { PageHeader } from "@/components/app/page-header";
import { StatStrip } from "@/components/app/stat-strip";
import { normaliseCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Investigation queue" };

/**
 * The one place flagged cargo lands.
 *
 * A flag never stops a flight being received — the boxes that came are checked
 * in and the ones that did not are recorded short. What must not happen is the
 * problem quietly disappearing, so every missing, damaged or wrong item is
 * parked here with its shipment, its flight and, above all, where its boxes
 * physically are, until somebody closes it out.
 *
 * Sorted oldest first on purpose. A shortage that has sat for two weeks is the
 * one costing the company a customer; a flag raised this morning can wait.
 */

const GROUP_FILTERS: { key: ExceptionGroupKey | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "missing", label: EXCEPTION_GROUPS.missing.label },
  { key: "damaged", label: EXCEPTION_GROUPS.damaged.label },
  { key: "mismatch", label: EXCEPTION_GROUPS.mismatch.label },
  { key: "other", label: EXCEPTION_GROUPS.other.label },
];

const EXCEPTION_INCLUDE = {
  raisedBy: { select: { name: true } },
  resolvedBy: { select: { name: true } },
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
  shipment: {
    select: {
      trackingNumber: true,
      status: true,
      description: true,
      packages: true,
      packageType: true,
      customer: { select: { name: true, phone: true } },
      packageList: {
        select: { sequence: true, receivedAt: true, deliveredAt: true },
        orderBy: { sequence: "asc" as const },
      },
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

function toCardData(row: ExceptionRow): ExceptionCardData {
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
    shipment: {
      trackingNumber: row.shipment.trackingNumber,
      status: row.shipment.status,
      description: row.shipment.description,
      customerName: row.shipment.customer.name,
      customerPhone: row.shipment.customer.phone,
      packageType: row.shipment.packageType,
      declaredPackages: row.shipment.packages,
      packages: row.shipment.packageList,
      settled:
        row.shipment.invoice?.status === "PAID"
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
  searchParams: Promise<{ group?: string; tracking?: string }>;
}) {
  const user = await requirePermission("exception.raise");
  const params = await searchParams;

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

  const [openRows, resolvedRows] = await Promise.all([
    // Everything still open, unfiltered by type: the counters on the pills have
    // to be honest about what is hiding behind the other pills.
    prisma.shipmentException.findMany({
      where: { status: "OPEN", ...scope },
      orderBy: { raisedAt: "asc" },
      include: EXCEPTION_INCLUDE,
    }),
    // Closed cases are filtered in the query, not after it: taking the newest
    // 25 and then filtering would show an empty history for a type that has
    // plenty of it.
    prisma.shipmentException.findMany({
      where: {
        status: { not: "OPEN" },
        ...scope,
        ...(group === "all"
          ? {}
          : { type: { in: [...EXCEPTION_GROUPS[group].types] } }),
      },
      orderBy: { resolvedAt: "desc" },
      take: 25,
      include: EXCEPTION_INCLUDE,
    }),
  ]);

  const canResolve = can(user.role, "exception.resolve");

  const openCards = openRows.map(toCardData);
  const visibleResolved = resolvedRows.map(toCardData);
  const visibleOpen = openCards.filter(
    (e) => group === "all" || groupOf(e.type) === group
  );

  const countFor = (key: ExceptionGroupKey | "all") =>
    key === "all"
      ? openCards.length
      : openCards.filter((e) => groupOf(e.type) === key).length;

  const oldest = openCards.length > 0 ? daysOpen(openCards[0].raisedAt) : 0;

  // Boxes, not flags: two exceptions on one shipment must not count its missing
  // cartons twice.
  const unaccounted = new Map<string, number>();
  for (const e of openCards) {
    unaccounted.set(
      e.shipment.trackingNumber,
      e.shipment.packages.filter((p) => !p.receivedAt).length
    );
  }
  const missingPieces = [...unaccounted.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Investigation queue"
        description="Every item flagged missing, damaged or wrong on arrival — held here, with the boxes it belongs to, until someone closes it out."
      />

      <StatStrip
        className="mb-5"
        chips={[
          {
            label: "Open",
            value: String(openCards.length),
            icon: AlertTriangle,
            tone: openCards.length > 0 ? "danger" : "success",
          },
          {
            label: "Missing",
            value: String(countFor("missing")),
            icon: PackageX,
            tone: countFor("missing") > 0 ? "danger" : "success",
          },
          {
            label: "Damaged",
            value: String(countFor("damaged")),
            icon: PackageOpen,
            tone: countFor("damaged") > 0 ? "warning" : "success",
          },
          {
            label: "Packages unaccounted for",
            value: String(missingPieces),
            icon: PackageX,
            tone: missingPieces > 0 ? "danger" : "success",
          },
          {
            label: "Oldest open",
            value: oldest > 0 ? `${oldest}d` : "—",
            icon: Clock,
            tone: oldest >= 7 ? "danger" : oldest >= 2 ? "warning" : "neutral",
          },
        ]}
      />

      {tracking ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            Showing flags on{" "}
            <span className="font-mono font-semibold tabular">{tracking}</span>
          </p>
          <Link
            href={group === "all" ? "/app/exceptions" : `/app/exceptions?group=${group}`}
            className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Show the whole queue
          </Link>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {GROUP_FILTERS.map((option) => {
          const href = new URLSearchParams();
          if (option.key !== "all") href.set("group", option.key);
          if (tracking) href.set("tracking", tracking);
          const query = href.toString();
          const count = countFor(option.key);
          const active = option.key === group;
          return (
            <Link
              key={option.key}
              href={query ? `/app/exceptions?${query}` : "/app/exceptions"}
              className={`focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "border-brand bg-brand text-brand-foreground" : "hover:bg-accent"
              }`}
            >
              {option.label}
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
          Under investigation ({visibleOpen.length})
          {visibleOpen.length > 1 ? (
            <span className="ml-2 font-normal text-muted-foreground">
              oldest first
            </span>
          ) : null}
        </h2>

        {visibleOpen.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={
              openCards.length > 0
                ? "Nothing of this kind is open"
                : tracking
                  ? `Nothing open on ${tracking}`
                  : "Nothing outstanding"
            }
            description={
              openCards.length > 0
                ? "Other flags are still open — switch the filter above to see them."
                : tracking
                  ? "This shipment has no case under investigation. Anything already closed is listed below."
                  : "Every flagged item has been accounted for. Cargo flagged at check-in lands here on its own."
            }
          />
        ) : (
          <ul className="space-y-3">
            {visibleOpen.map((exception) => (
              <ExceptionCard
                key={exception.id}
                exception={exception}
                canResolve={canResolve}
              />
            ))}
          </ul>
        )}
      </section>

      {visibleResolved.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold">
            Closed ({visibleResolved.length})
          </h2>
          <ul className="space-y-3">
            {visibleResolved.map((exception) => (
              <ExceptionCard
                key={exception.id}
                exception={exception}
                canResolve={false}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
