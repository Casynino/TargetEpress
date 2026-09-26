"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Crown,
  Landmark,
  Paperclip,
  Plane,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  FormError,
  FormSuccess,
  SubmitButton,
} from "@/components/app/form-feedback";
import {
  IdempotencyKey,
  useIdempotencyKey,
} from "@/components/app/idempotency-key";
import { useT } from "@/components/app/locale-provider";
import { UnsavedGuard, confirmDiscard } from "@/components/app/unsaved-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { recordExpense } from "@/lib/actions/expenses";
import {
  COMMON_EXPENSES,
  EXPENSE_CATEGORY_GROUPS,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CLASSES,
  EXPENSE_CLASS_LABELS,
} from "@/lib/expenses";
import type { ActionResult } from "@/lib/actions/types";

export type ExpenseAccount = {
  id: string;
  name: string;
  currency: string;
  accountNumber: string | null;
  /** Bank, till or tin — or a lender's loan, which is borrowed money. What an
      account IS decides how money reached it. */
  kind?: "BANK" | "MOBILE_MONEY" | "CASH" | "LOAN";
  /** On a loan: the lender's name. */
  accountName?: string | null;
};

export type ExpenseDispatch = { id: string; label: string };
export type QuickExpense = { label: string; category: string };

const TODAY = new Date().toISOString().slice(0, 10);

/** One picture per group, so a list of costs is scannable rather than read. */
const GROUP_ICONS: Record<string, LucideIcon> = {
  batch: Plane,
  office: Building2,
  staff: Users,
  financial: Landmark,
  executive: Crown,
  other: CircleDashed,
};

/**
 * RECORDING A COST, IN TWO QUESTIONS.
 *
 * It used to be one screen of eight fields, and the two that always had to be
 * answered — what was it, and how much — sat among six that almost never did.
 * A clerk with a receipt in one hand was reading a form about batches and
 * cost classes before reaching the amount.
 *
 * So it asks what it is, then asks how much. Nothing was removed: the batch,
 * the date, the kind of cost and the receipt are all still here, folded behind
 * one line on the second step, where somebody who needs them knows to look.
 *
 * The first step is a list rather than a text box, because the costs an air
 * cargo business pays are the same every week and the expensive mistake is not
 * the typing — it is the same cost filed under three different categories by
 * three different people, which makes every report quietly wrong. Picking from
 * the list answers both at once. What has been recorded before rises to the
 * top on its own, so the list gets shorter the longer it is used.
 */
