"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { NativeSelect } from "@/components/ui/native-select";
import { attributePayment } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Saying where a payment landed, from the register it is listed on.
 *
 * The Accounts page pointed at unattributed money with a "Fix it" link, and
 * that link led to a list where nothing could be fixed — the account is set
 * when a payment is recorded and there was no way to set it afterwards. A
 * button that names a job and then cannot do it is worse than no button.
 *
 * Inline rather than a page of its own: the answer is one field, the clerk is
 * already looking at the row, and the row has the receipt number and the
 * customer on it — everything needed to remember where the money went.
 */
export function AttributePayment({
  paymentId,
  currency,
  accounts,
}: {
  paymentId: string;
  /** What was handed over. Only accounts in this currency can have taken it. */
  currency: string;
  accounts: { id: string; name: string; currency: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(
    attributePayment,
    { ok: true }
  );

  const eligible = accounts.filter((a) => a.currency === currency);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring rounded-md text-xs font-medium text-warning hover:underline"
      >
        Say where it landed
      </button>
    );
  }

  if (eligible.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No {currency} account exists to have received this.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="paymentId" value={paymentId} />
      <NativeSelect
        name="accountId"
        aria-label="Account it landed in"
        defaultValue=""
        required
        className="h-8 w-auto min-w-[8rem] text-xs"
      >
        <option value="" disabled>
          Which account…
        </option>
        {eligible.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </NativeSelect>
      <SubmitButton size="sm" variant="brand" pendingLabel="Saving…">
        <Check className="h-3.5 w-3.5" />
      </SubmitButton>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="focus-ring rounded-md p-1 text-muted-foreground hover:text-foreground"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <FormError state={state} />
    </form>
  );
}
