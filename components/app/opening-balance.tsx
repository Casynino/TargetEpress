"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { setOpeningBalance } from "@/lib/actions/treasury";
import type { ActionResult } from "@/lib/actions/types";

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Closing the oldest caveat on the accounts page.
 *
 * "These are movements recorded here, not balances" has been true and inert
 * since the ledger was built: it named a gap and offered no way to close it.
 * A warning nobody can act on teaches people to scroll past warnings.
 *
 * Sits inside the banner that raises the problem, so the answer is where the
 * question is. One account at a time, because the figures come off six
 * different statements and nobody has all six in front of them at once.
 */
export function OpeningBalanceForm({
  accounts,
}: {
  accounts: { id: string; name: string; currency: string }[];
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [state, action] = useActionState<ActionResult, FormData>(
    setOpeningBalance,
    { ok: true }
  );

  const account = accounts.find((a) => a.id === accountId);
  const symbol = account?.currency === "TZS" ? "TSh" : account?.currency;

  if (accounts.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring mt-2 rounded-lg border border-warning/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-warning/10"
      >
        {t("Set the opening balances →")}
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="openingAccount" className="text-xs">
          {t("Account")}
        </Label>
        <NativeSelect
          id="openingAccount"
          name="accountId"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-9 w-auto min-w-[12rem] text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1">
        <Label htmlFor="openingAmount" className="text-xs">
          {t("What was in it")} {symbol ? `(${symbol})` : ""}
        </Label>
        <MoneyInput
          id="openingAmount"
          name="amount"
          className="h-10 w-44"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="openingAsOf" className="text-xs">
          {t("As at")}{" "}
          <span className="text-muted-foreground">{t("(blank = today)")}</span>
        </Label>
        <Input
          id="openingAsOf"
          name="asOf"
          type="date"
          max={TODAY}
          className="h-9 w-40"
        />
      </div>

      <SubmitButton variant="brand" size="sm" pendingLabel={t("Saving…")}>
        <Check className="mr-1.5 h-3.5 w-3.5" />
        {t("Set it")}
      </SubmitButton>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="focus-ring rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        aria-label={t("Cancel")}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="w-full">
        <FormError state={state} />
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Recorded as the first movement on the account, not as a stored total — so the balance still comes from adding up the ledger, and this figure is visible in the register like any other."
          )}
        </p>
      </div>
    </form>
  );
}
