"use client";

import { useState } from "react";
import { Check, Scale } from "lucide-react";

import { useT } from "@/components/app/locale-provider";

/**
 * WHAT THE CUSTOMER SENT IS NOT WHAT THE BILL SAYS.
 *
 * It rarely is. A bill of 36,450 is answered by 36,000, or by 38,000, because
 * the customer rounded, or the bank took a fee, or they simply sent what they
 * had. Both directions are ordinary and neither is an error to be corrected;
 * what matters is that the recorded payment stays the money that actually
 * arrived, and that the screen says plainly what will happen to the gap.
 *
 * TOO MUCH is nothing to decide. The money is recorded as it came, the bill is
 * settled, the cargo goes. Revenue in this system is derived from the BILL and
 * never from what was handed over, so the excess cannot leak into income by
 * arithmetic — it stays named as an overpayment on the payment and in the
 * ledger, where it can be found. Nothing is held back as customer credit: the
 * owner's rule is to take it, say so, and let the cargo go.
 *
 * TOO LITTLE is a decision, and it used to be two jobs. Every money form ended
 * this notice with a link reading "TZS 36,450 clears it in full", which typed
 * the bill's figure into the amount box — clearing the bill by recording 450
 * shillings that never arrived, then carrying that invented figure onto the
 * receipt, into the account balance and into the ledger. The honest route was
 * to record 36,000 here and then go to the bill's own page to clear the rest,
 * and the half that got forgotten left cargo settled in everybody's head and
 * unreleasable in the system.
 *
 * So: one press, no figure to type and no reason to write. The payment keeps
 * what came in and the remainder is written off in the same transaction. It is
 * a real adjustment and nothing weaker — its own row, its own audit entry,
 * reversible on its own, and NO LEDGER LINE, because no money moved.
 *
 * SUPPORT PRESSES THE SAME BUTTON. The desk on the phone is the desk that
 * hears "that is all I am sending", and a claim that cannot carry it leaves
 * Finance unable to tell a customer still being chased from a bill that is
 * finished. Support's copy of this form submits rather than records, so the
 * tick travels on the claim and Finance confirms it on the verify screen — the
 * same handover as every other figure Support writes down.
 */
export function PaymentDifference({
  /** Signed, in the money being handed over: positive when the customer is
      short, negative when they sent too much. */
  gap,
  /** What is being recorded as received, same money as `gap`. */
  paid,
  /** The money the customer is paying in. */
  tendered,
  /** The bill's own currency, and the gap expressed in it. Said together
      because that is the pair Finance reconciles against. */
  billCurrency,
  gapInBill,
  /** ledger.adjust, or a Support desk whose claim may carry the answer. */
  canClear,
  /** This form submits a claim rather than recording money, so the wording
      says who actually decides. */
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

  /* Sent too much. There is nothing to arm and nothing to ask — the figures
     below are already right, and this only says so out loud before the clerk
     presses Confirm on what looks like the wrong number. */
  if (gap < 0) {
    return (
      <div className="w-full space-y-1 rounded-md border border-success/40 bg-success/[0.08] px-3 py-2.5 text-xs text-success">
        <p className="flex items-start gap-1.5 font-semibold">
          <Check className="mt-px h-3.5 w-3.5 shrink-0" />
          {t("Overpaid by")} {billCurrency} {money(gapInBill, billCurrency)} —{" "}
          {t("the bill is settled in full and the cargo can go.")}
        </p>
        <p className="opacity-90">
          {t(
            "The whole amount is recorded exactly as it came in, and the extra is named as an overpayment on the receipt and in the ledger. Nothing is held back."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-warning">
      <p>
        {t("The customer sent less than the bill.")}{" "}
        {t("This leaves")} {billCurrency} {money(gapInBill, billCurrency)}{" "}
        {t("still owing on the bill.")}
      </p>

      {canClear ? (
        clearRest ? (
          <div className="space-y-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-2 text-success">
            <p className="flex items-start gap-1.5 font-semibold">
              <Check className="mt-px h-3.5 w-3.5 shrink-0" />
              {submitting
                ? t("The bill will be settled once Finance confirms this.")
                : t("The bill will be settled when you confirm.")}
            </p>
            <p className="opacity-90">
              {tendered} {money(paid, tendered)}{" "}
              {t("goes in as the payment, because that is what came in.")}{" "}
              {tendered} {money(gap, tendered)}{" "}
              {t("is cleared off the bill. No money moves for it.")}
            </p>
            <button
              type="button"
              onClick={() => setClearRest(false)}
              className="font-semibold underline underline-offset-2"
            >
              {t("No, leave the balance owing.")}
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setClearRest(true)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-warning px-3 py-2 text-xs font-semibold text-warning-foreground transition hover:opacity-90"
            >
              <Scale className="h-3.5 w-3.5 shrink-0" />
              {t("Clear the last")} {tendered} {money(gap, tendered)}{" "}
              {t("and settle the bill")}
            </button>
            <p className="opacity-90">
              {submitting
                ? t(
                    "Nothing to type. The claim keeps what the customer sent and tells Finance the rest is not coming."
                  )
                : t(
                    "Nothing to type. The payment stays exactly what the customer sent, and the rest is written off the bill in the same step."
                  )}
            </p>
          </>
        )
      ) : null}

      {/*
        Rendered only while the gap is on the screen and the desk has armed it.
        A figure that stops being short must not carry a stale instruction to
        write off a difference that is no longer there — and the action
        recomputes the gap from the database before it clears anything, so this
        can only ever ask, never decide.
      */}
      {clearRest ? <input type="hidden" name="clearShortfall" value="1" /> : null}
    </div>
  );
}
