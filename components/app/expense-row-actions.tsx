"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  approveExpense,
  payExpense,
  voidExpense,
} from "@/lib/actions/expenses";
import type { ActionResult } from "@/lib/actions/types";
import type { ExpenseAccount } from "@/components/app/expense-form";

/**
 * What can be done to one cost, from the register.
 *
 * Only ever the action that is actually available: an unapproved cost over the
 * limit offers approval and nothing else; an approved one offers payment; a
 * paid one offers nothing at all, because money that has left an account is
 * corrected by a reversing ledger entry, never by editing the record.
 */
export function ExpenseRowActions({
  expenseId,
  status,
  currency,
  accounts,
  canApprove,
  needsApproval,
}: {
  expenseId: string;
  status: string;
  currency: string;
  accounts: ExpenseAccount[];
  canApprove: boolean;
  needsApproval: boolean;
}) {
  const t = useT();
  const [voiding, setVoiding] = useState(false);

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

  if (status === "PAID" || status === "VOID") return null;

  const eligible = accounts.filter((a) => a.currency === currency);
  const blocked = status === "PENDING" && needsApproval;

  return (
    <div className="space-y-2">
      {blocked ? (
        canApprove ? (
          <form action={approve} className="flex items-center gap-2">
            <input type="hidden" name="expenseId" value={expenseId} />
            <SubmitButton size="sm" variant="signal" pendingLabel="Approving…">
              {t("Approve")}
            </SubmitButton>
            <FormError state={approveState} />
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("Waiting on the CEO’s approval")}
          </p>
        )
      ) : (
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
