"use client";

import { useActionState, useState } from "react";
import { Pencil, RotateCcw, Undo2, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import {
  editPayment,
  restorePayment,
  voidPayment,
} from "@/lib/actions/payment-corrections";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Putting right a payment that was recorded wrong.
 *
 * Two icons on the row and nothing else until one is pressed — the owner's
 * standing rule about repeated row actions, and the right instinct here anyway:
 * most payments are correct, and a row of buttons on every one of them makes a
 * receipt list look like a form.
 *
 * Cancelling asks why, and will not proceed without an answer, because the
 * question a month later is never "was this cancelled" but "why was it". The
 * warning above the field is not decoration: cancelling gives the money back on
 * the ledger, takes it off the bill, and withdraws the pickup note if the cargo
 * has not already gone. Somebody pressing this should know all three before they
 * do it, not after.
 *
 * A cancelled payment shows only Reinstate. There is no editing a record that
 * currently says nothing happened.
 */
export function PaymentCorrection({
  paymentId,
  reference,
  note,
  paidAt,
  voided,
  voidReason,
  voidedBy,
}: {
  paymentId: string;
  reference: string | null;
  note: string | null;
  /** yyyy-mm-dd, for the date input. */
  paidAt: string;
  voided: boolean;
  voidReason: string | null;
  voidedBy: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState<"void" | "edit" | "restore" | null>(null);

  const [voidState, doVoid] = useActionState<ActionResult | undefined, FormData>(
    voidPayment,
    undefined
  );
  const [editState, doEdit] = useActionState<ActionResult | undefined, FormData>(
    editPayment,
    undefined
  );
  const [restoreState, doRestore] = useActionState<
    ActionResult | undefined,
    FormData
  >(restorePayment, undefined);

  const iconBtn =
    "focus-ring rounded p-1 text-muted-foreground transition-colors hover:text-foreground";

  if (voided) {
    return (
      <div className="mt-1 space-y-1.5">
        <p className="text-[11px] text-warning">
          {t("Cancelled")}
          {voidedBy ? ` ${t("by")} ${voidedBy}` : ""}
          {voidReason ? ` — “${voidReason}”` : ""}
        </p>
        {open === "restore" ? (
          <form action={doRestore} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="paymentId" value={paymentId} />
            <Input
              name="reason"
              required
              placeholder={t("Why is it being reinstated?")}
              className="h-7 min-w-[200px] flex-1 text-[11px]"
            />
            <SubmitButton size="sm" className="h-7 px-2.5 text-[11px]">
              {t("Reinstate it")}
            </SubmitButton>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen("restore")}
            className="focus-ring inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-medium hover:bg-accent"
          >
            <Undo2 className="h-3 w-3" />
            {t("Reinstate")}
          </button>
        )}
        <FormError state={restoreState} />
      </div>
    );
  }

  return (
    <div className="mt-0.5 space-y-1.5">
      <span className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setOpen(open === "edit" ? null : "edit")}
          title={t("Correct the details")}
          aria-label={t("Correct the details")}
          className={iconBtn}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === "void" ? null : "void")}
          title={t("Cancel this payment")}
          aria-label={t("Cancel this payment")}
          className="focus-ring rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>

      {open === "void" ? (
        <form
          action={doVoid}
          className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/[0.04] p-2"
        >
          <input type="hidden" name="paymentId" value={paymentId} />
          {/* What is about to happen, before it happens. */}
          <p className="text-[11px] text-muted-foreground">
            {t(
              "The money comes back off the bill and out of the account on the ledger, and the pickup note is withdrawn unless the cargo has already gone. Nothing is deleted — this stays on the record and can be reinstated."
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              name="reason"
              required
              placeholder={t("Why is this payment being cancelled?")}
              className="h-7 min-w-[200px] flex-1 text-[11px]"
            />
            <SubmitButton
              size="sm"
              className="h-7 bg-destructive px-2.5 text-[11px] text-white"
            >
              <RotateCcw className="mr-1.5 h-3 w-3" />
              {t("Cancel the payment")}
            </SubmitButton>
          </div>
          <FormError state={voidState} />
        </form>
      ) : null}

      {open === "edit" ? (
        <form action={doEdit} className="space-y-1.5 rounded-lg border bg-card p-2">
          <input type="hidden" name="paymentId" value={paymentId} />
          <div className="flex flex-wrap gap-1.5">
            <Input
              name="reference"
              defaultValue={reference ?? ""}
              placeholder={t("Reference")}
              className="h-7 min-w-[120px] flex-1 text-[11px]"
            />
            <Input
              type="date"
              name="paidAt"
              defaultValue={paidAt}
              aria-label={t("Date received")}
              className="h-7 w-[130px] text-[11px]"
            />
          </div>
          <Input
            name="note"
            defaultValue={note ?? ""}
            placeholder={t("Note")}
            className="h-7 text-[11px]"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              name="reason"
              required
              placeholder={t("What was wrong with it?")}
              className="h-7 min-w-[160px] flex-1 text-[11px]"
            />
            <SubmitButton size="sm" className="h-7 px-2.5 text-[11px]">
              {t("Save the correction")}
            </SubmitButton>
          </div>
          {/* The boundary, said plainly rather than discovered by trying. */}
          <p className="text-[11px] text-muted-foreground">
            {t(
              "The amount cannot be edited. A figure that has already settled a bill is corrected by cancelling this payment and recording the right one, so the receipt and the ledger keep agreeing."
            )}
          </p>
          <FormError state={editState} />
        </form>
      ) : null}
    </div>
  );
}
