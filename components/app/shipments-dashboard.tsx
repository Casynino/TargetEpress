"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Package,
  Plane,
  Search,
  Warehouse,
} from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DispatchRow = {
  id: string;
  shipmentNumber: string;
  route: string;
  status: string;
  cargoCount: number;
  customerCount: number;
  weightKg: number;
  packages: number;
  waybillNumber: string | null;
  airline: string | null;
  flightNumber: string | null;
  departedLabel: string | null;
  expectedLabel: string | null;
  arrivedLabel: string | null;
  /**
   * Consignments on this flight with an unfinished case against them — short,
   * damaged, or not found. A flight is not "checked in and done" while any of
   * these are open, and the board should say so without being opened.
   */
  flagged: number;
  /**
   * Where this flight stands on money. Absent for desks that may not see it —
   * the warehouse reads this same board.
   *
   * `expected` includes cargo priced from the rate book but not yet confirmed,
   * because a flight that landed yesterday has barely any confirmed invoices
   * and a board showing near-zero against 87 pieces would be read as broken.
   */
  money?: {
    currency: string;
    expected: number;
    collected: number;
    outstanding: number;
    /** Prices nobody in Finance has signed off yet. */
    drafts: number;
  } | null;
};

/** Money without cents — a board is read at a glance, not reconciled from. */
const money = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const STATUS_TONE: Record<string, string> = {
  IN_TRANSIT: "bg-info/10 text-info border-info/30",
  ARRIVED: "bg-warning/10 text-warning border-warning/30",
  VERIFIED: "bg-success/10 text-success border-success/30",
  CLOSED: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<string, string> = {
  IN_TRANSIT: "In transit",
  ARRIVED: "Arrived",
  VERIFIED: "Checked in",
  CLOSED: "Completed",
};

const FILTERS = [
  { key: "all", label: "All shipments" },
  { key: "IN_TRANSIT", label: "In transit" },
  { key: "ARRIVED", label: "Pending clearance" },
  { key: "VERIFIED", label: "Checked in" },
  { key: "CLOSED", label: "Completed" },
] as const;

/**
 * Every dispatch that has left China.
 *
 * Filtering and search are client-side over rows the server already sent: the
 * whole history is a few hundred flights at most, and a desk flicking between
 * "in transit" and "pending clearance" should not wait on a round trip.
 */
export function ShipmentsDashboard({ rows }: { rows: DispatchRow[] }) {
  const t = useT();
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const by = (status: string) => rows.filter((r) => r.status === status).length;
    return {
      all: rows.length,
      IN_TRANSIT: by("IN_TRANSIT"),
      ARRIVED: by("ARRIVED"),
      VERIFIED: by("VERIFIED"),
      CLOSED: by("CLOSED"),
    } as Record<string, number>;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!q) return true;
      return [
        row.shipmentNumber,
        row.waybillNumber ?? "",
        row.airline ?? "",
        row.flightNumber ?? "",
        row.route,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filter, query]);

  return (
    <div>
      <div className="mb-4 rounded-xl border bg-card p-4 shadow-soft">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search shipment number, waybill, airline or flight…")}
            className="pl-9"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                filter === option.key
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:bg-accent"
              )}
            >
              {t(option.label)}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  filter === option.key ? "bg-white/20" : "bg-muted text-muted-foreground"
                )}
              >
                {counts[option.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{visible.length}</span>{" "}
        shipment{visible.length === 1 ? "" : "s"}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Plane className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 font-medium">{t("Nothing here")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {t("Dispatch a batch and it appears here permanently.")}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={row.id}>
              <Link
                href={`/app/shipments/${row.id}`}
                className="group block rounded-xl border bg-card p-5 shadow-soft transition-all hover:border-brand/40 hover:shadow-lift"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-bold">
                        {row.shipmentNumber}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          STATUS_TONE[row.status] ?? "bg-muted"
                        )}
                      >
                        {t(STATUS_LABEL[row.status] ?? row.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.route} → {t("Dar es Salaam")}
                      {row.airline ? ` · ${row.airline}` : ""}
                      {row.flightNumber ? ` ${row.flightNumber}` : ""}
                    </p>
                    {row.waybillNumber ? (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {t("Waybill")} {row.waybillNumber}
                      </p>
                    ) : null}
                  </div>

                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { label: t("Cargo"), value: String(row.cargoCount), Icon: Package },
                    { label: t("Customers"), value: String(row.customerCount) },
                    { label: t("Packages"), value: String(row.packages) },
                    { label: t("Weight"), value: `${row.weightKg.toFixed(1)} kg` },
                    {
                      label: row.arrivedLabel ? t("Arrived") : t("Expected"),
                      value: row.arrivedLabel ?? row.expectedLabel ?? "—",
                      Icon: Warehouse,
                    },
                    {
                      label: t("Under investigation"),
                      value: row.flagged ? String(row.flagged) : t("None"),
                      tone: row.flagged ? "text-destructive" : undefined,
                    },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                      <dd
                        className={`mt-0.5 text-sm font-semibold tabular-nums ${
                          "tone" in stat && stat.tone ? stat.tone : ""
                        }`}
                      >
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* How this flight is doing on money, on its own line so the
                    cargo figures above stay readable. Outstanding is the one
                    that decides whether anybody has to make a phone call, so
                    it carries the colour. */}
                {row.money ? (
                  <dl className="mt-3 grid grid-cols-2 gap-4 border-t pt-3 sm:grid-cols-4">
                    {[
                      {
                        label: t("Expected"),
                        value: `${row.money.currency} ${money(row.money.expected)}`,
                        tone: "text-foreground",
                      },
                      {
                        label: t("Collected"),
                        value: `${row.money.currency} ${money(row.money.collected)}`,
                        tone: "text-success",
                      },
                      {
                        label: t("To collect"),
                        value: `${row.money.currency} ${money(row.money.outstanding)}`,
                        tone:
                          row.money.outstanding > 0
                            ? "text-warning"
                            : "text-muted-foreground",
                      },
                      {
                        label: t("Prices to confirm"),
                        value: row.money.drafts
                          ? String(row.money.drafts)
                          : t("All confirmed"),
                        tone: row.money.drafts
                          ? "text-signal"
                          : "text-muted-foreground",
                      },
                    ].map((stat) => (
                      <div key={stat.label}>
                        <dt className="text-xs text-muted-foreground">
                          {stat.label}
                        </dt>
                        <dd
                          className={`mt-0.5 text-sm font-semibold tabular-nums ${stat.tone}`}
                        >
                          {stat.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
