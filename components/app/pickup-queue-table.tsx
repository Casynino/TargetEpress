"use client";

import Link from "next/link";
import type { ShipmentStatus } from "@prisma/client";
import { AlertTriangle, ArrowRight, PackageCheck, ShieldCheck } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PickupQueueRow = {
  /** Pickup note id — the row's identity, and what the release flow keys on. */
  id: string;
  noteNumber: string;
  /**
   * Money is OPTIONAL and absent for warehouse staff.
   *
   * The floor needs to know that Finance has cleared the cargo, not what the
   * customer paid — the owner's rule is that warehouse users never see
   * shipping prices. Making these optional rather than always-present means a
   * caller that omits them cannot accidentally render them.
   */
  amountPaid?: number;
  currency?: string;
  issuedAtLabel: string;
  /** Epoch ms, so sorting never depends on parsing a formatted string. */
  issuedAtMs: number;
  issuedByName: string | null;

  /**
   * Wait computed on the server. A client-side "time since" would recompute at
   * hydration and disagree with the HTML that was sent.
   */
  waitingMs: number;
  waitingLabel: string;

  customerId: string;
  customerName: string;
  customerPhone: string | null;

  trackingNumber: string;
  description: string;
  weightKg: number;
  /** Manifest count, in its own unit: "5 cartons" / "5 ctn". */
  packagesLabel: string;
  packagesShort: string;
  packagesReceived: number;
  packagesTotal: number;
  missingPackages: number[];

  shipmentStatus: ShipmentStatus;
  arrivedAtLabel: string | null;
  /** Chargeable days past the free storage window. */
  storageDays: number;

  /** Why the release would be refused. Empty means the counter can hand over. */
  blockers: string[];
  ready: boolean;
};

const DAY = 86_400_000;

/** Escalates with the wait: two days is normal, a week is a phone call. */
function waitTone(ms: number) {
  if (ms >= 7 * DAY) return "text-destructive";
  if (ms >= 2 * DAY) return "text-warning";
  return "text-muted-foreground";
}

/**
 * Who can collect today.
 *
 * One row per un-cancelled, unused pickup note — Finance has confirmed the
 * money, so the only remaining question is whether the boxes are all on the
 * floor. The queue answers that up front rather than at the counter with the
 * customer standing there: a row is either ready, or it says exactly what is
 * missing.
 *
 * The note itself is read-only here. Issuing and cancelling notes is Finance's
 * authority; the warehouse's job is to match it against cargo and hand over.
 */
