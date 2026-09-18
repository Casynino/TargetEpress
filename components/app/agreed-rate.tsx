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
  bookPerItem,
  reason = null,
  compact = false,
  className = "",
}: {
  /** The rate book's own rate for this cargo. */
  standard: number | null;
  /** What Finance agreed for this one consignment. */
  agreed: number | null;
  currency: string;
  /** The unit the agreed rate is in — what the bill is charged in now. */
  perItem?: boolean;
  /** The rate book's own unit, which `standard` is quoted in. Defaults to
      `perItem` for a caller that has not been told the two can differ. */
  bookPerItem?: boolean;
  /** Why, when the desk gave a reason. */
  reason?: string | null;
  /** One small line for a list row: the same three facts, the explanation
      and the reason on hover. The full box is for a panel with room. */
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  if (agreed === null) return null;

  const unit = perItem ? t("per item") : t("per kg");
  const bookByItem = bookPerItem ?? perItem;
  const bookUnit = bookByItem ? t("per item") : t("per kg");
  /*
    CHARGED IN THE OTHER UNIT, SAID IN SO MANY WORDS.

    Two documents the book prices at 40.00 a piece, agreed at 13.50 a kilo. Set
    side by side with one difference after them, that read as "−26.50" — a
    discount on a figure it is not a discount on. A rate in one unit and a rate
    in the other have no difference to print, so the line names the switch
    instead, and the bill's own total says what it came to.
  */
  const switched = perItem !== bookByItem;
  const off =
    standard === null || switched
      ? null
      : Math.round((standard - agreed) * 100) / 100;

  if (compact) {
    /*
      TWO SHORT LINES, IN THE WORDS THE DESK SAYS ON THE PHONE.

      This used to be one pill — "USD 13.50/kg · book 40.00/item · unit
      changed" — and the owner could not read it at a glance: "book" is our
      word for the rate book, not his, and "unit changed" did not say changed
      from what to what. So each figure gets a plain label, the units are
      written out, and the normal price sits directly under the special one.
      When the two are in different units, "per kg" over "per item" is the
      change itself, so the units are what gets coloured — a separate note
      saying so wrapped onto a third line in a list column.

      Still only as tall as it must be on a hundred-row queue, and no box: a
      thin bar marks it as a note about the cargo, not a button.
    */
    const detail = [
      t("Special rate for this cargo"),
      switched
        ? perItem
          ? t("Charged per item — the rate book prices it per kg")
          : t("Charged per kg — the rate book prices it per item")
        : null,
      reason ? `“${reason}”` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const unitTone = switched ? "font-medium text-warning" : "";
    return (
      <div
        title={detail}
        className={`grid w-fit grid-cols-[auto_auto] items-baseline gap-x-2 whitespace-nowrap border-l-2 border-brand/60 pl-2 text-[11px] leading-4 tabular-nums ${className}`}
      >
        <span className="font-medium text-brand">{t("Special price")}</span>
        <span className="flex items-baseline gap-x-1.5">
          <span className="font-semibold text-foreground">
            {currency} {agreed.toFixed(2)} <span className={unitTone}>{unit}</span>
          </span>
          {/* A signed figure, not "1.00 less": the words pushed the difference
              onto a line of its own in a list column. */}
          {off !== null && Math.abs(off) > 0.005 ? (
            <span className={off > 0 ? "text-success" : "text-warning"}>
              {off > 0 ? "−" : "+"}
              {Math.abs(off).toFixed(2)}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground">{t("Normal price")}</span>
        <span className="text-muted-foreground">
          {standard !== null ? (
            <>
              {currency} {standard.toFixed(2)} <span className={unitTone}>{bookUnit}</span>
            </>
          ) : (
            t("not recorded")
          )}
        </span>
      </div>
    );
  }

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
              {currency} {standard.toFixed(2)} {bookUnit}
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
      {switched ? (
        <p className="mt-1 inline-flex rounded bg-warning/15 px-1.5 py-px font-semibold text-warning">
          {perItem
            ? t("Charged per item — the rate book prices it per kg")
            : t("Charged per kg — the rate book prices it per item")}
        </p>
      ) : null}
      {reason ? (
        <p className="mt-0.5 italic text-muted-foreground">“{reason}”</p>
      ) : null}
    </div>
  );
}
