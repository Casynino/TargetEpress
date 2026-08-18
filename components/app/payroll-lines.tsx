"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, Check, Send } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { IconHint } from "@/components/app/icon-hint";
import { useT } from "@/components/app/locale-provider";
import { PayrollAmount } from "@/components/app/payroll-amount";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  buildPayrollRun,
  submitPayrollRun,
  updatePayrollItem,
} from "@/lib/actions/payroll";
import { formatShillings } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/types";

/*
  Finance's half of the salary run: build it, edit the exceptions, send it up.

  The lines are a grid of forms rather than a <table>. A row here has to POST on
  its own — thirty lines saved together is one clerk overwriting another's
  correction — and a <form> is not allowed inside a <tr>: the parser hoists it
  out of the table and the server and client trees stop matching. Every row is
  its own form, laid out on shared widths.
*/

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The widths every row, the header and the totals line agree on. */
const W = {
  gross: "w-24 text-right",
  adjust: "w-20",
  note: "w-28",
  net: "w-24 text-right",
  save: "w-7",
};

export type PayrollLineRow = {
  id: string;
  name: string;
  roleLabel: string;
  employeeId: string | null;
  /** USD, like every stored figure here. The screen prints shillings. */
  gross: number;
  allowance: number;
  deduction: number;
  net: number;
  note: string | null;
};

export type PayrollTotalsView = {
  gross: number;
  allowance: number;
  deduction: number;
  net: number;
  headcount: number;
};

export type PayrollAccountOption = {
  id: string;
  name: string;
  currency: string;
};

/**
 * Build the month from the staff register.
 *
 * The period is asked for rather than assumed. Finance closes a month a few
 * days into the next one as often as not, and a screen that could only ever
 * build "today's month" would leave them no way to run August on the 2nd of
 * September. The action refuses a month that has not started yet.
 */
export function PayrollBuild({
  year,
  month,
  headcount,
}: {
  year: number;
  month: number;
  /** How many staff have a monthly salary set — what the run would contain. */
  headcount: number;
}) {
  const t = useT();
  const [state, build] = useActionState<
    ActionResult<{ id: string; code: string; headcount: number }> | undefined,
    FormData
  >(buildPayrollRun, undefined);

  return (
    <section className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{t("Build the salary run")}</h2>
        <p className="text-[11px] text-muted-foreground">
          {headcount === 0
            ? t(
                "Nobody on the staff register has a monthly salary set, so there is nothing to build yet."
              )
            : `${headcount} ${t(
                "staff have a monthly salary set. Anybody missing has none — set it on their staff record."
              )}`}
        </p>
      </div>

      <form action={build} className="flex flex-wrap items-center gap-2">
        <NativeSelect
          name="month"
          defaultValue={String(month)}
          aria-label={t("Month")}
          className="h-8 w-36 text-xs"
        >
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {t(name)}
            </option>
          ))}
        </NativeSelect>
        {/* This year and last, and no further. Anything older is a month that
            was either run at the time or never will be. */}
        <NativeSelect
          name="year"
          defaultValue={String(year)}
          aria-label={t("Year")}
          className="h-8 w-24 text-xs"
        >
          {[year, year - 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </NativeSelect>
        <SubmitButton
          size="sm"
          variant="brand"
          className="h-8 px-3 text-xs"
          pendingLabel={t("Building…")}
        >
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
          {t("Build it from the staff register")}
        </SubmitButton>
      </form>

      <FormError state={state} />
    </section>
  );
}

/**
 * One person's line, editable.
 *
 * Gross is printed, never typed. What somebody earns a month is a fact about
 * their employment and lives on their staff record; an allowance and a
 * deduction are true of this month only, which is why those are the two boxes
 * here. The net is recomputed as it is typed so the effect of a deduction is
 * seen before it is saved, and the server recomputes it from the same sum.
 */