export function ExpenseForm({
  categories,
  accounts,
  dispatches,
  quick,
  rate,
  alwaysOpen = false,
  fixedDispatch,
}: {
  /** Empty means "use the shared list" — the ledger has no reason to pass it. */
  categories?: { value: string; label: string }[];
  accounts: ExpenseAccount[];
  dispatches?: ExpenseDispatch[];
  /**
   * Recording from inside one flight's own page.
   *
   * The dispatch is not a choice there — it is the thing being looked at — so
   * it is carried rather than asked for. Offering a picker that defaults to
   * "not one batch" on a page about one flight is how a customs charge ends
   * up attributed to nothing and the flight reads as pure profit.
   */
  fixedDispatch?: ExpenseDispatch;
  /** Most-recorded first, then the seeded common costs. */
  quick: QuickExpense[];
  rate: number | null;
  /** Rendered inside something that already decided it is open. */
  alwaysOpen?: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ expenseNumber: string }>,
    FormData
  >(recordExpense, { ok: true });
  const idem = useIdempotencyKey();

  const [open, setOpen] = useState(alwaysOpen);
  const [step, setStep] = useState<1 | 2>(1);
  const [chosen, setChosen] = useState<QuickExpense | null>(null);
  const [query, setQuery] = useState("");
  const [groupKey, setGroupKey] = useState("used");
  const [naming, setNaming] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("OTHER");

  const [more, setMore] = useState(false);
  const [currency, setCurrency] = useState("TZS");
  const [amount, setAmount] = useState("");
  const [paidFrom, setPaidFrom] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  /* Costs come in runs — three deliveries off one flight — so the key is
     retired as soon as one lands, or the second would be read as the first.
     The form goes back to its first question at the same moment: the clerk
     with three receipts is already looking for the second one. */
  useEffect(() => {
    if (state.ok && state.data?.expenseNumber) {
      idem.reset();
      setStep(1);
      setChosen(null);
      setAmount("");
      setQuery("");
      setNaming(false);
    }
  }, [state]);

  const categoryOptions = useMemo(
    () =>
      categories && categories.length > 0
        ? categories
        : Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({
            value,
            label,
          })),
    [categories]
  );

  /**
   * Everything this desk can pick from: what it has recorded before, then the
   * costs the business is seeded with. Deduplicated on the name, most-recorded
   * first, so a cost somebody has actually paid outranks the same word from
   * the seed list.
   */
  const catalogue = useMemo(() => {
    const seen = new Set<string>();
    const out: QuickExpense[] = [];
    for (const item of [...quick, ...COMMON_EXPENSES]) {
      const key = item.label.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [quick]);

  const groups = useMemo(() => {
    const used = quick.slice(0, 8);
    const rest = EXPENSE_CATEGORY_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      items: catalogue.filter((item) => group.categories.includes(item.category)),
    })).filter((group) => group.items.length > 0);
    return used.length > 0
      ? [{ key: "used", label: "Used most", items: used }, ...rest]
      : rest;
  }, [catalogue, quick]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return catalogue.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        t(EXPENSE_CATEGORY_LABELS[item.category] ?? item.category)
          .toLowerCase()
          .includes(needle)
    );
  }, [catalogue, query, t]);

  const shown =
    matches ?? groups.find((g) => g.key === groupKey)?.items ?? groups[0]?.items ?? [];

  const pick = (item: QuickExpense) => {
    setChosen(item);
    setStep(2);
    setNaming(false);
    /* The amount is the only thing left to answer, so the caret starts in it.
       After paint: the field is rendered by the step this press switches to. */
    setTimeout(() => amountRef.current?.focus(), 0);
  };

  const eligible = accounts.filter((a) => a.currency === currency);
  /* Borrowed money listed apart from the company's own, so nobody reads a
     lender's loan as another till. */
  const ownMoney = eligible.filter((a) => a.kind !== "LOAN");
  const borrowed = eligible.filter((a) => a.kind === "LOAN");
  const loanChosen = borrowed.find((a) => a.id === paidFrom) ?? null;

  const typed = Number(amount);
  const amountGiven = Number.isFinite(typed) && typed > 0;
  const moneyLabel = amountGiven
    ? `${currency === "TZS" ? "TSh" : "USD"} ${typed.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })}`
    : "";

  if (!open) {
    return (
      <Button variant="brand" className="rounded-lg" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        {t("Record a cost")}
      </Button>
    );
  }

  const Icon = chosen
    ? GROUP_ICONS[
        EXPENSE_CATEGORY_GROUPS.find((g) => g.categories.includes(chosen.category))
          ?.key ?? "other"
      ] ?? CircleDashed
    : CircleDashed;

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        {/* Which of the two questions is being answered, and which is next. */}
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest">
          <span
            className={`rounded-full px-2 py-1 ${
              step === 1 ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}
          >
            1 {t("What")}
          </span>
          <span className="h-px w-3 bg-border" />
          <span
            className={`rounded-full px-2 py-1 ${
              step === 2 ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}
          >
            2 {t("How much")}
          </span>
        </div>
        {alwaysOpen ? null : (
          <button
            type="button"
            /* Closing throws the form away as completely as navigating off it
               does, and this ✕ sits a thumb-width from the amount field. */
            onClick={() => confirmDiscard(() => setOpen(false))}
            className="focus-ring rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label={t("Close")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {step === 1 ? (
        <div className="p-5">
          <h2 className="font-display text-lg font-bold">
            {t("What did you pay for?")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("Search, or pick from a group. What you record shows up here next time.")}
          </p>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search — customs, fuel, salary, rent…")}
              className="h-11 pl-9"
              aria-label={t("Search costs")}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            {/* One row that scrolls on a phone, one column on a desk. Same
                buttons either way — a second copy of this list is a second
                list to keep right. */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0 sm:pb-0">
              {groups.map((group) => {
                const GroupIcon =
                  group.key === "used" ? Sparkles : GROUP_ICONS[group.key] ?? CircleDashed;
                const on = !matches && group.key === groupKey;
                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => {
                      setGroupKey(group.key);
                      setQuery("");
                    }}
                    className={`focus-ring flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:w-full ${
                      on ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <GroupIcon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {t(group.label)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {group.items.length}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="min-w-0 rounded-lg border">
              <p className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {matches
                  ? `${shown.length} ${t("found")}`
                  : t(groups.find((g) => g.key === groupKey)?.label ?? "Used most")}
              </p>
              <div className="max-h-[15rem] overflow-y-auto">
                {shown.map((item) => {
                  const ItemIcon =
                    GROUP_ICONS[
                      EXPENSE_CATEGORY_GROUPS.find((g) =>
                        g.categories.includes(item.category)
                      )?.key ?? "other"
                    ] ?? CircleDashed;
                  return (
                    <button
                      key={`${item.label}-${item.category}`}
                      type="button"
                      onClick={() => pick(item)}
                      className="focus-ring flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                        <ItemIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {t(item.label)}
                        </span>
                        {/* The seeded costs are named after the category they
                            file under — "Customs" filed under Customs — and
                            printing both reads as a stutter. It is said only
                            when it adds something, which is exactly when the
                            desk typed a name of its own. */}
                        {t(EXPENSE_CATEGORY_LABELS[item.category] ?? item.category) !==
                        t(item.label) ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {t(EXPENSE_CATEGORY_LABELS[item.category] ?? item.category)}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
                {shown.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {t("Nothing here by that name.")}
                  </p>
                ) : null}
              </div>

              {/* Anything the list does not have. The typed name carries over,
                  because somebody who has just searched for it has typed it. */}
              {naming ? (
                <div className="space-y-2 border-t bg-muted/30 p-3">
                  <Input
                    autoFocus
                    value={newLabel}
                    onChange={(event) => setNewLabel(event.target.value)}
                    placeholder={t("What was it for")}
                  />
                  <NativeSelect
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    aria-label={t("Category")}
                  >
                    {categoryOptions.map((c) => (
                      <option key={c.value} value={c.value}>
                        {t(c.label)}
                      </option>
                    ))}
                  </NativeSelect>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="brand"
                      disabled={newLabel.trim().length < 3}
                      onClick={() =>
                        pick({ label: newLabel.trim(), category: newCategory })
                      }
                    >
                      {t("Continue")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setNaming(false)}
                      className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {t("Cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNewLabel(query.trim());
                    setNaming(true);
                  }}
                  className="focus-ring flex w-full items-center gap-2 border-t px-3 py-2.5 text-sm font-medium text-brand hover:bg-accent"
                >
                  <Plus className="h-4 w-4" />
                  {t("Something else — record a new cost")}
                </button>
              )}
            </div>
          </div>

          <FormSuccess
            message={
              state.ok && state.data
                ? `${t("Recorded")} ${state.data.expenseNumber}`
                : null
            }
          />
        </div>
      ) : (
        <form action={action} className="p-5">
          <IdempotencyKey value={idem.key} />
          {/* Re-baselined on the expense number the action hands back, so the
              tap straight after recording a cost is not met with "discard
              changes?" about a cost already in the ledger. */}
          <UnsavedGuard
            savedKey={state.ok && state.data ? state.data.expenseNumber : null}
          />
          {/* Answered on the first step, carried here. */}
          <input type="hidden" name="description" value={chosen?.label ?? ""} />
          <input type="hidden" name="category" value={chosen?.category ?? "OTHER"} />
          {/* Carried, not asked for — this form is already inside the flight. */}
          {fixedDispatch ? (
            <input type="hidden" name="batchId" value={fixedDispatch.id} />
          ) : null}

          <h2 className="font-display text-lg font-bold">{t("How much was paid?")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("It leaves the account you name, straight away.")}
          </p>

          <div className="mt-4 flex items-center gap-3 rounded-xl border p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {t(chosen?.label ?? "")}
              </span>
              {t(EXPENSE_CATEGORY_LABELS[chosen?.category ?? "OTHER"] ?? "Miscellaneous") !==
              t(chosen?.label ?? "") ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {t(EXPENSE_CATEGORY_LABELS[chosen?.category ?? "OTHER"] ?? "Miscellaneous")}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="focus-ring shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              {t("Change")}
            </button>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="expenseAmount" className="text-xs">
              {t("Amount")}
            </Label>
            <div className="flex gap-2">
              <MoneyInput
                id="expenseAmount"
                ref={amountRef}
                name="amount"
                value={amount}
                onValueChange={setAmount}
                className="h-12 min-w-0 flex-1 text-lg"
                required
              />
              <NativeSelect
                name="currency"
                aria-label={t("Currency")}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-12 w-[5.5rem] shrink-0"
              >
                <option value="TZS">TSh</option>
                <option value="USD">USD</option>
              </NativeSelect>
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label className="text-xs">{t("Paid from")}</Label>
            {/*
              Compulsory, like every other place money is written down. A cost
              is money that has left an account, so there is always one to name.

              Chips rather than a dropdown: there are five or six of these, the
              clerk knows which one they used, and a list you can see is one
              tap where a dropdown is three.
            */}
            <input type="hidden" name="accountId" value={paidFrom} required />
            <div className="flex flex-wrap gap-2">
              {ownMoney.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setPaidFrom(account.id)}
                  className={`focus-ring rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    paidFrom === account.id
                      ? "border-brand bg-brand text-brand-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  {account.name}
                </button>
              ))}
              {borrowed.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setPaidFrom(account.id)}
                  className={`focus-ring rounded-lg border border-dashed px-3 py-2 text-sm font-medium transition-colors ${
                    paidFrom === account.id
                      ? "border-warning bg-warning/15 text-warning"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {account.name}
                </button>
              ))}
            </div>
            {loanChosen ? (
              /* Said the moment it is chosen: this is not company money, and
                 recording it creates a debt the company has to pay back. */
              <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
                {loanChosen.accountName || loanChosen.name}{" "}
                {t("paid this personally. It is recorded as a normal cost, and the company now owes the money back.")}
              </p>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/*
              WHO RECEIVED IT, IN PLAIN VIEW — AND STILL OPTIONAL.

              It is the one field that lets anyone trace a payment back to a
              real person or company months later — "who did we actually pay"
              is the first question an investigation asks, and a field nobody
              can see is a field nobody fills in.
            */}
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="vendor" className="text-xs">
                {t("Paid to")}
              </Label>
              <Input
                id="vendor"
                name="vendor"
                placeholder={t("Supplier or person")}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="expenseNote" className="text-xs">
                {t("Details")}{" "}
                <span className="text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Input
                id="expenseNote"
                name="note"
                placeholder={t("e.g. for September")}
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border">
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              className="focus-ring flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                {t("Receipt, batch, date & type")}{" "}
                <span className="text-muted-foreground">{t("— optional")}</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  more ? "rotate-180" : ""
                }`}
              />
            </button>

            {more ? (
              <div className="grid grid-cols-1 gap-3 border-t p-3 sm:grid-cols-2">
                {/* The moment the receipt is easiest to attach is the moment
                    the cost is being recorded. */}
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
                  <Label htmlFor="receipt" className="text-xs">
                    {t("Receipt or photo")}
                  </Label>
                  <Input
                    id="receipt"
                    name="receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    multiple
                    className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                  />
                </div>

                {!fixedDispatch && dispatches && dispatches.length > 0 ? (
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="expenseBatch" className="text-xs">
                      {t("Against a dispatch")}
                    </Label>
                    <NativeSelect id="expenseBatch" name="batchId" defaultValue="">
                      <option value="">{t("Not one batch")}</option>
                      {dispatches.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}

                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="incurredAt" className="text-xs">
                    {t("Date")}
                  </Label>
                  <Input id="incurredAt" name="incurredAt" type="date" max={TODAY} />
                  {/*
                    Nothing to type, most of the time. Left blank, the cost is
                    dated to this exact moment — the day AND the time, which a
                    plain "today" default would have lost.
                  */}
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      "Leave this blank — it is recorded as happening right now. Only set it when backdating a cost found later."
                    )}
                  </p>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="expenseClass" className="text-xs">
                    {t("Type of cost")}
                  </Label>
                  <NativeSelect
                    id="expenseClass"
                    name="expenseClass"
                    defaultValue="OPERATING"
                  >
                    {EXPENSE_CLASSES.map((value) => (
                      <option key={value} value={value}>
                        {t(EXPENSE_CLASS_LABELS[value])}
                      </option>
                    ))}
                  </NativeSelect>
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      "Almost everything is Operating — leave it as it is. Special is only for something like an owner's personal draw, which should not count as a running cost of the business."
                    )}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <FormError state={state} />

          <div className="mt-4">
            {/* The button says what pressing it does, once there is a figure
                to say. A cost recorded by mistake is money missing from an
                account until somebody reverses it. */}
            <SubmitButton
              variant="brand"
              className="h-12 w-full rounded-xl text-base"
              disabled={!amountGiven || !paidFrom || !chosen}
              pendingLabel={t("Recording…")}
            >
              {!amountGiven
                ? t("Enter the amount")
                : !paidFrom
                  ? t("Say which account it left")
                  : `${t("Record")} ${moneyLabel}`}
            </SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}
