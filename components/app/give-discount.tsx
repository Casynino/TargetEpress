"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Tag } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { applyInvoiceDiscount } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Taking something off the bill without leaving the payment.
 *
 * Discounting is ordinary at this counter — a customer negotiates and the
 * figure moves — and it used to mean abandoning the payment form, opening the
 * invoice, editing it and coming back. It is a link rather than a button
 * because the button row beside it is for the two things that finish the job,
 * and a discount is a change to the bill they are about to settle.
 *
 * The reason is required. Money given away with nothing written against it is
 * exactly what nobody can answer for a year later, and the audit log is where
 * that answer has to live.
 */
export function GiveDiscount({
  invoiceId,
  currency,
  current,
  across = 1,
}: {
  invoiceId: string;
  currency: string;
  /** What is already off the bill, so the box opens on the truth. */
  current: number;
  /** How many bills this covers. One figure, shared out by the server. */
  across?: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<
    ActionResult<{ total: number }>,
    FormData
  >(applyInvoiceDiscount, { ok: true });

  /* Closes itself once the bill has moved — the panel around it re-renders
     with the new figure, and leaving the form open invites a second one. */
  useEffect(() => {
    if (state.ok && state.data) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <Tag className="h-3.5 w-3.5" />
        {current > 0 ? t("Change the discount") : t("Give a discount")}
      </button>
    );
  }

  /*
    PORTALLED, BECAUSE A FORM MAY NOT LIVE INSIDE A FORM.

    The trigger sits in the payment panel, which is itself a form, and a nested
    <form> is invalid HTML — the browser drops the inner one and its fields
    silently join the outer submit. Pressing Apply would have tried to record a
    payment. So the button stays where it is and the form is rendered to the
    body, over the page, where it belongs to nobody.
  */
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
          <Tag className="h-4 w-4 text-brand" />
          {current > 0 ? t("Change the discount") : t("Give a discount")}
        </p>
        {/* Said before it is agreed, not discovered afterwards: one figure off
            the lot, shared out in proportion to what each bill is worth. */}
        {across > 1 ? (
          <p className="text-[11px] text-muted-foreground">
            {t("One figure off all")} {across} {t("bills, split between them by size.")}
          </p>
        ) : null}
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {currency}
        </span>
        <MoneyInput
          name="discount"
          defaultValue={current > 0 ? String(current) : ""}
          placeholder="0"
          className="h-8 text-xs"
          required
          autoFocus
        />
      </div>
      <Input
        name="reason"
        placeholder={t("Why — agreed with the customer, damaged goods…")}
        className="h-8 text-xs"
        required
      />
      <FormError state={state} />
      <div className="flex items-center gap-2">
        <SubmitButton variant="brand" size="sm" pendingLabel="Applying…">
          {t("Apply")}
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
