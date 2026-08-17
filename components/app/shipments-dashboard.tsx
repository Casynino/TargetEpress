"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plane, Search } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { formatLocal, formatUsd } from "@/lib/money";
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
   * The month this flight belongs to, as YYYY-MM.
   *
   * Arrival where there is one, departure otherwise: a flight belongs to the
   * month its cargo landed and started being invoiced, and one still in the
   * air belongs to the month it left. Decided on the server so every desk
   * agrees on which month a flight is in, whatever a browser's clock says.
   */
  month: string;
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
    /**
     * What clearing this flight has cost, in dollars and in shillings.
     *
     * Optional, and absent rather than zero for a reader without expense.view.
     * Customer Care holds finance.view so it can chase a bill, which is why the
     * three figures above are here for them — what the clearing agent charged
     * is not the same question, and a zero would still be a cost figure with an
     * Expected profit built on top of it.
     */
    spentUsd?: number;
    spentTzs?: number;
  } | null;
};

/**
 * Money on a board, where the question is scale and not the last shilling.
 *
 * 22,935,015 is eight digits that have to be counted before they mean
 * anything, and four columns of them is a wall. 22.9M is read, not counted.
 * The exact figure is one click away on the flight itself, and the band above
 * the list carries the total in full.
 */
function compact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

const STATUS_RAIL: Record<string, string> = {
  IN_TRANSIT: "bg-info",
  ARRIVED: "bg-warning",
  VERIFIED: "bg-success",
  CLOSED: "bg-border",
};

const STATUS_LABEL: Record<string, string> = {
  IN_TRANSIT: "In transit",
  ARRIVED: "Arrived",
  VERIFIED: "Checked in",
  CLOSED: "Completed",
};

/*
  Active flights and history are two different questions.

  A closed flight is finished: its books are shut, nothing can land on it, and
  it is only opened again to be read. Leaving it in the working list meant the
  board grew forever and "all shipments" answered neither "what am I working
  on" nor "what did we fly in March". Active is now the default and the closed
  ones live behind History.
*/
const FILTERS = [
  { key: "active", label: "Active" },
  { key: "IN_TRANSIT", label: "In transit" },
  { key: "ARRIVED", label: "Pending clearance" },
  { key: "VERIFIED", label: "Checked in" },
  { key: "CLOSED", label: "History" },
  { key: "all", label: "Everything" },
] as const;

/*
  Column widths live here rather than on each cell.

  The headings and the figures are separate elements, so the only thing
  keeping a column title over its own numbers is that both use the same width.
  Written out twice, they drift the first time one of them is edited.
*/
const COL = {
  /* On a phone the code takes the free space; origin is what steps out. */
  code: "min-w-0 flex-1 sm:w-28 sm:flex-none",
  origin: "hidden min-w-0 flex-1 sm:block",
  status: "hidden w-24 shrink-0 lg:block",
  cargo: "hidden w-10 shrink-0 text-right xl:block",
  weight: "hidden w-16 shrink-0 text-right xl:block",
  arrived: "hidden w-20 shrink-0 text-right lg:block",
  money: "w-20 shrink-0 text-right",
  moneySm: "hidden w-20 shrink-0 text-right sm:block",
  moneyLg: "hidden w-20 shrink-0 text-right lg:block",
};

/**
 * Every dispatch that has left China, as a register.
 *
 * This was a stack of cards, each carrying ten figures over two rows. That
 * reads beautifully against three flights and is unusable against forty —
 * which is one year of a weekly schedule, and the state this board will spend
 * most of its life in. One flight is now one line.
 *
 * The band above the list totals what is ON SCREEN rather than everything on
 * record. Filter to August, or to what is still in the air, and the money
 * follows: that is the question somebody came to this page with, and it saves
 * them adding a column up by eye.
 *
 * Filtering and search stay client-side over rows the server already sent: the
 * whole history is a few hundred flights at most, and a desk flicking between
 * "in transit" and "pending clearance" should not wait on a round trip.
 */
