"use client";

import Link from "next/link";
import type {
  ExceptionType,
  Origin,
  VerificationResult,
} from "@prisma/client";
import { AlertTriangle, Boxes, CheckCheck, ClipboardCheck } from "lucide-react";

import {
  DataTable,
  type Column,
  type TableFilter,
} from "@/components/app/data-table";
import { useT } from "@/components/app/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  EXCEPTION_TYPE_LABELS,
  ORIGIN_LABELS,
  formatPackagesShort,
} from "@/lib/constants";
import { formatDate, formatDateTime, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One line of the printed manifest, plus whatever the floor recorded for it. */
export type VerificationLine = {
  id: string;
  trackingNumber: string;
  customerName: string;
  packages: number;
  packageType: string;
  /** How many boxes this shipment actually has QR labels for. May be 0 on old cargo. */
  packagesTracked: number;
  packagesPresent: number;
  weightKg: number;
  /**
   * Already in the reader's language: the server parent resolves it with
   * `cargoText(locale, shipment, "description")` before handing it down, so a
   * Dar clerk never gets the Chinese original a Guangzhou packer typed.
   */
  description: string;
  result: VerificationResult | null;
  note: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
};

/** An exception raised while this batch was being checked in. */
export type VerificationFlag = {
  id: string;
  type: ExceptionType;
  open: boolean;
  description: string;
  trackingNumber: string;
  raisedBy: string | null;
  raisedAt: string;
};

export type VerificationBatchRow = {
  id: string;
  batchNumber: string;
  origin: Origin;
  airline: string | null;
  flightNumber: string | null;
  waybillNumber: string | null;
  arrivedAt: string | null;
  waitDays: number | null;
  shipments: number;
  /** Lines with a verification record — ticked off or flagged. */
  checked: number;
  passed: number;
  flagged: number;
  unchecked: number;
  packagesTracked: number;
  packagesPresent: number;
  weightKg: number;
  openFlags: number;
  checkers: { name: string; count: number }[];
  lines: VerificationLine[];
  flags: VerificationFlag[];
};

/** How long a batch may sit half-checked before it is a problem. */
const WAIT_WARNING_DAYS = 1;
const WAIT_CRITICAL_DAYS = 2;

function waitTone(waitDays: number | null) {
  if (waitDays === null) return "muted" as const;
  if (waitDays >= WAIT_CRITICAL_DAYS) return "destructive" as const;
  if (waitDays >= WAIT_WARNING_DAYS) return "warning" as const;
  return "muted" as const;
}

/** Not a component, so the reader's `t` is handed in rather than hooked. */
function checkerSummary(
  checkers: VerificationBatchRow["checkers"],
  t: (text: string) => string
) {
  if (checkers.length === 0) return t("Nobody yet");
  const shown = checkers.slice(0, 2).map((c) => c.name);
  const rest = checkers.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest}` : shown.join(", ");
}

/**
 * The verification bench.
 *
 * Everything that has landed and is not yet closed off, one row per batch. The
 * bench answers a different question from the receiving queue: not "what has
 * arrived" but "how far through the manifest are we, and who ticked what".
 *
 * Deliberately read-only. Ticking a line off is a statement that a human had
 * hands on the cargo, so the only button here opens the batch's own check-in
 * screen — a queue that could verify would be a queue that could verify by
 * accident.
 */
export function VerificationQueue({ rows }: { rows: VerificationBatchRow[] }) {
  const t = useT();

  const columns: Column<VerificationBatchRow>[] = [
    {
      id: "batchNumber",
      header: t("Batch"),
      sortValue: (row) => row.batchNumber,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/receive/${row.id}`}
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
      id: "landed",
      header: t("Landed"),
      hideBelow: "md",
      sortValue: (row) => (row.arrivedAt ? new Date(row.arrivedAt) : null),
      cell: (row) => (
        <div className="min-w-0 whitespace-nowrap text-sm">
          <p>{formatDate(row.arrivedAt)}</p>
          <p className="text-xs text-muted-foreground">
            {row.waitDays === null
              ? "—"
              : row.waitDays === 0
                ? t("today")
                : `${row.waitDays}d ${t("on the bench")}`}
          </p>
        </div>
      ),
    },
    {
      id: "flight",
      header: t("Flight"),
      hideBelow: "xl",
      defaultHidden: true,
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
      id: "cargo",
      header: t("Cargo"),
      align: "right",
      hideBelow: "lg",
      sortValue: (row) => row.shipments,
      cell: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-sm font-medium tabular">
            {row.shipments} {t("shpt")}
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {formatWeight(row.weightKg)}
          </p>
        </div>
      ),
    },
    {
      id: "progress",
      header: t("Checked off"),
      sortValue: (row) =>
        row.shipments === 0 ? 1 : row.checked / row.shipments,
      cell: (row) => {
        const done = row.unchecked === 0;
        return (
          <div className="min-w-[130px]">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={done ? "text-success" : "text-muted-foreground"}>
                {done
                  ? t("Ready to close off")
                  : `${row.unchecked} ${t("left")}`}
              </span>
              <span className="font-medium tabular">
                {row.checked}/{row.shipments}
              </span>
            </div>
            <Progress
              value={row.checked}
              max={Math.max(1, row.shipments)}
              tone={done ? "success" : "warning"}
              className="mt-1.5"
              label={`${row.batchNumber} ${t("verification progress")}`}
            />
          </div>
        );
      },
    },
    {
      id: "boxes",
      header: t("Boxes present"),
      align: "right",
      hideBelow: "xl",
      sortValue: (row) =>
        row.packagesTracked === 0
          ? -1
          : row.packagesPresent / row.packagesTracked,
      cell: (row) =>
        row.packagesTracked === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              "whitespace-nowrap text-sm tabular",
              row.packagesPresent < row.packagesTracked && "text-warning"
            )}
          >
            {row.packagesPresent}/{row.packagesTracked}
          </span>
        ),
    },
    {
      id: "checkers",
      header: t("Checked by"),
      hideBelow: "xl",
      sortValue: (row) => row.checkers[0]?.name ?? "",
      cell: (row) => (
        <span
          className={cn(
            "text-xs",
            row.checkers.length === 0 && "text-muted-foreground"
          )}
        >
          {checkerSummary(row.checkers, t)}
        </span>
      ),
    },
    {
      id: "flags",
      header: t("Flags"),
      align: "center",
      sortValue: (row) => row.openFlags,
      cell: (row) =>
        row.openFlags > 0 ? (
          <Link
            href="/app/exceptions"
            className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {row.openFlags}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "wait",
      header: t("Waiting"),
      align: "right",
      defaultHidden: true,
      sortValue: (row) => row.waitDays ?? -1,
      cell: (row) =>
        row.waitDays === null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Badge variant={waitTone(row.waitDays)}>{row.waitDays}d</Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button asChild size="sm" variant={row.unchecked === 0 ? "brand" : "signal"}>
          <Link href={`/app/receive/${row.id}`}>
            {row.unchecked === 0 ? t("Close off") : t("Check off")}
          </Link>
        </Button>
      ),
    },
  ];

  const filters: TableFilter<VerificationBatchRow>[] = [
    {
      id: "work",
      label: t("State"),
      options: [
        { value: "unchecked", label: t("Still being checked") },
        { value: "ready", label: t("Ready to close off") },
        { value: "untouched", label: t("Not started") },
        { value: "flagged", label: t("Has open flags") },
      ],
      match: (row, value) => {
        if (value === "unchecked") return row.unchecked > 0;
        if (value === "ready") return row.unchecked === 0;
        if (value === "untouched") return row.checked === 0;
        return row.openFlags > 0;
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
    {
      id: "age",
      label: t("On the bench"),
      options: [
        { value: "today", label: t("Landed today") },
        { value: "overdue", label: t("Two days or more") },
      ],
      match: (row, value) =>
        value === "today"
          ? row.waitDays === 0
          : (row.waitDays ?? 0) >= WAIT_CRITICAL_DAYS,
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
          ...row.lines.map(
            (line) => `${line.trackingNumber} ${line.customerName}`
          ),
        ].join(" ")
      }
      searchPlaceholder={t("Batch, flight, tracking number or customer…")}
      filters={filters}
      pageSize={15}
      emptyTitle={t("The bench is clear")}
      emptyDescription={t(
        "Nothing has landed that still needs checking against its manifest."
      )}
      renderExpanded={(row) => <BatchDetail row={row} />}
      renderCard={(row) => <BatchCard row={row} />}
    />
  );
}