function EditableLine({
  line,
  rate,
}: {
  line: PayrollLineRow;
  rate: number | null;
}) {
  const t = useT();
  const [state, save] = useActionState<
    ActionResult<{ net: number }> | undefined,
    FormData
  >(updatePayrollItem, undefined);

  const [allowance, setAllowance] = useState(
    line.allowance ? String(line.allowance) : ""
  );
  const [deduction, setDeduction] = useState(
    line.deduction ? String(line.deduction) : ""
  );

  const n = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);
  const net = line.gross + n(allowance) - n(deduction);

  return (
    <form action={save} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
      <input type="hidden" name="itemId" value={line.id} />

      <div className="min-w-[9rem] flex-1">
        <p className="truncate text-xs font-medium">{line.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {t(line.roleLabel)}
          {line.employeeId ? ` · ${line.employeeId}` : ""}
        </p>
      </div>

      <PayrollAmount usd={line.gross} rate={rate} className={W.gross} />

      {/* Typed in dollars, which is what the line is stored in. A shilling box
          would have to convert at a rate that moves, and a slip for a month
          that has passed cannot be allowed to restate itself. */}
      <MoneyInput
        name="allowance"
        value={allowance}
        onValueChange={setAllowance}
        placeholder="0.00"
        aria-label={`${t("Allowance for")} ${line.name}`}
        className={cn("h-7 text-[11px]", W.adjust)}
      />
      <MoneyInput
        name="deduction"
        value={deduction}
        onValueChange={setDeduction}
        placeholder="0.00"
        aria-label={`${t("Deduction for")} ${line.name}`}
        className={cn("h-7 text-[11px]", W.adjust)}
      />
      <Input
        name="note"
        defaultValue={line.note ?? ""}
        placeholder={t("Why")}
        aria-label={`${t("Note for")} ${line.name}`}
        /* Its own line on a phone, a column beside the figures from sm up —
           the same 7rem the header and the totals line reserve for it. */
        className="h-7 w-full text-[11px] sm:w-28"
      />

      <PayrollAmount
        usd={net}
        rate={rate}
        strong
        className={cn(W.net, net < 0 ? "text-destructive" : "")}
      />

      <IconHint label={t("Save this line")}>
        <SubmitButton
          size="sm"
          aria-label={t("Save this line")}
          className={cn("h-7 p-0", W.save)}
          /* No word: the button is a 28px square on a row that repeats thirty
             times, and "Working…" inside it would break the column. */
          pendingLabel=""
        >
          <Check className="h-3.5 w-3.5" />
        </SubmitButton>
      </IconHint>

      {state && !state.ok ? (
        <div className="basis-full">
          <FormError state={state} />
        </div>
      ) : null}
    </form>
  );
}

/** The same line once the run has left Finance's hands. */
function ReadOnlyLine({
  line,
  rate,
}: {
  line: PayrollLineRow;
  rate: number | null;
}) {
  const t = useT();

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
      <div className="min-w-[9rem] flex-1">
        <p className="truncate text-xs font-medium">{line.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {t(line.roleLabel)}
          {line.employeeId ? ` · ${line.employeeId}` : ""}
          {line.note ? ` · “${line.note}”` : ""}
        </p>
      </div>

      <PayrollAmount usd={line.gross} rate={rate} className={W.gross} />
      {/* A dash where there is nothing. Most people have neither an allowance
          nor a deduction, and thirty stacked "TSh 0" would bury the two lines
          that do. */}
      <Adjustment usd={line.allowance} rate={rate} />
      <Adjustment usd={line.deduction} rate={rate} />
      <PayrollAmount usd={line.net} rate={rate} strong className={W.net} />
    </div>
  );
}

function Adjustment({ usd, rate }: { usd: number; rate: number | null }) {
  if (usd === 0) {
    return (
      <span className={cn("text-right text-xs text-muted-foreground/50", W.adjust)}>
        —
      </span>
    );
  }
  return <PayrollAmount usd={usd} rate={rate} className={cn("text-right", W.adjust)} />;
}

/**
 * The month, line by line, and what it adds up to.
 *
 * The totals are summed from the lines on every read rather than stored on the
 * run — see the note in lib/payroll.ts. The reason it matters on this screen is
 * that a line is edited here: a header total written once would disagree with
 * the rows underneath it the moment somebody records a deduction.
 */