export function ShipmentsDashboard({
  rows,
  months,
  rate,
  showCosts = true,
}: {
  rows: DispatchRow[];
  /** Every month that actually flew, newest first. */
  months: { key: string; label: string }[];
  /** USD → TZS. Null when no rate is published; the board falls back to USD. */
  rate: number | null;
  /**
   * Whether this reader may see what the flights COST.
   *
   * The same flag the Financial overview band takes, for the same reason: money
   * columns on this board follow finance.view, but the Expenses column and the
   * Expected profit built on it follow expense.view — Finance and the owner.
   */
  showCosts?: boolean;
}) {
  const t = useT();
  const [filter, setFilter] = useState<string>("active");
  const [month, setMonth] = useState<string>("all");
  const [query, setQuery] = useState("");

  const showMoney = rows.some((row) => row.money);

  /* Status counts follow the month, so a chip never offers an empty list. */
  const counts = useMemo(() => {
    const inMonth = month === "all" ? rows : rows.filter((r) => r.month === month);
    const by = (status: string) => inMonth.filter((r) => r.status === status).length;
    return {
      all: inMonth.length,
      /* Everything that has not had a line drawn under it. */
      active: inMonth.filter((r) => r.status !== "CLOSED").length,
      IN_TRANSIT: by("IN_TRANSIT"),
      ARRIVED: by("ARRIVED"),
      VERIFIED: by("VERIFIED"),
      CLOSED: by("CLOSED"),
    } as Record<string, number>;
  }, [rows, month]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "active" ? row.status === "CLOSED" : filter !== "all" && row.status !== filter) {
        return false;
      }
      if (month !== "all" && row.month !== month) return false;
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
  }, [rows, filter, month, query]);

  /** Everything on screen, added up. */
  const totals = useMemo(() => {
    const sum = (pick: (row: DispatchRow) => number) =>
      visible.reduce((acc, row) => acc + pick(row), 0);
    return {
      cargo: sum((r) => r.cargoCount),
      weight: sum((r) => r.weightKg),
      expected: sum((r) => r.money?.expected ?? 0),
      collected: sum((r) => r.money?.collected ?? 0),
      outstanding: sum((r) => r.money?.outstanding ?? 0),
      spentUsd: sum((r) => r.money?.spentUsd ?? 0),
      spentTzs: sum((r) => r.money?.spentTzs ?? 0),
    };
  }, [visible]);

  /* Shillings lead, as they do everywhere money is shown in this app. */
  const tsh = (usd: number) =>
    rate === null ? formatUsd(usd) : formatLocal(usd * rate);
  /*
    Nothing is a dash, not a nought.

    A column of red zeroes down a board reads as a problem on every row. Zero
    collected and zero spent are the ordinary state of a flight that has just
    landed, so they are set as an absence and the eye passes over them.
  */
  const tshCompact = (usd: number) =>
    usd === 0 ? "—" : rate === null ? compact(usd) : compact(usd * rate);

  const cells: {
    k: string;
    main: string;
    sub: string;
    tone?: string;
  }[] = [
    {
      k: t("Batches"),
      main: String(visible.length),
      sub: `${totals.cargo} ${t("cargo")} · ${totals.weight.toFixed(0)} kg`,
    },
  ];

  if (showMoney) {
    cells.push(
      {
        k: t("Expected"),
        main: tsh(totals.expected),
        sub: formatUsd(totals.expected),
      },
      {
        k: t("Collected"),
        main: tsh(totals.collected),
        sub: formatUsd(totals.collected),
        tone: "text-success",
      },
      {
        k: t("Outstanding"),
        main: tsh(totals.outstanding),
        sub: formatUsd(totals.outstanding),
        tone: totals.outstanding > 0 ? "text-destructive" : undefined,
      }
    );
  }

  /* What the flights cost, and the profit that is only ever expected minus
     that cost. Pushed separately so a desk without expense.view gets a band
     that stops at Outstanding, rather than one carrying a profit figure
     computed against a spend it was never sent. */
  if (showMoney && showCosts) {
    const profitUsd = totals.expected - totals.spentUsd;
    cells.push(
      {
        // Shillings summed at face value where they were paid in shillings,
        // exactly as a flight's own expenses panel does it.
        k: t("Expenses"),
        main: rate === null ? formatUsd(totals.spentUsd) : formatLocal(totals.spentTzs),
        sub: formatUsd(totals.spentUsd),
        tone: "text-destructive",
      },
      {
        k: t("Expected profit"),
        main: tsh(profitUsd),
        sub: formatUsd(profitUsd),
        tone: profitUsd < 0 ? "text-destructive" : undefined,
      }
    );
  }

  return (
    <div>
      {/*
        What is on screen, in one band.

        Deliberately the same object as the Financial overview on a flight —
        label above, shillings large, dollars small — so a total means the same
        thing whether you are looking at one flight or at forty.
      */}
      {!showMoney ? (
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{visible.length}</span>{" "}
          {t(visible.length === 1 ? "batch" : "batches")} · {totals.cargo}{" "}
          {t("cargo")} · {totals.weight.toFixed(0)} kg
        </p>
      ) : (
      <dl
        className={cn(
          "mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-soft",
          /* Sized to the tiles that exist. Six columns holding four left a
             slab of border colour across the end of the band on every screen
             Support opened. */
          showCosts
            ? "sm:grid-cols-3 lg:grid-cols-6"
            : "sm:grid-cols-2 lg:grid-cols-4"
        )}
      >
        {cells.map((cell) => (
          <div key={cell.k} className="bg-card px-4 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {cell.k}
            </dt>
            <dd
              className={cn(
                "mt-0.5 font-display text-base font-bold tabular-nums",
                cell.tone
              )}
            >
              {cell.main}
            </dd>
            <p className="truncate text-[11px] tabular-nums text-muted-foreground">
              {cell.sub}
            </p>
          </div>
        ))}
      </dl>
      )}

      <div className="mb-4 rounded-xl border bg-card p-4 shadow-soft">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search batch number, waybill, airline or flight…")}
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

        {/*
          A month, because the schedule is weekly and the question is almost
          always "how did August go" rather than "how has the company done
          since it started". Only months that actually flew are offered, so
          the row cannot grow a chip that leads nowhere.
        */}
        {months.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[{ key: "all", label: t("Every month") }, ...months].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMonth(option.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  month === option.key
                    ? "border-foreground/25 bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Plane className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 font-medium">{t("Nothing here")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {t("Dispatch a batch and it appears here permanently.")}
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
          {/* The headings, on the same widths as the figures under them. */}
          <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span aria-hidden className="w-0.5 shrink-0" />
            <span className={COL.code}>{t("Batch")}</span>
            <span className={COL.origin}>{t("Origin")}</span>
            <span className={COL.status}>{t("Status")}</span>
            <span className={COL.cargo}>{t("Cargo")}</span>
            <span className={COL.weight}>{t("Weight")}</span>
            <span className={COL.arrived}>{t("Arrived")}</span>
            {showMoney ? (
              <>
                <span className={COL.moneySm}>{t("Expected")}</span>
                <span className={COL.moneyLg}>{t("Collected")}</span>
                <span className={COL.money}>{t("Outstanding")}</span>
                {showCosts ? (
                  <span className={COL.moneyLg}>{t("Expenses")}</span>
                ) : null}
              </>
            ) : null}
            <span aria-hidden className="w-4 shrink-0" />
          </div>

          <ul className="divide-y divide-border/60">
            {visible.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/app/shipments/${row.id}`}
                  className="flex h-11 items-center gap-3 px-4 text-sm transition-colors hover:bg-muted/25"
                >
                  {/* Status, findable down the edge before a word is read. */}
                  <span
                    aria-hidden
                    className={cn(
                      "h-6 w-0.5 shrink-0 rounded-full",
                      STATUS_RAIL[row.status] ?? "bg-border"
                    )}
                  />
                  <span className={cn(COL.code, "truncate font-mono font-semibold")}>
                    {row.shipmentNumber}
                  </span>
                  {/* Origin and flight only. Every one of these landed in
                      Dar es Salaam, so printing the destination on each row is
                      fifteen characters of the same word all the way down a
                      column that is short of space. The airline is dropped
                      for the same reason — "Ethiopian Airlines" truncates to
                      "Ethiopian Air…" while ET605 says it in five characters,
                      and search still matches the full name. */}
                  <span className={cn(COL.origin, "truncate text-muted-foreground")}>
                    {row.route}
                    {row.flightNumber ? ` · ${row.flightNumber}` : ""}
                    {row.flagged > 0 ? (
                      <span className="ml-2 text-destructive">
                        {row.flagged} {t("under investigation")}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(COL.status, "truncate text-xs text-muted-foreground")}
                  >
                    {t(STATUS_LABEL[row.status] ?? row.status)}
                  </span>
                  <span className={cn(COL.cargo, "tabular-nums text-muted-foreground")}>
                    {row.cargoCount}
                  </span>
                  <span className={cn(COL.weight, "tabular-nums text-muted-foreground")}>
                    {row.weightKg.toFixed(0)} kg
                  </span>
                  <span className={cn(COL.arrived, "text-xs text-muted-foreground")}>
                    {row.arrivedLabel ?? row.expectedLabel ?? "—"}
                  </span>
                  {row.money ? (
                    <>
                      <span className={cn(COL.moneySm, "font-medium tabular-nums")}>
                        {tshCompact(row.money.expected)}
                      </span>
                      <span
                        className={cn(
                          COL.moneyLg,
                          "tabular-nums",
                          row.money.collected > 0
                            ? "text-success"
                            : "text-muted-foreground"
                        )}
                      >
                        {tshCompact(row.money.collected)}
                      </span>
                      <span
                        className={cn(
                          COL.money,
                          "font-medium tabular-nums",
                          row.money.outstanding > 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {tshCompact(row.money.outstanding)}
                      </span>
                      {/* The cost column is absent for a desk without
                          expense.view, not blanked — nothing is sent to the
                          browser for it, so there is no figure in the payload
                          for a later edit to surface. */}
                      {showCosts ? (
                        <span
                          className={cn(
                            COL.moneyLg,
                            "tabular-nums",
                            (row.money.spentUsd ?? 0) > 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {!row.money.spentUsd
                            ? "—"
                            : rate === null
                              ? compact(row.money.spentUsd)
                              : compact(row.money.spentTzs ?? 0)}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>

          {/* The unit, said once. Repeating "TSh" down four columns of a
              forty-row board is forty times the ink for one fact. */}
          {showMoney ? (
            <p className="border-t px-4 py-1.5 text-right text-[11px] text-muted-foreground">
              {rate === null
                ? t("Figures in USD — no exchange rate published")
                : t("Money columns in thousands (k) and millions (M) of shillings")}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
