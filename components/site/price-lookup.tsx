"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";

export type PriceRow = {
  id: string;
  /** Null for a category-wide rate that covers anything not named. */
  product: string | null;
  category: string;
  method: string;
  price: number;
  currency: string;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  notes: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  NORMAL_GOODS: "Normal goods",
  ELECTRONICS: "Electronics",
  LIQUID_SPECIAL: "Special goods",
};

const CATEGORY_ROUTE: Record<string, string> = {
  NORMAL_GOODS: "Guangzhou",
  ELECTRONICS: "Hong Kong",
  LIQUID_SPECIAL: "Hong Kong",
};

const CATEGORY_BLURB: Record<string, string> = {
  NORMAL_GOODS:
    "Clothes, shoes, bags, car parts, general merchandise. Priced per kilogram, cheaper above 10 kg.",
  ELECTRONICS:
    "Phones, laptops, tablets, cameras. Most are a fixed price per item, so weight does not matter.",
  LIQUID_SPECIAL:
    "Medicines, food, oils, batteries, printers, speakers. Priced per kilogram at a single rate.",
};

function tierLabel(row: PriceRow) {
  if (row.method === "FIXED_PER_ITEM") return "any weight";
  if (row.minWeightKg && row.maxWeightKg)
    return `${row.minWeightKg}–${row.maxWeightKg} kg`;
  if (row.minWeightKg) return `${row.minWeightKg} kg and above`;
  if (row.maxWeightKg) return `under ${row.maxWeightKg} kg`;
  return "any weight";
}

/**
 * Search the price list by what you are sending.
 *
 * Filtering is instant and local — the whole rate book is a few dozen rows, and
 * a customer checking a price on a phone in a market in Guangzhou should not be
 * waiting on a round trip. Shows the shilling equivalent alongside, because
 * that is the currency they will actually pay in.
 */
export function PriceLookup({
  rows,
  exchangeRate,
}: {
  rows: PriceRow[];
  exchangeRate: number | null;
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? rows.filter(
          (row) =>
            (row.product ?? "").toLowerCase().includes(q) ||
            (CATEGORY_LABEL[row.category] ?? "").toLowerCase().includes(q) ||
            (row.notes ?? "").toLowerCase().includes(q)
        )
      : rows;

    return ["NORMAL_GOODS", "ELECTRONICS", "LIQUID_SPECIAL"]
      .map((category) => ({
        category,
        items: matching.filter((row) => row.category === category),
      }))
      .filter((group) => group.items.length > 0);
  }, [rows, query]);

  const local = (usd: number) =>
    exchangeRate === null
      ? null
      : `TZS ${Math.round(usd * exchangeRate).toLocaleString("en-US")}`;

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Laptop, clothes, medicine, printer…"
          className="h-14 rounded-xl pl-12 pr-12 text-base"
          aria-label="Search the price list"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {grouped.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">
            Nothing on the list matches &ldquo;{query}&rdquo;
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            That does not mean we cannot ship it. Anything not named here is
            charged at its category rate — message us with a photo and we will
            tell you which one applies.
          </p>
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {grouped.map((group) => (
          <section
            key={group.category}
            className="overflow-hidden rounded-2xl border bg-card shadow-soft"
          >
            <header className="border-b bg-muted/30 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold">
                  {CATEGORY_LABEL[group.category] ?? group.category}
                </h2>
                <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                  flies from {CATEGORY_ROUTE[group.category]}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {CATEGORY_BLURB[group.category]}
              </p>
            </header>

            <ul className="divide-y">
              {group.items.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {row.product ?? `Anything else — ${CATEGORY_LABEL[row.category]?.toLowerCase()}`}
                    </p>
                    {/* The rule's note is an internal memo for the CEO and
                        almost always restates the tier ("Per item, any
                        weight."), so it is not shown here — the tier label
                        already says it, once. */}
                    <p className="text-xs text-muted-foreground">
                      {row.method === "FIXED_PER_ITEM"
                        ? "per item, whatever it weighs"
                        : `per kilogram · ${tierLabel(row)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold tabular-nums">
                      {row.currency} {row.price.toFixed(2)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {row.method === "FIXED_PER_ITEM" ? "each" : "/kg"}
                      </span>
                    </p>
                    {local(row.price) ? (
                      <p className="text-xs text-muted-foreground">
                        ≈ {local(row.price)}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {exchangeRate !== null ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Shilling figures use today&rsquo;s rate of {exchangeRate.toLocaleString()}{" "}
          TZS to the dollar. Your invoice locks the rate on the day it is raised.
        </p>
      ) : null}
    </div>
  );
}
