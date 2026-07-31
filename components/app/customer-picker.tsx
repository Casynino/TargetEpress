"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserCheck, UserPlus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TZ_CITIES } from "@/lib/constants";

export type PickedCustomer = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  city: string | null;
  shipments: number;
};

/**
 * Choose an existing customer, or record a new one.
 *
 * Consolidated cargo arrives for the same traders week after week, so searching
 * first is the common case and typing a new record is the exception. Both are
 * one click apart.
 *
 * Searching by name matters as much as by number: a Guangzhou packing list
 * often carries a name and no phone, and 18 of the customers already in the
 * book have no number at all. A phone-only lookup simply cannot find them.
 */
export function CustomerPicker({
  onPick,
}: {
  /** Notifies the parent form so it can clear itself between registrations. */
  onPick?: (customer: PickedCustomer | null) => void;
}) {
  const [mode, setMode] = useState<"search" | "new">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PickedCustomer | null>(null);
  const [touched, setTouched] = useState(false);

  // New-customer fields, controlled so switching modes does not strand values.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    // Debounced: the desk types fast and every keystroke would otherwise be a
    // query against the whole customer book.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/customers/search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { customers: PickedCustomer[] };
        setResults(data.customers);
      } catch {
        // Aborted or offline. The clerk can still record a new customer.
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const pick = (customer: PickedCustomer | null) => {
    setPicked(customer);
    setTouched(true);
    onPick?.(customer);
    if (customer) setQuery("");
  };

  /* ------------------------------------------------- a customer is chosen */

  if (picked) {
    return (
      <div className="space-y-2">
        {/* The id is what the server uses. Name and phone ride along so the
            shipment still records who it was for even if the row is later
            renamed. */}
        <input type="hidden" name="customerId" value={picked.id} />
        <input type="hidden" name="customerName" value={picked.name} />
        <input type="hidden" name="customerPhone" value={picked.phone ?? ""} />
        <input type="hidden" name="customerCity" value={picked.city ?? ""} />

        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium">
              <UserCheck className="h-4 w-4 text-success" />
              {picked.name}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {picked.code}
              {picked.phone ? ` · ${picked.phone}` : " · no phone on file"}
              {picked.city ? ` · ${picked.city}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {picked.shipments === 0
                ? "No cargo shipped yet"
                : `${picked.shipments} shipment${picked.shipments === 1 ? "" : "s"} with us`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              pick(null);
              setMode("search");
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
            Change
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------ nobody chosen yet */

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border p-1">
        {(
          [
            { key: "search", label: "Find a customer", Icon: Search },
            { key: "new", label: "New customer", Icon: UserPlus },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors ${
              mode === key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === "search" ? (
        <div className="space-y-2">
          <Label htmlFor="customer-search">Search by name, phone or customer ID</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="customer-search"
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Mama Zainab, 0762 000 111 or CUS-000123"
              className="pl-9"
              autoComplete="off"
            />
            {searching ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          {results.length > 0 ? (
            <ul className="divide-y overflow-hidden rounded-lg border">
              {results.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => pick(customer)}
                    className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{customer.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {customer.code}
                        {customer.phone ? ` · ${customer.phone}` : " · no phone"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {customer.shipments} shipment
                      {customer.shipments === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {query.trim().length >= 2 && !searching && results.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="text-sm">
                No customer matches &ldquo;{query.trim()}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => {
                  // Carry what they typed across, so nothing is retyped.
                  const term = query.trim();
                  if (/\d/.test(term)) setPhone(term);
                  else setName(term);
                  setMode("new");
                }}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Record them as a new customer
              </button>
            </div>
          ) : null}

          {query.trim().length < 2 ? (
            <p className="text-xs text-muted-foreground">
              Start typing a name or number. Everyone the China desk has ever
              registered cargo for is in here.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customerName">Name or company</Label>
            <Input
              id="customerName"
              name="customerName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Trader or business name"
              required={mode === "new"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerPhone">
              Phone number{" "}
              <span className="font-normal text-muted-foreground">optional</span>
            </Label>
            <Input
              id="customerPhone"
              name="customerPhone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="0762 000 111"
              inputMode="tel"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Leave it blank if the packing list has none — plenty do.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerCity">City in Tanzania</Label>
            <Input
              id="customerCity"
              name="customerCity"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              list="tz-cities"
              placeholder="Dar es Salaam"
            />
            <datalist id="tz-cities">
              {TZ_CITIES.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          <p className="text-xs text-muted-foreground sm:col-span-2">
            Saved to the customer book on registration. Next time, find them by
            name or number instead of typing this again.
          </p>
        </div>
      )}

      {touched && !picked && mode === "search" ? (
        <p className="text-xs text-destructive">
          Choose a customer, or switch to &ldquo;New customer&rdquo;.
        </p>
      ) : null}
    </div>
  );
}