export function PayrollLines({
  lines,
  totals,
  rate,
  editable,
}: {
  lines: PayrollLineRow[];
  totals: PayrollTotalsView;
  rate: number | null;
  editable: boolean;
}) {
  const t = useT();

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Column names on the widths the rows use. Hidden below lg, where the
          rows wrap and a header cannot line up with anything. */}
      <div className="hidden items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:flex">
        <span className="min-w-0 flex-1">{t("Staff")}</span>
        <span className={W.gross}>{t("Gross")}</span>
        <span className={cn(W.adjust, editable ? "" : "text-right")}>
          {t("Allowance")}
          {editable ? " (USD)" : ""}
        </span>
        <span className={cn(W.adjust, editable ? "" : "text-right")}>
          {t("Deduction")}
          {editable ? " (USD)" : ""}
        </span>
        {editable ? <span className={W.note}>{t("Why")}</span> : null}
        <span className={W.net}>{t("Net")}</span>
        {editable ? <span className={W.save} /> : null}
      </div>

      <div className="divide-y">
        {lines.map((line) =>
          editable ? (
            <EditableLine key={line.id} line={line} rate={rate} />
          ) : (
            <ReadOnlyLine key={line.id} line={line} rate={rate} />
          )
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-3 py-2">
        <span className="min-w-[9rem] flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {totals.headcount}{" "}
          {t(totals.headcount === 1 ? "person on this run" : "people on this run")}
        </span>
        <PayrollAmount usd={totals.gross} rate={rate} className={W.gross} />
        <PayrollAmount
          usd={totals.allowance}
          rate={rate}
          className={cn("text-right", W.adjust)}
        />
        <PayrollAmount
          usd={totals.deduction}
          rate={rate}
          className={cn("text-right", W.adjust)}
        />
        {editable ? <span className={cn("hidden sm:block", W.note)} /> : null}
        <PayrollAmount usd={totals.net} rate={rate} strong className={W.net} />
        {editable ? <span className={W.save} /> : null}
      </div>
    </div>
  );
}

/**
 * Send the month up.
 *
 * The account is chosen here rather than at payment, because that is what the
 * manager is being asked to agree to: money leaving a named account whose
 * balance he can check, not a total in the abstract. The figure beside the
 * picker is the same one he will see, so nobody sends up a number they have
 * not read.
 */
export function PayrollSubmit({
  runId,
  accounts,
  defaultAccountId,
  netUsd,
  rate,
}: {
  runId: string;
  accounts: PayrollAccountOption[];
  /** The account a sent-back run already named, kept so it is not re-chosen. */
  defaultAccountId: string | null;
  netUsd: number;
  rate: number | null;
}) {
  const t = useT();
  const [state, submit] = useActionState<
    ActionResult<{ code: string }> | undefined,
    FormData
  >(submitPayrollRun, undefined);
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");

  const account = accounts.find((a) => a.id === accountId) ?? null;
  /* A dollar bill cannot leave a shilling account with no rate published, and
     the action refuses it at payment. Saying so now spares the manager agreeing
     to something that will not go through. */
  const needsRate = account !== null && account.currency !== "USD" && rate === null;

  return (
    <form action={submit} className="space-y-2 rounded-xl border bg-card p-3">
      <input type="hidden" name="runId" value={runId} />

      <div className="flex flex-wrap items-end gap-2">
        {/* A div and a `for`, not a wrapping <label>: NativeSelect renders its
            chevron inside a positioning div, and a div is not phrasing content
            — inside a label the parser closes it early. */}
        <div className="min-w-[11rem] flex-1 space-y-0.5">
          <label
            htmlFor={`payroll-account-${runId}`}
            className="block text-[11px] font-medium text-muted-foreground"
          >
            {t("Paid from")}
          </label>
          <NativeSelect
            id={`payroll-account-${runId}`}
            name="accountId"
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-8 text-xs"
          >
            <option value="">{t("Choose the account")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="min-w-[11rem] flex-1 space-y-0.5">
          <label
            htmlFor={`payroll-note-${runId}`}
            className="block text-[11px] font-medium text-muted-foreground"
          >
            {t("Anything the manager should know")}
          </label>
          <Input
            id={`payroll-note-${runId}`}
            name="note"
            placeholder={t("Optional")}
            className="h-8 text-xs"
          />
        </div>

        <SubmitButton
          size="sm"
          variant="brand"
          className="h-8 px-3 text-xs"
          pendingLabel={t("Sending…")}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {t("Send it to the manager")}
        </SubmitButton>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {account ? (
          <>
            <span className="font-semibold text-foreground">
              {formatShillings(netUsd, rate)}
            </span>{" "}
            {t("leaves")} {account.name}
            {" · "}
          </>
        ) : null}
        {t(
          "Nothing on the run can be changed once it has gone up. It comes back only if the manager sends it back."
        )}
      </p>

      {needsRate ? (
        <p className="text-[11px] font-semibold text-warning">
          {t(
            "No exchange rate is published, so a dollar salary bill cannot be paid out of a shilling account. Publish one before this is agreed."
          )}
        </p>
      ) : null}

      <FormError state={state} />
    </form>
  );
}
