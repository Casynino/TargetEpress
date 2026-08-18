"use client";

import { useActionState } from "react";
import { CalendarDays, Check, Send, Undo2, Wallet } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import {
  buildPayrollRun,
  decidePayrollRun,
  payPayrollRun,
  submitPayrollRun,
  updatePayrollItem,
} from "@/lib/actions/payroll";
import type { ActionResult } from "@/lib/actions/types";

/**
 * The controls either side of a salary run.
 *
 * Each one is its own form with its own action, rather than one screen-wide
 * form with a mode. The four things that happen to a run — building it, editing
 * a line, sending it up, ruling on it — are four different authorities on two
 * different desks, and a single form posting to a branch would have to
 * re-decide at runtime which of them the presser is allowed to do. Separate
 * forms let the server answer that once, in the action, where it is enforced.
 */

/* ------------------------------------------------------------ build a month */

export function BuildRunForm({ year, month }: { year: number; month: number }) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ id: string; code: string; headcount: number }> | undefined,
    FormData
  >(buildPayrollRun, undefined);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <SubmitButton size="sm" className="h-8 px-3 text-xs">
        <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
        {t("Build this month from the staff register")}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

/* --------------------------------------------------- edit one person's line */

/**
 * Allowance and deduction only.
 *
 * Gross is rendered beside these as text, not as an input, because the action
 * refuses to change it — what somebody earns a month is a fact about their
 * employment and belongs on their staff record. Drawing it as a disabled box
 * would still invite the question; leaving it as a figure answers it.
 */
export function PayrollLineForm({
  itemId,
  allowance,
  deduction,
  note,
  editable,
}: {
  itemId: string;
  allowance: number;
  deduction: number;
  note: string | null;
  editable: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ net: number }> | undefined,
    FormData
  >(updatePayrollItem, undefined);

  if (!editable) {
    return (
      <span className="tabular text-[11px] text-muted-foreground">
        {allowance > 0 ? `+${allowance.toFixed(2)}` : "—"}
        {deduction > 0 ? ` −${deduction.toFixed(2)}` : ""}
      </span>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <Input
        name="allowance"
        type="number"
        step="0.01"
        min="0"
        defaultValue={allowance}
        aria-label={t("Allowance")}
        className="h-7 w-[84px] text-[11px]"
      />
      <Input
        name="deduction"
        type="number"
        step="0.01"
        min="0"
        defaultValue={deduction}
        aria-label={t("Deduction")}
        className="h-7 w-[84px] text-[11px]"
      />
      <Input
        name="note"
        defaultValue={note ?? ""}
        placeholder={t("Note")}
        className="h-7 w-[120px] text-[11px]"
      />
      <SubmitButton size="sm" className="h-7 px-2 text-[11px]">
        {t("Save")}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

/* ------------------------------------------------------------- send it up */

export function SubmitRunForm({
  runId,
  accounts,
  defaultAccountId,
}: {
  runId: string;
  accounts: { id: string; name: string; currency: string }[];
  defaultAccountId: string | null;
}) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ code: string }> | undefined,
    FormData
  >(submitPayrollRun, undefined);

  return (
    <form action={action} className="space-y-2 rounded-xl border bg-card p-3">
      <input type="hidden" name="runId" value={runId} />
      <p className="text-[11px] text-muted-foreground">
        {t(
          "Name the account these salaries will be paid from. The manager is agreeing to a payment out of that account, not to a total — so it is chosen here, before the decision, not after it."
        )}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          {t("Paid from")}
          <select
            name="accountId"
            defaultValue={defaultAccountId ?? ""}
            required
            className="focus-ring mt-1 block h-8 min-w-[190px] rounded-md border bg-card px-2 text-xs"
          >
            <option value="">{t("— choose an account —")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </label>
        <Input
          name="note"
          placeholder={t("Anything the manager should know")}
          className="h-8 min-w-[190px] flex-1 text-xs"
        />
        <SubmitButton size="sm" className="h-8 px-3 text-xs">
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {t("Send to the manager")}
        </SubmitButton>
      </div>
      <FormError state={state} />
    </form>
  );
}

/* -------------------------------------------------------- agree, or send back */

export function DecideRunForm({ runId }: { runId: string }) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ status: string }> | undefined,
    FormData
  >(decidePayrollRun, undefined);

  return (
    <form action={action} className="space-y-2 rounded-xl border bg-card p-3">
      <input type="hidden" name="runId" value={runId} />
      <Input
        name="decisionNote"
        placeholder={t("A reason — required to send it back")}
        className="h-8 text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          size="sm"
          name="decision"
          value="APPROVED"
          className="h-8 px-3 text-xs"
        >
          <Check className="mr-1.5 h-3.5 w-3.5" />
          {t("Agree this run")}
        </SubmitButton>
        <SubmitButton
          size="sm"
          name="decision"
          value="REJECTED"
          className="h-8 border bg-transparent px-3 text-xs text-destructive hover:bg-destructive/10"
        >
          <Undo2 className="mr-1.5 h-3.5 w-3.5" />
          {t("Send it back")}
        </SubmitButton>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t(
          "Agreeing does not pay anybody. It is a signature on the figures; paying is a separate press, because the day the money leaves is a fact about the bank rather than about the decision."
        )}
      </p>
      <FormError state={state} />
    </form>
  );
}

/* ------------------------------------------------------------------- pay it */

/**
 * The one control on either screen that moves money.
 *
 * It says what it will do before it does it — the same treatment cancelling a
 * payment gets, and for the same reason: this is the largest single payment the
 * company makes each month and there is no undo. A date field because salaries
 * are often paid on a day that is not the day somebody got round to recording
 * them, and the ledger has to read the day the bank moved.
 */
export function PayRunForm({
  runId,
  accountName,
  today,
}: {
  runId: string;
  accountName: string;
  today: string;
}) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ expenseNumber: string }> | undefined,
    FormData
  >(payPayrollRun, undefined);

  return (
    <form
      action={action}
      className="space-y-2 rounded-xl border border-warning/40 bg-warning/[0.04] p-3"
    >
      <input type="hidden" name="runId" value={runId} />
      <p className="text-[11px] text-muted-foreground">
        {t("This books a salaries expense against")} <strong>{accountName}</strong>
        {t(
          " and posts it to the ledger. The money is out from that moment, the run is final, and there is no undo — a mistake is answered by a correcting entry, not by editing this."
        )}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          {t("Day the money left")}
          <Input
            type="date"
            name="paidAt"
            max={today}
            defaultValue={today}
            className="mt-1 h-8 w-[150px] text-xs"
          />
        </label>
        <SubmitButton size="sm" className="h-8 px-3 text-xs">
          <Wallet className="mr-1.5 h-3.5 w-3.5" />
          {t("Pay the salaries")}
        </SubmitButton>
      </div>
      <FormError state={state} />
    </form>
  );
}
