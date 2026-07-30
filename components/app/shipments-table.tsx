"use client";

import Link from "next/link";
import { Printer, QrCode } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { GOODS_TYPE_LABELS, ORIGIN_LABELS, SHIPMENT_STATUS_META } from "@/lib/constants";
import { formatDate, formatMoney, formatWeight } from "@/lib/format";

/**
 * Row shape is deliberately flat and pre-formatted on the server: Decimals and
 * Dates do not cross the client boundary, and the table never has to know about
 * Prisma.
 */
export type ShipmentRow = {
  id: string;
  trackingNumber: string;
  status: keyof typeof SHIPMENT_STATUS_META;
  customerName: string;
  customerPhone: string | null;
  description: string;
  goodsType: keyof typeof GOODS_TYPE_LABELS;
  origin: keyof typeof ORIGIN_LABELS;
  packages: number;
  weightKg: number;
  batchNumber: string | null;
  registeredAt: string;
  /** Absent entirely for roles that may not see prices. */
  outstanding?: number | null;
  currency: string;
};

export function ShipmentsTable({
  rows,
  canCreate,
  showMoney,
}: {
  rows: ShipmentRow[];
  canCreate: boolean;
  showMoney: boolean;
}) {
  const { toast } = useToast();

  const columns: Column<ShipmentRow>[] = [
    {
      id: "trackingNumber",
      header: "Tracking",
      sortValue: (row) => row.trackingNumber,
      cell: (row) => (
        <Link
          href={`/app/shipments/${row.trackingNumber}`}
          className="font-mono text-sm font-medium tabular hover:text-brand"
        >
          {row.trackingNumber}
        </Link>
      ),
    },
    {
      id: "customer",
      header: "Customer",
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
      id: "cargo",
      header: "Cargo",
      hideBelow: "lg",
      sortValue: (row) => row.description,
      cell: (row) => (
        <div className="min-w-0">
          <p className="max-w-[220px] truncate text-sm">{row.description}</p>
          <p className="text-xs text-muted-foreground tabular">
            {row.packages} pkg · {formatWeight(row.weightKg)}
          </p>
        </div>
      ),
    },
    {
      id: "weight",
      header: "Weight",
      align: "right",
      defaultHidden: true,
      sortValue: (row) => row.weightKg,
      cell: (row) => (
        <span className="font-mono text-sm tabular">{formatWeight(row.weightKg)}</span>
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
    {
      id: "status",
      header: "Status",
      sortValue: (row) => Object.keys(SHIPMENT_STATUS_META).indexOf(row.status),
      cell: (row) => <ShipmentStatusBadge status={row.status} />,
    },
    ...(showMoney
      ? [{
      id: "outstanding",
      header: "Owed",
      align: "right",
      hideBelow: "xl",
      sortValue: (row) => row.outstanding ?? -1,
      cell: (row) =>
        row.outstanding === null || row.outstanding === undefined ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : row.outstanding <= 0 ? (
          <span className="text-xs font-medium text-success">Settled</span>
        ) : (
          <span className="font-mono text-sm font-medium tabular text-warning">
            {formatMoney(row.outstanding, row.currency)}
          </span>
        ),
    }] satisfies Column<ShipmentRow>[]
      : []),
    {
      id: "registeredAt",
      header: "Registered",
      hideBelow: "lg",
      sortValue: (row) => new Date(row.registeredAt),
      cell: (row) => (
        <span className="text-sm text-muted-foreground tabular">
          {formatDate(row.registeredAt)}
        </span>
      ),
    },
  ];

  const filters: TableFilter<ShipmentRow>[] = [
    {
      id: "status",
      label: "Status",
      options: Object.entries(SHIPMENT_STATUS_META).map(([value, meta]) => ({
        value,
        label: meta.label,
      })),
      match: (row, value) => row.status === value,
    },
    {
      id: "origin",
      label: "Origin",
      options: Object.entries(ORIGIN_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      match: (row, value) => row.origin === value,
    },
    {
      id: "goodsType",
      label: "Goods type",
      options: Object.entries(GOODS_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      match: (row, value) => row.goodsType === value,
    },
    ...(showMoney
      ? [{
      id: "payment",
      label: "Payment",
      options: [
        { value: "owing", label: "Money outstanding" },
        { value: "settled", label: "Settled" },
        { value: "uninvoiced", label: "Not invoiced" },
      ],
      match: (row, value) => {
        const owed = row.outstanding;
        if (value === "uninvoiced") return owed === null || owed === undefined;
        if (value === "settled") return typeof owed === "number" && owed <= 0;
        return typeof owed === "number" && owed > 0;
      },
    }] satisfies TableFilter<ShipmentRow>[]
      : []),
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
      searchPlaceholder="Tracking number, customer, phone or batch…"
      filters={filters}
      initialSort={{ columnId: "registeredAt", direction: "desc" }}
      emptyTitle="No shipments match"
      emptyDescription="Try a different search, or clear the filters."
      toolbar={
        canCreate ? (
          <Button asChild variant="signal" size="sm" className="h-10">
            <Link href="/app/shipments/new">Register cargo</Link>
          </Button>
        ) : null
      }
      bulkActions={(selected, clear) => (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              // Copying tracking numbers is the single most common bulk need —
              // staff paste them into WhatsApp to update a customer.
              navigator.clipboard
                .writeText(selected.map((r) => r.trackingNumber).join("\n"))
                .then(() =>
                  toast({
                    tone: "success",
                    title: `${selected.length} tracking number(s) copied`,
                    description: "Paste them wherever you need them.",
                  })
                )
                .catch(() =>
                  toast({
                    tone: "error",
                    title: "Could not copy",
                    description: "Your browser blocked clipboard access.",
                  })
                );
              clear();
            }}
          >
            <QrCode className="mr-2 h-4 w-4" />
            Copy numbers
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/app/shipments/${selected[0]?.trackingNumber}/label`}
              target="_blank"
            >
              <Printer className="mr-2 h-4 w-4" />
              Print first label
            </Link>
          </Button>
        </>
      )}
      renderExpanded={(row) => (
        <dl className="grid gap-4 sm:grid-cols-4">
          {[
            { label: "Goods type", value: GOODS_TYPE_LABELS[row.goodsType] },
            { label: "Origin", value: ORIGIN_LABELS[row.origin] },
            { label: "Packages", value: String(row.packages) },
            { label: "Weight", value: formatWeight(row.weightKg) },
            { label: "Batch", value: row.batchNumber ?? "Not assigned" },
            { label: "Registered", value: formatDate(row.registeredAt) },
            ...(showMoney
              ? [
                  {
                    label: "Outstanding",
                    value:
                      row.outstanding === null || row.outstanding === undefined
                        ? "Not invoiced"
                        : formatMoney(row.outstanding, row.currency),
                  },
                ]
              : []),
            { label: "Description", value: row.description },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 text-sm font-medium">{item.value}</dd>
            </div>
          ))}
          <div className="sm:col-span-4">
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/shipments/${row.trackingNumber}`}>
                Open shipment
              </Link>
            </Button>
          </div>
        </dl>
      )}
      renderCard={(row) => (
        <Link
          href={`/app/shipments/${row.trackingNumber}`}
          className="panel focus-ring block p-4 transition-shadow active:shadow-lift"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="font-mono text-sm font-semibold tabular">
              {row.trackingNumber}
            </span>
            <ShipmentStatusBadge status={row.status} />
          </div>
          <p className="mt-2 truncate text-sm">{row.customerName}</p>
          <p className="text-xs text-muted-foreground tabular">
            {row.customerPhone ?? "No phone recorded"}
          </p>
          <p className="mt-2 truncate text-xs text-muted-foreground">
            {row.packages} pkg · {formatWeight(row.weightKg)}
            {row.batchNumber ? ` · ${row.batchNumber}` : ""}
          </p>
          {showMoney &&
          typeof row.outstanding === "number" &&
          row.outstanding > 0 ? (
            <p className="mt-2 font-mono text-xs font-medium tabular text-warning">
              {formatMoney(row.outstanding, row.currency)} outstanding
            </p>
          ) : null}
        </Link>
      )}
    />
  );
}
