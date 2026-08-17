"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import {
  editSubmission,
  withdrawSubmission,
} from "@/lib/actions/submission-corrections";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Fixing or taking back a claim before Finance rules on it.
 *
 * Two icons, and only on a pending row. Nothing has moved yet — no ledger line,
 * no receipt, no change to the bill — which is exactly why a claim can be edited
 * in place while a payment cannot: there is no receipt in anybody's hand for this
 * to disagree with.
 *
 * Once Finance verifies it, both icons go. At that point real money exists and
 * the way back is cancelling the payment on the invoice, not editing the claim
 * that produced it — offered here as a plain link rather than a silent dead end,
 * so somebody looking for the undo is told where it lives.
 */
export function SubmissionCorrection({
  submissionId,
  invoiceId,
  amount,
  reference,
  note,
  status,
}: {
  submissionId: string;
  invoiceId: string;
  amount: number;
  reference: string | null;
  note: string | null;
  status: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<"edit" | "withdraw" | null>(null);
  const [editState, doEdit] = useActionState<ActionResult | undefined, FormData>(
    editSubmission,
    undefined
  );
  const [withdrawState, doWithdraw] = useActionState<
    ActionResult | undefined,
    FormData
  >(withdrawSubmission, undefined);

  if (status === "VERIFIED") {
    return (
      <a
        href={`/app/finance/invoices/${invoiceId}`}
        className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {t("Verified — cancel the payment on the invoice")}
      </a>
    );
  }
  if (status !== "PENDING") return null;

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => setOpen(open === "edit" ? null : "edit")}
        title={t("Correct this claim")}
        aria-label={t("Correct this claim")}
        className="focus-ring rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setOpen(open === "withdraw" ? null : "withdraw")}
        title={t("Withdraw this claim")}
        aria-label={t("Withdraw this claim")}
        className="focus-ring rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {open === "edit" ? (
        <form
          action={doEdit}
          className="mt-1 basis-full space-y-1.5 rounded-lg border bg-card p-2"
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <div className="flex flex-wrap gap-1.5">
            <Input
              name="amount"
              type="number"
              step="0.01"
              defaultValue={amount}
              aria-label={t("Amount")}
              className="h-7 w-[110px] text-[11px]"
            />
            <Input
              name="reference"
              defaultValue={reference ?? ""}
              placeholder={t("Reference")}
              className="h-7 min-w-[110px] flex-1 text-[11px]"
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
              className="h-7 min-w-[150px] flex-1 text-[11px]"
            />
            <SubmitButton size="sm" className="h-7 px-2.5 text-[11px]">
              {t("Save")}
            </SubmitButton>
          </div>
          <FormError state={editState} />
        </form>
      ) : null}

      {open === "withdraw" ? (
        <form
          action={doWithdraw}
          className="mt-1 basis-full space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/[0.04] p-2"
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <p className="text-[11px] text-muted-foreground">
            {t(
              "Nothing has moved yet, so withdrawing costs the customer nothing. It is recorded as withdrawn by us, not refused by Finance."
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              name="reason"
              required
              placeholder={t("Why is it being withdrawn?")}
              className="h-7 min-w-[150px] flex-1 text-[11px]"
            />
            <SubmitButton
              size="sm"
              className="h-7 bg-destructive px-2.5 text-[11px] text-white"
            >
              {t("Withdraw it")}
            </SubmitButton>
          </div>
          <FormError state={withdrawState} />
        </form>
      ) : null}
    </span>
  );
}
