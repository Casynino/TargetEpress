"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  approveExpense,
  payExpense,
  reverseExpense,
  voidExpense,
} from "@/lib/actions/expenses";
import type { ActionResult } from "@/lib/actions/types";
import type { ExpenseAccount } from "@/components/app/expense-form";

/**
 * What can be done to one cost, from the register.
 *
 * Only ever the action that is actually available: an unapproved cost over the
 * limit offers approval and nothing else; an approved one offers payment; and a
 * paid one offers a REVERSAL, because money that has left an account is
 * corrected by an opposite ledger entry, never by editing the record.
 */
export function ExpenseRowActions({
  expenseId,
  status,
  currency,
  accounts,
  canApprove,
  canReverse = false,
}: {
  expenseId: string;
  status: string;
  currency: string;
  accounts: ExpenseAccount[];
  canApprove: boolean;
  /** Writing the opposite entry is ledger.adjust, not expense.record. */
  canReverse?: boolean;
}) {
  const t = useT();
  const [voiding, setVoiding] = useState(false);
  const [reversing, setReversing] = useState(false);

  const [approveState, approve] = useActionState<ActionResult, FormData>(
    approveExpense,
    { ok: true }
  );
  const [payState, pay] = useActionState<ActionResult, FormData>(payExpense, {
    ok: true,
  });
  const [voidState, cancel] = useActionState<ActionResult, FormData>(
    voidExpense,
    { ok: true }
  );
  const [reverseState, reverse] = useActionState<
    ActionResult<{ expenseNumber: string }>,
    FormData
  >(reverseExpense, { ok: true });

  if (status === "VOID") return null;

  /*
    Paid: the money is gone, so the only honest correction is an opposite
    entry. The reason is required — a reversal with no explanation is
    indistinguishable, months later, from a bookkeeping error.
  */
  if (status === "PAID") {
    if (!canReverse) return null;
    return reversing ? (
      <form action={reverse} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="expenseId" value={expenseId} />
        <Input
          name="reason"
          required
          minLength={3}
          placeholder={t("Why is this being reversed?")}
          className="h-8 w-56 text-xs"
        />
        <SubmitButton size="sm" variant="signal" pendingLabel={t("Reversing…")}>
          {t("Reverse")}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setReversing(false)}
          className="text-xs text-muted-foreground underline"
        >
          {t("Keep")}
        </button>
        <FormError state={reverseState} />
      </form>
    ) : (
      <button
        type="button"
        onClick={() => setReversing(true)}
        className="text-xs text-muted-foreground underline"
      >
        {t("Reverse")}
      </button>
    );
  }

  const eligible = accounts.filter((a) => a.currency === currency);
  /* No cost waits for a signature: the owner removed the ceiling, so the row
     always offers the thing that actually needs doing — paying it. */
  return (
    <div className="space-y-2">
      {(
        <form action={pay} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="expenseId" value={expenseId} />
          <NativeSelect
            name="accountId"
            defaultValue=""
            className="h-8 w-auto min-w-[9rem] text-xs"
            required
          >
            <option value="" disabled>
              {t("Paid from…")}
            </option>
            {eligible.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
          <SubmitButton size="sm" pendingLabel="Paying…">
            {t("Mark paid")}
          </SubmitButton>
          <FormError state={payState} />
        </form>
      )}

      {voiding ? (
        <form action={cancel} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="expenseId" value={expenseId} />
          <Input
            name="reason"
            placeholder={t("Why is this being cancelled?")}
            className="h-8 w-auto min-w-[12rem] text-xs"
            required
          />
          <SubmitButton size="sm" variant="destructive" pendingLabel="Cancelling…">
            {t("Confirm")}
          </SubmitButton>
          <button
            type="button"
            onClick={() => setVoiding(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("Keep it")}
          </button>
          <FormError state={voidState} />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setVoiding(true)}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          {t("Cancel this cost")}
        </button>
      )}
    </div>
  );
}
