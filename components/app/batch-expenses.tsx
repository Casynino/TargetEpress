"use client";

import { useActionState, useState } from "react";
import { ChevronDown, Paperclip, Pencil, Plus } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  editExpense,
  recordExpense,
  reverseExpense,
  voidExpense,
} from "@/lib/actions/expenses";
import { formatLocal, formatUsd } from "@/lib/money";
import type { ActionResult } from "@/lib/actions/types";
import {
  BATCH_COST_TYPES,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CLASSES,
} from "@/lib/expenses";
import type { ExpenseAccount } from "@/components/app/expense-form";

/**
 * How many expenses the panel shows before it starts scrolling.
 *
 * Four, matching the attention panel on the Finance dashboard, which is the
 * screen this desk spends its day on. The number is here rather than inline
 * because the box height below is cut to exactly this many rows and the two
 * have to move together.
 */
const VISIBLE_ROWS = 4;

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
  /** Which account it left, so the editor can open on the right one. */
  accountId: string | null;
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
  closed = false,
}: {
  batchId: string;
  batchNumber: string;
  expenses: BatchExpenseRow[];
  accounts: ExpenseAccount[];
  /** USD → TZS, for showing a dollar cost in shillings. Null if unpublished. */
  rate: number | null;
  canRecord: boolean;
  /** A closed batch takes no more costs, so it is not offered a form. */
  closed?: boolean;
}) {
  const t = useT();
  /** Which cost the picker is showing. Defaults to the first not yet recorded. */
  const [choice, setChoice] = useState<string>("");
  /** The row whose editor is open, if any. One at a time. */
  const [editing, setEditing] = useState<string | null>(null);

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

  /** What the box cannot show. Four rows at 40px, cut to the row. */
  const hiddenRows = Math.max(0, operating.length - VISIBLE_ROWS);

  return (
    /*
      Money out, and the panel says so before you have read a word.

      Every other card on this page is neutral card stock. This one carries a
      faint red wash and a red hairline, so the block of the page that is
      spending is separable from the block that is earning at a glance — the
      tint is 4%, which is enough to tell two surfaces apart and not enough to
      make a warning out of an ordinary clearing bill.
    */
    /* An id, so the close panel can send somebody straight here to fix a
       figure instead of telling them it is "below" and leaving them to look. */
    <section
      id="batch-costs"
      className="mb-6 scroll-mt-4 overflow-hidden rounded-xl border border-destructive/25 bg-card shadow-soft"
    >
      <div className="bg-destructive/[0.04]">
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
          {/* Red, because it is money that has gone. Same rule as the row
              figures and as the Expenses tile in the band above. */}
          <p className="font-display text-xl font-bold tabular-nums text-destructive">
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

          And bounded, the same way the attention panel on the dashboard is
          bounded: four rows, then scroll, and a line at the foot that says so
          out loud. Nothing stops a batch collecting twenty costs, and a panel
          that simply grows pushes the cargo table off the screen for everybody
          who did not come here about money. The total in the header is always
          the total, whether or not the last line is on screen.

          Rows are a fixed h-10 so the box can be cut to exactly four of them:
          border-box sizing puts the divider inside the 40px, so four rows are
          160px and max-h-40 lands on the seam. A half-row peeking out of a
          scroll area is how a list ends up looking broken rather than
          continued.
        */
        <>
        <ul className="max-h-40 divide-y divide-border/60 overflow-y-auto">
          {operating.map((e) => (
            <li key={e.id}>
            <div className="group flex h-10 items-center gap-x-3 px-5 text-sm transition-colors hover:bg-muted/20">
              {/*
                One state, marked once.

                Paid or not is the only thing about an expense that can be
                wrong, and it is what somebody scans this list for. The rail
                makes it findable down the left edge; the words stay, because
                a colour on its own is not a fact anybody can read.
              */}
              <span
                aria-hidden
                className={`h-5 w-0.5 shrink-0 rounded-full ${
                  e.accountName ? "bg-border" : "bg-warning"
                }`}
              />
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
              <span className="w-32 shrink-0 text-right font-medium tabular-nums text-destructive">
                {shillings(tsh(e))}
              </span>
              {/*
                Correcting a cost, from the row it is on.

                Costs are typed in a hurry by somebody who has just come back
                from the port, so a wrong figure or a wrong description is
                ordinary. Sending them to the central expenses register to fix
                it means finding it again among every cost the company has ever
                paid. The pencil is quiet until the row is hovered or the key
                lands on it — an edit affordance on every row of a money list
                invites edits, and most rows do not need one.
              */}
              {canRecord && !closed ? (
                <button
                  type="button"
                  onClick={() => setEditing(editing === e.id ? null : e.id)}
                  aria-label={`${t("Correct")} ${e.description}`}
                  className="focus-ring shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span aria-hidden className="w-[26px] shrink-0" />
              )}
            </div>
            {editing === e.id ? (
              <ExpenseEditor
                  row={e}
                  batchId={batchId}
                  accounts={accounts}
                  onDone={() => setEditing(null)}
                />
            ) : null}
            </li>
          ))}
        </ul>
        {/* Said out loud, because a scroll area with no edge showing looks
            like the whole list. Worded and built exactly as the dashboard's
            attention panel, so a bounded list means the same thing on both
            screens rather than being a trick this one page plays. */}
        {hiddenRows > 0 ? (
          <p className="flex items-center justify-center gap-1.5 border-t px-4 py-1.5 text-xs text-muted-foreground">
            <ChevronDown className="h-3 w-3" />
            {t("scroll for")} {hiddenRows} {t("more")}
          </p>
        ) : null}
        </>
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

      {/* The server refuses a cost on a closed batch. Offering the boxes
          anyway would be a form whose only outcome is an error message. */}
      {closed ? (
        <p className="border-t bg-muted/25 px-5 py-3 text-xs text-muted-foreground">
          {t("This batch is closed. Reopen it to add a cost.")}
        </p>
      ) : canRecord ? (
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
      </div>
    </section>
  );
}

/**
 * Correcting one cost, in the row it is on.
 *
 * Two different repairs, because they are two different facts.
 *
 * A cost that has not been paid has no ledger line and no account balance
 * standing on it, so a wrong figure is just a wrong figure: it is corrected,
 * with a reason, and the change is kept as history. A cost whose money has
 * already left an account cannot have its amount edited at all — the account
 * would disagree with the ledger and nothing would say why. That one is
 * REVERSED: the row stays, its ledger line stays, and an opposite line is
 * written against it. The server enforces both; the form only reflects them.
 */
function ExpenseEditor({
  row,
  batchId,
  accounts,
  onDone,
}: {
  row: BatchExpenseRow;
  batchId: string;
  /** Every company account; the editor shows the ones in this cost's currency. */
  accounts: ExpenseAccount[];
  onDone: () => void;
}) {
  const t = useT();
  const paid = row.status === "PAID";

  const [editState, edit] = useActionState<
    ActionResult<{ expenseNumber: string }>,
    FormData
  >(editExpense, { ok: true });
  /* Two actions with different result shapes; the form only needs the error. */
  const [killState, kill] = useActionState<ActionResult<unknown>, FormData>(
    paid
      ? (reverseExpense as unknown as (
          prev: ActionResult<unknown>,
          data: FormData
        ) => Promise<ActionResult<unknown>>)
      : (voidExpense as unknown as (
          prev: ActionResult<unknown>,
          data: FormData
        ) => Promise<ActionResult<unknown>>),
    { ok: true }
  );

  return (
    <div className="border-t bg-muted/25 px-5 py-3">
      <form action={edit} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="expenseId" value={row.id} />
        {/* Unchanged fields still have to be posted: the action compares the
            whole record and writes down only what actually moved. */}
        <input
          type="hidden"
          name="expenseClass"
          value={
            EXPENSE_CLASSES.includes(row.expenseClass as (typeof EXPENSE_CLASSES)[number])
              ? row.expenseClass
              : "OPERATING"
          }
        />
        <input type="hidden" name="incurredAt" value={row.incurredAt} />
        {/*
          Every field the action compares has to be posted, including the ones
          this form does not show.

          The action reads the whole record and writes down whatever moved, so
          a field left out of the body arrives as empty and is saved as empty.
          Leaving these three off detached the cost from its flight and wiped
          the vendor the first time anybody corrected a typo — caught by the
          change history, which recorded "Dispatch → null" in plain sight.
        */}
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="vendor" value={row.vendor ?? ""} />
        <input type="hidden" name="note" value={row.note ?? ""} />

        {/*
          Every field of the record, not three of them.

          The owner's rule: an edit should be a complete change. A cost gets
          recorded against the wrong category, or out of petty cash when it
          actually left CRDB, as often as it gets a digit wrong — and having to
          cancel a correct cost and retype it to fix its account is how a
          register fills up with cancelled rows nobody can read.
        */}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">{t("Expense")}</span>
          <NativeSelect
            name="category"
            defaultValue={row.category}
            className="h-9 w-44 bg-card text-sm"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(EXPENSE_CATEGORY_LABELS[c] ?? c)}
              </option>
            ))}
          </NativeSelect>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">{t("What it was")}</span>
          <Input
            name="description"
            defaultValue={row.description}
            required
            minLength={3}
            className="h-9 bg-card text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">{t("Amount")}</span>
          <Input
            name="amount"
            inputMode="numeric"
            defaultValue={String(row.amount)}
            className="h-9 w-32 bg-card text-sm tabular-nums"
          />
        </label>

        {/*
          Which account it left, including "none".

          On a cost that has already been paid this moves real money, and the
          action treats it that way: the ledger line on the wrong account is
          reversed and a correct one posted, so a balance never quietly
          disagrees with a bank statement. Saying so here means nobody is
          surprised by two lines appearing in the ledger.
        */}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">{t("Paid from")}</span>
          <NativeSelect
            name="accountId"
            defaultValue={row.accountId ?? ""}
            className="h-9 w-44 bg-card text-sm"
          >
            <option value="">{t("Not paid yet")}</option>
            {accounts
              .filter((a) => a.currency === row.currency)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </NativeSelect>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">
            {t("Why is it being corrected")}
          </span>
          <Input
            name="reason"
            required
            minLength={3}
            placeholder={t("Typed the wrong figure")}
            className="h-9 bg-card text-sm"
          />
        </label>

        <SubmitButton
          variant="ghost"
          className="h-9 border border-brand/35 bg-brand/10 px-3 text-brand hover:bg-brand/20 hover:text-brand"
          pendingLabel={t("Saving…")}
        >
          {t("Save")}
        </SubmitButton>
        <button
          type="button"
          onClick={onDone}
          className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("Cancel")}
        </button>
      </form>
      <FormError state={editState} />

      {/* Taking it back out. A cost that never happened is cancelled; one whose
          money moved is reversed, and the difference is not the user's to
          remember — the row already knows which it is. */}
      <form action={kill} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="expenseId" value={row.id} />
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">
            {paid
              ? t("Reverse this cost — an opposite entry, so the account balance comes back")
              : t("Cancel this cost — it should never have been recorded")}
          </span>
          <Input
            name="reason"
            required
            minLength={3}
            placeholder={t("Why")}
            className="h-9 bg-card text-sm"
          />
        </label>
        <SubmitButton
          variant="ghost"
          className="h-9 border border-destructive/35 bg-destructive/10 px-3 text-destructive hover:bg-destructive/20 hover:text-destructive"
          pendingLabel={t("Working…")}
        >
          {paid ? t("Reverse") : t("Cancel this cost")}
        </SubmitButton>
      </form>
      <FormError state={killState} />
    </div>
  );
}
