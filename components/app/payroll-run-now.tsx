"use client";

import { useActionState, useState } from "react";
import { Banknote, Zap } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { runPayrollNow } from "@/lib/actions/payroll";
import type { ActionResult } from "@/lib/actions/types";

/**
 * The month in one press, for the chair that answers for it anyway.
 *
 * The two-step month — Finance builds, the manager accepts — remains the
 * ordinary way and keeps its same-person control. This is the owner's explicit
 * exception: "manager can just run a payroll and the money will be deducted".
 * It shows what will happen before it happens — every name and the total are
 * printed above the button — and the press builds, agrees and settles the run
 * in one transaction: one salaries expense, one ledger line, audit trail
 * saying one person did the whole thing.
 */
export function PayrollRunNow({
  accounts,
  headcount,
  totalLabel,
  defaultYear,
  defaultMonth,
  monthTaken,
}: {
  accounts: { id: string; name: string }[];
  headcount: number;
  /** The roster total, already written in the page's own money style. */
  totalLabel: string;
  defaultYear: number;
  defaultMonth: number;
  /** The default month already has a run, so say so instead of failing. */
  monthTaken: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<
    ActionResult<{ code: string; expenseNumber: string; headcount: number }> | undefined,
    FormData
  >(runPayrollNow, undefined);

  if (headcount === 0) return null;

  return (
    <div className="rounded-xl border border-brand/25 bg-gradient-to-br from-brand/[0.10] via-card to-card p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="h-4 w-4 text-brand" />
            {t("Run this month yourself")}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {headcount} {t("staff on the register")} · {totalLabel}{" "}
            {t("leaves the account you choose, as one salaries expense.")}
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
          >
            <Banknote className="h-4 w-4" />
            {t("Run payroll")}
          </button>
        ) : null}
      </div>

      {open ? (
        <form action={action} className="mt-3 rounded-lg border bg-background/50 p-3">
          {monthTaken ? (
            <p className="mb-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {t(
                "This month already has a run from Finance — it is in the list below and this press will refuse. Pick another month only if that is really what you mean."
              )}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="runNowMonth">{t("Month")}</Label>
              <NativeSelect id="runNowMonth" name="month" defaultValue={String(defaultMonth)}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleDateString("en-GB", { month: "long" })}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="runNowYear">{t("Year")}</Label>
              <NativeSelect id="runNowYear" name="year" defaultValue={String(defaultYear)}>
                {[defaultYear - 1, defaultYear].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="runNowAccount">{t("Paid from")}</Label>
              <NativeSelect id="runNowAccount" name="accountId" required defaultValue="">
                <option value="" disabled>
                  {t("Choose an account")}
                </option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <FormError state={state} />
          {state?.ok && state.data ? (
            <FormSuccess
              message={`${state.data.code} ${t("paid")} — ${state.data.headcount} ${t(
                "staff"
              )}, ${t("booked as")} ${state.data.expenseNumber}.`}
            />
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SubmitButton pendingLabel="Paying…">
              {t("Run payroll — the money leaves now")}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="focus-ring inline-flex min-h-10 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {t("Cancel")}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
