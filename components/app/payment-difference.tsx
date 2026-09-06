"use client";

import { useState } from "react";
import { Check, Scale } from "lucide-react";

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
}: {
  gap: number;
  paid: number;
  tendered: string;
  billCurrency: string;
  gapInBill: number;
  canClear: boolean;
  submitting?: boolean;
}) {
  const t = useT();
  const [clearRest, setClearRest] = useState(false);

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

  const row =
    "flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-2.5 py-2 text-xs";

  if (gap < 0) {
    return (
      <div className={`${row} border-success/40 bg-success/[0.08] text-success`}>
        <Check className="h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-semibold">{t("Overpaid")} {both}</span>
          {" · "}
          {t("bill settled, cargo can go")}
        </span>
      </div>
    );
  }

  if (clearRest) {
    return (
      <div className={`${row} border-success/40 bg-success/[0.08] text-success`}>
        <Check className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold">
          {submitting ? t("Finance clears") : t("Clearing")} {both}
        </span>
        <span className="opacity-80">
          · {tendered} {money(paid, tendered)} {t("recorded")}
        </span>
        <button
          type="button"
          onClick={() => setClearRest(false)}
          className="focus-ring ml-auto rounded underline underline-offset-2"
        >
          {t("Undo")}
        </button>
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
    <div className={`${row} border-warning/40 bg-warning/10 text-warning`}>
      <span>
        <span className="font-semibold">{t("Short")} {both}</span>
      </span>
      {canClear ? (
        <button
          type="button"
          onClick={() => setClearRest(true)}
          className="focus-ring ml-auto inline-flex items-center gap-1.5 rounded-md bg-warning px-2.5 py-1 font-semibold text-warning-foreground transition hover:opacity-90"
        >
          <Scale className="h-3.5 w-3.5 shrink-0" />
          {t("Clear it")}
        </button>
      ) : null}
    </div>
  );
}
