"use client";

import { useActionState, useState } from "react";
import { Paperclip, Plus, X } from "lucide-react";

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
 * What this flight cost: the costs it has, and a line of the ones it might.
 *
 * The first version listed all six standard costs permanently, so a flight with
 * one cost recorded spent six rows saying what had NOT happened. The owner's
 * correction: the prompt is worth keeping, six empty rows are not. The costs
 * still to record are chips on one line — a tap opens a box for the figure —
 * and a full row is spent only on a cost that exists.
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
  /** Which cost is being entered: a named one, "something else", or nothing. */
  const [adding, setAdding] = useState<
    { label: string; category: string; free: boolean } | null
  >(null);

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

  // Only the standard costs this flight has not had yet.
  const remaining = BATCH_COST_TYPES.filter(
    (c) => !recorded.has(c.label.toLowerCase())
  );

  const totalTsh = live.reduce((sum, e) => sum + (tsh(e) ?? 0), 0);
  const totalUsd = live.reduce((sum, e) => sum + e.amountUsd, 0);
  const payFrom = accounts.filter((a) => a.currency === "TZS");

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
        <div>
          <h2 className="font-display font-semibold">{t("Cost of this flight")}</h2>
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
            "Nothing recorded yet, so this flight's profit has nothing taken off it."
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
        <div className="border-t bg-muted/20 px-5 py-3">
          {adding ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="batchId" value={batchId} />
              <input type="hidden" name="currency" value="TZS" />
              <input type="hidden" name="category" value={adding.category} />

              {/* A named cost carries its own name; only "something else" asks. */}
              {adding.free ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">
                    {t("What was it for")}
                  </span>
                  <Input
                    name="description"
                    required
                    minLength={3}
                    autoFocus
                    placeholder={t("Something else this flight cost")}
                    className="h-8 w-52 text-sm"
                  />
                </label>
              ) : (
                <>
                  <input type="hidden" name="description" value={adding.label} />
                  <span className="mb-1.5 text-sm font-medium">
                    {t(adding.label)}
                  </span>
                </>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("Amount in shillings")}
                </span>
                <Input
                  name="amount"
                  inputMode="numeric"
                  required
                  autoFocus={!adding.free}
                  placeholder="0"
                  className="h-8 w-36 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("Paid from")}
                </span>
                <NativeSelect name="accountId" defaultValue="" className="h-8 text-sm">
                  <option value="">{t("Not paid yet")}</option>
                  {payFrom.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>

              <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")}>
                {t("Record")}
              </SubmitButton>
              <button
                type="button"
                onClick={() => setAdding(null)}
                aria-label={t("Cancel")}
                className="focus-ring mb-0.5 rounded p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <FormError state={state} />
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">{t("Add")}</span>
              {remaining.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() =>
                    setAdding({ label: c.label, category: c.category, free: false })
                  }
                  className="focus-ring rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t(c.label)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAdding({ label: "", category: "OTHER", free: true })}
                className="focus-ring inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                {t("Something else")}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
