"use client";

import { useActionState, useState } from "react";
import { Paperclip } from "lucide-react";

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

  const totalTsh = live.reduce((sum, e) => sum + (tsh(e) ?? 0), 0);
  const totalUsd = live.reduce((sum, e) => sum + e.amountUsd, 0);
  const payFrom = accounts.filter((a) => a.currency === "TZS");

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
        <div>
          <h2 className="font-display font-semibold">{t("Cost of this batch")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("Clearing, permits and transport for")} {batchNumber}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg font-bold tabular-nums">
            {shillings(totalTsh)}
          </p>
          <p className="text-xs text-muted-foreground">{formatUsd(totalUsd)}</p>
        </div>
      </div>

      {/* A row is spent only on a cost that exists. */}
      {live.length === 0 ? (
        <p className="px-5 pt-4 text-sm text-muted-foreground">
          {t(
            "Nothing recorded yet, so this batch's profit has nothing taken off it."
          )}
        </p>
      ) : (
        <ul className="divide-y">
          {live.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-medium">{e.description}</span>
                {e.expenseClass === "NON_OPERATING" ? (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t("Special — not in profit")}
                  </span>
                ) : null}
                {e.receipts > 0 ? (
                  <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : null}
              </span>
              <span className="text-right">
                <span className="block font-display font-bold tabular-nums">
                  {shillings(tsh(e))}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatUsd(e.amountUsd)} · {e.accountName ?? t("not paid yet")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canRecord ? (
        <form
          action={action}
          className="flex flex-wrap items-end gap-2 border-t bg-muted/20 px-5 py-3"
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
              className="h-9 w-56 text-sm"
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
                className="h-9 w-48 text-sm"
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
              className="h-9 w-32 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("Paid from")}</span>
            <NativeSelect name="accountId" defaultValue="" className="h-9 text-sm">
              <option value="">{t("Not paid yet")}</option>
              {payFrom.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </label>

          <SubmitButton size="sm" variant="brand" pendingLabel={t("Adding…")}>
            {t("Add")}
          </SubmitButton>
          <FormError state={state} />
        </form>
      ) : null}
    </section>
  );
}
