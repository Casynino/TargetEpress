"use client";

import Link from "next/link";
import type { ReceiverRelationship } from "@prisma/client";
import { Camera, CameraOff } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { useLocale, useT } from "@/components/app/locale-provider";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatWeight } from "@/lib/format";
import { pickText, type Locale } from "@/lib/locale";

/**
 * Who collected it, in the words the release counter used.
 *
 * Same four options as the release form, phrased identically — a log that
 * renames what the operator picked is a log nobody trusts.
 */
const RELATIONSHIP_LABELS: Record<ReceiverRelationship, string> = {
  SELF: "The customer",
  AGENT: "Agent / transporter",
  EMPLOYEE: "Their employee",
  FAMILY: "Family member",
};

export type DeliveryHistoryRow = {
  id: string;
  releasedAt: string;
  trackingNumber: string;
  description: string;
  /** The renderings of `description`, so Dar never reads the Chinese original. */
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  packagesLabel: string;
  weightKg: number;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  batchNumber: string | null;
  receiverName: string;
  receiverPhone: string;
  receiverIdNumber: string | null;
  relationship: ReceiverRelationship;
  note: string | null;
  releasedByName: string | null;
  pickupNoteNumber: string;
  pickupNoteIssuedAt: string;
  photos: { id: string; url: string; caption: string | null }[];
};

/**
 * The Dar warehouse's own audit trail.
 *
 * Every row answers the question a claim starts with — "who took my cargo, and
 * who let them" — so the receiver, the staff member and the handover photo are
 * all on the row rather than a click away. Expanding a row shows the ID number
 * and the note, which is what gets read out when a customer disputes a pickup.
 */
/**
 * The cargo description as this reader should see it.
 *
 * Falls through to whatever the server sent when no rendering came with it, so
 * a handover line is never blank.
 */
function cargoDescription(locale: Locale, row: DeliveryHistoryRow) {
  return pickText(locale, row.description, {
    en: row.descriptionEn,
    zh: row.descriptionZh,
  });
}

