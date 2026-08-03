"use client";

import Link from "next/link";
import { QrCode } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { ORIGIN_LABELS, SHIPMENT_STATUS_META } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";

/**
 * One row of a cargo search result.
 *
 * Flat and pre-formatted on the server, like every other table in the app:
 * Decimals and Dates never cross the client boundary, and `owed` is absent
 * entirely — not null, absent — for anyone without `finance.view`. The Dar
 * warehouse looks cargo up all day and must never be shown a price.
 */
export type CargoSearchRow = {
  id: string;
  trackingNumber: string;
  status: keyof typeof SHIPMENT_STATUS_META;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  description: string;
  packages: number;
  weightKg: number;
  origin: keyof typeof ORIGIN_LABELS;
  batchNumber: string | null;
  arrivedAt: string | null;
  /** True when a scanned label — not the typed text — resolved to this row. */
  fromLabel: boolean;
  /** Omitted for viewers without finance.view. */
  owed?: { label: string; state: "unbilled" | "due" | "settled" };
};

export function CargoSearchResults({ rows }: { rows: CargoSearchRow[] }) {
  const showMoney = rows.some((row) => row.owed !== undefined);

  const columns: Column<CargoSearchRow>[] = [
    {
      id: "trackingNumber",
      header: "Tracking",
      sortValue: (row) => row.trackingNumber,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/cargo/${row.trackingNumber}`}
            className="font-mono text-sm font-semibold tabular hover:text-brand"
          >
            {row.trackingNumber}
          </Link>
          {row.fromLabel ? (
            <Badge variant="brand" className="ml-2 align-middle text-[10px]">
              <QrCode className="mr-1 h-3 w-3" />
              scanned
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      sortValue: (row) => row.customerName,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/customers/${row.customerId}`}
            className="truncate text-sm hover:text-brand"
          >
            {row.customerName}
          </Link>
          <p className="truncate text-xs text-muted-foreground tabular">
            {row.customerPhone ?? "No phone recorded"}
          </p>
        </div>
      ),
    },
    {
      id: "cargo",
      header: "Cargo",
      hideBelow: "lg",
      sortValue: (row) => row.description,
      cell: (row) => (
        <div className="min-w-0">
          <p className="max-w-[220px] truncate text-sm">{row.description}</p>
          <p className="text-xs text-muted-foreground tabular">
            {row.packages} pkg · {formatWeight(row.weightKg)} ·{" "}
            {ORIGIN_LABELS[row.origin]}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (row) => Object.keys(SHIPMENT_STATUS_META).indexOf(row.status),
      cell: (row) => <ShipmentStatusBadge status={row.status} />,
    },
    {
      id: "where",
      header: "Where it is",
      hideBelow: "md",
      sortValue: (row) => SHIPMENT_STATUS_META[row.status].publicLocation,
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm">{SHIPMENT_STATUS_META[row.status].publicLocation}</p>
          {row.arrivedAt ? (
            <p className="text-xs text-muted-foreground tabular">
              Landed {formatDate(row.arrivedAt)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "batch",
      header: "Batch",
      hideBelow: "xl",
      sortValue: (row) => row.batchNumber,
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground tabular">
          {row.batchNumber ?? "—"}
        </span>
      ),
    },
    ...(showMoney
      ? ([
          {
            id: "owed",
            header: "Owed",
            align: "right",
            hideBelow: "xl",
            sortValue: (row) => row.owed?.label ?? "",
            cell: (row) =>
              !row.owed ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                <span
                  className={
                    row.owed.state === "due"
                      ? "font-mono text-sm font-medium tabular text-warning"
                      : row.owed.state === "settled"
                        ? "text-xs font-medium text-success"
                        : "text-xs text-muted-foreground"
                  }
                >
                  {row.owed.label}
                </span>
              ),
          },
        ] satisfies Column<CargoSearchRow>[])
      : []),
  ];

  const filters: TableFilter<CargoSearchRow>[] = [
    {
      id: "status",
      label: "Status",
      options: Object.entries(SHIPMENT_STATUS_META).map(([value, meta]) => ({
        value,
        label: meta.label,
      })),
      match: (row, value) => row.status === value,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      searchValue={(row) =>
        [
          row.trackingNumber,
          row.customerName,
          row.customerPhone ?? "",
          row.description,
          row.batchNumber ?? "",
        ].join(" ")
      }
      searchPlaceholder="Narrow these results…"
      filters={filters}
      emptyTitle="Nothing left after narrowing"
      emptyDescription="Clear the box above to see the full result set again."
      renderCard={(row) => (
        <Link
          href={`/app/cargo/${row.trackingNumber}`}
          className="panel block p-4 transition-shadow hover:shadow-lift"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-sm font-semibold tabular">
              {row.trackingNumber}
            </p>
            <ShipmentStatusBadge status={row.status} />
          </div>
          <p className="mt-1 truncate text-sm">{row.customerName}</p>
          <p className="text-xs text-muted-foreground tabular">
            {row.customerPhone ?? "No phone recorded"}
          </p>
          <p className="mt-2 truncate text-xs text-muted-foreground">
            {row.description}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular">
            {row.packages} pkg · {formatWeight(row.weightKg)} ·{" "}
            {SHIPMENT_STATUS_META[row.status].publicLocation}
          </p>
        </Link>
      )}
    />
  );
}
