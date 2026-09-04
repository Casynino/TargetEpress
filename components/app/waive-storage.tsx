"use client";

import { createPortal } from "react-dom";
import { useActionState, useEffect, useState } from "react";
import { Ban } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { waiveStorageFee } from "@/lib/actions/storage";
import type { ActionResult } from "@/lib/actions/types";

/**
 * TAKING THE STORAGE FEE OFF, WHERE THE MONEY IS BEING TAKEN.
 *
 * The decision lived on the cargo page alone. A customer standing at the
 * counter with a bill carrying nine late days meant leaving the payment form,
 * finding the consignment, forgiving the fee, and coming back to a form that
 * had to be filled in again — so in practice the desk either sent them away or
 * took the fee it had already agreed to drop.
 *
 * The amount is never typed. It is whatever the clock accrued, which is the
 * whole reason this is safe to put in front of the counter: the only answer
 * available is yes. The reason is required, because "why was a twelve-day
 * consignment not charged" is the first question asked about this record later.
 *
 * Not a discount, and not gated as one — see invoice.storage.waive in rbac.
 */
export function WaiveStorage({
  invoiceId,
  storage,
  currency,
  rate,
  across = 1,
  freeDaysLeft,
}: {
  /** One id, or the comma-separated set ticked on the merge screen. */
  invoiceId: string;
  /** What is on the bill for storage — summed when this covers several. */
  storage: number;
  currency: string;
  /** The bill's frozen rate, so the fee reads in the money the customer pays. */
  rate?: number | null;
  /** How many consignments this forgives. Each keeps its own clock. */
  across?: number;
  /**
   * Free days still left, when nothing has accrued.
   *
   * Shown instead of the control, because a screen that says nothing about
   * storage looks like a screen that failed rather than a consignment that
   * owes nothing — and then somebody checks the cargo page to be sure.
   */
  freeDaysLeft?: number | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    waiveStorageFee,
    undefined
  );

  /* Closes once the bill has moved; the panel around it re-renders without the
     fee, and leaving the form open invites a second attempt at nothing. */
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  if (!(storage > 0)) {
    if (freeDaysLeft === null || freeDaysLeft === undefined) return null;
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Ban className="h-3.5 w-3.5 opacity-60" />
        {freeDaysLeft > 0
          ? `${t("No storage fee")} · ${freeDaysLeft} ${t("free days left")}`
          : t("No storage fee — the last free day is today.")}
      </span>
    );
  }

  const local =
    typeof rate === "number" && rate > 0 && currency !== "TZS"
      ? `TSh ${Math.round(storage * rate).toLocaleString("en-US")}`
      : null;
  const amount = `${currency} ${storage.toFixed(2)}`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <Ban className="h-3.5 w-3.5" />
        {t("Remove the storage fee")}
      </button>
    );
  }

  /* Portalled for the same reason the discount is: the trigger sits inside the
     payment form, and a <form> inside a <form> is dropped by the browser —
     pressing this would have recorded a payment. */
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
          <Ban className="h-4 w-4 text-brand" />
          {t("Remove the storage fee")}
        </p>
        {/* Each consignment has sat for its own number of days, so this is
            several fees being forgiven at once, not one shared out. */}
        {across > 1 ? (
          <p className="text-[11px] text-muted-foreground">
            {t("Across all")} {across}{" "}
            {t("consignments, each counted from the day it landed.")}
          </p>
        ) : null}
        {/* The figure, so nobody forgives an amount they never saw. */}
        <p className="text-[11px] text-muted-foreground">
          {t("Comes off the bill")}:{" "}
          <span className="font-semibold text-foreground">{amount}</span>
          {local ? ` · ${local}` : ""}
        </p>
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <Input
          name="reason"
          placeholder={t("Why — we were closed, our delay, agreed with them…")}
          className="h-8 text-xs"
          required
          autoFocus
        />
        <FormError state={state} />
        <div className="flex items-center gap-2">
          <SubmitButton variant="brand" size="sm" pendingLabel="Removing…">
            {t("Remove it")}
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <Ban className="h-3.5 w-3.5" />
        {t("Remove the storage fee")}
      </button>
      {typeof document === "undefined"
        ? null
        : createPortal(dialog, document.body)}
    </>
  );
}
