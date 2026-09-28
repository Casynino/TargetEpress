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
  weightBefore = null,
  weightNow = null,
  pricedOnKg = null,
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
  /**
   * WHAT THE CARGO WEIGHED WHEN IT WAS BOOKED, AND WHAT IT WEIGHS NOW.
   *
   * A price that moved because the warehouse put the box on a scale is a
   * different event from a price somebody agreed, and the owner asked for the
   * two to be told apart on sight: weight changed, price changed, or both.
   * Both null — which is every consignment nobody has re-weighed — and this
   * says nothing about weight at all.
   */
  weightBefore?: number | null;
  weightNow?: number | null;
  /**
   * The weight the BILL was worked out on — the chargeable figure, so the
   * 1 kg minimum is already in it.
   *
   * This is what tells "the kilos moved and the price followed" from "the
   * kilos moved and the price did not": a bill nobody could re-price, because
   * the customer has already paid it, is still standing on the old figure.
   */
  pricedOnKg?: number | null;
  /** One small line for a list row: the same three facts, the explanation
      and the reason on hover. The full box is for a panel with room. */
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  /* The kilos moved if we know both figures and they differ by more than a
     rounding. Guangzhou's declared weight is frozen the first time Dar writes
     its own over it, so this is a real before-and-after, not a guess. */
  const weightMoved =
    weightBefore !== null &&
    weightNow !== null &&
    Math.abs(weightBefore - weightNow) > 0.005;
  if (agreed === null && !weightMoved) return null;

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
    standard === null || agreed === null || switched
      ? null
      : Math.round((standard - agreed) * 100) / 100;

  if (compact) {
    /*
      ONE LINE: WHAT THE PRICE WAS, AND WHAT IT IS NOW.

      The owner's own words for it — "price changed from 40 per pc to 13.5
      per kg". Two labelled lines, and a box before them, each still took
      more of a list row than the fact is worth. The old price comes first
      and quiet, the new one after the arrow and bold; a unit that changed
      needs no note, because "per pc → per kg" is the change. The explanation
      and the reason are on hover.
    */
    const short = (byItem: boolean) => (byItem ? t("per pc") : t("per kg"));
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
    /*
      WHAT CHANGED, IN THE HEADLINE.

      Three states and the owner named all three: the kilos moved and the
      price followed, the kilos moved and the price did not, or a rate was
      agreed with nothing to do with weight. The reader should not have to
      read the figures to work out which of the three they are looking at.
    */
    /* Which figure the bill is standing on. Chargeable, so a 0.4 kg parcel
       billed at the 1 kg minimum is not read as a bill that ignored the
       scale. Unknown means we cannot claim the price followed. */
    const chargeable = (kg: number) => Math.max(kg, 1);
    const priceFollowed =
      weightMoved &&
      pricedOnKg !== null &&
      Math.abs(pricedOnKg - chargeable(weightNow!)) <=
        Math.abs(pricedOnKg - chargeable(weightBefore!));
    /* The owner's own words for it: "KG Changed — Price Affected". Said that
       way only where the price really did follow — on a bill somebody has
       already paid it cannot, and claiming otherwise on the one line Finance
       reads before ringing a customer would be a lie about money. */
    const headline = weightMoved
      ? priceFollowed
        ? t("KG changed — price affected")
        : t("KG changed — price unchanged")
      : t("Price changed");
    return (
      <span
        title={detail}
        className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] leading-4 tabular-nums ${className}`}
      >
        <Tag className="h-3 w-3 shrink-0 text-brand" aria-hidden />
        <span className="font-medium text-brand">{headline}:</span>
        {weightMoved ? (
          <>
            <span className="text-muted-foreground">
              {weightBefore!.toFixed(weightBefore! % 1 === 0 ? 0 : 1)} kg
            </span>
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
            <span className="font-semibold text-foreground">
              {weightNow!.toFixed(weightNow! % 1 === 0 ? 0 : 1)} kg
            </span>
          </>
        ) : null}
        {weightMoved && agreed !== null ? (
          <span className="text-muted-foreground" aria-hidden>
            ·
          </span>
        ) : null}
        {agreed !== null && standard !== null ? (
          <>
            <span className="text-muted-foreground">
              {currency} {standard.toFixed(2)} {short(bookByItem)}
            </span>
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
          </>
        ) : null}
        {agreed !== null ? (
          <span className="font-semibold text-foreground">
            {currency} {agreed.toFixed(2)} {short(perItem)}
          </span>
        ) : null}
        {agreed !== null && standard === null ? (
          <span className="text-muted-foreground">({t("normal price not recorded")})</span>
        ) : null}
      </span>
    );
  }

  /* The full box explains an agreed rate. A re-weigh with no agreement has
     nothing for it to say, and the compact line above already said it. */
  if (agreed === null) return null;

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
