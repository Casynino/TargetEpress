"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { IdempotencyKey, useIdempotencyKey } from "@/components/app/idempotency-key";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { recordLoanMovement } from "@/lib/actions/loans";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/lib/actions/types";

type Mode = "REPAID" | "RECEIVED";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * THE TWO THINGS THAT HAPPEN TO A LOAN BESIDES THE COSTS IT PAYS.
 *
 * The company paying the lender back, and the lender handing cash over. Two
 * buttons rather than a direction dropdown: which way the money went is the
 * one fact that must never be chosen by accident, and each button says it in
 * words before anything is typed.
 *
 * The figure owed is shown as the repayment is typed, and a repayment larger
 * than it is refused here and on the server — paying back more than was
 * borrowed would make the lender owe the company.
 */
export function LoanMovementForm({
  loanAccountId,
  lender,
  currency,
  owed,
  accounts,
}: {
  loanAccountId: string;
  lender: string;
  currency: string;
  /** What the company owes the lender right now. */
  owed: number;
  /** Company accounts in the loan's currency. */
  accounts: { id: string; name: string }[];
}) {
  const t = useT();
  const [mode, setMode] = useState<Mode | null>(null);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const { key, reset } = useIdempotencyKey();
  const [state, action] = useActionState<
    ActionResult<{ movementNumber: string }> | undefined,
    FormData
  >(recordLoanMovement, undefined);

  useEffect(() => {
    if (state?.ok) {
      setMode(null);
      setAmount("");
      setAccountId("");
      reset();
    }
  }, [state, reset]);

  const money = (n: number) => formatMoney(n, currency);
  const typed = Number(amount || 0);
  const after = mode === "REPAID" ? owed - typed : owed + typed;
  const tooMuch = mode === "REPAID" && typed > owed + 0.005;

  const open = (next: Mode) => {
    setMode(next);
    setAmount("");
    setAccountId("");
    reset();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => open("REPAID")}
          disabled={owed <= 0.005}
          className={`focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
            mode === "REPAID" ? "border-brand bg-brand text-brand-foreground" : "hover:bg-accent"
          }`}
        >
          <ArrowUpRight className="h-4 w-4" />
          {t("Record a repayment")}
        </button>
        <button
          type="button"
          onClick={() => open("RECEIVED")}
          className={`focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
            mode === "RECEIVED" ? "border-brand bg-brand text-brand-foreground" : "hover:bg-accent"
          }`}
        >
          <ArrowDownLeft className="h-4 w-4" />
          {t("Record money received")}
        </button>
      </div>

      {state?.ok && state.data ? (
        <p className="text-sm text-success">
          {t("Recorded")}: <span className="font-mono">{state.data.movementNumber}</span>.
        </p>
      ) : null}

      {mode ? (
        <form action={action} className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <IdempotencyKey value={key} />
          <input type="hidden" name="kind" value={mode} />
          <input type="hidden" name="loanAccountId" value={loanAccountId} />

          <p className="text-sm">
            {mode === "REPAID" ? (
              <>
                {t("The company pays")} <span className="font-semibold">{lender}</span>{" "}
                {t("back. This is not a cost — it reduces what the company owes.")}
              </>
            ) : (
              <>
                <span className="font-semibold">{lender}</span>{" "}
                {t("hands money to the company. This is not income — it is borrowed, and adds to what the company owes.")}
              </>
            )}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="loan-amount" className="text-xs">
                {t("Amount")} ({currency})
              </Label>
              <MoneyInput
                id="loan-amount"
                name="amount"
                value={amount}
                onValueChange={setAmount}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-account" className="text-xs">
                {mode === "REPAID" ? t("Paid from") : t("Received into")}
              </Label>
              <NativeSelect
                id="loan-account"
                name="accountId"
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="" disabled>
                  {t("Choose the account")}
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-date" className="text-xs">
                {t("Date")}
              </Label>
              <Input
                id="loan-date"
                name="occurredAt"
                type="date"
                defaultValue={today()}
                max={today()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-reference" className="text-xs">
                {t("Reference")} <span className="text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Input
                id="loan-reference"
                name="reference"
                placeholder={t("Bank slip, M-Pesa code…")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-note" className="text-xs">
              {t("Note")} <span className="text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Input id="loan-note" name="note" />
          </div>

          <p className={`text-sm ${tooMuch ? "text-destructive" : "text-muted-foreground"}`}>
            {t("Currently owed to")} {lender}:{" "}
            <span className="font-mono font-semibold text-foreground">{money(owed)}</span>
            {typed > 0 ? (
              <>
                {" → "}
                <span className="font-mono font-semibold text-foreground">{money(Math.max(after, 0))}</span>
              </>
            ) : null}
            {tooMuch ? ` — ${t("a repayment cannot be more than what is owed.")}` : null}
          </p>

          <FormError state={state} />
          <div className="flex items-center gap-2">
            <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")} disabled={tooMuch || typed <= 0}>
              {mode === "REPAID" ? t("Record the repayment") : t("Record the money received")}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t("Cancel")}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
