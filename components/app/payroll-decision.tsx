"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, Banknote, Undo2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { decidePayrollRun, payPayrollRun } from "@/lib/actions/payroll";
import { formatShillings, formatUsd } from "@/lib/money";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Accept the month — which pays it — or send it back with a reason.
 *
 * Accepting is one press and IT MOVES THE MONEY, at the owner's instruction:
 * "when he accept the total amount must be deducted and written as salary".
 * The action books one SALARIES expense for the run's total in the same
 * transaction as the acceptance, so there is no state in which the manager
 * believes salaries are paid and the account disagrees. The button says so.
 *
 * Sending it back opens a reason field and will not proceed without one — the
 * note is the only thing that travels back down, and a run returned blank
 * sends Finance hunting through thirty lines for an objection they cannot see.
 */
export function PayrollDecision({
  runId,
  code,
}: {
  runId: string;
  code: string;
}) {
  const t = useT();
  const [state, decide] = useActionState<
    ActionResult<{ status: string }> | undefined,
    FormData
  >(decidePayrollRun, undefined);
  const [sendingBack, setSendingBack] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <form action={decide}>
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="decision" value="APPROVED" />
          <SubmitButton
            size="sm"
            variant="brand"
            className="h-7 px-2.5 text-[11px]"
            pendingLabel={t("Paying…")}
          >
            <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
            {t("Accept & pay")}
          </SubmitButton>
        </form>

        <button
          type="button"
          onClick={() => setSendingBack((v) => !v)}
          aria-expanded={sendingBack}
          className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 text-[11px] font-medium text-destructive hover:bg-destructive/10"
        >
          <Undo2 className="h-3.5 w-3.5" />
          {t("Send it back")}
        </button>

        <span className="text-[11px] text-muted-foreground">
          {t("Accepting pays it: one salaries expense for the total leaves the named account.")}
        </span>
      </div>

      {sendingBack ? (
        <form
          action={decide}
          className="flex flex-wrap items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/[0.04] p-2"
        >
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="decision" value="REJECTED" />
          <Input
            name="decisionNote"
            aria-label={`${t("Note on sending")} ${code} ${t("back")}`}
            placeholder={t("Note (optional) — Finance sees only this.")}
            className="h-7 min-w-[220px] flex-1 text-[11px]"
          />
          <SubmitButton
            size="sm"
            /* The hover colour comes with it: the button variant's own
               hover:bg-primary is not overridden by a bare bg-destructive, and
               a red button that turns navy under the cursor reads as broken. */
            className="h-7 bg-destructive px-2.5 text-[11px] text-white hover:bg-destructive/90"
            pendingLabel={t("Sending…")}
          >
            {t("Send it back to Finance")}
          </SubmitButton>
        </form>
      ) : null}

      <FormError state={state} />
    </div>
  );
}

/**
 * The money leaving, and the sentence that says so before it does.
 *
 * Behind a press of its own, with the consequence written out above the button
 * in the same plain terms as cancelling a payment (components/app/payment
 * -correction.tsx): what gets booked, out of which account, and that the run
 * closes on the spot. Nothing else on either payroll screen moves a shilling,
 * so this is the one control that has to be impossible to press by accident.
 *
 * A shilling account with no published rate is refused up front rather than
 * left to fail in the action — there is nothing the manager could do here to
 * fix it, and the rate is published on another screen entirely.
 */
export function PayrollPay({
  runId,
  code,
  accountName,
  accountCurrency,
  netUsd,
  headcount,
  rate,
}: {
  runId: string;
  code: string;
  accountName: string;
  accountCurrency: string;
  netUsd: number;
  headcount: number;
  rate: number | null;
}) {
  const t = useT();
  const [state, pay] = useActionState<
    ActionResult<{ expenseNumber: string }> | undefined,
    FormData
  >(payPayrollRun, undefined);
  const [open, setOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const needsRate = accountCurrency !== "USD" && rate === null;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-2.5 text-[11px] font-semibold text-warning hover:bg-warning/20"
        >
          <Banknote className="h-3.5 w-3.5" />
          {t("Pay the salaries")}
        </button>
        <span className="text-[11px] text-muted-foreground">
          {t("Agreed and waiting. Nothing has left the account yet.")}
        </span>
      </div>
    );
  }

  return (
    <form
      action={pay}
      className="space-y-2 rounded-lg border border-warning/50 bg-warning/[0.05] p-2.5"
    >
      <input type="hidden" name="runId" value={runId} />

      {/* What is about to happen, before it happens. */}
      <p className="text-[11px] text-muted-foreground">
        {t(
          "This is the money leaving. It books a salaries expense and posts it out of the account on the ledger, the same as any other cost. The run closes on the spot: no line on it can be changed afterwards, and it cannot be paid twice."
        )}
      </p>

      <p className="text-xs font-semibold tabular">
        {formatShillings(netUsd, rate)}
        <span className="ml-1.5 font-normal text-muted-foreground">
          {rate === null ? "" : `${formatUsd(netUsd)} · `}
          {headcount} {t("staff")} · {t("out of")} {accountName}
          {accountCurrency !== "USD" && rate !== null
            ? ` · ${t("converted at the published rate and frozen onto the expense")}`
            : ""}
        </span>
      </p>

      {needsRate ? (
        <p className="text-[11px] font-semibold text-destructive">
          {t(
            "No exchange rate is published, so a dollar salary bill cannot leave a shilling account. Publish one on Pricing & configuration first."
          )}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {/* The day the money actually left, which is not always today: a
            transfer made on Friday gets recorded on Monday. */}
        <Input
          type="date"
          name="paidAt"
          defaultValue={today}
          max={today}
          aria-label={t("Date the money left")}
          className="h-7 w-[130px] text-[11px]"
        />
        <SubmitButton
          size="sm"
          disabled={needsRate}
          className="h-7 bg-warning px-2.5 text-[11px] text-warning-foreground hover:bg-warning/90"
          pendingLabel={t("Paying…")}
        >
          <Banknote className="mr-1.5 h-3 w-3" />
          {t("Pay")} {code}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring h-7 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {t("Not now")}
        </button>
      </div>

      <FormError state={state} />
    </form>
  );
}
