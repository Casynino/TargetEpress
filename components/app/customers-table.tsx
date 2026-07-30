"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";

export type CustomerRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  city: string | null;
  shipments: number;
  activeShipments: number;
  /** Undefined for roles that may not see money. */
  outstanding?: number;
  createdAt: string;
  lastShipmentAt: string | null;
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/**
 * The customer book.
 *
 * `outstanding` arrives undefined for roles without finance.view — the column
 * and its filter are built from that, so a warehouse account is never sent the
 * numbers in the first place rather than having them hidden in the markup.
 */
export function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  const showMoney = rows.some((row) => row.outstanding !== undefined);

  const columns: Column<CustomerRow>[] = [
    {
      id: "name",
      header: "Customer",
      sortValue: (row) => row.name,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/customers/${row.id}`}
            className="font-medium hover:text-brand hover:underline"
          >
            {row.name}
          </Link>
          <div className="font-mono text-[11px] text-muted-foreground">{row.code}</div>
        </div>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      sortValue: (row) => row.phone ?? "",
      className: "font-mono text-xs",
      cell: (row) =>
        row.phone ? (
          <a href={`tel:${row.phone}`} className="hover:text-brand">
            {row.phone}
          </a>
        ) : (
          <span className="font-sans text-xs text-muted-foreground">
            none recorded
          </span>
        ),
    },
    {
      id: "city",
      header: "City",
      hideBelow: "lg",
      sortValue: (row) => row.city ?? "",
      className: "text-muted-foreground",
      cell: (row) => row.city ?? "—",
    },
    {
      id: "shipments",
      header: "Shipments",
      align: "right",
      sortValue: (row) => row.shipments,
      className: "tabular-nums",
      cell: (row) => (
        <div>
          <span className="font-medium">{row.shipments}</span>
          {row.activeShipments > 0 ? (
            <div className="text-[11px] text-info">{row.activeShipments} active</div>
          ) : null}
        </div>
      ),
    },
    ...(showMoney
      ? [
          {
            id: "outstanding",
            header: "Owed",
            align: "right" as const,
            sortValue: (row: CustomerRow) => row.outstanding ?? 0,
            className: "font-mono tabular-nums",
            cell: (row: CustomerRow) =>
              (row.outstanding ?? 0) > 0 ? (
                <span className="text-destructive">
                  USD {(row.outstanding ?? 0).toFixed(2)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
        ]
      : []),
    {
      id: "last",
      header: "Last shipment",
      hideBelow: "xl",
      sortValue: (row) => (row.lastShipmentAt ? new Date(row.lastShipmentAt) : null),
      className: "text-xs text-muted-foreground",
      cell: (row) => (row.lastShipmentAt ? day(row.lastShipmentAt) : "never"),
    },
    {
      id: "since",
      header: "Customer since",
      hideBelow: "xl",
      defaultHidden: true,
      sortValue: (row) => new Date(row.createdAt),
      className: "text-xs text-muted-foreground",
      cell: (row) => day(row.createdAt),
    },
    {
      id: "reach",
      header: "",
      align: "right",
      cell: (row) =>
        row.phone ? (
          <a
            href={`https://wa.me/${row.phone.replace(/[^\d]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${row.name}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        ) : null,
    },
  ];

  const filters: TableFilter<CustomerRow>[] = [
    {
      id: "activity",
      label: "Activity",
      options: [
        { value: "active", label: "Has cargo in flight" },
        { value: "dormant", label: "Nothing active" },
        { value: "new", label: "Never shipped" },
      ],
      match: (row, value) =>
        value === "active"
          ? row.activeShipments > 0
          : value === "new"
            ? row.shipments === 0
            : row.activeShipments === 0 && row.shipments > 0,
    },
    {
      id: "contact",
      label: "Contact details",
      options: [
        { value: "phone", label: "Has a phone number" },
        { value: "nophone", label: "No phone on file" },
      ],
      match: (row, value) =>
        value === "phone" ? row.phone !== null : row.phone === null,
    },
    ...(showMoney
      ? [
          {
            id: "balance",
            label: "Balance",
            options: [
              { value: "owing", label: "Owes money" },
              { value: "clear", label: "Nothing owed" },
            ],
            match: (row: CustomerRow, value: string) =>
              value === "owing" ? (row.outstanding ?? 0) > 0 : (row.outstanding ?? 0) === 0,
          },
        ]
      : []),
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      filters={filters}
      searchValue={(row) =>
        [row.name, row.code, row.phone ?? "", row.city ?? ""].join(" ").toLowerCase()
      }
      searchPlaceholder="Name, customer ID, phone or city"
      initialSort={{ columnId: "shipments", direction: "desc" }}
      emptyTitle="No customers match"
      emptyDescription="Try a shorter piece of the name or number."
      renderCard={(row) => (
        <Link
          href={`/app/customers/${row.id}`}
          className="block rounded-xl border bg-card p-4 shadow-soft"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{row.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{row.code}</p>
              <p className="mt-1 font-mono text-xs">{row.phone ?? "no phone"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium tabular-nums">{row.shipments}</p>
              <p className="text-[11px] text-muted-foreground">shipments</p>
            </div>
          </div>
          {(row.outstanding ?? 0) > 0 ? (
            <p className="mt-3 border-t pt-3 font-mono text-sm text-destructive">
              USD {(row.outstanding ?? 0).toFixed(2)} owed
            </p>
          ) : null}
        </Link>
      )}
    />
  );
}
