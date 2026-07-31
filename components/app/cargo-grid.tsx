"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Camera, Download, Grid3x3, Printer, Search, Table2, X } from "lucide-react";


import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

import { cn } from "@/lib/utils";

export type CargoCell = {
  id: string;
  trackingNumber: string;
  /** The carton number from the packing list, e.g. GZ/26-22-7. Imported cargo
   *  only — anything registered through the form has none. Kept on the record
   *  and shown on the cargo page, but not in lists. */
  cartonRef: string | null;
  /** When the China desk took it in, already formatted. */
  receivedLabel: string;
  /** Sortable form of the same thing. */
  receivedAt: string;
  customerName: string;
  description: string;
  weightKg: number;
  packages: number;
  status: string;
  category: string;
  /** Null until the batch has been checked in at Dar. */
  verification: "VERIFIED" | "EXCEPTION" | null;
  /** What the cargo actually is right now, in the words staff read. */
  statusLabel: string;
  /** Who took this cargo in at the China desk. */
  receivedBy: string | null;
  /**
   * Proof photos, taken when the cargo was received. They belong to the cargo,
   * so they travel with it into the batch, onto the flight and all the way to
   * the counter — nothing has to copy them along.
   */
  photos: { id: string; url: string; kind: string; caption: string | null }[];
};

const CATEGORY_TINT: Record<string, string> = {
  NORMAL_GOODS: "bg-brand/10 border-brand/30 text-brand",
  ELECTRONICS: "bg-info/10 border-info/30 text-info",
  LIQUID_SPECIAL: "bg-warning/10 border-warning/30 text-warning",
};

/** Short forms, because this column is read at a glance a hundred times a day. */
const CATEGORY_SHORT: Record<string, string> = {
  NORMAL_GOODS: "Normal",
  ELECTRONICS: "Electronics",
  LIQUID_SPECIAL: "Special",
};

const CATEGORY_CHIP: Record<string, string> = {
  NORMAL_GOODS: "bg-brand/10 text-brand",
  ELECTRONICS: "bg-info/10 text-info",
  LIQUID_SPECIAL: "bg-warning/10 text-warning",
};

const CATEGORY_LABEL: Record<string, string> = {
  NORMAL_GOODS: "Normal goods",
  ELECTRONICS: "Electronics",
  LIQUID_SPECIAL: "Special goods",
};

/**
 * The photos taken when this cargo was received.
 *
 * A thumbnail that opens the full image, and an explicit download beside it.
 * Both matter: someone settling an argument about damage wants to look now,
 * and someone answering a claim wants the file to attach to an email.
 */
