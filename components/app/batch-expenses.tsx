"use client";

import { useActionState, useState } from "react";
import { Paperclip, Plus } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { recordExpense } from "@/lib/actions/expenses";
import { formatLocal, formatUsd } from "@/lib/money";
import type { ActionResult } from "@/lib/actions/types";
import { BATCH_COST_TYPES } from "@/lib/expenses";
import type { ExpenseAccount } from "@/components/app/expense-form";

export type BatchExpenseRow = {
  id: string;
  expenseNumber: string;
  category: string;
  expenseClass: string;
  description: string;
  note: string | null;
  vendor: string | null;
  /** In whatever currency it was paid. */
  amount: number;
  currency: string;
  amountUsd: number;
  status: string;
  incurredAt: string;
  accountName: string | null;
  recordedBy: string | null;
  receipts: number;
};

/**
 * What this batch cost: the costs it has, and one line to add the next.
 *
 * Every cost carries a rail showing its share of the batch, in its own
 * category's colour. A list of four figures makes you do the arithmetic to
 * find out that transport is two thirds of the clearing bill; a rail says it
 * before you have read the numbers, which is the whole reason to look at this
 * panel rather than the ledger.
 *
 * Adding one is a single line that is always there: pick what it was, type the
 * shillings, say which account it left. No chips to tap first and no form to
 * open — the fastest version of this is the one where the boxes are already in
 * front of you, because the person doing it has just come back from the port
 * and is entering four of them at once.
 *
 * The picker still lists the six that happen on every batch, so it doubles as
 * the reminder that Zanzibar customs has not been entered yet.
 *
 * Shillings lead throughout. The office pays the clearing agent in shillings;
 * the dollar figure is what the invoice says, so it sits underneath in small
 * type rather than the other way round.
 */