export function PickupQueueTable({ rows }: { rows: PickupQueueRow[] }) {
  const columns: Column<PickupQueueRow>[] = [
    {
      id: "customer",
      header: "Customer",
      sortValue: (row) => row.customerName,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/customers/${row.customerId}`}
            className="font-medium hover:text-brand hover:underline"
          >
            {row.customerName}
          </Link>
          <div className="text-xs text-muted-foreground tabular">
            {row.customerPhone ?? "no phone"}
          </div>
        </div>
      ),
    },
    {
      id: "cargo",
      header: "Cargo",
      sortValue: (row) => row.trackingNumber,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/cargo/${row.trackingNumber}`}
            className="font-mono text-xs font-medium hover:text-brand hover:underline"
          >
            {row.trackingNumber}
          </Link>
          <div className="truncate text-xs text-muted-foreground">
            {row.description}
          </div>
        </div>
      ),
    },
    {
      id: "packages",
      header: "Packages",
      sortValue: (row) => row.packagesReceived - row.packagesTotal,
      cell: (row) => (
        <div>
          <p className="text-sm tabular">{row.packagesShort}</p>
          <p
            className={cn(
              "text-[11px] tabular",
              row.missingPackages.length > 0 || row.packagesTotal === 0
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {row.packagesTotal === 0
              ? "no labels on file"
              : `${row.packagesReceived} of ${row.packagesTotal} checked in`}
          </p>
        </div>
      ),
    },
    {
      id: "note",
      header: "Pickup note",
      sortValue: (row) => row.noteNumber,
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-medium tabular">{row.noteNumber}</p>
          <p className="text-[11px] text-muted-foreground tabular">
            {row.amountPaid !== undefined && row.currency
              ? `paid ${formatMoney(row.amountPaid, row.currency)}`
              : "payment confirmed"}
          </p>
        </div>
      ),
    },
    {
      id: "issued",
      header: "Issued",
      hideBelow: "xl",
      sortValue: (row) => row.issuedAtMs,
      className: "text-xs text-muted-foreground",
      cell: (row) => row.issuedAtLabel,
    },
    {
      id: "waiting",
      header: "Waiting",
      align: "right",
      sortValue: (row) => row.waitingMs,
      cell: (row) => (
        <div>
          <p className={cn("text-sm font-medium tabular", waitTone(row.waitingMs))}>
            {row.waitingLabel}
          </p>
          {row.storageDays > 0 ? (
            <p className="text-[11px] text-warning tabular">
              +{row.storageDays} d storage
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "state",
      header: "State",
      sortValue: (row) => (row.ready ? 0 : 1),
      cell: (row) =>
        row.ready ? (
          <Badge variant="success">Ready</Badge>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <Badge variant="warning">Held</Badge>
            <span className="text-[11px] text-muted-foreground">
              {row.blockers[0]}
            </span>
          </div>
        ),
    },
    {
      id: "action",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          asChild
          size="sm"
          variant={row.ready ? "brand" : "outline"}
          className="rounded-lg"
        >
          <Link href={`/app/release?note=${encodeURIComponent(row.noteNumber)}`}>
            Release
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      ),
    },
  ];

  const filters: TableFilter<PickupQueueRow>[] = [
    {
      id: "state",
      label: "State",
      options: [
        { value: "ready", label: "Ready to release" },
        { value: "held", label: "Held back" },
      ],
      match: (row, value) => (value === "ready" ? row.ready : !row.ready),
    },
    {
      id: "waiting",
      label: "Waiting",
      options: [
        { value: "today", label: "Issued today" },
        { value: "2", label: "Over 2 days" },
        { value: "7", label: "Over a week" },
      ],
      match: (row, value) => {
        if (value === "today") return row.waitingMs < DAY;
        return row.waitingMs >= Number(value) * DAY;
      },
    },
    {
      id: "storage",
      label: "Storage",
      options: [
        { value: "charging", label: "Accruing charges" },
        { value: "free", label: "Still free" },
      ],
      match: (row, value) =>
        value === "charging" ? row.storageDays > 0 : row.storageDays === 0,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      filters={filters}
      initialSort={{ columnId: "waiting", direction: "desc" }}
      searchValue={(row) =>
        [
          row.customerName,
          row.customerPhone ?? "",
          row.trackingNumber,
          row.noteNumber,
          row.description,
        ].join(" ")
      }
      searchPlaceholder="Customer, phone, tracking or pickup note"
      emptyTitle="Nothing matches"
      emptyDescription="No cargo in the pickup queue matches those filters."
      renderExpanded={(row) => (
        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cargo
            </p>
            <p className="text-sm">{row.description}</p>
            <p className="text-sm text-muted-foreground tabular">
              {row.packagesLabel} · {formatWeight(row.weightKg)}
            </p>
            <div className="pt-1">
              <ShipmentStatusBadge status={row.shipmentStatus} />
            </div>
            <p className="text-xs text-muted-foreground">
              {row.arrivedAtLabel
                ? `Arrived in Dar ${row.arrivedAtLabel}`
                : "No arrival recorded"}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pickup note
            </p>
            <p className="font-mono text-sm tabular">{row.noteNumber}</p>
            <p className="text-sm text-muted-foreground">
              {row.amountPaid !== undefined && row.currency
                ? `${formatMoney(row.amountPaid, row.currency)} settled · `
                : "Payment confirmed · "}
              {row.issuedAtLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              Issued by {row.issuedByName ?? "Finance"}. Finance issues and
              cancels pickup notes — the warehouse only matches it to cargo.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Release check
            </p>
            {row.ready ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Every package is on the floor. Scan the note, then the box.
              </p>
            ) : (
              <ul className="space-y-1">
                {row.blockers.map((blocker) => (
                  <li
                    key={blocker}
                    className="flex items-start gap-2 text-sm text-destructive"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{blocker}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="rounded-lg">
                <Link href={`/app/cargo/${row.trackingNumber}`}>Open cargo</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="rounded-lg">
                <Link href={`/app/customers/${row.customerId}`}>Customer</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
      renderCard={(row) => (
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{row.customerName}</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {row.trackingNumber} · {row.noteNumber}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular">
                {row.packagesShort} · {row.packagesReceived} of{" "}
                {row.packagesTotal} checked in
              </p>
            </div>
            {row.ready ? (
              <Badge variant="success">Ready</Badge>
            ) : (
              <Badge variant="warning">Held</Badge>
            )}
          </div>

          {row.ready ? null : (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {row.blockers[0]}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span className={cn("text-xs tabular", waitTone(row.waitingMs))}>
              waiting {row.waitingLabel}
            </span>
            <Button
              asChild
              size="sm"
              variant={row.ready ? "brand" : "outline"}
              className="rounded-lg"
            >
              <Link href={`/app/release?note=${encodeURIComponent(row.noteNumber)}`}>
                <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
                Release
              </Link>
            </Button>
          </div>
        </div>
      )}
    />
  );
}
