"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Option = { value: string; label: string };

const PERIODS: Option[] = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

/**
 * One row of controls over the register.
 *
 * Selects rather than chips: there are six axes here — type, direction,
 * account, category, person, date — and a chip per value across all six was
 * forty controls fighting for the same line. A select says what it is filtering
 * even when nothing is chosen.
 *
 * Everything lives in the URL. A filtered register is a thing people send to
 * each other — "look at what went through the CRDB account last month" — and
 * that only works if the view has an address.
 */
export function LedgerFilters({
  accounts,
  people,
  kinds,
  categories,
}: {
  accounts: { id: string; name: string }[];
  people: { id: string; name: string }[];
  kinds: Option[];
  categories: Option[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");

  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // A new filter always starts at the first page; staying on page 4 of a
    // narrower result set shows an empty table and looks like a bug.
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/app/finance/transactions?${qs}` : "/app/finance/transactions");
  };

  // Debounced, so the register does not refetch on every keystroke.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (term === current) return;
    const t = setTimeout(() => push({ q: term }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const active =
    params.get("q") ||
    params.get("account") ||
    params.get("direction") ||
    params.get("kind") ||
    params.get("category") ||
    params.get("person") ||
    params.get("period");

  const value = (key: string) => params.get(key) ?? "";

  return (
    <div className="mb-4 rounded-xl border bg-card p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search a receipt, customer, reference, account or person…"
          className="pl-9"
          aria-label="Search the ledger"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <NativeSelect
          aria-label="Type"
          value={value("kind")}
          onChange={(e) => push({ kind: e.target.value })}
          className="h-9 w-auto min-w-[9rem] text-sm"
        >
          <option value="">All types</option>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Direction"
          value={value("direction")}
          onChange={(e) => push({ direction: e.target.value })}
          className="h-9 w-auto min-w-[8rem] text-sm"
        >
          <option value="">In &amp; out</option>
          <option value="IN">In only</option>
          <option value="OUT">Out only</option>
        </NativeSelect>

        <NativeSelect
          aria-label="Account"
          value={value("account")}
          onChange={(e) => push({ account: e.target.value })}
          className="h-9 w-auto min-w-[10rem] text-sm"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Cost category"
          value={value("category")}
          onChange={(e) => push({ category: e.target.value })}
          className="h-9 w-auto min-w-[10rem] text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Recorded by"
          value={value("person")}
          onChange={(e) => push({ person: e.target.value })}
          className="h-9 w-auto min-w-[9rem] text-sm"
        >
          <option value="">Anyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="When"
          value={value("period")}
          onChange={(e) => push({ period: e.target.value })}
          className="h-9 w-auto min-w-[9rem] text-sm"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </NativeSelect>

        {active ? (
          <button
            type="button"
            onClick={() => {
              setTerm("");
              router.push("/app/finance/transactions");
            }}
            className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
