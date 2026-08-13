"use client";

import Link from "next/link";
import { FileText, Plane, Warehouse } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { useLocale, useT } from "@/components/app/locale-provider";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AIRPORT_LABELS } from "@/lib/cargo";
import { BATCH_STATUS_META } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BatchRow = {
  id: string;
  batchNumber: string;
  status: keyof typeof BATCH_STATUS_META;
  origin: "GUANGZHOU" | "HONG_KONG";
  airline: string | null;
  flightNumber: string | null;
  waybillNumber: string | null;
  createdAt: string;
  departureDate: string | null;
  arrivalDate: string | null;
  shipments: number;
  verified: number;
  packages: number;
  weightKg: number;
};

/** Where a batch is in its life, as one short phrase. */
const STAGE_RANK: Record<string, number> = {
  OPEN: 0,
  READY_TO_DEPART: 1,
  IN_TRANSIT: 2,
  ARRIVED: 3,
  VERIFIED: 4,
  CLOSED: 5,
};

/**
 * Batch register.
 *
 * Same reasoning as the receiving queue: a card per batch is fine for one and
 * useless for forty. Ordered newest-activity-first so the batch someone is
 * working on is at the top, and every row shows how full it is.
 */
export function BatchesTable({
  rows,
  canCreate,
}: {
  rows: BatchRow[];
  canCreate: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const columns: Column<BatchRow>[] = [
    {
      id: "batchNumber",
      header: t("Batch"),
      sortValue: (row) => row.batchNumber,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/batches/${row.id}`}
            className="font-mono text-sm font-semibold tabular hover:text-brand"
          >
            {row.batchNumber}
          </Link>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {row.origin === "HONG_KONG" ? (
              <Plane className="h-3 w-3" />
            ) : (
              <Warehouse className="h-3 w-3" />
            )}
            {t(AIRPORT_LABELS[row.origin])}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: t("Stage"),
      sortValue: (row) => STAGE_RANK[row.status] ?? 9,
      cell: (row) => <BatchStatusBadge status={row.status} />,
    },
    {
      id: "cargo",
      header: t("Cargo"),
      align: "right",
      sortValue: (row) => row.shipments,
      cell: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-sm font-medium tabular">
            {row.shipments} {t("shpt")}
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {row.packages} {t("pkg")}
          </p>
        </div>
      ),
    },
    {
      id: "weight",
      header: t("Weight"),
      align: "right",
      sortValue: (row) => row.weightKg,
      cell: (row) => (
        <span className="font-mono text-sm tabular">{formatWeight(row.weightKg)}</span>
      ),
    },
    {
      id: "flight",
      header: t("Flight"),
      hideBelow: "lg",
      sortValue: (row) => `${row.airline ?? ""} ${row.flightNumber ?? ""}`,
      cell: (row) =>
        row.airline ? (
          <div className="min-w-0">
            <p className="truncate text-sm">{row.airline}</p>
            <p className="font-mono text-xs text-muted-foreground tabular">
              {row.flightNumber ?? ""}
              {row.waybillNumber ? ` · ${row.waybillNumber}` : ""}
            </p>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("Not booked")}
          </span>
        ),
    },
    {
      id: "dates",
      header: t("Departed / arrived"),
      hideBelow: "xl",
      sortValue: (row) =>
        row.departureDate ? new Date(row.departureDate) : new Date(row.createdAt),
      cell: (row) => (
        <div className="min-w-0 whitespace-nowrap text-sm">
          {row.departureDate ? (
            <p>{formatDate(row.departureDate, locale)}</p>
          ) : (
            <p className="text-muted-foreground">
              {t("opened")} {formatDate(row.createdAt, locale)}
            </p>
          )}
          {row.arrivalDate ? (
            <p className="text-xs text-muted-foreground">
              {t("landed")} {formatDate(row.arrivalDate, locale)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "progress",
      header: t("Checked in"),
      cell: (row) => {
        if (STAGE_RANK[row.status] < 3) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const done = row.verified >= row.shipments;
        return (
          <div className="min-w-[100px]">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={done ? "text-success" : "text-muted-foreground"}>
                {done
                  ? t("Complete")
                  : `${row.shipments - row.verified} ${t("left")}`}
              </span>
              <span className="font-medium tabular">
                {row.verified}/{row.shipments}
              </span>
            </div>
            <Progress
              value={row.verified}
              max={Math.max(1, row.shipments)}
              tone={done ? "success" : "warning"}
              className="mt-1.5"
              label={`${row.batchNumber} ${t("check-in")}`}
            />
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/batches/${row.id}`}>{t("Open")}</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" title={t("Print manifest")}>
            <Link href={`/app/batches/${row.id}/manifest`}>
              <FileText className="h-4 w-4" />
              <span className="sr-only">
                {t("Manifest for")} {row.batchNumber}
              </span>
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  const filters: TableFilter<BatchRow>[] = [
    {
      id: "status",
      label: t("Stage"),
      options: Object.entries(BATCH_STATUS_META).map(([value, meta]) => ({
        value,
        label: t(meta.label),
      })),
      match: (row, value) => row.status === value,
    },
    {
      id: "origin",
      label: t("Departure airport"),
      options: [
        { value: "GUANGZHOU", label: t("Guangzhou") },
        { value: "HONG_KONG", label: t("Hong Kong") },
      ],
      match: (row, value) => row.origin === value,
    },
    {
      id: "live",
      label: t("Activity"),
      options: [
        { value: "live", label: t("Still moving") },
        { value: "done", label: t("Finished") },
      ],
      match: (row, value) =>
        value === "live"
          ? STAGE_RANK[row.status] < 4
          : STAGE_RANK[row.status] >= 4,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      searchValue={(row) =>
        [
          row.batchNumber,
          row.airline ?? "",
          row.flightNumber ?? "",
          row.waybillNumber ?? "",
        ].join(" ")
      }
      searchPlaceholder={t("Batch, airline, flight or waybill…")}
      filters={filters}
      pageSize={25}
      initialSort={{ columnId: "status", direction: "asc" }}
      emptyTitle={t("No batches yet")}
      emptyDescription={t("Open a batch to start grouping cargo for a flight.")}
      toolbar={
        canCreate ? (
          <Button asChild variant="signal" size="sm" className="h-11">
            <Link href="/app/batches/new">{t("Open batch")}</Link>
          </Button>
        ) : null
      }
      renderCard={(row) => (
        <Link
          href={`/app/batches/${row.id}`}
          className="panel focus-ring block p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="font-mono text-sm font-semibold tabular">
              {row.batchNumber}
            </span>
            <BatchStatusBadge status={row.status} />
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Plane className="h-3 w-3" />
            {t(AIRPORT_LABELS[row.origin])}
            {row.airline ? ` · ${row.airline} ${row.flightNumber ?? ""}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular">
            {row.shipments} {t("shipment(s)")} · {row.packages} {t("pkg")} ·{" "}
            {formatWeight(row.weightKg)}
          </p>
          {STAGE_RANK[row.status] >= 3 ? (
            <Progress
              value={row.verified}
              max={Math.max(1, row.shipments)}
              tone={row.verified >= row.shipments ? "success" : "warning"}
              className="mt-3"
              label={`${row.batchNumber} ${t("check-in")}`}
            />
          ) : null}
        </Link>
      )}
    />
  );
}
