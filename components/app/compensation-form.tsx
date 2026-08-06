"use client";

import { useActionState } from "react";
import { BadgeCheck } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  approveCompensation,
  recordCompensation,
} from "@/lib/actions/investigations";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

/**
 * The two halves of a payout, kept apart on purpose.
 *
 * Approving is a decision and recording is a disbursement, and the permissions
 * behind them are held by different desks — `exception.approve` is the CEO's
 * alone, `exception.compensate` is Finance's. Rendering them as one form would
 * suggest one person does both, which is exactly what the split exists to stop.
 *
 * Neither form is ever rendered to the warehouse: the panel around them refuses
 * before it gets this far, and the amount is not in the props at all.
 */

/** The CEO says yes. No figure here — Finance records what actually went out. */
export function ApproveCompensationForm({
  exceptionId,
}: {
  exceptionId: string;
}) {
  const [state, action] = useActionState(approveCompensation, undefined);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="note"
          placeholder="What is being approved, and why. e.g. total loss, customer compensated at declared value"
          required
        />
        <SubmitButton size="default" variant="brand" pendingLabel="Approving…">
          <BadgeCheck className="mr-2 h-4 w-4" />
          Approve compensation
        </SubmitButton>
      </div>
      <FormError state={state} />
    </form>
  );
}

/**
 * Finance records the settlement.
 *
 * The payment date is optional and that is the point: an approved amount with
 * no date is the "Compensation Pending" the dashboard counts. Filling the date
 * in later is the same form again — it amends the record rather than adding a
 * second one, and the old figures go to the audit log.
 */
export function RecordCompensationForm({
  exceptionId,
  defaults,
}: {
  exceptionId: string;
  /**
   * Present only when a settlement already exists AND the reader holds
   * finance.view — the panel does not pass figures to anybody else.
   */
  defaults?: {
    amount: string;
    currency: string;
    paidAt: string | null;
    method: string | null;
    note: string | null;
  } | null;
}) {
  const [state, action] = useActionState(recordCompensation, undefined);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="exceptionId" value={exceptionId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="compensation-amount">Amount</Label>
          <MoneyInput
            id="compensation-amount"
            name="amount"
            placeholder="250000"
            defaultValue={defaults?.amount ?? ""}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="compensation-currency">Currency</Label>
          <NativeSelect
            id="compensation-currency"
            name="currency"
            defaultValue={defaults?.currency ?? "TZS"}
          >
            <option value="TZS">TZS — Tanzanian shilling</option>
            <option value="USD">USD — US dollar</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="compensation-paidAt">Payment date</Label>
          <Input
            id="compensation-paidAt"
            name="paidAt"
            type="date"
            defaultValue={defaults?.paidAt ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty until the money has actually gone out.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="compensation-method">Payment method</Label>
          <NativeSelect
            id="compensation-method"
            name="method"
            defaultValue={defaults?.method ?? ""}
          >
            <option value="">Not paid yet</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="compensation-note">Notes</Label>
        <Textarea
          id="compensation-note"
          name="note"
          rows={3}
          defaultValue={defaults?.note ?? ""}
          placeholder="Reference, who authorised it, anything an auditor will ask about."
        />
      </div>

      <FormError state={state} />
      {state?.ok ? (
        <p className="rounded-md border border-success/30 bg-success/5 p-2 text-xs text-success">
          Saved against this investigation.
        </p>
      ) : null}

      <SubmitButton size="sm" variant="brand" pendingLabel="Saving…">
        {defaults ? "Update compensation" : "Record compensation"}
      </SubmitButton>
    </form>
  );
}
