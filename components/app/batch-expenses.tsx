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
 * What this batch cost: one line per expense, and one line to add the next.
 *
 * A register, not a chart. Six costs is an ordinary batch and twenty is a bad
 * one, so every device that looks good against three of them — a bar per row,
 * a colour per category, two lines of detail — is furniture that arrives
 * exactly when the panel can least afford it. Each expense is one line, the
 * list is sorted biggest first, and it keeps its own height.
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

    Both lists are sorted biggest first rather than newest first. The page
    hands them over in the order they were entered, which is the order they
    happened to be typed and tells a reader nothing. By size, the top of the
    list is the bill — and since the list is bounded, what is visible without
    scrolling is the part worth arguing about. The twelve-thousand-shilling
    bank charge belongs below the fold.
  */
  const bySize = (a: BatchExpenseRow, b: BatchExpenseRow) =>
    (tsh(b) ?? 0) - (tsh(a) ?? 0);
  const operating = live
    .filter((e) => e.expenseClass !== "NON_OPERATING")
    .sort(bySize);
  const special = live
    .filter((e) => e.expenseClass === "NON_OPERATING")
    .sort(bySize);

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
          <h2 className="font-display font-semibold">
            {t("Expenses in this batch")}
          </h2>
          {/*
            The nudge is what is MISSING, and it is not an error.

            Counting what has been recorded reads as "0 of 6" on a batch that
            has four costs against it — true of the standard list, and wrong
            about the batch. And in red it accused somebody of something that
            is only a reminder. Missing count, plain type, gone once the list
            is complete — which is why there is no permanent subtitle here:
            a line of prose explaining what a clearing bill is costs the same
            space every time the page opens and is read once.

            The count is beside it because the list is allowed to be taller
            than its box, and a count is how a reader knows that.
          */}
          {operating.length > 0 || remaining.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {operating.length > 0
                ? `${operating.length} ${t(operating.length === 1 ? "expense" : "expenses")}`
                : ""}
              {operating.length > 0 && remaining.length > 0 ? " · " : ""}
              {remaining.length > 0
                ? `${remaining.length} ${t("usual costs still to record")}`
                : ""}
            </p>
          ) : null}
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
          {t("Nothing recorded against")} {batchNumber}{" "}
          {t("yet, so its profit has nothing taken off it.")}
        </p>
      ) : (
        /*
          One line per expense, and it stays one line at twenty of them.

          The bars are gone. A share rail per row reads well against three
          costs and turns into six near-empty tracks the moment a real batch
          is entered — four of them at 1%, which is a lot of furniture to say
          "this one is not the problem". The share is a number in its own
          column instead: same fact, no drawing, and it still sorts the bill
          at a glance because the eye runs down a column of percentages
          faster than it compares six bar lengths.

          Fixed widths on the two right-hand columns rather than a grid,
          because each row is its own element — widths are what make the
          figures line up down the page, and figures that do not line up
          cannot be compared.

          And bounded. Nothing stops a batch collecting twenty costs, and a
          panel that simply grows pushes the cargo table off the screen for
          everybody who did not come here about money. The list keeps its own
          height and scrolls inside itself; the total in the header is always
          the total, whether or not the last line is on screen.
        */
        <div className="relative">
        <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto">
          {operating.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline gap-x-3 px-5 py-2 text-sm transition-colors hover:bg-muted/20"
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="truncate font-medium">{e.description}</span>
                {/* Where the money left from, or that it has not yet. */}
                {e.accountName ? (
                  <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">
                    {e.accountName}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-warning">
                    {t("not paid yet")}
                  </span>
                )}
                {/* A cost paid in dollars: say so, since the column is shillings. */}
                {e.currency !== "TZS" ? (
                  <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
                    {formatUsd(e.amountUsd)}
                  </span>
                ) : null}
                {e.receipts > 0 ? (
                  <Paperclip
                    className="h-3 w-3 shrink-0 text-muted-foreground"
                    aria-label={t("Receipt")}
                  />
                ) : null}
              </span>
              {/* The share is the first thing to go on a phone: on 430px of
                  screen the name is being clipped to make room for it, and
                  what a cost WAS beats what fraction of the bill it is. */}
              <span className="hidden w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                {Math.round(share(e))}%
              </span>
              <span className="w-32 shrink-0 text-right font-medium tabular-nums">
                {shillings(tsh(e))}
              </span>
            </li>
          ))}
        </ul>
        {/*
          A clipped row is the honest signal that the list continues, but a
          hard edge reads as a rendering fault. The last visible line fades
          instead. Row height is fixed, so ten is the count at which the box
          overflows — no measuring, and if it is out by one the fade simply
          sits at the foot of a full list, where it costs nothing.
        */}
        {operating.length > 9 ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
          />
        ) : null}
        </div>
      )}

      {/* Paid, recorded, and deliberately outside the total above. */}
      {special.length > 0 ? (
        <div className="border-t bg-muted/20 py-2">
          <p className="flex items-baseline gap-x-3 px-5 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="flex-1">{t("Special — not in profit")}</span>
            <span className="w-32 shrink-0 text-right font-semibold tabular-nums">
              {shillings(specialTsh)}
            </span>
          </p>
          <ul>
            {special.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline gap-x-3 px-5 py-1 text-xs text-muted-foreground"
              >
                <span className="min-w-0 flex-1 truncate">{e.description}</span>
                <span className="w-32 shrink-0 text-right tabular-nums">
                  {shillings(tsh(e))}
                </span>
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
            <span className="text-[11px] text-muted-foreground">{t("Expense")}</span>
            <NativeSelect
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="h-9 w-56 bg-card text-sm"
              aria-label={t("Expense")}
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
