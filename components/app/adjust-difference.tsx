"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Scale, TriangleAlert } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { adjustDifference } from "@/lib/actions/invoice-adjustments";
import { isLargeAdjustment } from "@/lib/invoice-balance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * CLEARING WHAT IS NEVER GOING TO ARRIVE.
 *
 * A bill comes to 4,424,625 and the transfer says 4,424,000. The 625 is a
 * rounding at the other end, or a bank fee, or simply what the customer sent.
 * Somebody has to be able to close the bill without inventing 625 shillings.
 *
 * ONE BUTTON, AN AMOUNT, AN OPTIONAL NOTE, CONFIRM — the owner was explicit,
 * and the box opens with the whole difference already in it, so the ordinary
 * case is two clicks and no typing. There is no approval step, no pending
 * state and no maximum: Finance judges whether a difference should be cleared.
 *
 * A large one is FLAGGED, not blocked. The warning appears as the figure is
 * typed and the button stays live underneath it — the flag exists so that
 * management can find the decision afterwards, not so the system can argue
 * with the person making it.
 *
 * This is NOT a payment. Nothing reaches an account; it only closes the
 * customer's balance, and the payment row goes on saying what actually
 * arrived.
 */
export function AdjustDifference({
  invoiceId,
  currency,
  balance,
  total,
  money,
}: {
  invoiceId: string;
  currency: string;
  /** What is still owed — the figure the box opens on. */
  balance: number;
  /** The bill, for deciding whether a figure is large enough to flag. */
  total: number;
  /** How this screen writes money, so the dialog speaks its host's units. */
  money: (value: number) => string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(balance));
  const [state, action] = useActionState<
    ActionResult<{ amount: number; large: boolean }>,
    FormData
  >(adjustDifference, { ok: true });

  /* Closed once it lands. The page revalidates with the balance gone, and a
     form left open invites a second clearing of a difference that no longer
     exists. */
  useEffect(() => {
    if (state.ok && state.data) setOpen(false);
  }, [state]);

  /* Re-opens on the current difference. The balance moves when a payment is
     recorded, and the box must not remember a figure from before it did. */
  useEffect(() => {
    if (!open) setAmount(String(balance));
  }, [open, balance]);

  if (balance <= 0.005) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <Scale className="h-3.5 w-3.5" />
        {t("Adjust the difference")}
      </button>
    );
  }

  const typed = Math.max(0, Number(amount) || 0);
  const large = typed > 0 && isLargeAdjustment(typed, total, currency);
  const over = typed > balance + 0.005;

  /* Portalled: the trigger sits inside the payment form, and a form inside a
     form is invalid HTML — the browser drops the inner one and its fields join
     the outer submit, so Confirm would have recorded a payment. */
  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <form
        action={action}
        className="w-full max-w-sm space-y-3 rounded-xl border bg-card p-4 shadow-lg"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Scale className="h-4 w-4 text-brand" />
          {t("Adjust the difference")}
        </p>

        <input type="hidden" name="invoiceId" value={invoiceId} />

        {/* What is being closed, before it is closed. */}
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("Still owing")}:{" "}
          <span className="font-semibold text-foreground">{money(balance)}</span>
        </p>

        <div className="space-y-1">
          <label htmlFor="adjustAmount" className="text-xs font-medium">
            {t("Clear how much?")}
          </label>
          <MoneyInput
            id="adjustAmount"
            name="amount"
            decimals={currency === "TZS" ? 0 : 2}
            value={amount}
            onValueChange={setAmount}
            required
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="adjustReason" className="text-xs font-medium">
            {t("Why? (optional)")}
          </label>
          <Input
            id="adjustReason"
            name="reason"
            placeholder={t("e.g. bank charge on the transfer")}
            className="h-9 text-sm"
          />
        </div>

        {/*
          FLAG, DO NOT BLOCK. The button below stays live: this says the figure
          is unusual so it can be found later, and says nothing about whether
          it is right — that is the judgement of the person reading it.
        */}
        {large && !over ? (
          <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-semibold">
                {t("Large adjustment")} — {money(typed)}
              </span>{" "}
              {t("This will be flagged for management to review.")}
            </span>
          </p>
        ) : null}

        {over ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
            {t("That is more than the bill still owes.")}
          </p>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          {t(
            "This closes the balance. No money moves and the payment stays exactly as it was."
          )}
        </p>

        <FormError state={state} />

        <div className="flex items-center gap-2">
          <SubmitButton size="sm" variant="brand" disabled={over || typed <= 0} pendingLabel="Clearing…">
            {t("Confirm")}
          </SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("Cancel")}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <Scale className="h-3.5 w-3.5" />
        {t("Adjust the difference")}
      </button>
      {typeof document !== "undefined"
        ? createPortal(dialog, document.body)
        : null}
    </>
  );
}
