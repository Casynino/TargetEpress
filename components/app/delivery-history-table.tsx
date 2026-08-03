"use client";

import Link from "next/link";
import type { ReceiverRelationship } from "@prisma/client";
import { Camera, CameraOff } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatWeight } from "@/lib/format";

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
export function DeliveryHistoryTable({ rows }: { rows: DeliveryHistoryRow[] }) {
  const columns: Column<DeliveryHistoryRow>[] = [
    {
      id: "releasedAt",
      header: "Handed over",
      sortValue: (row) => new Date(row.releasedAt),
      cell: (row) => (
        <span className="text-sm tabular">{formatDateTime(row.releasedAt)}</span>
      ),
    },
    {
      id: "trackingNumber",
      header: "Cargo",
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
            {row.description}
          </p>
        </div>
      ),
    },
    {
      id: "customer",
      header: "Customer",
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
            {row.customerPhone ?? "No phone recorded"}
          </p>
        </div>
      ),
    },
    {
      id: "receiver",
      header: "Collected by",
      sortValue: (row) => row.receiverName,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.receiverName}</p>
          <p className="truncate text-xs text-muted-foreground tabular">
            {row.receiverPhone}
          </p>
          {row.relationship !== "SELF" ? (
            <Badge variant="warning" className="mt-1 text-[10px]">
              {RELATIONSHIP_LABELS[row.relationship]}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: "releasedBy",
      header: "Released by",
      hideBelow: "md",
      sortValue: (row) => row.releasedByName,
      cell: (row) => (
        <span className="text-sm">
          {row.releasedByName ?? (
            <span className="text-muted-foreground">Account removed</span>
          )}
        </span>
      ),
    },
    {
      id: "proof",
      header: "Proof",
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
            none
          </span>
        ),
    },
    {
      id: "pickupNote",
      header: "Pickup note",
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
      label: "Collected by",
      options: Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      match: (row, value) => row.relationship === value,
    },
    {
      id: "proof",
      label: "Handover photo",
      options: [
        { value: "with", label: "Photo on file" },
        { value: "without", label: "No photo" },
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
      searchPlaceholder="Tracking number, customer, receiver or pickup note…"
      filters={filters}
      initialSort={{ columnId: "releasedAt", direction: "desc" }}
      emptyTitle="No handovers match"
      emptyDescription="Try a different search, or clear the filters."
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
              {formatDateTime(row.releasedAt)}
            </span>
          </div>
          <p className="truncate text-sm">{row.customerName}</p>
          <p className="text-xs text-muted-foreground">
            Collected by {row.receiverName} · {row.receiverPhone}
          </p>
          <p className="text-xs text-muted-foreground">
            Released by {row.releasedByName ?? "an account since removed"}
          </p>
          <DeliveryPhotos photos={row.photos} />
        </div>
      )}
    />
  );
}

function DeliveryDetail({ row }: { row: DeliveryHistoryRow }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Cargo">
          {row.description}
          <span className="mt-0.5 block text-xs text-muted-foreground tabular">
            {row.packagesLabel} · {formatWeight(row.weightKg)}
            {row.batchNumber ? ` · batch ${row.batchNumber}` : ""}
          </span>
        </Field>
        <Field label="Pickup note">
          <span className="font-mono tabular">{row.pickupNoteNumber}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground tabular">
            Issued {formatDateTime(row.pickupNoteIssuedAt)}
          </span>
        </Field>
        <Field label="Collected by">
          {row.receiverName}
          <span className="mt-0.5 block text-xs text-muted-foreground tabular">
            {row.receiverPhone} · {RELATIONSHIP_LABELS[row.relationship]}
          </span>
        </Field>
        <Field label="ID recorded">
          {row.receiverIdNumber ? (
            <span className="font-mono tabular">{row.receiverIdNumber}</span>
          ) : (
            <span className="text-muted-foreground">
              {row.relationship === "SELF" ? "Not required" : "None recorded"}
            </span>
          )}
        </Field>
        <Field label="Released by">
          {row.releasedByName ?? (
            <span className="text-muted-foreground">Account since removed</span>
          )}
          <span className="mt-0.5 block text-xs text-muted-foreground tabular">
            {formatDateTime(row.releasedAt)}
          </span>
        </Field>
        {row.note ? (
          <Field label="Counter note">
            <span className="text-muted-foreground">{row.note}</span>
          </Field>
        ) : null}
      </dl>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Handover photo
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
  if (photos.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
        <CameraOff className="h-4 w-4 shrink-0" />
        No handover photo on record. Releases now require one; this predates that
        rule.
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
              alt={photo.caption ?? "Cargo being handed over"}
              className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]"
              loading="lazy"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
