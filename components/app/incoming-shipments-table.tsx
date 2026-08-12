"use client";

import Link from "next/link";
import { ChevronRight, ImageOff, Lock, Plane, Warehouse } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { useT } from "@/components/app/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One line of a dispatch's manifest, exactly as China registered it.
 *
 * Pre-formatted on the server: no Decimal and no Date crosses the client
 * boundary, so the table never has to know about Prisma.
 */
export type IncomingLine = {
  id: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string | null;
  /**
   * Already in the reader's language: the server parent resolves it with
   * `cargoText(locale, shipment, "description")` before handing it down, so a
   * Dar clerk never gets the Chinese original a Guangzhou packer typed.
   */
  description: string;
  packagesLabel: string;
  weightLabel: string;
  cartonRef: string | null;
  /** Photos taken in China at registration. Never the Dar arrival photos. */
  photos: { id: string; url: string; caption: string | null }[];
};

export type IncomingRow = {
  id: string;
  /** The dispatch's own number, e.g. GZ-SHIP-2026-001. */
  shipmentNumber: string;
  /**
   * The loading table this cargo was built on, in the words the floor uses:
   * "Guangzhou Batch" / "Hong Kong Batch". A dispatch and its batch are one
   * record in the database, so the batch is named by its origin rather than
   * printing the same code in two columns.
   */
  batchLabel: string;
  origin: keyof typeof ORIGIN_LABELS;
  route: string;
  status: "IN_TRANSIT" | "ARRIVED";
  airline: string | null;
  flightNumber: string | null;
  waybillNumber: string | null;
  cargoCount: number;
  customerCount: number;
  packages: number;
  weightKg: number;
  photoCount: number;
  departedLabel: string;
  expectedLabel: string;
  arrivedLabel: string;
  /** "3 days in the air" / "2 days on the floor". Empty when unknown. */
  ageLabel: string;
  /** Epoch ms of the departure. Drives the default newest-first order. */
  sortAt: number;
  /**
   * Epoch ms of the landing — actual once it is down, expected before that.
   * Sorting on the formatted label would order "01 Aug" before "28 Jul", so
   * the column sorts on this and renders the label.
   */
  landsAt: number | null;
  lines: IncomingLine[];
};

const STATUS_LABEL: Record<IncomingRow["status"], string> = {
  IN_TRANSIT: "In the air",
  ARRIVED: "Landed — not checked in",
};

const STATUS_TONE: Record<IncomingRow["status"], "info" | "warning"> = {
  IN_TRANSIT: "info",
  ARRIVED: "warning",
};

/** Landed cargo is the work; cargo still flying is only news. */
const STATUS_RANK: Record<IncomingRow["status"], number> = {
  ARRIVED: 0,
  IN_TRANSIT: 1,
};

/** How many thumbnails fit on a manifest line before the rest become a count. */
const THUMBS = 4;

