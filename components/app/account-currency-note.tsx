"use client";

import { useT } from "@/components/app/locale-provider";

/**
 * Why an account somebody is looking for is not in the list.
 *
 * The account picker only offers accounts held in the currency being paid,
 * which is a physical fact rather than a rule: shillings cannot be put into a
 * dollar account. But it filtered silently, so a desk hunting for "Office cash
 * (USD)" saw it simply missing and had no way to know whether it had been
 * archived, whether their role could not see it, or whether something was
 * broken. Three wrong explanations, none of them the true one.
 *
 * One line, only when something is actually hidden, naming the way out.
 */
export function AccountCurrencyNote({
  currency,
  hidden,
}: {
  /** The currency the money is being taken in. */
  currency: string;
  /** How many accounts the currency filter is holding back. */
  hidden: number;
}) {
  const t = useT();
  if (hidden < 1) return null;

  return (
    <p className="text-[11px] text-muted-foreground">
      {t("Only {currency} accounts are listed, because {currency} cannot land in an account held in another currency. Change what it was paid in to see the rest.").replace(
        /\{currency\}/g,
        currency
      )}
    </p>
  );
}
