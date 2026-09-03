"use client";

import { useActionState, useState } from "react";
import { Ban, Pencil } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import {
  editSubmission,
  withdrawSubmission,
} from "@/lib/actions/submission-corrections";
import type { ActionResult } from "@/lib/actions/types";

const pillButton =
  "focus-ring inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent";

/**
 * Fixing or taking back a claim before Finance rules on it.
 *
 * Written out as Edit Payment / Delete Payment, not left as bare icons — the
 * same fix the ledger's own correction buttons needed: a control nobody can
 * see is a button nobody presses. "Delete" is what the desk calls this, and
 * it IS the complete undo from where they stand — but nothing has moved yet
 * to be deleted from, so what actually happens is a clean withdrawal, said
 * once in the confirmation below rather than argued over in the label.
 *
 * Both only on a pending row. Nothing has moved yet — no ledger line, no
 * receipt, no change to the bill — which is exactly why a claim can be
 * edited in place while a payment cannot: there is no receipt in anybody's
 * hand for this to disagree with.
 *
 * Once Finance verifies it, both go. At that point real money exists and the
 * way back is cancelling the payment on the invoice, not editing the claim
 * that produced it — offered here as a plain link rather than a silent dead
 * end, so somebody looking for the undo is told where it lives.
 */
export function SubmissionCorrection({
  submissionId,
  invoiceId,
  amount,
  method,
  reference,
  note,
  status,
  accountId,
  accounts,
  canDelete = true,
}: {
  submissionId: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  status: string;
  accountId: string | null;
  accounts: { id: string; name: string; currency: string }[];
  /** Finance corrects a claim it is about to decide, but does not take it
      back — refusing somebody else's claim is Send back, which says who
      refused it and why. Deleting is the raiser's own undo. */
  canDelete?: boolean;
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
    <span className="inline-flex max-w-[22rem] flex-wrap items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => setOpen(open === "edit" ? null : "edit")}
        className={pillButton}
      >
        <Pencil className="h-3.5 w-3.5" />
        {t("Edit Payment")}
      </button>
      {canDelete ? (
        <button
          type="button"
          onClick={() => setOpen(open === "withdraw" ? null : "withdraw")}
          className={`${pillButton} hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive`}
        >
          <Ban className="h-3.5 w-3.5" />
          {t("Delete Payment")}
        </button>
      ) : null}

      {open === "edit" ? (
        <form
          action={doEdit}
          className="mt-1 w-full min-w-[17rem] space-y-1.5 rounded-lg border bg-card p-2"
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
            <NativeSelect
              name="method"
              defaultValue={method}
              aria-label={t("Method")}
              className="h-7 w-auto min-w-[8rem] text-[11px]"
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </NativeSelect>
            {/* Where it landed. Editable here because a customer naming the
                wrong bank is the ordinary mistake this form exists to fix, and
                bouncing the claim back for it costs them a rejection. */}
            <NativeSelect
              name="accountId"
              defaultValue={accountId ?? ""}
              aria-label={t("Where did it land")}
              className="h-7 w-auto min-w-[9rem] text-[11px]"
            >
              <option value="" disabled>
                {t("Choose the account")}
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency}
                </option>
              ))}
            </NativeSelect>
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
            <SubmitButton size="sm" className="h-11 md:h-7 px-2.5 text-[11px]">
              {t("Save")}
            </SubmitButton>
          </div>
          <FormError state={editState} />
        </form>
      ) : null}

      {open === "withdraw" ? (
        <form
          action={doWithdraw}
          className="mt-1 w-full min-w-[17rem] space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/[0.04] p-2"
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <p className="text-[11px] text-muted-foreground">
            {t(
              "Nothing has moved yet, so deleting it costs the customer nothing. It is recorded as withdrawn by us, not refused by Finance."
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              name="reason"
              required
              placeholder={t("Why is it being deleted?")}
              className="h-7 min-w-[150px] flex-1 text-[11px]"
            />
            <SubmitButton
              size="sm"
              className="h-7 bg-destructive px-2.5 text-[11px] text-white"
            >
              {t("Delete it")}
            </SubmitButton>
          </div>
          <FormError state={withdrawState} />
        </form>
      ) : null}
    </span>
  );
}
