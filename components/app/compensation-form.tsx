"use client";

import { useActionState, useState } from "react";
import { BadgeCheck } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
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
  const t = useT();
  const [state, action] = useActionState(approveCompensation, undefined);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="note"
          placeholder={t(
            "What is being approved, and why. e.g. total loss, customer compensated at declared value"
          )}
          required
        />
        <SubmitButton size="default" variant="brand" pendingLabel={t("Approving…")}>
          <BadgeCheck className="mr-2 h-4 w-4" />
          {t("Approve compensation")}
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
  accounts = [],
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
    accountId?: string | null;
  } | null;
  /**
   * Where the money can leave from. A payout with a payment date must name
   * one — that is what puts the line on the general ledger.
   */
  accounts?: {
    id: string;
    name: string;
    currency: string;
    kind?: "BANK" | "MOBILE_MONEY" | "CASH";
  }[];
}) {
  const t = useT();
  const [state, action] = useActionState(recordCompensation, undefined);
  /* Which account the payout leaves, and therefore how it was paid. Empty
     until one is named: until then it genuinely has not been paid. */
  const [accountId, setAccountId] = useState(defaults?.accountId ?? "");
  const payoutMethod = (() => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return "";
    if (account.kind === "CASH") return "CASH";
    if (account.kind === "MOBILE_MONEY") return "MOBILE_MONEY";
    return "BANK_TRANSFER";
  })();

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="exceptionId" value={exceptionId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="compensation-amount">{t("Amount")}</Label>
          <MoneyInput
            id="compensation-amount"
            name="amount"
            placeholder="250000"
            defaultValue={defaults?.amount ?? ""}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="compensation-currency">{t("Currency")}</Label>
          <NativeSelect
            id="compensation-currency"
            name="currency"
            defaultValue={defaults?.currency ?? "TZS"}
          >
            <option value="TZS">{t("TZS — Tanzanian shilling")}</option>
            <option value="USD">{t("USD — US dollar")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="compensation-paidAt">{t("Payment date")}</Label>
          <Input
            id="compensation-paidAt"
            name="paidAt"
            type="date"
            defaultValue={defaults?.paidAt ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            {t("Leave empty until the money has actually gone out.")}
          </p>
        </div>
        {/* Never asked. Which account the payout LEFT says how it was paid:
            the tin is cash, a till is mobile money, a bank is a transfer. Two
            questions with one answer is two answers that can disagree, and a
            payout whose method and account contradict each other is a line
            nobody can reconcile against a statement. Empty until an account is
            named, because until then it genuinely has not been paid. */}
        <input type="hidden" name="method" value={payoutMethod} />

        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="compensation-account">{t("Paid from")}</Label>
          <NativeSelect
            id="compensation-account"
            name="accountId"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">{t("Not paid yet")}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} — {account.currency}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            {t(
              "Required once a payment date is set — it puts the payout on the general ledger against this account."
            )}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="compensation-note">{t("Notes")}</Label>
        <Textarea
          id="compensation-note"
          name="note"
          rows={3}
          defaultValue={defaults?.note ?? ""}
          placeholder={t(
            "Reference, who authorised it, anything an auditor will ask about."
          )}
        />
      </div>

      <FormError state={state} />
      {state?.ok ? (
        <p className="rounded-md border border-success/30 bg-success/5 p-2 text-xs text-success">
          {t("Saved against this investigation.")}
        </p>
      ) : null}

      <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")}>
        {defaults ? t("Update compensation") : t("Record compensation")}
      </SubmitButton>
    </form>
  );
}
