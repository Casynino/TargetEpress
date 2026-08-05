"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Download,
  FileText,
  History,
  Package,
  Search,
} from "lucide-react";

import { RowPriceEditor } from "@/components/app/row-price-editor";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export type CargoLine = {
  id: string;
  trackingNumber: string;
  cartonRef: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  description: string;
  category: string;
  weightKg: number;
  packages: number;
  /** Pre-formatted with its unit. */
  packagesLabel: string;
  status: string;
  statusLabel: string;
  receivedLabel: string;
  /**
   * Open problems raised against this line, so a flagged shipment is visible
   * wherever the cargo is listed rather than only in the investigation queue.
   * Empty for a clean line.
   */
  problems: string[];
  /**
   * What this consignment is priced at, and whether Finance has signed that
   * price off. Absent for desks that may not see money — the warehouse reads
   * this same table.
   */
  price?: {
    amount: number;
    currency: string;
    confirmed: boolean;
    /** Everything the inline editor needs, so a correction never leaves the list. */
    edit?: {
      invoiceId: string;
      rateBookFreight: number;
      freightOverride: number | null;
      storage: number;
      otherCharges: number;
      discount: number;
    } | null;
  } | null;
  /** Proof photos, carried by the cargo itself all the way to the counter. */
  photos: { id: string; url: string; caption: string | null }[];
  /** Undefined for roles that may not see money. */
  valueUsd?: number;
};

export type TimelineEntry = {
  id: string;
  label: string;
  detail: string;
  at: string;
  done: boolean;
};

export type DocumentEntry = {
  id: string;
  name: string;
  kind: string;
  url: string;
  uploadedBy: string | null;
  uploadedAt: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  NORMAL_GOODS: "Normal goods",
  ELECTRONICS: "Electronics",
  LIQUID_SPECIAL: "Special goods",
};

const TABS = [
  { key: "cargo", label: "Cargo", Icon: Package },
  { key: "documents", label: "Documents", Icon: FileText },
  { key: "timeline", label: "Timeline", Icon: History },
] as const;

/**
 * The body of a shipment: its cargo, its paperwork, its history.
 *
 * Tabs rather than one long page, because these are three different jobs.
 * Somebody checking a manifest against a pallet, somebody hunting for a customs
 * form, and somebody explaining a delay to a customer all want the whole screen
 * for their own task.
 */
