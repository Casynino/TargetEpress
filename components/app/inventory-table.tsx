"use client";

import * as React from "react";
import Link from "next/link";
import { Boxes, PackageX, TriangleAlert } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { useT } from "@/components/app/locale-provider";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STORAGE_POLICY, formatPackagesShort } from "@/lib/constants";
import { formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One piece of cargo standing on the Dar warehouse floor.
 *
 * PRICES ARE ABSENT ON PURPOSE. The warehouse may not see shipping prices or
 * any money figure — the owner's rule — so this type carries no amount, no
 * rate and no currency. `paid` is the whole of what the floor needs: it says
 * whether Finance has cleared the cargo for release, not what it cost. Because
 * the row shape has no money field, no amount is ever serialised into the
 * client bundle, which is a stronger guarantee than merely not rendering it.
 */
export type InventoryRow = {
  id: string;
  trackingNumber: string;
  status: "RECEIVED_AT_DAR" | "READY_FOR_PICKUP";
  customerName: string;
  customerPhone: string | null;
  description: string;
  /** Manifest count and its unit — a count is never shown without its unit. */
  packages: number;
  packageType: string;
  /** Packages on the manifest that have not been ticked off in Dar. */
  packagesPending: number;
  weightKg: number;
  /** Kilos actually on the floor — declared weight minus what never arrived. */
  weightHereKg: number;
  batchNumber: string | null;
  /** The China carton this cargo was packed into — how it is found on a pallet. */
  cartonRef: string | null;
  /** Pre-formatted on the server; Prisma Dates never cross the client boundary. */
  arrivedLabel: string;
  /** ISO string, for sorting the column by real time rather than by its label. */
  arrivedIso: string | null;
  /** Whole days since the cargo landed. Null when no arrival time was recorded. */
  daysHeld: number | null;
  openExceptions: number;
  /** True when an ACTIVE pickup note exists — i.e. Finance says it is settled. */
  paid: boolean;
  pickupNoteNumber: string | null;
  clearedLabel: string | null;
};

type Segment = "all" | "unpaid" | "paid";

const SEGMENTS: { id: Segment; label: string; hint: string }[] = [
  { id: "all", label: "All held cargo", hint: "Everything on the floor" },
  {
    id: "unpaid",
    label: "Not yet paid for",
    hint: "Stored, waiting on Finance to confirm payment",
  },
  {
    id: "paid",
    label: "Cleared for pickup",
    hint: "Pickup note issued — the customer can collect",
  },
];

function matchesSegment(row: InventoryRow, segment: Segment) {
  if (segment === "paid") return row.paid;
  if (segment === "unpaid") return !row.paid;
  return true;
}

/** Whether the cargo has outstayed the free storage window. */
function isAging(row: InventoryRow) {
  return row.daysHeld !== null && row.daysHeld > STORAGE_POLICY.freeDays;
}

function DaysHeld({ row }: { row: InventoryRow }) {
  const t = useT();
  if (row.daysHeld === null) {
    return <span className="text-xs text-muted-foreground">{t("Not recorded")}</span>;
  }
  return (
    <span
      className={cn(
        "text-sm tabular",
        isAging(row) ? "font-medium text-warning" : "text-muted-foreground"
      )}
    >
      {row.daysHeld === 0
        ? t("Today")
        : `${row.daysHeld} ${t(row.daysHeld === 1 ? "day" : "days")}`}
    </span>
  );
}

/**
 * Payment state as the floor sees it: cleared or not cleared, never an amount.
 */
function PaymentBadge({ row }: { row: InventoryRow }) {
  const t = useT();
  return row.paid ? (
    <Badge variant="success">{t("Paid — cleared")}</Badge>
  ) : (
    <Badge variant="warning">{t("Not yet paid")}</Badge>
  );
}

export function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  const t = useT();
  const [segment, setSegment] = React.useState<Segment>("all");

  const counts = React.useMemo(
    () => ({
      all: rows.length,
      paid: rows.filter((row) => row.paid).length,
      unpaid: rows.filter((row) => !row.paid).length,
    }),
    [rows]
  );

  const segmentRows = React.useMemo(
    () => rows.filter((row) => matchesSegment(row, segment)),
    [rows, segment]
  );

  const columns: Column<InventoryRow>[] = [
    {
      id: "trackingNumber",
      header: t("Tracking"),
      sortValue: (row) => row.trackingNumber,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/cargo/${row.trackingNumber}`}
            className="font-mono text-sm font-medium tabular hover:text-brand"
          >
            {row.trackingNumber}
          </Link>
          {row.cartonRef ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              Carton {row.cartonRef}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "customer",
      header: t("Customer"),
      sortValue: (row) => row.customerName,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.customerName}</p>
          <p className="truncate text-xs text-muted-foreground tabular">
            {row.customerPhone ?? "No phone recorded"}
          </p>
        </div>
      ),
    },
    {
      id: "packages",
      header: t("Packages"),
      align: "right",
      sortValue: (row) => row.packages,
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-mono text-sm tabular">
            {formatPackagesShort(row.packages, row.packageType)}
          </span>
          {row.packagesPending > 0 ? (
            <p className="text-[11px] font-medium text-destructive tabular">
              {row.packagesPending} not checked in
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "weight",
      header: t("Weight"),
      align: "right",
      hideBelow: "lg",
      sortValue: (row) => row.weightKg,
      cell: (row) => (
        <span className="font-mono text-sm tabular">
          {formatWeight(row.weightKg)}
        </span>
      ),
    },
    {
      id: "arrived",
      header: t("Arrived"),
      hideBelow: "lg",
      sortValue: (row) => (row.arrivedIso ? new Date(row.arrivedIso) : null),
      cell: (row) => (
        <span className="text-sm text-muted-foreground tabular">
          {row.arrivedLabel}
        </span>
      ),
    },
    {
      id: "daysHeld",
      header: t("Days held"),
      align: "right",
      // Sorting by the number, not the printed words, keeps "Today" first.
      sortValue: (row) => row.daysHeld ?? -1,
      cell: (row) => <DaysHeld row={row} />,
    },
    {
      id: "payment",
      header: t("Payment"),
      sortValue: (row) => (row.paid ? 1 : 0),
      cell: (row) => <PaymentBadge row={row} />,
    },
    {
      id: "status",
      header: t("Status"),
      hideBelow: "xl",
      defaultHidden: true,
      sortValue: (row) => row.status,
      cell: (row) => <ShipmentStatusBadge status={row.status} />,
    },
    {
      id: "batch",
      header: t("Batch"),
      hideBelow: "xl",
      defaultHidden: true,
      sortValue: (row) => row.batchNumber,
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground tabular">
          {row.batchNumber ?? "—"}
        </span>
      ),
    },
    {
      id: "condition",
      header: t("Condition"),
      hideBelow: "xl",
      sortValue: (row) => row.openExceptions + (row.packagesPending > 0 ? 1 : 0),
      cell: (row) =>
        row.openExceptions > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" />
            {row.openExceptions} open
          </span>
        ) : row.packagesPending > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
            <PackageX className="h-3.5 w-3.5" />
            Short
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t("Clean")}</span>
        ),
    },
  ];

  const filters: TableFilter<InventoryRow>[] = [
    {
      id: "aging",
      label: t("How long held"),
      options: [
        { value: "fresh", label: t("3 days or less") },
        { value: "week", label: `4–${STORAGE_POLICY.freeDays} days` },
        { value: "aging", label: `Over ${STORAGE_POLICY.freeDays} days` },
      ],
      match: (row, value) => {
        if (row.daysHeld === null) return false;
        if (value === "fresh") return row.daysHeld <= 3;
        if (value === "week")
          return row.daysHeld > 3 && row.daysHeld <= STORAGE_POLICY.freeDays;
        return row.daysHeld > STORAGE_POLICY.freeDays;
      },
    },
    {
      id: "condition",
      label: t("Condition"),
      options: [
        { value: "exception", label: t("Open exception") },
        { value: "short", label: t("Packages not checked in") },
        { value: "clean", label: t("Clean") },
      ],
      match: (row, value) => {
        if (value === "exception") return row.openExceptions > 0;
        if (value === "short") return row.packagesPending > 0;
        return row.openExceptions === 0 && row.packagesPending === 0;
      },
    },
    {
      id: "batch",
      label: t("Arrived on batch"),
      options: Array.from(
        new Set(rows.map((row) => row.batchNumber).filter(Boolean) as string[])
      )
        .sort()
        .map((value) => ({ value, label: value })),
      match: (row, value) => row.batchNumber === value,
    },
  ];

  const activeSegment = SEGMENTS.find((s) => s.id === segment) ?? SEGMENTS[0];

  return (
    <div className="space-y-4">
      {/* Segments. "Held here, nobody has paid for it" is the question the
          floor actually asks, so it is a top-level switch, not a buried filter. */}
      <div className="flex flex-col gap-2">
        <div
          role="group"
          aria-label={t("Inventory segment")}
          className="flex flex-wrap items-center gap-2"
        >
          {SEGMENTS.map((option) => {
            const active = option.id === segment;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSegment(option.id)}
                className={cn(
                  "focus-ring inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-brand/50 bg-brand/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {t(option.label)}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular",
                    active
                      ? "bg-brand text-brand-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {counts[option.id]}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{activeSegment.hint}</p>
      </div>

      <DataTable
        rows={segmentRows}
        columns={columns}
        getRowId={(row) => row.id}
        searchValue={(row) =>
          [
            row.trackingNumber,
            row.customerName,
            row.customerPhone ?? "",
            row.description,
            row.batchNumber ?? "",
            row.cartonRef ?? "",
            row.pickupNoteNumber ?? "",
          ].join(" ")
        }
        searchPlaceholder="Tracking number, customer, phone, carton or batch…"
        filters={filters}
        initialSort={{ columnId: "daysHeld", direction: "desc" }}
        emptyTitle="No cargo matches"
        emptyDescription="Try a different search, or clear the filters."
        renderExpanded={(row) => (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {[
              { label: t("Cargo"), value: row.description },
              {
                label: t("Packages"),
                value:
                  row.packagesPending > 0
                    ? `${formatPackagesShort(row.packages, row.packageType)} · ${row.packagesPending} not checked in`
                    : `${formatPackagesShort(row.packages, row.packageType)} · all checked in`,
              },
              { label: t("Weight"), value: formatWeight(row.weightKg) },
              { label: t("Arrived"), value: row.arrivedLabel },
              { label: t("Arrived on batch"), value: row.batchNumber ?? "Not recorded" },
              { label: t("China carton"), value: row.cartonRef ?? "Not recorded" },
              {
                label: t("Payment"),
                // Cleared or not cleared. Never an amount — the floor does not
                // see prices.
                value: row.paid
                  ? `Cleared${row.pickupNoteNumber ? ` · note ${row.pickupNoteNumber}` : ""}`
                  : "Not yet paid for",
              },
              {
                label: t("Cleared on"),
                value: row.clearedLabel ?? "—",
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 text-sm font-medium">{item.value}</dd>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 sm:col-span-4">
              <Button asChild size="sm" variant="outline">
                <Link href={`/app/cargo/${row.trackingNumber}`}>{t("Open cargo")}</Link>
              </Button>
              {row.paid ? (
                <Button asChild size="sm" variant="signal">
                  <Link href={`/app/release?open=${encodeURIComponent(row.trackingNumber)}`}>
                    Hand over
                  </Link>
                </Button>
              ) : null}
            </div>
          </dl>
        )}
        renderCard={(row) => (
          <Link
            href={`/app/cargo/${row.trackingNumber}`}
            className="panel focus-ring block p-4 transition-shadow active:shadow-lift"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono text-sm font-semibold tabular">
                {row.trackingNumber}
              </span>
              <PaymentBadge row={row} />
            </div>
            <p className="mt-2 truncate text-sm">{row.customerName}</p>
            <p className="truncate text-xs text-muted-foreground tabular">
              {row.customerPhone ?? "No phone recorded"}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <Boxes className="h-3.5 w-3.5" />
              {formatPackagesShort(row.packages, row.packageType)} ·{" "}
              {formatWeight(row.weightKg)}
              {row.cartonRef ? ` · carton ${row.cartonRef}` : ""}
            </p>
            <p className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                Arrived {row.arrivedLabel}
              </span>
              <span aria-hidden className="text-muted-foreground/50">
                ·
              </span>
              <DaysHeld row={row} />
            </p>
            {row.openExceptions > 0 ? (
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                <TriangleAlert className="h-3.5 w-3.5" />
                {row.openExceptions} open exception
                {row.openExceptions === 1 ? "" : "s"}
              </p>
            ) : row.packagesPending > 0 ? (
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-warning">
                <PackageX className="h-3.5 w-3.5" />
                {row.packagesPending} package
                {row.packagesPending === 1 ? "" : "s"} not checked in
              </p>
            ) : null}
          </Link>
        )}
      />
    </div>
  );
}
