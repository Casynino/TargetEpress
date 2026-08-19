"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { reconcileAccount } from "@/lib/actions/control";
import type { ActionResult } from "@/lib/actions/types";
import { formatMoney, roundMoney } from "@/lib/format";

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Where the second number comes from, in the account's own words.
 *
 * "Actual balance" is true for all three kinds and read by none of them: the
 * person at a till counts, the person with a statement reads. Naming the
 * source is also a quiet instruction — it says the figure must come from
 * outside this system, which is the entire reason the form exists.
 */
const SOURCE = {
  BANK: "off the bank statement",
  MOBILE_MONEY: "off the phone",
  CASH: "counted in the till",
} as const;

/**
 * Recording what an account actually held, against what the ledger says.
 *
 * The difference is computed and shown the moment the second figure is typed,
 * BEFORE submitting. A manager about to put "short by TSh 400,000" on the
 * record should meet that sentence while the till is still open in front of
 * them, not on the next page load — half the time the difference is a typo,
 * and the form is the last place a typo is cheap.
 *
 * A non-zero difference requires the note. The validator enforces it too, but
 * the form says so itself the moment the figures disagree: a rule that only
 * speaks after a rejected submit reads as an error, and this is not an error —
 * it is the job. "Bank charge not yet booked" is the difference between a
 * reconciliation and a shrug.
 *
 * The system balance is display only. The action derives the frozen figure on
 * the server for the same reason every balance here is derived — a number the
 * client sends is a number the client can get wrong.
 */
export function ReconcileForm({
  accountId,
  kind,
  systemBalance,
  currency,
}: {
  accountId: string;
  kind: "BANK" | "MOBILE_MONEY" | "CASH";
  /** What the ledger says right now, in the account's own currency. */
  systemBalance: number;
  currency: string;
}) {
  const t = useT();
  /* Starts undefined rather than { ok: true } so a success line only appears
     after a submit has actually happened. */
  const [state, action] = useActionState<
    ActionResult<{ difference: number; state: string }> | undefined,
    FormData
  >(
    reconcileAccount,
    undefined
  );
  const [actual, setActual] = useState("");

  /* Rounded to the cent before comparing: both sides arrive as IEEE doubles,
     and "short by TSh 0.0000000001" would demand a note for money that does
     not exist. */
  const diff = actual === "" ? null : roundMoney(Number(actual) - systemBalance);
  const mustExplain = diff !== null && diff !== 0;

  return (
    <form action={action} className="rounded-xl border bg-card p-3">
      <input type="hidden" name="accountId" value={accountId} />

      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("Check this account")}
      </p>

      {/* The first of the two numbers, stated where the second is typed so the
          comparison happens in one eyeful — not against a figure further up
          the page that may have scrolled away. */}
      <div className="mt-2 flex items-baseline justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
        <span className="text-[11px] text-muted-foreground">
          {t("The ledger says")}
        </span>
        <span className="tabular text-sm font-semibold">
          {formatMoney(systemBalance, currency)}
        </span>
      </div>

      <div className="mt-3 space-y-1">
        <Label htmlFor="reconcileActual" className="text-xs">
          {t("What it actually holds")}{" "}
          <span className="font-normal text-muted-foreground">
            — {t(SOURCE[kind])}
          </span>
        </Label>
        <MoneyInput
          id="reconcileActual"
          name="actualBalance"
            /* An overdrawn account's true balance is a negative number, and it
               is exactly the case this form exists for. */
            allowNegative
          className="h-9 text-sm"
          onValueChange={setActual}
          required
        />
      </div>

      {/* The finding, before it is a record. aria-live so a screen reader
          hears the verdict change as the figure is typed, same as the eye. */}
      {diff !== null ? (
        <p
          aria-live="polite"
          className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${
            diff === 0
              ? "bg-success/10 text-success"
              : diff < 0
                ? "bg-destructive/10 text-destructive"
                : "bg-warning/10 text-warning"
          }`}
        >
          {diff === 0 ? (
            t("Matches the ledger exactly.")
          ) : (
            <>
              {diff < 0 ? t("Short by") : t("Over by")}{" "}
              <span className="tabular font-semibold">
                {formatMoney(Math.abs(diff), currency)}
              </span>{" "}
              —{" "}
              {diff < 0
                ? t("the account holds less than the books say.")
                : t("the account holds more than the books say.")}
            </>
          )}
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
        <div className="space-y-1">
          <Label htmlFor="reconcileAsOf" className="text-xs">
            {t("As at")}
          </Label>
          {/* max = today: a statement can be from last Friday, never from
              next week. Defaults to today because that is when tills are
              counted; a backdated statement date is the exception typed in. */}
          <Input
            id="reconcileAsOf"
            name="asOf"
            type="date"
            defaultValue={TODAY}
            max={TODAY}
            className="h-9 w-40 text-sm"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reconcileNote" className="text-xs">
            {t("Note")}{" "}
            {!mustExplain ? (
              <span className="font-normal text-muted-foreground">
                {t("(optional when it matches)")}
              </span>
            ) : null}
          </Label>
          <Textarea
            id="reconcileNote"
            name="note"
            rows={2}
            className="min-h-[2.25rem] text-sm"
            placeholder={t("e.g. bank charge not yet booked")}
            required={mustExplain}
          />
          {mustExplain ? (
            <p className="text-[11px] text-warning">
              {t(
                "A difference needs a reason before it goes on the record. Say what explains it — or that nothing does yet."
              )}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <FormError state={state} />
        {state?.ok ? <FormSuccess message={t("Recorded.")} /> : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {t(
              "This records the check as an event beside the account. It changes no figure."
            )}
          </p>
          <SubmitButton variant="brand" size="sm" pendingLabel={t("Recording…")}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            {t("Record the check")}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
