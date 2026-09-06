"use client";

import { useState } from "react";
import { Check, Scale, TriangleAlert, Undo2 } from "lucide-react";

import { useT } from "@/components/app/locale-provider";

/**
 * WHAT THE CUSTOMER SENT IS NOT WHAT THE BILL SAYS.
 *
 * It rarely is. A bill of 36,450 is answered by 36,000, or by 38,000, because
 * the customer rounded, or the bank took a fee, or they sent what they had.
 * Both directions are ordinary and neither is an error to be corrected; what
 * matters is that the recorded payment stays the money that actually arrived,
 * and that one line says what happens to the gap.
 *
 * ONE LINE, DELIBERATELY. This began as a paragraph — what the button would
 * do, what would be recorded, what would not move — and the owner's answer was
 * that the office already knows all of that. Prose in the middle of a form is
 * read once and skipped for ever after, while the figures beside it are read
 * every time. So the figures lead and the words stop.
 *
 * TOO MUCH is nothing to decide. Revenue here derives from the BILL and never
 * from what was handed over, so the excess cannot leak into income by
 * arithmetic — it stays named as an overpayment on the payment and in the
 * ledger. Nothing is held back as customer credit.
 *
 * TOO LITTLE is one press: the payment keeps what came in and the remainder is
 * written off in the same transaction — its own row, its own audit entry,
 * reversible on its own, and no ledger line, because no money moved.
 *
 * SUPPORT PRESSES THE SAME BUTTON. Her form submits rather than records, so
 * the tick travels on the claim and Finance confirms it on the verify screen.
 */
export function PaymentDifference({
  /** Signed, in the money being handed over: positive when short. */
  gap,
  /** What is being recorded as received, same money as `gap`. */
  paid,
  tendered,
  /** The bill's own currency, and the gap in it — the pair Finance
      reconciles against. */
  billCurrency,
  gapInBill,
  /** ledger.adjust, or a Support desk whose claim may carry the answer. */
  canClear,
  /** This form submits a claim rather than recording money. */
  submitting = false,
  /**
   * Told when the desk arms or disarms the tick.
   *
   * The cargo panel needs nothing back — the flag rides on a hidden input and
   * the payment is one bill. The merge screen does: arming it there reduces
   * one bill's allocation by the gap, so the allocations still sum to the
   * money that arrived, and the parent has to know in order to send them.
   */
  onArmedChange,
}: {
  gap: number;
  paid: number;
  tendered: string;
  billCurrency: string;
  gapInBill: number;
  canClear: boolean;
  submitting?: boolean;
  onArmedChange?: (armed: boolean) => void;
}) {
  const t = useT();
  const [clearRest, setClearRest] = useState(false);
  const arm = (on: boolean) => {
    setClearRest(on);
    onArmedChange?.(on);
  };

  const money = (value: number, currency: string) =>
    Math.abs(value).toLocaleString(undefined, {
      maximumFractionDigits: currency === "TZS" ? 0 : 2,
    });

  /* Both monies when they differ — the desk works in shillings and the bill is
     written in dollars, and one figure in the wrong one is a figure somebody
     has to convert in their head. */
  const both =
    tendered === billCurrency
      ? `${billCurrency} ${money(gapInBill, billCurrency)}`
      : `${tendered} ${money(gap, tendered)} · ${billCurrency} ${money(gapInBill, billCurrency)}`;

  /*
    THE STATE IS THE KEY, SO THE ARRIVAL REPLAYS.

    React keeps the same DOM node when only the text inside it changes, and a
    CSS animation on a node that was never remounted does not run again. So
    going short → cleared → overpaid would animate once and then change
    silently. Keying on the state remounts the row, and each new answer arrives
    the way the first one did.
  */
  const state = gap < 0 ? "over" : clearRest ? "armed" : "short";
  const tone =
    state === "short"
      ? {
          ring: "hsl(var(--warning) / 0.55)",
          cls: "border-warning/40 bg-warning/10 text-warning",
          /* Spelt out per state rather than bg-current/15: Tailwind gives
             currentColor no opacity scale, so that class compiled to nothing
             and the icon sat on the panel with no disc behind it at all. */
          disc: "bg-warning/20",
        }
      : {
          ring: "hsl(var(--success) / 0.55)",
          cls: "border-success/40 bg-success/[0.08] text-success",
          disc: "bg-success/20",
        };

  /*
    TEXT ON TOP, THE PRESS UNDERNEATH IT.

    This was one row, and one row is what it kept failing to be: the panel it
    lives in is a narrow column, so the line broke and the button fell to the
    next line pushed hard right by the space it had left over — landing in a
    different place on every screen, at a different width, for no reason a
    reader could see.

    Stacked, nothing is left to chance. The icon and the figure hold the top
    line, the text wraps under itself in its own column rather than under the
    icon, and the one thing to press sits centred beneath, the same size and
    the same place every time.
  */
  const shell = `money-notice w-full rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${tone.cls}`;
  /* A fixed first column, so a second line of text tucks under the first line
     of text and never under the icon. */
  const row = "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2";
  const disc = `mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded-full ${tone.disc}`;
  const figure = "font-semibold tabular-nums";
  /* Small, round and quiet. The old one was a full-height rectangle in solid
     amber — a button that shouted about a rounding error. */
  const press =
    "focus-ring inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition active:scale-[0.97]";

  if (state === "over") {
    return (
      <div
        key={state}
        className={shell}
        style={{ "--flash": tone.ring } as React.CSSProperties}
      >
        <div className={row}>
          <span className={disc}>
            <Check className="h-3 w-3" />
          </span>
          <span className="min-w-0">
            <span className={figure}>
              {t("Overpaid")} {both} ·
            </span>
            {/* Its own line on purpose. The figure is what gets read; the
                sentence after it is the reassurance, and putting the two on
                one line made a long line that wrapped in the middle of a
                number. */}
            <span className="block opacity-80">
              {t("Bill settled, cargo can go")}
            </span>
          </span>
        </div>
      </div>
    );
  }

  if (state === "armed") {
    return (
      <div
        key={state}
        className={shell}
        style={{ "--flash": tone.ring } as React.CSSProperties}
      >
        <div className={row}>
          <span className={disc}>
            <Check className="h-3 w-3" />
          </span>
          <span className="min-w-0">
            <span className={figure}>
              {submitting ? t("Finance clears") : t("Clearing")} {both} ·
            </span>
            <span className="block opacity-80">
              {tendered} {money(paid, tendered)} {t("recorded")}
            </span>
          </span>
        </div>
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => arm(false)}
            className={`${press} border border-success/40 opacity-90 hover:opacity-100`}
          >
            <Undo2 className="h-3 w-3 shrink-0" />
            {t("Undo")}
          </button>
        </div>
        <input type="hidden" name="clearShortfall" value="1" />
        {/* The figure on the button, travelling with the tick, so the action
            can never write off more than the desk was shown. */}
        <input
          type="hidden"
          name="clearShortfallUpTo"
          value={Math.max(0, gapInBill).toFixed(2)}
        />
      </div>
    );
  }

  return (
    <div
      key={state}
      className={shell}
      style={{ "--flash": tone.ring } as React.CSSProperties}
    >
      <div className={row}>
        <span className={disc}>
          <TriangleAlert className="h-3 w-3" />
        </span>
        <span className={`min-w-0 ${figure}`}>
          {t("Short")} {both}
        </span>
      </div>
      {canClear ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => arm(true)}
            className={`${press} bg-warning text-warning-foreground shadow-sm hover:brightness-110`}
          >
            <Scale className="h-3 w-3 shrink-0" />
            {t("Clear it")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
