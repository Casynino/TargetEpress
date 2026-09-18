"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Archive } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { closeAccount, type CloseAccountResult } from "@/lib/actions/accounts";
import type { ActionResult } from "@/lib/actions/types";
import { formatMoney } from "@/lib/format";

/**
 * Closing an account, from the account's own page.
 *
 * Folded away behind one button: it is rare and it is final for every picker
 * in the app, so nobody should meet the form by scrolling past it. The panel
 * says in words what will happen to the money before anything is pressed.
 */
export function CloseAccountForm({
  accountId,
  name,
  currency,
  balance,
  active,
  needsOpening,
  targets,
}: {
  accountId: string;
  name: string;
  currency: string;
  /** What is on it now, in its own currency. */
  balance: number;
  active: boolean;
  /** No opening balance was ever set — it has to be, before closing. */
  needsOpening: boolean;
  /** Open company accounts in the same currency, this one excluded. */
  targets: { id: string; name: string }[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [into, setInto] = useState("");
  const [state, action] = useActionState<ActionResult<CloseAccountResult> | undefined, FormData>(
    closeAccount,
    undefined
  );

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-success/40 bg-success/5 px-5 py-4 text-sm">
        <p className="font-medium text-foreground">
          {active ? `${name} ${t("is closed.")}` : `${name} ${t("is empty again.")}`}
        </p>
        <p className="mt-1 text-muted-foreground">
          {state.data?.transferNumber
            ? `${formatMoney(Math.abs(state.data.moved), currency)} ${t("moved on")} ${state.data.transferNumber}.`
            : t("Nothing was on it, so no money moved.")}{" "}
          <Link href="/app/finance/accounts" className="font-medium text-brand hover:underline">
            {t("Back to the accounts")}
          </Link>
        </p>
      </div>
    );
  }

  const hasMoney = Math.abs(balance) >= 0.005;
  const chosen = targets.find((a) => a.id === into)?.name;

  if (active && needsOpening) {
    return (
      <p className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
        {t("To close this account, first set its opening balance — even if it was zero — so money that was in it before the system started is not lost.")}{" "}
        <Link href="/app/finance/accounts" className="font-medium text-brand hover:underline">
          {t("Set it on the Accounts page")}
        </Link>
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Archive className="h-4 w-4" />
        {active ? t("Close this account") : t("Move what is left")}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-xl border bg-card p-5 shadow-soft">
      <input type="hidden" name="accountId" value={accountId} />
      <div>
        <h2 className="font-display text-base font-semibold">
          {active ? `${t("Close")} ${name}` : `${t("Move what is left on")} ${name}`}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {hasMoney ? (
            <li>
              {balance > 0
                ? `${formatMoney(balance, currency)} ${t("is on it. It moves to the account you choose, as a transfer on the register.")}`
                : `${t("It is overdrawn by")} ${formatMoney(-balance, currency)}${t(", so that much moves into it from the account you choose, as a transfer on the register.")}`}
            </li>
          ) : (
            <li>{t("Nothing is on it, so no money moves.")}</li>
          )}
          {active ? (
            <>
              <li>
                {t("Payment claims still waiting for Finance, costs not yet paid and payroll not yet paid that name it will name the new account instead.")}
              </li>
              <li>
                {t("No form will offer it again. Its history stays on record, and receipts already given keep their account.")}
              </li>
            </>
          ) : null}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="close-into" className="text-xs">
            {t("Its money goes to")}
          </Label>
          <NativeSelect
            id="close-into"
            name="intoAccountId"
            required
            value={into}
            onChange={(e) => setInto(e.target.value)}
          >
            <option value="" disabled>
              {t("Choose the account")}
            </option>
            {targets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="close-reason" className="text-xs">
            {t("Why")} <span className="text-muted-foreground">{t("(optional)")}</span>
          </Label>
          <Input id="close-reason" name="reason" placeholder={t("Joined into Lipa")} />
        </div>
      </div>

      <FormError state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton size="sm" variant="destructive" pendingLabel={t("Saving…")} disabled={!into}>
          {active
            ? chosen
              ? `${t("Close")} ${name} ${t("into")} ${chosen}`
              : `${t("Close")} ${name}`
            : t("Move it")}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