export function BatchExpenses({
  batchId,
  batchNumber,
  expenses,
  accounts,
  rate,
  canRecord,
}: {
  batchId: string;
  batchNumber: string;
  expenses: BatchExpenseRow[];
  accounts: ExpenseAccount[];
  /** USD → TZS, for showing a dollar cost in shillings. Null if unpublished. */
  rate: number | null;
  canRecord: boolean;
}) {
  const t = useT();
  /** Which cost the picker is showing. Defaults to the first not yet recorded. */
  const [choice, setChoice] = useState<string>("");

  const [state, action] = useActionState<
    ActionResult<{ expenseNumber: string }>,
    FormData
  >(recordExpense, { ok: true });

  /** Every figure in shillings, whichever currency it was paid in. */
  const tsh = (row: { amount: number; currency: string; amountUsd: number }) =>
    row.currency === "TZS" ? row.amount : rate ? row.amountUsd * rate : null;

  const shillings = (n: number | null) => (n === null ? "—" : formatLocal(n));

  const live = expenses.filter((e) => e.status !== "VOID");
  const recorded = new Set(live.map((e) => e.description.toLowerCase()));

  /*
    Operating and special are counted apart, and only operating is totalled
    here.

    Batch profit is billed revenue minus OPERATING cost — that is what the
    panel above this one subtracts. Adding a special cost into this total
    would put a figure on screen that is larger than the Expenses figure two
    inches above it, and there would be no way to tell which one was wrong.
    Special costs are still shown, still paid, just kept where they belong.
  */
  const operating = live.filter((e) => e.expenseClass !== "NON_OPERATING");
  const special = live.filter((e) => e.expenseClass === "NON_OPERATING");

  // Only the standard costs this batch has not had yet.
  const remaining = BATCH_COST_TYPES.filter(
    (c) => !recorded.has(c.label.toLowerCase())
  );

  /*
    The picker's current selection, resolved to what the form needs.

    Falling back to the first remaining cost rather than to nothing: opening a
    batch that still owes four entries should have the next one already chosen.
  */
  const current = remaining.find((c) => c.key === choice) ?? remaining[0];
  const picked =
    choice === "other" || !current
      ? { label: "", category: "OTHER", free: true }
      : { label: current.label, category: current.category, free: false };

  const totalTsh = operating.reduce((sum, e) => sum + (tsh(e) ?? 0), 0);
  const totalUsd = operating.reduce((sum, e) => sum + e.amountUsd, 0);
  const specialTsh = special.reduce((sum, e) => sum + (tsh(e) ?? 0), 0);
  const payFrom = accounts.filter((a) => a.currency === "TZS");

  /** How much of the clearing bill this one cost is. */
  const share = (row: BatchExpenseRow) =>
    totalTsh > 0 ? ((tsh(row) ?? 0) / totalTsh) * 100 : 0;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-display font-semibold">{t("Cost of this batch")}</h2>
          {/*
            The nudge is what is MISSING, and it is not an error.

            Counting what has been recorded reads as "0 of 6" on a batch that
            has four costs against it — true of the standard list, and wrong
            about the batch. And in red it accused somebody of something that
            is only a reminder. Missing count, plain type, gone once the list
            is complete.
          */}
          <p className="text-xs text-muted-foreground">
            {t("Clearing, permits and transport for")} {batchNumber}
            {remaining.length > 0
              ? ` · ${remaining.length} ${t("usual costs still to record")}`
              : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-bold tabular-nums">
            {shillings(totalTsh)}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatUsd(totalUsd)}
          </p>
        </div>
      </div>

      {/* A row is spent only on a cost that exists. */}
      {live.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          {t(
            "Nothing recorded yet, so this batch's profit has nothing taken off it."
          )}
        </p>
      ) : (
        <ul className="divide-y">
          {operating.map((e) => (
            <li
              key={e.id}
              className="px-5 py-2.5 transition-colors hover:bg-muted/20"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="truncate text-sm font-medium">
                  {e.description}
                </span>
                {/* Where the money left from, or that it has not yet. */}
                {e.accountName ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {e.accountName}
                  </span>
                ) : (
                  <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">
                    {t("Not paid yet")}
                  </span>
                )}
                {e.receipts > 0 ? (
                  <Paperclip
                    className="h-3 w-3 text-muted-foreground"
                    aria-label={t("Receipt")}
                  />
                ) : null}
                <span className="ml-auto font-display text-base font-bold tabular-nums">
                  {shillings(tsh(e))}
                </span>
              </div>

              {/*
                One accent, not six.

                Colour-coding each category would need a legend nobody has,
                and would put green and red — which mean paid and missing
                everywhere else in this system — on a bar that means neither.
                Every rail is the brand colour and it is the LENGTH that
                carries the information: which line is most of the bill.
              */}
              <div className="mt-1.5 flex items-center gap-3">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="cost-rail block h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(share(e), 1.5)}%` }}
                  />
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {Math.round(share(e))}%
                </span>
                <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {formatUsd(e.amountUsd)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Paid, recorded, and deliberately outside the total above. */}
      {special.length > 0 ? (
        <div className="border-t bg-muted/20 px-5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("Special — not in profit")}
            </p>
            <p className="text-sm font-semibold tabular-nums text-muted-foreground">
              {shillings(specialTsh)}
            </p>
          </div>
          <ul className="mt-1 space-y-0.5">
            {special.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground"
              >
                <span className="truncate">{e.description}</span>
                <span className="tabular-nums">{shillings(tsh(e))}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canRecord ? (
        <form
          action={action}
          className="flex flex-wrap items-end gap-2 border-t bg-muted/25 px-5 py-3"
        >
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="currency" value="TZS" />
          {/* Whatever the picker is on decides the category too. */}
          <input type="hidden" name="category" value={picked.category} />

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("Cost")}</span>
            <NativeSelect
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="h-9 w-56 bg-card text-sm"
              aria-label={t("Cost")}
            >
              {remaining.map((c) => (
                <option key={c.key} value={c.key}>
                  {t(c.label)}
                </option>
              ))}
              <option value="other">{t("Something else")}</option>
            </NativeSelect>
          </label>

          {/* Named costs carry their own description; only "something else" asks. */}
          {picked.free ? (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                {t("What was it for")}
              </span>
              <Input
                name="description"
                required
                minLength={3}
                placeholder={t("What was it for")}
                className="h-9 w-48 bg-card text-sm"
              />
            </label>
          ) : (
            <input type="hidden" name="description" value={picked.label} />
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t("Amount in shillings")}
            </span>
            <Input
              name="amount"
              inputMode="numeric"
              required
              placeholder="0"
              className="h-9 w-32 bg-card text-sm tabular-nums"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("Paid from")}</span>
            <NativeSelect
              name="accountId"
              defaultValue=""
              className="h-9 bg-card text-sm"
            >
              <option value="">{t("Not paid yet")}</option>
              {payFrom.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </label>

          {/*
            Interactive, not loud.

            A solid brand fill made the Add button the brightest object on a
            page whose subject is a twenty-million shilling batch. Recording a
            cost is routine data entry; it needs to look pressable, not
            important.
          */}
          <SubmitButton
            variant="ghost"
            className="h-9 gap-1.5 border border-brand/35 bg-brand/10 px-3 text-brand hover:bg-brand/20 hover:text-brand"
            pendingLabel={t("Adding…")}
          >
            <Plus className="h-4 w-4" />
            {t("Add")}
          </SubmitButton>
          <FormError state={state} />
        </form>
      ) : null}
    </section>
  );
}