function PhotoStrip({ line }: { line: IncomingLine }) {
  const t = useT();

  if (line.photos.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ImageOff className="h-3.5 w-3.5" />
        {t("No China photo")}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {line.photos.slice(0, THUMBS).map((photo) => (
        <a
          key={photo.id}
          href={photo.url}
          target="_blank"
          rel="noopener noreferrer"
          title={
            photo.caption ??
            `${t("China photo for")} ${line.trackingNumber}`
          }
          className="focus-ring group block h-12 w-12 shrink-0 overflow-hidden rounded-md border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={
              photo.caption ??
              `${t("China photo for")} ${line.trackingNumber}`
            }
            className="h-full w-full object-cover transition-transform group-hover:scale-110"
            loading="lazy"
          />
        </a>
      ))}
      {line.photos.length > THUMBS ? (
        <span className="text-xs text-muted-foreground tabular">
          +{line.photos.length - THUMBS}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The Dar arrivals board.
 *
 * Every dispatch that has left China and has not been checked in yet, newest
 * departure first. Strictly read-only: this page is where the warehouse learns
 * what is coming, not where anything about it is changed. The manifest China
 * registered — customers, tracking numbers, packages, weight, photos — is the
 * thing being checked against, so nothing here offers to edit it. A count or
 * weight that disagrees with the box on the floor is raised as an exception
 * during check-in, which records the disagreement instead of overwriting the
 * manifest that proves it.
 *
 * Rows are dispatches rather than individual boxes because that is the unit
 * that lands: the operator's question is "which flight do I open next", and the
 * per-customer detail is one click away in the expanded manifest.
 */
export function IncomingShipmentsTable({ rows }: { rows: IncomingRow[] }) {
  const t = useT();

  const columns: Column<IncomingRow>[] = [
    {
      id: "shipment",
      header: t("Shipment"),
      sortValue: (row) => row.shipmentNumber,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/shipments/${row.id}`}
            className="font-mono text-sm font-semibold tabular hover:text-brand"
          >
            {row.shipmentNumber}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{row.route}</p>
        </div>
      ),
    },
    {
      id: "batch",
      header: t("Batch"),
      hideBelow: "lg",
      sortValue: (row) => row.batchLabel,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.batchLabel}</p>
          <p className="truncate font-mono text-xs text-muted-foreground tabular">
            {row.waybillNumber ? `AWB ${row.waybillNumber}` : t("No waybill")}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: t("Where"),
      sortValue: (row) => STATUS_RANK[row.status],
      cell: (row) => (
        <div className="min-w-0">
          <Badge variant={STATUS_TONE[row.status]}>
            {t(STATUS_LABEL[row.status])}
          </Badge>
          {row.ageLabel ? (
            <p className="mt-1 text-xs text-muted-foreground tabular">
              {row.ageLabel}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "flight",
      header: t("Flight"),
      hideBelow: "xl",
      sortValue: (row) => row.airline ?? "",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {[row.airline, row.flightNumber].filter(Boolean).join(" ") || "—"}
        </span>
      ),
    },
    {
      id: "cargo",
      header: t("Cargo"),
      align: "right",
      sortValue: (row) => row.cargoCount,
      cell: (row) => (
        <div>
          <p className="text-sm font-medium tabular">{row.cargoCount}</p>
          <p className="text-xs text-muted-foreground tabular">
            {row.customerCount}{" "}
            {t(row.customerCount === 1 ? "customer" : "customers")}
          </p>
        </div>
      ),
    },
    {
      id: "packages",
      header: t("Packages"),
      align: "right",
      hideBelow: "md",
      sortValue: (row) => row.packages,
      cell: (row) => <span className="font-mono text-sm tabular">{row.packages}</span>,
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
      id: "photos",
      header: t("China photos"),
      align: "right",
      hideBelow: "xl",
      sortValue: (row) => row.photoCount,
      cell: (row) =>
        row.photoCount === 0 ? (
          <span className="text-xs text-muted-foreground">{t("None")}</span>
        ) : (
          <span className="font-mono text-sm tabular">{row.photoCount}</span>
        ),
    },
    {
      id: "departed",
      header: t("Departed"),
      hideBelow: "md",
      sortValue: (row) => row.sortAt,
      cell: (row) => (
        <span className="text-sm text-muted-foreground tabular">
          {row.departedLabel}
        </span>
      ),
    },
    {
      id: "lands",
      header: t("Lands"),
      sortValue: (row) => row.landsAt,
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm tabular">
            {row.status === "ARRIVED" ? row.arrivedLabel : row.expectedLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.status === "ARRIVED" ? t("Arrived") : t("Expected")}
          </p>
        </div>
      ),
    },
  ];

  const filters: TableFilter<IncomingRow>[] = [
    {
      id: "status",
      label: t("Where it is"),
      options: [
        { value: "IN_TRANSIT", label: t(STATUS_LABEL.IN_TRANSIT) },
        { value: "ARRIVED", label: t(STATUS_LABEL.ARRIVED) },
      ],
      match: (row, value) => row.status === value,
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
      id: "photos",
      label: t("China photos"),
      options: [
        { value: "some", label: t("Has photos") },
        { value: "none", label: t("No photos") },
      ],
      match: (row, value) =>
        value === "none" ? row.photoCount === 0 : row.photoCount > 0,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      // Searching reaches into the manifest, so "which flight is Amina's box
      // on" is answerable from this page without opening every dispatch.
      searchValue={(row) =>
        [
          row.shipmentNumber,
          row.batchLabel,
          row.waybillNumber ?? "",
          row.airline ?? "",
          row.flightNumber ?? "",
          row.route,
          ...row.lines.map((line) =>
            [line.trackingNumber, line.customerName, line.customerPhone ?? ""].join(" ")
          ),
        ].join(" ")
      }
      searchPlaceholder={t(
        "Shipment, waybill, flight, tracking number or customer…"
      )}
      filters={filters}
      initialSort={{ columnId: "departed", direction: "desc" }}
      emptyTitle={t("Nothing inbound")}
      emptyDescription={t(
        "No dispatch is in the air or waiting to be checked in."
      )}
      renderExpanded={(row) => (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              {t("Manifest as registered in China")} · {row.cargoCount}{" "}
              {t(row.cargoCount === 1 ? "piece" : "pieces")}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/shipments/${row.id}`}>
                {t("Open shipment")}
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <ul className="space-y-2">
            {row.lines.map((line) => (
              <li
                key={line.id}
                className="panel-inset flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/app/cargo/${line.trackingNumber}`}
                      className="font-mono text-sm font-semibold tabular hover:text-brand"
                    >
                      {line.trackingNumber}
                    </Link>
                    {line.cartonRef ? (
                      <span className="rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {line.cartonRef}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm">{line.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground tabular">
                    {line.customerPhone ?? t("No phone recorded")}
                  </p>
                  <p className="max-w-[36rem] truncate text-xs text-muted-foreground">
                    {line.description}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  <p className="font-mono text-xs text-muted-foreground tabular">
                    {line.packagesLabel} · {line.weightLabel}
                  </p>
                  <PhotoStrip line={line} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      renderCard={(row) => (
        <Link
          href={`/app/shipments/${row.id}`}
          className="panel focus-ring block p-4 transition-shadow active:shadow-lift"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="font-mono text-sm font-semibold tabular">
              {row.shipmentNumber}
            </span>
            <Badge variant={STATUS_TONE[row.status]}>
              {t(STATUS_LABEL[row.status])}
            </Badge>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            {row.status === "ARRIVED" ? (
              <Warehouse className="h-3.5 w-3.5" />
            ) : (
              <Plane className="h-3.5 w-3.5" />
            )}
            {row.route}
          </p>
          <p className="mt-2 text-xs text-muted-foreground tabular">
            {row.cargoCount} {t(row.cargoCount === 1 ? "piece" : "pieces")} ·{" "}
            {row.packages} {t("pkg")} · {formatWeight(row.weightKg)}
          </p>
          <p
            className={cn(
              "mt-2 text-xs tabular",
              row.status === "ARRIVED" ? "text-warning" : "text-muted-foreground"
            )}
          >
            {row.status === "ARRIVED"
              ? `${t("Arrived")} ${row.arrivedLabel}`
              : `${t("Expected")} ${row.expectedLabel}`}
            {row.ageLabel ? ` · ${row.ageLabel}` : ""}
          </p>
        </Link>
      )}
    />
  );
}
