"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Clock } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { TermDaysField } from "@/components/app/term-days-field";
import { Input } from "@/components/ui/input";
import { requestCredit } from "@/lib/actions/credit";
import type { ActionResult } from "@/lib/actions/types";

/**
 * "This customer wants to take the cargo now and pay later."
 *
 * The desk that hears that sentence is Support, on the phone, and this is where
 * they pass it on. Asking commits nothing: the cargo does not move, the bill does
 * not change, and the terms are chosen HERE rather than at approval so Finance is
 * answering a specific question — may this customer have 30 days on USD 500 —
 * instead of being handed a blank authority to invent both the amount and the
 * deadline.
 *
 * Support cannot approve what it asks for. That is enforced in the action, twice:
 * by permission, and by refusing anybody who approves their own request. This
 * component just never pretends otherwise — it says who decides, so nobody sits
 * waiting for a button that is not theirs.
 */
export function CreditRequest({
  invoiceId,
  outstanding,
  defaultTerm,
  /** Their limit and what is already against it, so the ask is informed. */
  limitLabel,
  outstandingLabel,
  startOpen,
  canApprove,
}: {
  invoiceId: string;
  outstanding: string;
  defaultTerm: number;
  limitLabel: string | null;
  outstandingLabel: string | null;
  /**
   * Skip the button and show the form.
   *
   * On the payment screen the choice has already been made by pressing "Taking
   * it on credit" — asking somebody to then press a second button that says the
   * same thing is a step that exists only because two components met.
   */
  startOpen?: boolean;
  /**
   * The reader already holds the approval authority.
   *
   * Finance sending itself a request was ceremony: raise it here, walk to another
   * page, approve your own. When the person acting can grant it, one press grants
   * it — and the words have to say so, or they will press it expecting a queue.
   */
  canApprove?: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    requestCredit,
    undefined
  );
  const [open, setOpen] = useState(startOpen ?? false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-brand"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        {/* The word matches the authority. Finance saw "Ask for credit" and
            expected a queue; their press grants it, and the button has to say
            so before it is pressed, not after. */}
        {canApprove ? t("Release on credit") : t("Ask for credit")}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2 rounded-lg border bg-card p-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <p className="text-xs font-semibold">
        {canApprove ? t("Release on credit") : t("Ask Finance for credit")} ·{" "}
        {outstanding}
      </p>

      {/* Where they already stand. A request made without this is a request
          Finance has to research before it can answer. */}
      {limitLabel || outstandingLabel ? (
        <p className="text-[11px] text-muted-foreground">
          {outstandingLabel ? `${t("Already owes")} ${outstandingLabel}` : null}
          {outstandingLabel && limitLabel ? " · " : null}
          {limitLabel ? `${t("limit")} ${limitLabel}` : t("no credit limit set")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {t("Terms")}
          <TermDaysField defaultValue={String(defaultTerm)} />
        </label>
      </div>

      <Input
        name="note"
        placeholder={t("Why are they asking? Finance reads this.")}
        className="h-8 text-xs"
      />

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          size="sm"
          className={
            canApprove ? "h-8 bg-warning text-xs text-white" : "h-8 text-xs"
          }
        >
          {canApprove ? t("Release it on credit") : t("Send to Finance")}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("Never mind")}
        </button>
      </div>

      {/* Said plainly, because the alternative is somebody telling a customer
          the cargo is ready when nothing has been agreed yet. */}
      <p className="text-[11px] text-muted-foreground">
        {canApprove
          ? t(
              "Granted the moment you press it, in your name, with the due date counted from today. The bill stays owed until the customer pays — it is a sale, not a payment."
            )
          : t(
              "Finance decides. Until they approve it the cargo stays where it is, and whoever raises a request cannot be the one who approves it."
            )}
      </p>

      <FormError state={state} />
    </form>
  );
}