export function ShipmentDetailTabs({
  cargo,
  documents,
  timeline,
  showPrice = false,
  canEditPrice = false,
  canOverridePrice = false,
}: {
  cargo: CargoLine[];
  documents: DocumentEntry[];
  timeline: TimelineEntry[];
  /** Finance and the CEO only. See lib/rbac, finance.view. */
  showPrice?: boolean;
  /** invoice.edit — may adjust a bill that has had no money against it. */
  canEditPrice?: boolean;
  /** invoice.discount — may move the freight figure itself, or discount it. */
  canOverridePrice?: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("cargo");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [sort, setSort] = useState("carton");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = cargo.filter((line) => {
      if (category !== "ALL" && line.category !== category) return false;
      if (!q) return true;
      return [
        line.trackingNumber,
        line.customerName,
        line.customerPhone ?? "",
        line.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (sort === "weight") return b.weightKg - a.weightKg;
      if (sort === "customer") return a.customerName.localeCompare(b.customerName);
      if (sort === "tracking")
        return a.trackingNumber.localeCompare(b.trackingNumber);
      return a.receivedLabel.localeCompare(b.receivedLabel);
    });
  }, [cargo, query, category, sort]);

  const categories = useMemo(
    () => [...new Set(cargo.map((line) => line.category))],
    [cargo]
  );

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {TABS.map(({ key, label, Icon }) => {
          const count =
            key === "cargo"
              ? cargo.length
              : key === "documents"
                ? documents.length
                : timeline.length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded px-3 py-2 text-sm font-medium transition-colors",
                tab === key
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className="rounded-full bg-background px-1.5 text-xs tabular-nums text-muted-foreground">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "cargo" ? (
        <div className="rounded-xl border bg-card shadow-soft">
          <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tracking number, customer, phone or goods…"
                className="pl-9"
              />
            </div>
            <NativeSelect
              aria-label="Filter by category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="sm:w-48"
            >
              <option value="ALL">All categories</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABEL[value] ?? value}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Sort cargo"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="sm:w-44"
            >
              <option value="carton">Sort: date received</option>
              <option value="tracking">Sort: tracking</option>
              <option value="customer">Sort: customer</option>
              <option value="weight">Sort: heaviest</option>
            </NativeSelect>
          </div>

          <p className="border-b px-4 py-2 text-xs text-muted-foreground">
            {visible.length} of {cargo.length} pieces
          </p>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Received</th>
                  <th className="px-3 py-2 font-medium">Tracking</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Goods</th>
                  <th className="px-3 py-2 text-right font-medium">Weight</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    Counted as
                  </th>
                  {/* Beside the weight and the count it is worked out from —
                      and never last, where the table scrolls it off the edge
                      of the screen and Finance cannot find it. */}
                  {showPrice ? (
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      Price
                    </th>
                  ) : null}
                  <th className="px-3 py-2 font-medium">Proof</th>
                  <th className="w-20 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => (
                  <tr key={line.id} className="border-t">
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                      {line.receivedLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Link
                        href={`/app/cargo/${line.trackingNumber}`}
                        className="font-mono text-xs hover:text-brand hover:underline"
                      >
                        {line.trackingNumber}
                      </Link>
                      {/* The flag travels with the line. Somebody scanning this
                          list for a customer's cargo should see the problem
                          here, not have to open the shipment to find it. */}
                      {line.problems.length > 0 ? (
                        <span
                          title={line.problems.join(", ")}
                          className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {line.problems[0]}
                          {line.problems.length > 1
                            ? ` +${line.problems.length - 1}`
                            : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-1.5">
                      <Link
                        href={`/app/customers/${line.customerId}`}
                        className="hover:text-brand hover:underline"
                      >
                        {line.customerName}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-1.5 text-muted-foreground">
                      {line.description}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums">
                      {line.weightKg.toFixed(1)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums">
                      {line.packagesLabel}
                    </td>
                    {showPrice ? (
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        {line.price ? (
                          <span className="inline-flex items-center gap-1.5">
                            {line.price.edit && canEditPrice ? (
                              <RowPriceEditor
                                invoiceId={line.price.edit.invoiceId}
                                trackingNumber={line.trackingNumber}
                                currency={line.price.currency}
                                rateBookFreight={line.price.edit.rateBookFreight}
                                freightOverride={line.price.edit.freightOverride}
                                storage={line.price.edit.storage}
                                otherCharges={line.price.edit.otherCharges}
                                discount={line.price.edit.discount}
                                canOverride={canOverridePrice}
                              />
                            ) : null}
                            <span className="font-medium">
                              {line.price.currency} {line.price.amount.toFixed(2)}
                            </span>
                            {/* An unconfirmed figure has to look unconfirmed,
                                or the desk signs off a list it believes was
                                already agreed. */}
                            {!line.price.confirmed ? (
                              <span className="rounded bg-signal/10 px-1.5 py-0.5 text-[10px] font-medium text-signal">
                                draft
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {line.photos.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <a
                            href={line.photos[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`View ${line.photos.length} photo(s)`}
                            className="group relative block h-8 w-8 shrink-0 overflow-hidden rounded border"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={line.photos[0].url}
                              alt={line.photos[0].caption ?? `Cargo photo for ${line.trackingNumber}`}
                              className="h-full w-full object-cover transition-transform group-hover:scale-110"
                              loading="lazy"
                            />
                            {line.photos.length > 1 ? (
                              <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-medium text-white">
                                {line.photos.length}
                              </span>
                            ) : null}
                          </a>
                          <a
                            href={line.photos[0].url}
                            download={`${line.trackingNumber}.jpg`}
                            title="Download"
                            className="text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Link
                        href={`/app/cargo/${line.trackingNumber}`}
                        className="inline-flex items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-brand"
                      >
                        Open
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="p-10 text-center text-sm text-muted-foreground"
                    >
                      No cargo matches that search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="rounded-xl border bg-card shadow-soft">
          {documents.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 font-medium">No documents yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Waybills, customs paperwork and packing photos attached to this
                shipment appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.kind}
                        {doc.uploadedBy ? ` · ${doc.uploadedBy}` : ""} ·{" "}
                        {doc.uploadedAt}
                      </p>
                    </div>
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "timeline" ? (
        <div className="rounded-xl border bg-card p-6 shadow-soft">
          <ol className="relative">
            <span
              aria-hidden="true"
              className="absolute left-[11px] top-2 w-0.5 bg-border"
              style={{ height: "calc(100% - 1.5rem)" }}
            />
            {timeline.map((entry) => (
              <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                <span
                  className={cn(
                    "relative z-10 mt-1 h-6 w-6 shrink-0 rounded-full border-2",
                    entry.done
                      ? "border-brand bg-brand/15"
                      : "border-border bg-background"
                  )}
                />
                <div className="min-w-0 pt-0.5">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      entry.done ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {entry.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{entry.detail}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground/80">{entry.at}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
