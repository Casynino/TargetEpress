"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Grid3x3, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type CargoCell = {
  id: string;
  trackingNumber: string;
  /** The carton number from the packing list, e.g. GZ/26-22-7. */
  cartonRef: string | null;
  customerName: string;
  description: string;
  weightKg: number;
  packages: number;
  status: string;
  category: string;
  /** Null until the batch has been checked in at Dar. */
  verification: "VERIFIED" | "EXCEPTION" | null;
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
export function CargoGrid({ cells }: { cells: CargoCell[] }) {
  // List first, deliberately. The tile grid is a picture of one batch; the list
  // is what a desk works down when several hundred cartons are moving in a week.
  const [view, setView] = useState<"list" | "grid">("list");
  const [filter, setFilter] = useState<string>("ALL");

  const sorted = useMemo(() => {
    const byCarton = (a: CargoCell, b: CargoCell) => {
      // Carton refs end in a number ("GZ/26-22-7"). Sorting them as strings
      // puts carton 10 before carton 2, which is exactly wrong when someone is
      // reading numbers off boxes.
      const tail = (ref: string | null) => {
        const match = (ref ?? "").match(/(\d+)\s*$/);
        return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
      };
      const diff = tail(a.cartonRef) - tail(b.cartonRef);
      return diff !== 0 ? diff : a.trackingNumber.localeCompare(b.trackingNumber);
    };

    return [...cells]
      .filter((cell) => filter === "ALL" || cell.category === filter)
      .sort(byCarton);
  }, [cells, filter]);

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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            filter === "ALL" ? "border-foreground bg-foreground text-background" : "hover:bg-accent"
          )}
        >
          All {counts.total}
        </button>
        {categories.map(([category, count]) => (
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
        ))}

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

      {counts.verified > 0 || counts.flagged > 0 ? (
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
                href={`/app/shipments/${cell.trackingNumber}`}
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
                    {cell.cartonRef ?? cell.trackingNumber}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs font-medium text-foreground">
                    {cell.description}
                  </p>
                </div>
                <div className="mt-2 border-t border-current/20 pt-1.5">
                  <p className="truncate text-[11px] text-foreground/70">
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
                  <th className="px-3 py-2 font-medium">Carton</th>
                  <th className="px-3 py-2 font-medium">Tracking</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Cargo</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Weight</th>
                  <th className="px-3 py-2 text-right font-medium">Pkgs</th>
                  <th className="px-3 py-2 font-medium">State</th>
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
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-muted-foreground">
                      {cell.cartonRef ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Link
                        href={`/app/shipments/${cell.trackingNumber}`}
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
                    <td className="hidden whitespace-nowrap px-3 py-1.5 text-xs lg:table-cell">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5",
                          CATEGORY_CHIP[cell.category] ?? "bg-muted"
                        )}
                      >
                        {CATEGORY_SHORT[cell.category] ?? cell.category}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums">
                      {cell.weightKg.toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                      {cell.packages}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs">
                      {cell.verification === "VERIFIED" ? (
                        <span className="text-success">checked in</span>
                      ) : cell.verification === "EXCEPTION" ? (
                        <span className="font-medium text-destructive">flagged</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
