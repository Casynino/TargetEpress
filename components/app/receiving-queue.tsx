"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  Plane,
  Warehouse,
} from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { useLocale, useT } from "@/components/app/locale-provider";
import { ReceiveBatchButton } from "@/components/app/receive-batch-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BATCH_STATUS_META, ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";
import type { ReceivingRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** How long a batch may sit on the floor before it is a problem. */
const WAIT_WARNING_DAYS = 1;
const WAIT_CRITICAL_DAYS = 2;

const STATUS_RANK: Partial<Record<ReceivingRow["status"], number>> = {
  ARRIVED: 0,
  IN_TRANSIT: 1,
  VERIFIED: 2,
  CLOSED: 3,
};

function waitTone(row: ReceivingRow) {
  if (row.status !== "ARRIVED" || row.waitDays === null) return "muted" as const;
  if (row.waitDays >= WAIT_CRITICAL_DAYS) return "destructive" as const;
  if (row.waitDays >= WAIT_WARNING_DAYS) return "warning" as const;
  return "muted" as const;
}

/**
 * The Dar receiving queue.
 *
 * Built as a dense table rather than a card per batch: at ten or twenty batches
 * a week, the operator's question is "which one do I open next", and that is
 * answered by scanning a column, not by scrolling past hero cards. Every row is
 * one line high and carries its own progress and age.
 */
export function ReceivingQueue({ rows }: { rows: ReceivingRow[] }) {
  const t = useT();
  const locale = useLocale();
  const columns: Column<ReceivingRow>[] = [
    {
      id: "batchNumber",
      header: t("Batch"),
      sortValue: (row) => row.batchNumber,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={
              row.status === "ARRIVED"
                ? `/app/receive/${row.id}`
                : `/app/batches/${row.id}`
            }
            className="font-mono text-sm font-semibold tabular hover:text-brand"
          >
            {row.batchNumber}
          </Link>
          <p className="text-xs text-muted-foreground">
            {t(ORIGIN_LABELS[row.origin])}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: t("Where"),
      // Same ordering the server sorts by, so clicking the column and clicking
      // away land you back where you started.
      sortValue: (row) => STATUS_RANK[row.status] ?? 9,
      cell: (row) => (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
            row.status === "ARRIVED" && "bg-warning/10 text-warning",
            row.status === "IN_TRANSIT" && "bg-info/10 text-info",
            (row.status === "VERIFIED" || row.status === "CLOSED") &&
              "bg-success/10 text-success"
          )}
        >
          {row.status === "IN_TRANSIT" ? (
            <Plane className="h-3 w-3" />
          ) : row.status === "ARRIVED" ? (
            <Warehouse className="h-3 w-3" />
          ) : (
            <ClipboardCheck className="h-3 w-3" />
          )}
          {/*
            THE JOB WHERE THERE IS ONE, THE PLACE WHERE THERE IS NOT.

            "On the floor" is where the flight is, not what to do about it —
            and a landed flight with boxes still unticked is the one row on
            this page that is asking for something. It says so. Once every box
            is checked off it goes back to being a location, because then
            there is nothing to instruct.
          */}
          {row.status === "ARRIVED"
            ? row.unchecked > 0
              ? t("To check in")
              : t("On the floor")
            : row.status === "IN_TRANSIT"
              ? t("In the air")
              : t(BATCH_STATUS_META[row.status].label)}
        </span>
      ),
    },
    {
      id: "flight",
      header: t("Flight"),
      hideBelow: "lg",
      sortValue: (row) => `${row.airline ?? ""} ${row.flightNumber ?? ""}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">
            {row.airline ?? <span className="text-muted-foreground">—</span>}
          </p>
          <p className="font-mono text-xs text-muted-foreground tabular">
            {row.flightNumber ?? ""}
            {row.waybillNumber ? ` · ${row.waybillNumber}` : ""}
          </p>
        </div>
      ),
    },
    {
      id: "date",
      header: t("Departed / landed"),
      hideBelow: "md",
      sortValue: (row) =>
        row.arrivedAt
          ? new Date(row.arrivedAt)
          : row.departureDate
            ? new Date(row.departureDate)
            : null,
      cell: (row) => (
        <div className="min-w-0 text-sm">
          {row.arrivedAt ? (
            <>
              <p>{formatDate(row.arrivedAt, locale)}</p>
              <p className="text-xs text-muted-foreground">{t("landed")}</p>
            </>
          ) : row.departureDate ? (
            <>
              <p>{formatDate(row.departureDate, locale)}</p>
              <p className="text-xs text-muted-foreground">{t("departed")}</p>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      ),
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
            {/* The piece count came off the old Incoming Shipments page when
                the two were merged. It is the number the floor counts against,
                so it cannot be the thing that gets dropped. */}
            {row.packages} {t("pcs")} · {formatWeight(row.weightKg)}
          </p>
        </div>
      ),
    },
    {
      id: "progress",
      header: t("Checked in"),
      sortValue: (row) =>
        row.shipments === 0 ? 0 : row.verified / row.shipments,
      cell: (row) => {
        if (row.status === "IN_TRANSIT") {
          return (
            <span className="text-xs text-muted-foreground">
              {t("Not landed")}
            </span>
          );
        }
        const done = row.unchecked === 0;
        return (
          <div className="min-w-[110px]">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={done ? "text-success" : "text-muted-foreground"}>
                {done ? t("Complete") : `${row.unchecked} ${t("left")}`}
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
              label={`${row.batchNumber} ${t("check-in progress")}`}
            />
          </div>
        );
      },
    },
    {
      id: "boxes",
      header: t("Boxes present"),
      align: "right",
      hideBelow: "lg",
      sortValue: (row) => row.packages - row.packagesPresent,
      cell: (row) => (
        // Carried over from the verification list. "Shipments checked off" is
        // not the same question as "boxes on the floor" — a shipment can be
        // signed off while one of its five cartons is still missing, and the
        // counter is where that difference shows up.
        <span
          className={
            row.packagesPresent < row.packages
              ? "whitespace-nowrap text-sm tabular text-warning"
              : "whitespace-nowrap text-sm tabular text-muted-foreground"
          }
        >
          {row.packagesPresent}/{row.packages}
        </span>
      ),
    },
    {
      id: "checkedBy",
      header: t("Checked by"),
      hideBelow: "xl",
      sortValue: (row) => row.checkedBy[0] ?? "",
      cell: (row) =>
        row.checkedBy.length ? (
          <span className="truncate text-sm text-muted-foreground">
            {row.checkedBy.slice(0, 2).join(", ")}
            {row.checkedBy.length > 2 ? ` +${row.checkedBy.length - 2}` : ""}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{t("Nobody yet")}</span>
        ),
    },
    {
      id: "wait",
      header: t("Waiting"),
      align: "right",
      sortValue: (row) => (row.status === "ARRIVED" ? (row.waitDays ?? 0) : -1),
      cell: (row) => {
        if (row.status !== "ARRIVED" || row.waitDays === null) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const tone = waitTone(row);
        return (
          <Badge variant={tone === "muted" ? "muted" : tone}>
            {row.waitDays}
            {t("d")}
          </Badge>
        );
      },
    },
    {
      id: "exceptions",
      header: t("Flags"),
      align: "center",
      defaultHidden: true,
      sortValue: (row) => row.exceptions,
      cell: (row) =>
        row.exceptions > 0 ? (
          <Link
            href="/app/exceptions"
            className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {row.exceptions}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {row.status === "IN_TRANSIT" ? (
            <ReceiveBatchButton batchId={row.id} />
          ) : null}
          {row.status === "ARRIVED" ? (
            <Button asChild size="sm" variant="signal">
              <Link href={`/app/receive/${row.id}`}>
                {row.unchecked > 0 ? t("Check in") : t("Finish")}
              </Link>
            </Button>
          ) : null}
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

  const filters: TableFilter<ReceivingRow>[] = [
    {
      id: "status",
      label: t("Where"),
      options: [
        { value: "ARRIVED", label: t("On the floor") },
        { value: "IN_TRANSIT", label: t("In the air") },
        { value: "VERIFIED", label: t("Checked in") },
        { value: "CLOSED", label: t("Closed") },
      ],
      match: (row, value) => row.status === value,
    },
    {
      id: "work",
      label: t("Work outstanding"),
      options: [
        { value: "unchecked", label: t("Still to check in") },
        { value: "done", label: t("Nothing left") },
        { value: "flagged", label: t("Has exceptions") },
      ],
      match: (row, value) => {
        if (value === "unchecked") return row.status === "ARRIVED" && row.unchecked > 0;
        if (value === "flagged") return row.exceptions > 0;
        return row.unchecked === 0;
      },
    },
    {
      id: "origin",
      label: t("Origin"),
      options: Object.entries(ORIGIN_LABELS).map(([value, label]) => ({
        value,
        label: t(label),
      })),
      match: (row, value) => row.origin === value,
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
      pageSize={20}
      emptyTitle={t("Nothing inbound")}
      emptyDescription={t(
        "No batches are in the air or waiting to be checked in."
      )}
      renderCard={(row) => (
        <div className="panel p-4">
          <div className="flex items-start justify-between gap-3">
            <Link
              href={
                row.status === "ARRIVED"
                  ? `/app/receive/${row.id}`
                  : `/app/batches/${row.id}`
              }
              className="font-mono text-sm font-semibold tabular hover:text-brand"
            >
              {row.batchNumber}
            </Link>
            <div className="flex items-center gap-2">
              {row.status === "ARRIVED" && row.waitDays !== null ? (
                <Badge variant={waitTone(row) === "muted" ? "muted" : waitTone(row)}>
                  {row.waitDays}
                  {t("d")}
                </Badge>
              ) : null}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  row.status === "ARRIVED" && "bg-warning/10 text-warning",
                  row.status === "IN_TRANSIT" && "bg-info/10 text-info",
                  (row.status === "VERIFIED" || row.status === "CLOSED") &&
                    "bg-success/10 text-success"
                )}
              >
                {row.status === "ARRIVED"
                  ? t("On the floor")
                  : row.status === "IN_TRANSIT"
                    ? t("In the air")
                    : t("Checked in")}
              </span>
            </div>
          </div>

          <p className="mt-1.5 text-xs text-muted-foreground">
            {t(ORIGIN_LABELS[row.origin])}
            {row.airline ? ` · ${row.airline} ${row.flightNumber ?? ""}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular">
            {row.shipments} {t("cargo")} · {formatWeight(row.weightKg)}
            {row.arrivedAt
              ? ` · ${t("landed")} ${formatDate(row.arrivedAt, locale)}`
              : row.departureDate
                ? ` · ${t("departed")} ${formatDate(row.departureDate, locale)}`
                : ""}
          </p>

          {row.status !== "IN_TRANSIT" ? (
            <>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("Checked in")}</span>
                <span className="font-medium tabular">
                  {row.verified}/{row.shipments}
                </span>
              </div>
              <Progress
                value={row.verified}
                max={Math.max(1, row.shipments)}
                tone={row.unchecked === 0 ? "success" : "warning"}
                className="mt-1.5"
                label={`${row.batchNumber} ${t("check-in progress")}`}
              />
            </>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            {row.status === "IN_TRANSIT" ? (
              <ReceiveBatchButton batchId={row.id} />
            ) : null}
            {row.status === "ARRIVED" ? (
              <Button asChild size="sm" variant="signal">
                <Link href={`/app/receive/${row.id}`}>
                  {row.unchecked > 0
                    ? t("Check in cargo")
                    : t("Finish check-in")}
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/batches/${row.id}/manifest`}>
                {t("Manifest")}
              </Link>
            </Button>
          </div>
        </div>
      )}
    />
  );
}