export function DeliveryHistoryTable({ rows }: { rows: DeliveryHistoryRow[] }) {
  const t = useT();
  const locale = useLocale();
  const columns: Column<DeliveryHistoryRow>[] = [
    {
      id: "releasedAt",
      header: t("Handed over"),
      sortValue: (row) => new Date(row.releasedAt),
      cell: (row) => (
        <span className="text-sm tabular">{formatDateTime(row.releasedAt, locale)}</span>
      ),
    },
    {
      id: "trackingNumber",
      header: t("Cargo"),
      sortValue: (row) => row.trackingNumber,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/cargo/${row.trackingNumber}`}
            className="font-mono text-sm font-semibold tabular hover:text-brand"
          >
            {row.trackingNumber}
          </Link>
          <p className="max-w-[220px] truncate text-xs text-muted-foreground">
            {cargoDescription(locale, row)}
          </p>
        </div>
      ),
    },
    {
      id: "customer",
      header: t("Customer"),
      hideBelow: "lg",
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
            {row.customerPhone ?? t("No phone recorded")}
          </p>
        </div>
      ),
    },
    {
      id: "receiver",
      header: t("Collected by"),
      sortValue: (row) => row.receiverName,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.receiverName}</p>
          <p className="truncate text-xs text-muted-foreground tabular">
            {row.receiverPhone}
          </p>
          {row.relationship !== "SELF" ? (
            <Badge variant="warning" className="mt-1 text-[10px]">
              {t(RELATIONSHIP_LABELS[row.relationship])}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: "releasedBy",
      header: t("Released by"),
      hideBelow: "md",
      sortValue: (row) => row.releasedByName,
      cell: (row) => (
        <span className="text-sm">
          {row.releasedByName ?? (
            <span className="text-muted-foreground">{t("Account removed")}</span>
          )}
        </span>
      ),
    },
    {
      id: "proof",
      header: t("Proof"),
      align: "center",
      sortValue: (row) => row.photos.length,
      cell: (row) =>
        row.photos.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-success tabular">
            <Camera className="h-3.5 w-3.5" />
            {row.photos.length}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CameraOff className="h-3.5 w-3.5" />
            {t("none")}
          </span>
        ),
    },
    {
      id: "pickupNote",
      header: t("Pickup note"),
      hideBelow: "xl",
      sortValue: (row) => row.pickupNoteNumber,
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground tabular">
          {row.pickupNoteNumber}
        </span>
      ),
    },
  ];

  const filters: TableFilter<DeliveryHistoryRow>[] = [
    {
      id: "relationship",
      label: t("Collected by"),
      options: Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => ({
        value,
        label: t(label),
      })),
      match: (row, value) => row.relationship === value,
    },
    {
      id: "proof",
      label: t("Handover photo"),
      options: [
        { value: "with", label: t("Photo on file") },
        { value: "without", label: t("No photo") },
      ],
      match: (row, value) =>
        value === "with" ? row.photos.length > 0 : row.photos.length === 0,
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
          row.receiverName,
          row.receiverPhone,
          row.releasedByName ?? "",
          row.pickupNoteNumber,
        ].join(" ")
      }
      searchPlaceholder={t(
        "Tracking number, customer, receiver or pickup note…"
      )}
      filters={filters}
      initialSort={{ columnId: "releasedAt", direction: "desc" }}
      emptyTitle={t("No handovers match")}
      emptyDescription={t("Try a different search, or clear the filters.")}
      renderExpanded={(row) => <DeliveryDetail row={row} />}
      renderCard={(row) => (
        <div className="panel space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <Link
              href={`/app/cargo/${row.trackingNumber}`}
              className="font-mono text-sm font-semibold tabular hover:text-brand"
            >
              {row.trackingNumber}
            </Link>
            <span className="text-xs text-muted-foreground tabular">
              {formatDateTime(row.releasedAt, locale)}
            </span>
          </div>
          <p className="truncate text-sm">{row.customerName}</p>
          <p className="text-xs text-muted-foreground">
            {t("Collected by")} {row.receiverName} · {row.receiverPhone}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Released by")}{" "}
            {row.releasedByName ?? t("an account since removed")}
          </p>
          <DeliveryPhotos photos={row.photos} />
        </div>
      )}
    />
  );
}

function DeliveryDetail({ row }: { row: DeliveryHistoryRow }) {
  const t = useT();
  const locale = useLocale();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.minmax(0,1fr)]">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label={t("Cargo")}>
          {cargoDescription(locale, row)}
          <span className="mt-0.5 block text-xs text-muted-foreground tabular">
            {row.packagesLabel} · {formatWeight(row.weightKg)}
            {row.batchNumber ? ` · ${t("batch")} ${row.batchNumber}` : ""}
          </span>
        </Field>
        <Field label={t("Pickup note")}>
          <span className="font-mono tabular">{row.pickupNoteNumber}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground tabular">
            {t("Issued")} {formatDateTime(row.pickupNoteIssuedAt, locale)}
          </span>
        </Field>
        <Field label={t("Collected by")}>
          {row.receiverName}
          <span className="mt-0.5 block text-xs text-muted-foreground tabular">
            {row.receiverPhone} · {t(RELATIONSHIP_LABELS[row.relationship])}
          </span>
        </Field>
        <Field label={t("ID recorded")}>
          {row.receiverIdNumber ? (
            <span className="font-mono tabular">{row.receiverIdNumber}</span>
          ) : (
            <span className="text-muted-foreground">
              {row.relationship === "SELF"
                ? t("Not required")
                : t("None recorded")}
            </span>
          )}
        </Field>
        <Field label={t("Released by")}>
          {row.releasedByName ?? (
            <span className="text-muted-foreground">
              {t("Account since removed")}
            </span>
          )}
          <span className="mt-0.5 block text-xs text-muted-foreground tabular">
            {formatDateTime(row.releasedAt, locale)}
          </span>
        </Field>
        {row.note ? (
          <Field label={t("Counter note")}>
            <span className="text-muted-foreground">{row.note}</span>
          </Field>
        ) : null}
      </dl>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Handover photo")}
        </p>
        <DeliveryPhotos photos={row.photos} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function DeliveryPhotos({ photos }: { photos: DeliveryHistoryRow["photos"] }) {
  const t = useT();

  if (photos.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
        <CameraOff className="h-4 w-4 shrink-0" />
        {t(
          "No handover photo on record. Releases now require one; this predates that rule."
        )}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <li key={photo.id}>
          <a
            href={photo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring group block overflow-hidden rounded-lg border"
          >
            {/* Sizes vary and some are remote Blob URLs; a plain img avoids
                configuring a loader for every future host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.caption ?? t("Cargo being handed over")}
              className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]"
              loading="lazy"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
