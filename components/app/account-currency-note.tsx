"use client";

import { useT } from "@/components/app/locale-provider";

/**
 * Where the account somebody is looking for went.
 *
 * The picker only offers accounts held in the currency being paid, which is a
 * physical fact rather than a rule: shillings cannot be put into a dollar
 * account. It filtered in silence, so a desk hunting for "Office cash (USD)"
 * saw it simply missing — archived? not allowed? broken? — and the true answer
 * was none of those.
 *
 * Saying only "some accounts are hidden" was not enough either: the reader is
 * looking for a NAME, so the line names it, says which currency it is held in,
 * and says the one thing that brings it back.
 */
export function AccountCurrencyNote({
  currency,
  hidden,
}: {
  /** The currency the money is being taken in. */
  currency: string;
  /** The accounts the currency filter is holding back. */
  hidden: { name: string; currency: string }[];
}) {
  const t = useT();
  if (hidden.length === 0) return null;

  /* Named, up to two of them. Beyond that the list is longer than the
     sentence, and the currency is the part that matters. */
  const named = hidden.slice(0, 2).map((a) => a.name).join(", ");
  const rest = hidden.length - Math.min(2, hidden.length);
  const others = [...new Set(hidden.map((a) => a.currency))].join(", ");

  /* One sentence, not a row of fragments: Chinese does not put the pieces back
     together in English's order, and a note this short must still read as a
     sentence in both. */
  return (
    <p className="text-[11px] text-muted-foreground">
      {t("{names} are {other} accounts — switch Paid in.")
        .replace("{names}", named + (rest > 0 ? ` +${rest}` : ""))
        .replace("{other}", others)}
    </p>
  );
}
