"use client";

import Link from "next/link";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { Badge } from "@/components/ui/badge";

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  trackingNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  currency: string;
  total: number;
  amountPaid: number;
  outstanding: number;
  status: string;
  issuedAt: string;
  /** Null until someone has actually sent it to the customer. */
  sentAt: string | null;
  storageDays: number;
};

const STATUS_TONE: Record<string, "destructive" | "warning" | "success" | "outline"> = {
  UNPAID: "destructive",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  VOID: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  VOID: "Void",
};

const money = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/**
 * Every invoice, sortable and filterable.
 *
 * The "sent" facet is the one that earns its place: an invoice nobody sent is a
 * different problem from an invoice that was sent and ignored, and Finance
 * cannot tell them apart from the status column alone.
 */
export function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const columns: Column<InvoiceRow>[] = [
    {
      id: "invoice",
      header: "Invoice",
      sortValue: (row) => row.invoiceNumber,
      cell: (row) => (
        <div>
          <Link
            href={`/app/finance/invoices/${row.id}`}
            className="font-mono text-xs font-medium hover:text-brand hover:underline"
          >
            {row.invoiceNumber}
          </Link>
          <div className="font-mono text-[11px] text-muted-foreground">
            {row.trackingNumber}
          </div>
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
            className="font-medium hover:text-brand hover:underline"
          >
            {row.customerName}
          </Link>
          <div className="text-xs text-muted-foreground">
            {row.customerPhone ?? "no phone"}
          </div>
        </div>
      ),
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      sortValue: (row) => row.total,
      className: "font-mono tabular-nums",
      cell: (row) => money(row.total, row.currency),
    },
    {
      id: "outstanding",
      header: "Owed",
      align: "right",
      sortValue: (row) => row.outstanding,
      className: "font-mono tabular-nums",
      cell: (row) =>
        row.outstanding > 0 ? (
          <span className="text-destructive">{money(row.outstanding, row.currency)}</span>
        ) : (
          <span className="text-success">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={STATUS_TONE[row.status] ?? "outline"}>
            {STATUS_LABEL[row.status] ?? row.status}
          </Badge>
          {!row.sentAt && row.status !== "PAID" ? (
            <span className="text-[11px] text-warning">never sent</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "storage",
      header: "Storage",
      hideBelow: "xl",
      align: "right",
      sortValue: (row) => row.storageDays,
      cell: (row) =>
        row.storageDays > 0 ? (
          <span className="text-warning">{row.storageDays} d</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "issued",
      header: "Issued",
      hideBelow: "lg",
      sortValue: (row) => new Date(row.issuedAt),
      className: "text-xs text-muted-foreground",
      cell: (row) => day(row.issuedAt),
    },
    {
      id: "sent",
      header: "Sent",
      hideBelow: "xl",
      defaultHidden: true,
      sortValue: (row) => (row.sentAt ? new Date(row.sentAt) : null),
      className: "text-xs text-muted-foreground",
      cell: (row) => (row.sentAt ? day(row.sentAt) : "never"),
    },
  ];

  const filters: TableFilter<InvoiceRow>[] = [
    {
      id: "status",
      label: "Status",
      options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
      match: (row, value) => row.status === value,
    },
    {
      id: "sent",
      label: "Sent to customer",
      options: [
        { value: "yes", label: "Sent" },
        { value: "no", label: "Never sent" },
      ],
      match: (row, value) => (value === "yes" ? row.sentAt !== null : row.sentAt === null),
    },
    {
      id: "storage",
      label: "Storage",
      options: [
        { value: "charging", label: "Accruing storage" },
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
      searchValue={(row) =>
        [row.invoiceNumber, row.trackingNumber, row.customerName, row.customerPhone ?? ""]
          .join(" ")
          .toLowerCase()
      }
      searchPlaceholder="Invoice, tracking number, customer or phone"
      emptyTitle="Nothing matches"
      emptyDescription="No invoices match those filters."
      renderCard={(row) => (
        <Link
          href={`/app/finance/invoices/${row.id}`}
          className="block rounded-xl border bg-card p-4 shadow-soft"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs font-medium">{row.invoiceNumber}</p>
              <p className="mt-0.5 font-medium">{row.customerName}</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {row.trackingNumber}
              </p>
            </div>
            <Badge variant={STATUS_TONE[row.status] ?? "outline"}>
              {STATUS_LABEL[row.status] ?? row.status}
            </Badge>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t pt-3">
            <span className="text-xs text-muted-foreground">
              {row.outstanding > 0 ? "Owed" : "Paid in full"}
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {money(row.outstanding > 0 ? row.outstanding : row.total, row.currency)}
            </span>
          </div>
        </Link>
      )}
    />
  );
}
