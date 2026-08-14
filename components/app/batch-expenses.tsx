"use client";

import { useActionState, useState } from "react";
import { Check, Paperclip, Plus } from "lucide-react";

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
 * What this flight cost, as the six things that actually happen to it.
 *
 * The owner's correction, and it is the right one: a dispatch does not incur
 * "an expense in a category" — it is cleared at Zanzibar, cleared at Dar, may
 * need a permit at either, and is trucked twice. Those six are always on the
 * list whether or not they have been paid, so a blank row is a reminder rather
 * than an absence nobody notices. Anything unusual goes in the row underneath.
 *
 * Shillings lead. The office pays the clearing agent in shillings and reads
 * shillings all day; the dollar figure is what the invoice says, so it sits
 * underneath in small type rather than the other way round.
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
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);

  const [state, action] = useActionState<
    ActionResult<{ expenseNumber: string }>,
    FormData
  >(recordExpense, { ok: true });

  /** Every figure in shillings, whichever currency it was paid in. */
  const tsh = (row: { amount: number; currency: string; amountUsd: number }) =>
    row.currency === "TZS"
      ? row.amount
      : rate
        ? row.amountUsd * rate
        : null;

  // Same formatter as everywhere else, so no screen quotes a different symbol.
  const shillings = (n: number | null) => (n === null ? "—" : formatLocal(n));
  const dollars = (n: number) => formatUsd(n);

  const live = expenses.filter((e) => e.status !== "VOID");

  // A recorded cost is matched to its row by the name it was recorded under.
  const forType = (label: string) =>
    live.find((e) => e.description.toLowerCase() === label.toLowerCase());

  const standardLabels = new Set(
    BATCH_COST_TYPES.map((c) => c.label.toLowerCase())
  );
  const others = live.filter(
    (e) => !standardLabels.has(e.description.toLowerCase())
  );

  const totalTsh = live.reduce((sum, e) => sum + (tsh(e) ?? 0), 0);
  const totalUsd = live.reduce((sum, e) => sum + e.amountUsd, 0);

  /** One row: the cost, and either its figure or a box to put one in. */
  const CostRow = ({
    label,
    category,
    recorded,
  }: {
    label: string;
    category: string;
    recorded?: BatchExpenseRow;
  }) => {
    const open = openRow === label;
    return (
      <div className="border-b last:border-0">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {recorded ? (
              <Check className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-dashed" />
            )}
            <span className={recorded ? "font-medium" : "text-muted-foreground"}>
              {t(label)}
            </span>
            {recorded?.receipts ? (
              <Paperclip className="h-3 w-3 text-muted-foreground" />
            ) : null}
          </div>

          {recorded ? (
            <div className="text-right">
              <p className="font-display font-bold tabular-nums">
                {shillings(tsh(recorded))}
              </p>
              <p className="text-xs text-muted-foreground">
                {dollars(recorded.amountUsd)} ·{" "}
                {recorded.accountName ?? t("not paid yet")}
              </p>
            </div>
          ) : canRecord ? (
            <button
              type="button"
              onClick={() => setOpenRow(open ? null : label)}
              className="focus-ring rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent"
            >
              {open ? t("Cancel") : t("Add")}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">{t("Not recorded")}</span>
          )}
        </div>

        {open && !recorded ? (
          <form action={action} className="bg-muted/30 px-5 py-3">
            {/* The row already knows what it is; only the figure is asked for. */}
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="description" value={label} />
            <input type="hidden" name="category" value={category} />
            <input type="hidden" name="currency" value="TZS" />
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("Amount in shillings")}
                </span>
                <Input
                  name="amount"
                  inputMode="numeric"
                  required
                  autoFocus
                  placeholder="0"
                  className="h-8 w-40 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("Paid from")}
                </span>
                <NativeSelect name="accountId" defaultValue="" className="h-8 text-sm">
                  <option value="">{t("Not paid yet")}</option>
                  {accounts
                    .filter((a) => a.currency === "TZS")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </NativeSelect>
              </label>
              <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")}>
                {t("Record")}
              </SubmitButton>
            </div>
            <FormError state={state} />
          </form>
        ) : null}
      </div>
    );
  };

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
          <p className="text-xs text-muted-foreground">{dollars(totalUsd)}</p>
        </div>
      </div>

      {BATCH_COST_TYPES.map((type) => (
        <CostRow
          key={type.key}
          label={type.label}
          category={type.category}
          recorded={forType(type.label)}
        />
      ))}

      {others.map((e) => (
        <div
          key={e.id}
          className="flex flex-wrap items-center gap-3 border-b px-5 py-3 last:border-0"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-success" />
            <span className="font-medium">{e.description}</span>
            {e.expenseClass === "NON_OPERATING" ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t("Special — not in this flight's profit")}
              </span>
            ) : null}
            {e.receipts > 0 ? (
              <Paperclip className="h-3 w-3 text-muted-foreground" />
            ) : null}
          </div>
          <div className="text-right">
            <p className="font-display font-bold tabular-nums">{shillings(tsh(e))}</p>
            <p className="text-xs text-muted-foreground">
              {dollars(e.amountUsd)} · {e.accountName ?? t("not paid yet")}
            </p>
          </div>
        </div>
      ))}

      {canRecord ? (
        <div className="bg-muted/30 px-5 py-3">
          {showOther ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="batchId" value={batchId} />
              <input type="hidden" name="currency" value="TZS" />
              <input type="hidden" name="category" value="OTHER" />
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
                  className="h-8 w-56 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t("Amount in shillings")}
                </span>
                <Input
                  name="amount"
                  inputMode="numeric"
                  required
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
                  {accounts
                    .filter((a) => a.currency === "TZS")
                    .map((a) => (
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
                onClick={() => setShowOther(false)}
                className="h-8 text-xs text-muted-foreground underline"
              >
                {t("Cancel")}
              </button>
              <FormError state={state} />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowOther(true)}
              className="focus-ring inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("Another cost on this flight")}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
