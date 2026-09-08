"use client";

import { Tag } from "lucide-react";

import { useT } from "@/components/app/locale-provider";

/**
 * WHAT WAS AGREED, BESIDE WHAT THE BOOK SAYS.
 *
 * A large customer is given USD 11.50/kg where the rate book says 12.50. The
 * one thing this must never do is print 11.50 on its own: a bill showing only
 * the agreed figure reads as if that were the price all along, and the fact
 * that somebody granted a discount — and how much of one — disappears out of
 * the record.
 *
 * So it always says all three: the standard rate, the agreed rate, and the
 * difference per kilo or per piece. One component, rendered on the cargo, the
 * bill, the payment panel, the verify dialog and the flight list, so the same
 * discount cannot be described five different ways.
 *
 * Renders nothing when there is no agreed rate, which is almost every
 * consignment — the ordinary case is the rate book, and a badge saying
 * "standard price" on every line would be noise.
 */
export function AgreedRate({
  standard,
  agreed,
  currency,
  perItem = false,
  reason = null,
  className = "",
}: {
  /** The rate book's own rate for this cargo. */
  standard: number | null;
  /** What Finance agreed for this one consignment. */
  agreed: number | null;
  currency: string;
  /** Per-piece cargo is priced per item, not per kilo. */
  perItem?: boolean;
  /** Why, when the desk gave a reason. */
  reason?: string | null;
  className?: string;
}) {
  const t = useT();
  if (agreed === null) return null;

  const unit = perItem ? t("per item") : t("per kg");
  const off =
    standard === null ? null : Math.round((standard - agreed) * 100) / 100;

  return (
    <div
      className={`rounded-md border border-brand/40 bg-brand/[0.07] px-2.5 py-2 text-[11px] leading-relaxed ${className}`}
    >
      <p className="flex items-center gap-1.5 font-semibold text-brand">
        <Tag className="h-3.5 w-3.5 shrink-0" />
        {t("Special rate for this cargo")}
      </p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {standard !== null ? (
          <>
            {t("Standard")}{" "}
            <span className="text-foreground">
              {currency} {standard.toFixed(2)} {unit}
            </span>{" "}
            ·{" "}
          </>
        ) : null}
        {t("Agreed")}{" "}
        <span className="font-semibold text-foreground">
          {currency} {agreed.toFixed(2)} {unit}
        </span>
        {/*
          A CONSIGNMENT WITH NO BOOK RATE ON IT STILL MAY NOT READ AS ITS OWN
          PRICE.

          quotedRate is legitimately null — cargo priced before that column
          existed, and anything the rate book could not quote — and with the
          Standard half missing this line would print "Agreed 11.50 per kg"
          and nothing else, which is exactly the sentence the owner's rule
          forbids. So where the book's own rate is unknown the line says so,
          rather than quietly presenting the agreed figure as the price.
        */}
        {standard === null ? (
          <span className="text-muted-foreground">
            {" · "}
            {t("the rate book's own figure for this cargo was not recorded")}
          </span>
        ) : null}
        {off !== null && Math.abs(off) > 0.005 ? (
          <>
            {" · "}
            <span className={off > 0 ? "text-success" : "text-warning"}>
              {off > 0 ? "−" : "+"}
              {currency} {Math.abs(off).toFixed(2)} {unit}
            </span>
          </>
        ) : null}
      </p>
      {reason ? (
        <p className="mt-0.5 italic text-muted-foreground">“{reason}”</p>
      ) : null}
    </div>
  );
}
