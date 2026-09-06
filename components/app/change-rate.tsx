"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { changeInvoiceRate } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Re-quoting this consignment's bill at a rate the counter agreed.
 *
 * It used to be a link away to the invoice page, which meant leaving a
 * half-filled payment to change one number and finding your way back. It is
 * the same dialog the discount uses, for the same reason: both are changes to
 * the BILL made from the form that is about to settle it.
 *
 * Portalled, because the trigger sits inside the payment form and a nested
 * <form> is invalid HTML — the browser drops the inner one and its fields
 * silently join the outer submit.
 */
export function ChangeRate({
  invoiceId,
  currency,
  current,
  total,
  across = 1,
  onSaved,
}: {
  invoiceId: string;
  /** The currency the bill is priced in — the FROM side of the rate. */
  currency: string;
  /** The rate frozen on this bill, so the box opens on the truth. */
  current: number | null;
  /** The bill's own total, to show what the new rate makes of it. */
  total: number;
  /** How many bills this rate lands on. */
  across?: number;
  /**
   * Called once the change has actually saved.
   *
   * A screen holding the bill in SERVER props gets the new figures for free —
   * these actions revalidate the pages that render them. A screen holding it
   * in CLIENT state does not: the dialog closes, the bill has moved, and every
   * figure around it is still the old one. The Record Payment dialog is that
   * second kind, and its money box follows the outstanding balance — so a
   * discount agreed inside it would be followed by a payment for the
   * pre-discount amount.
   */
  onSaved?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(current === null ? "" : String(current));

  /*
    THE BOX FOLLOWS THE BILLS IT IS POINTED AT.

    On the merge screen this component stays mounted while the desk ticks and
    unticks consignments, and `current` changes underneath it — but the box
    kept whatever it was seeded with from the FIRST bill ticked. Applying it
    then wrote that bill's rate onto every other bill in the set, silently
    restating them all.

    Resynced when the incoming rate changes, and only while the dialog is shut
    so a half-typed figure is never yanked out from under the person typing it.
  */
  useEffect(() => {
    if (!open) setRate(current === null ? "" : String(current));
  }, [current, open]);
  const [state, action] = useActionState<
    ActionResult<{ totalLocal: number | null }>,
    FormData
  >(changeInvoiceRate, { ok: true });

  useEffect(() => {
    if (state.ok && state.data) {
      setOpen(false);
      onSaved?.();
    }
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        {t("Change the rate")}
      </button>
    );
  }

  /* What the bill becomes, worked out as they type — the whole point of
     changing it is the figure at the bottom, so it is not left to be
     discovered after saving. */
  const typed = Number(rate);
  const preview =
    Number.isFinite(typed) && typed > 0
      ? `${currency} ${total.toFixed(2)} = TZS ${Math.round(total * typed).toLocaleString("en-US")}`
      : null;

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <form
        action={action}
        className="w-full max-w-sm space-y-2.5 rounded-xl border bg-card p-4 shadow-lg"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <ArrowLeftRight className="h-4 w-4 text-brand" />
          {t("Change the rate")}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {across > 1
            ? `${t("All")} ${across} ${t("bills. The dollar totals do not move — only what they come to in shillings.")}`
            : t("This bill only. The dollar total does not move — only what it comes to in shillings.")}
        </p>
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {currency} 1 =
          </span>
          <MoneyInput
            name="exchangeRate"
            value={rate}
            onValueChange={setRate}
            placeholder="2700"
            className="h-8 text-xs"
            required
            autoFocus
          />
        </div>
        {preview ? (
          <p className="rounded-md border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            {preview}
          </p>
        ) : null}
        <Input
          name="reason"
          placeholder={t("Note (optional) — agreed at the counter, bank rate on the day…")}
          className="h-8 text-xs"
        />
        <FormError state={state} />
        <div className="flex items-center gap-2">
          <SubmitButton variant="brand" size="sm" className="px-2.5" pendingLabel="Saving…">
            {t("Save")}
          </SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("Cancel")}
          </button>
        </div>
      </form>
    </div>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(dialog, document.body);
}
