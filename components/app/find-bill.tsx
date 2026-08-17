"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Banknote, Search } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { searchBillable, type BillableHit } from "@/lib/actions/finance";

/**
 * "A customer says they have paid — which bill was it?"
 *
 * Support fields that call all day and had no way in. Finance has had a
 * search-then-record entry point since the money spine was built; this desk had
 * to already know the tracking number, so the answer to "Mama Grace paid, I do
 * not have her number here" was to go and look it up somewhere else first.
 *
 * WHAT THIS IS NOT is a second payment form. Picking a bill navigates to the one
 * record screen, which already behaves correctly for whoever is standing there —
 * Support files a claim for Finance to verify, Finance banks the money outright.
 * Duplicating the form to give Support its own copy would have meant two places
 * to keep in step about currency, evidence and rates, and this app has been bitten
 * four times by exactly that.
 */
export function FindBill() {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BillableHit[]>([]);
  const [searching, startSearch] = useTransition();
  const [open, setOpen] = useState(false);

  const run = (term: string) => {
    setQuery(term);
    if (term.trim().length < 2) {
      setHits([]);
      return;
    }
    startSearch(async () => setHits(await searchBillable(term)));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex min-h-[44px] items-center gap-2 rounded-lg border bg-card px-4 text-sm font-semibold transition-colors hover:bg-accent hover:text-brand"
      >
        <Banknote className="h-4 w-4 text-success" />
        {/* The same words Finance uses for the same act. Two names for one
            thing sends somebody hunting for a button that is in front of them. */}
        {t("Record an income")}
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-xl border bg-card p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => run(event.target.value)}
          placeholder={t("Customer, tracking number, invoice or phone…")}
          className="h-11 pl-9"
        />
      </div>

      {/* Only bills with something owing come back, so the list is already the
          shortlist — no filtering for the reader to do. */}
      {query.trim().length >= 2 ? (
        hits.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {searching
              ? t("Looking…")
              : t("Nothing owing matches that. Check the spelling, or the bill may already be settled.")}
          </p>
        ) : (
          <ul className="divide-y">
            {hits.map((hit) => (
              <li key={hit.invoiceId}>
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/app/collections/record/${hit.invoiceId}`)
                  }
                  className="focus-ring flex w-full items-baseline justify-between gap-3 px-1 py-2 text-left transition-colors hover:bg-accent/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {hit.customerName}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {hit.trackingNumber} · {hit.invoiceNumber} · {hit.goods}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-sm font-bold tabular">
                      {hit.currency} {hit.outstanding.toFixed(2)}
                    </span>
                    {hit.paid > 0.005 ? (
                      <span className="block text-[11px] text-muted-foreground">
                        {t("of")} {hit.total.toFixed(2)}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="px-1 text-xs text-muted-foreground">
          {t("Type a name, a tracking number or a phone number — two letters is enough.")}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setQuery("");
          setHits([]);
        }}
        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
      >
        {t("Never mind")}
      </button>
    </div>
  );
}