/** The manifest check-off for one batch, line by line. */
function BatchDetail({ row }: { row: VerificationBatchRow }) {
  const t = useT();

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Manifest check-off")}
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {row.passed} {t("checked in")}
            {row.flagged > 0 ? ` · ${row.flagged} ${t("flagged")}` : ""}
            {row.unchecked > 0 ? ` · ${row.unchecked} ${t("untouched")}` : ""}
          </p>
        </div>

        <ul className="mt-2 divide-y rounded-lg border bg-card">
          {row.lines.map((line) => (
            <li
              key={line.id}
              className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/app/cargo/${line.trackingNumber}`}
                    className="font-mono text-xs font-semibold tabular hover:text-brand"
                  >
                    {line.trackingNumber}
                  </Link>
                  {line.result === "VERIFIED" ? (
                    <Badge variant="success">{t("Checked in")}</Badge>
                  ) : line.result === "EXCEPTION" ? (
                    <Badge variant="destructive">{t("Flagged")}</Badge>
                  ) : (
                    <Badge variant="muted">{t("Not checked")}</Badge>
                  )}
                  {/* Only meaningful once someone has looked: an unchecked
                      line has no boxes ticked simply because nobody has been
                      to it yet, which is not a shortage. */}
                  {line.result !== null &&
                  line.packagesTracked > 0 &&
                  line.packagesPresent < line.packagesTracked ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                      <Boxes className="h-3 w-3" />
                      {line.packagesPresent}/{line.packagesTracked}{" "}
                      {t("boxes here")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {line.customerName} ·{" "}
                  {formatPackagesShort(line.packages, line.packageType)} ·{" "}
                  {formatWeight(line.weightKg)} · {line.description}
                </p>
                {line.note ? (
                  <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                    {line.note}
                  </p>
                ) : null}
              </div>

              <div className="shrink-0 whitespace-nowrap text-right text-xs">
                {line.checkedBy ? (
                  <>
                    <p className="font-medium">{line.checkedBy}</p>
                    <p className="text-muted-foreground">
                      {formatDateTime(line.checkedAt)}
                    </p>
                  </>
                ) : (
                  <span className="text-muted-foreground">{t("Waiting")}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {row.flags.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Raised during check-in")}
          </p>
          <ul className="mt-2 space-y-2">
            {row.flags.map((flag) => (
              <li
                key={flag.id}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  flag.open ? "border-destructive/40 bg-destructive/5" : "bg-card"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={flag.open ? "destructive" : "muted"}>
                    {t(EXCEPTION_TYPE_LABELS[flag.type])}
                  </Badge>
                  <Link
                    href={`/app/cargo/${flag.trackingNumber}`}
                    className="font-mono text-xs tabular hover:text-brand"
                  >
                    {flag.trackingNumber}
                  </Link>
                  {flag.open ? null : (
                    <span className="text-xs text-success">
                      {t("Resolved")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs">{flag.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {flag.raisedBy ?? "—"} · {formatDateTime(flag.raisedAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={row.unchecked === 0 ? "brand" : "signal"}>
          <Link href={`/app/receive/${row.id}`}>
            {row.unchecked === 0 ? (
              <>
                <CheckCheck className="mr-1.5 h-4 w-4" />
                {t("Close off")} {row.batchNumber}
              </>
            ) : (
              <>
                <ClipboardCheck className="mr-1.5 h-4 w-4" />
                {t("Check off")} {row.unchecked} {t("remaining")}
              </>
            )}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/batches/${row.id}/manifest`}>{t("Manifest")}</Link>
        </Button>
      </div>
    </div>
  );
}

/** Phone layout. The table becomes this below `md`. */
function BatchCard({ row }: { row: VerificationBatchRow }) {
  const t = useT();
  const done = row.unchecked === 0;
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/app/receive/${row.id}`}
          className="font-mono text-sm font-semibold tabular hover:text-brand"
        >
          {row.batchNumber}
        </Link>
        <div className="flex items-center gap-2">
          {row.openFlags > 0 ? (
            <Badge variant="destructive">
              {row.openFlags} {t("flag(s)")}
            </Badge>
          ) : null}
          {row.waitDays === null ? null : (
            <Badge variant={waitTone(row.waitDays)}>{row.waitDays}d</Badge>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {t(ORIGIN_LABELS[row.origin])}
        {row.airline ? ` · ${row.airline} ${row.flightNumber ?? ""}` : ""} ·{" "}
        {t("landed")} {formatDate(row.arrivedAt)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground tabular">
        {row.shipments} {t("shipment(s)")} · {formatWeight(row.weightKg)}
        {row.packagesTracked > 0
          ? ` · ${row.packagesPresent}/${row.packagesTracked} ${t("boxes here")}`
          : ""}
      </p>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className={done ? "text-success" : "text-muted-foreground"}>
          {done
            ? t("Ready to close off")
            : `${row.unchecked} ${t("still to check")}`}
        </span>
        <span className="font-medium tabular">
          {row.checked}/{row.shipments}
        </span>
      </div>
      <Progress
        value={row.checked}
        max={Math.max(1, row.shipments)}
        tone={done ? "success" : "warning"}
        className="mt-1.5"
        label={`${row.batchNumber} ${t("verification progress")}`}
      />

      <p className="mt-2 text-xs text-muted-foreground">
        {t("Checked by")} {checkerSummary(row.checkers, t)}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button asChild size="sm" variant={done ? "brand" : "signal"}>
          <Link href={`/app/receive/${row.id}`}>
            {done ? t("Close off") : t("Check off cargo")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/batches/${row.id}/manifest`}>{t("Manifest")}</Link>
        </Button>
      </div>
    </div>
  );
}