function PhotoProof({
  photos,
  tracking,
}: {
  photos: CargoCell["photos"];
  tracking: string;
}) {
  if (photos.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const first = photos[0];

  return (
    <span className="flex items-center gap-1.5">
      <a
        href={first.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`View ${photos.length} photo${photos.length === 1 ? "" : "s"} of ${tracking}`}
        className="group relative block h-8 w-8 shrink-0 overflow-hidden rounded border"
      >
        {/* Deliberately a plain img: these are user uploads on a storage host
            that may not be in the Next image allow-list, and a broken optimiser
            would hide the proof entirely. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={first.url}
          alt={first.caption ?? `Cargo photo for ${tracking}`}
          className="h-full w-full object-cover transition-transform group-hover:scale-110"
          loading="lazy"
        />
        {photos.length > 1 ? (
          <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-medium text-white">
            {photos.length}
          </span>
        ) : null}
      </a>
      <a
        href={first.url}
        download={`${tracking}.jpg`}
        title="Download"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}

/**
 * A batch as cargo, not as rows.
 *
 * A packing list is physical: 24 cartons on a pallet, each with a number
 * painted on it. A table of 86 rows tells you nothing about that; a grid of 86
 * tiles does — you can see at a glance how much of a batch is electronics, how
 * much has been checked in, and which carton number is missing.
 *
 * Sorted by carton reference so the screen order matches the order the cartons
 * come off the truck.
 */
export function CargoGrid({
  cells,
  batchId,
}: {
  cells: CargoCell[];
  /** Set to allow selecting cargo and printing their stickers together. */
  batchId?: string;
}) {
  // List first, deliberately. The tile grid is a picture of one batch; the list
  // is what a desk works down when several hundred cartons are moving in a week.
  const [view, setView] = useState<"list" | "grid">("list");
  const [filter, setFilter] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("received");

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matches = (cell: CargoCell) =>
      !q ||
      [cell.trackingNumber, cell.customerName, cell.description]
        .join(" ")
        .toLowerCase()
        .includes(q);

    return [...cells]
      .filter((cell) => filter === "ALL" || cell.category === filter)
      .filter(matches)
      .sort((a, b) => {
        if (sort === "customer") return a.customerName.localeCompare(b.customerName);
        if (sort === "weight") return b.weightKg - a.weightKg;
        if (sort === "tracking")
          return a.trackingNumber.localeCompare(b.trackingNumber);
        // Oldest first by default: the piece that has waited longest is the one
        // that should go on the next flight.
        return a.receivedAt.localeCompare(b.receivedAt);
      });
  }, [cells, filter, query, sort]);

  const counts = useMemo(() => {
    const total = cells.length;
    const verified = cells.filter((c) => c.verification === "VERIFIED").length;
    const flagged = cells.filter((c) => c.verification === "EXCEPTION").length;
    const weight = cells.reduce((sum, c) => sum + c.weightKg, 0);
    const packages = cells.reduce((sum, c) => sum + c.packages, 0);
    return { total, verified, flagged, weight, packages };
  }, [cells]);

  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const cell of cells) {
      seen.set(cell.category, (seen.get(cell.category) ?? 0) + 1);
    }
    return [...seen.entries()];
  }, [cells]);

  return (
    <div>
      {/* Finding one customer in a busy batch is the common task, so search
          leads and the filters sit under it. */}
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Customer, tracking number or goods…"
            className="pl-9 pr-9"
            aria-label="Search cargo"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <NativeSelect
          aria-label="Sort cargo"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="sm:w-48"
        >
          <option value="received">Sort: date received</option>
          <option value="customer">Sort: customer A–Z</option>
          <option value="tracking">Sort: tracking number</option>
          <option value="weight">Sort: heaviest first</option>
        </NativeSelect>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {categories.length > 1 ? (
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              filter === "ALL"
                ? "border-foreground bg-foreground text-background"
                : "hover:bg-accent"
            )}
          >
            All {counts.total}
          </button>
        ) : null}
        {categories.length > 1
          ? categories.map(([category, count]) => (
          <button
            key={category}
            type="button"
            onClick={() => setFilter(category)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              filter === category
                ? "border-foreground bg-foreground text-background"
                : "hover:bg-accent"
            )}
          >
                {CATEGORY_LABEL[category] ?? category} {count}
              </button>
            ))
          : null}

        {batchId ? (
          <Link
            href={`/app/batches/${batchId}/stickers`}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Printer className="h-3.5 w-3.5" />
            Print all stickers
          </Link>
        ) : null}

        <div className="ml-auto flex rounded-md border p-0.5">
          {(
            [
              { key: "list", Icon: Table2, label: "List" },
              { key: "grid", Icon: Grid3x3, label: "Cargo layout" },
            ] as const
          ).map(({ key, Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-label={label}
              aria-pressed={view === key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors",
                view === key ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {query.trim() || filter !== "ALL" ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{sorted.length}</span>{" "}
          of {counts.total} pieces
        </p>
      ) : counts.verified > 0 || counts.flagged > 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {counts.verified} of {counts.total} checked in
          {counts.flagged > 0 ? ` · ${counts.flagged} flagged` : ""} ·{" "}
          {counts.packages} packages · {counts.weight.toFixed(1)} kg
        </p>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          {counts.packages} packages · {counts.weight.toFixed(1)} kg
        </p>
      )}

      {view === "grid" ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {sorted.map((cell) => (
            <li key={cell.id}>
              <Link
                href={`/app/cargo/${cell.trackingNumber}`}
                className={cn(
                  "flex h-full flex-col justify-between rounded-lg border-2 p-3 transition-shadow hover:shadow-lift",
                  cell.verification === "EXCEPTION"
                    ? "border-destructive bg-destructive/5"
                    : cell.verification === "VERIFIED"
                      ? "border-success bg-success/5"
                      : CATEGORY_TINT[cell.category] ?? "bg-card"
                )}
              >
                <div>
                  <p className="font-mono text-xs font-bold tabular-nums">
                    {cell.trackingNumber}
                  </p>
                  <p className="text-[10px] text-foreground/60">
                    {cell.receivedLabel}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs font-medium text-foreground">
                    {cell.description}
                  </p>
                </div>
                <div className="mt-2 border-t border-current/20 pt-1.5">
                  <p className="flex items-center gap-1 truncate text-[11px] text-foreground/70">
                    {cell.photos.length > 0 ? (
                      <Camera className="h-3 w-3 shrink-0" />
                    ) : null}
                    {cell.customerName}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-foreground/70">
                    {cell.weightKg.toFixed(1)} kg · {cell.packages} pkg
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Received</th>
                  <th className="px-3 py-2 font-medium">Tracking</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Cargo</th>
                  <th className="px-3 py-2 text-right font-medium">Weight</th>
                  <th className="px-3 py-2 text-right font-medium">Pkgs</th>
                  <th className="px-3 py-2 font-medium">Proof</th>
                  <th className="hidden px-3 py-2 font-medium xl:table-cell">
                    Received by
                  </th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((cell) => (
                  <tr
                    key={cell.id}
                    className={cn(
                      "border-t",
                      cell.verification === "EXCEPTION" && "bg-destructive/5"
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                      {cell.receivedLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Link
                        href={`/app/cargo/${cell.trackingNumber}`}
                        className="font-mono text-xs hover:text-brand hover:underline"
                      >
                        {cell.trackingNumber}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-1.5">
                      {cell.customerName}
                    </td>
                    <td className="max-w-[18rem] truncate px-3 py-1.5 text-muted-foreground">
                      {cell.description}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums">
                      {cell.weightKg.toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                      {cell.packages}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <PhotoProof photos={cell.photos} tracking={cell.trackingNumber} />
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground xl:table-cell">
                      {cell.receivedBy ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs">
                      {cell.verification === "EXCEPTION" ? (
                        <span className="font-medium text-destructive">Flagged</span>
                      ) : cell.verification === "VERIFIED" ? (
                        <span className="text-success">Checked in</span>
                      ) : (
                        <span className="text-muted-foreground">{cell.statusLabel}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {/* One click, one sticker. The label is normally printed
                          the moment the cargo is recorded; this is here for the
                          reprint, which is the only reason to come looking. */}
                      <Link
                        href={`/app/cargo/${cell.trackingNumber}/label`}
                        title={`Print sticker for ${cell.trackingNumber}`}
                        aria-label={`Print sticker for ${cell.trackingNumber}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing in this batch matches that filter.
        </p>
      ) : null}
    </div>
  );
}
