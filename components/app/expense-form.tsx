"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
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
  UserRound,
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
import type { ExpensePickerData, PickerItem } from "@/lib/expense-picker";

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

/**
 * WHAT KIND OF SPENDING IS THIS?
 *
 * Four answers, and they are not four filters over one list — they are four
 * different questions. The office pays the rent; a flight carries customs;
 * "special" is money that left the business but would mislead if it were
 * counted as a running cost; a draw belongs to a person. Asking first means
 * the rest of the screen can be about that one thing.
 */
const SCOPES = [
  {
    key: "OFFICE" as const,
    label: "The office",
    hint: "The business's own running costs",
  },
  {
    key: "FLIGHT" as const,
    label: "A flight",
    hint: "Charged to one flight's margin",
  },
  {
    key: "SPECIAL" as const,
    label: "Special",
    hint: "A one-off, outside the usual running costs",
  },
  {
    key: "EXECUTIVE" as const,
    label: "Executive",
    hint: "An owner's or manager's own draw",
  },
];

type Scope = (typeof SCOPES)[number]["key"];

/** One picture per group, so a list of costs is scannable rather than read. */
const GROUP_ICONS: Record<string, LucideIcon> = {
  batch: Plane,
  office: Building2,
  staff: Users,
  financial: Landmark,
  executive: Crown,
  other: CircleDashed,
};

function iconFor(category: string): LucideIcon {
  const group = EXPENSE_CATEGORY_GROUPS.find((g) =>
    g.categories.includes(category),
  );
  return GROUP_ICONS[group?.key ?? "other"] ?? CircleDashed;
}

/**
 * RECORDING A COST, IN TWO QUESTIONS.
 *
 * It used to be one screen of eight fields, and the two that always had to be
 * answered — what was it, and how much — sat among six that almost never did.
 *
 * So it asks what it is, then asks how much. Nothing was removed: the batch,
 * the date, the kind of cost and the receipt are all still here, folded behind
 * one line on the second step.
 *
 * The first step is a list rather than a text box, because the costs an air
 * cargo business pays are the same every week and the expensive mistake is not
 * the typing — it is the same cost filed under three different categories by
 * three different people, which makes every report quietly wrong. Picking from
 * the list answers both at once.
 *
 * And the list knows what has NOT been paid. A flight with no customs charge
 * against it is either a flight that owed no duty or a receipt nobody wrote
 * down, and the second is how a batch reads as pure profit — so the flights
 * with nothing on them come first, and every row says whether this flight has
 * ever carried that cost.
 */
export function ExpenseForm({
  categories,
  accounts,
  dispatches,
  quick,
  picker,
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
  /**
   * What the register knows: how often each cost has been paid, which flights
   * are carrying nothing, and who has drawn. Absent on screens that have not
   * been given it, and then the office list is all there is.
   */
  picker?: ExpensePickerData;
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
  const [scope, setScope] = useState<Scope>(
    fixedDispatch ? "FLIGHT" : "OFFICE",
  );
  const [groupKey, setGroupKey] = useState("used-most");
  const [flightId, setFlightId] = useState(fixedDispatch?.id ?? "");
  const [person, setPerson] = useState("");
  const [chosen, setChosen] = useState<PickerItem | null>(null);
  const [query, setQuery] = useState("");
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
     with three receipts is already looking for the second one. The flight and
     the person are kept, because the next receipt is usually the same one's. */
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
    [categories],
  );

  /** The office list, from the register where there is one and the seeded
      costs where there is not. */
  const officeGroups = useMemo(() => {
    if (picker) return picker.office;
    const seen = new Set<string>();
    const items: PickerItem[] = [];
    for (const item of [...quick, ...COMMON_EXPENSES]) {
      const key = `${item.label.toLowerCase()}|${item.category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...item, times: 0, last: null });
    }
    return EXPENSE_CATEGORY_GROUPS.filter((g) => g.key !== "batch").map(
      (group) => ({
        key: group.key,
        label: group.label,
        items: items.filter((item) => group.categories.includes(item.category)),
      }),
    );
  }, [picker, quick]);

  const history = useMemo(() => {
    const all = officeGroups.flatMap((g) => g.items);
    if (scope === "SPECIAL")
      return all.filter(
        (item) => item.times > 0 && item.category === "EXECUTIVE_DRAW",
      );
    return all
      .filter((item) => item.times > 0)
      .sort((a, b) => b.times - a.times)
      .slice(0, 8);
  }, [officeGroups, scope]);

  const flights = picker?.flights ?? [];
  const flight = flights.find((f) => f.id === flightId) ?? null;
  const people = picker?.people ?? [];
  const chosenPerson = people.find((p) => p.name === person) ?? null;

  const searching = query.trim().length > 0;
  const matches = (item: PickerItem) => {
    const needle = query.trim().toLowerCase();
    return (
      item.label.toLowerCase().includes(needle) ||
      t(EXPENSE_CATEGORY_LABELS[item.category] ?? item.category)
        .toLowerCase()
        .includes(needle)
    );
  };

  /** What the right-hand list is showing, for the scope in hand. */
  const shown: PickerItem[] = useMemo(() => {
    if (scope === "FLIGHT") {
      const costs = picker?.flightCosts ?? [];
      return searching ? costs.filter(matches) : costs;
    }
    if (scope === "EXECUTIVE") {
      const draws = picker?.draws ?? [];
      return searching ? draws.filter(matches) : draws;
    }
    const all = officeGroups.flatMap((g) => g.items);
    if (searching) return all.filter(matches);
    if (groupKey === "used-most") return history;
    return officeGroups.find((g) => g.key === groupKey)?.items ?? [];
  }, [scope, picker, officeGroups, groupKey, history, query, searching]);

  const pick = (item: PickerItem) => {
    setChosen(item);
    if (item.last) {
      setAmount(String(item.last.amount));
      setCurrency(item.last.currency);
    }
    setStep(2);
    setNaming(false);
    /* The amount is the only thing left to answer, so the caret starts in it. */
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
      <Button
        variant="brand"
        className="rounded-lg"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t("Record a cost")}
      </Button>
    );
  }

  /* What the row says under its name. A cost named after the kind it files
     under — "Customs" under Customs — stands in for itself, and printing both
     reads as a stutter; what it needs to say then is whether it has ever been
     paid. */
  const subtitleOf = (item: PickerItem) => {
    const kind = t(EXPENSE_CATEGORY_LABELS[item.category] ?? item.category);
    if (kind !== t(item.label)) return kind;
    return item.times === 0 ? t("Never recorded yet") : t("Recorded before");
  };

  const ChosenIcon = chosen ? iconFor(chosen.category) : CircleDashed;

  const scopeTitle =
    scope === "EXECUTIVE" ? t("Whose draw is it?") : t("What did you pay for?");
  const scopeHint =
    scope === "FLIGHT" && !fixedDispatch
      ? t(
          "Pick the flight, then what it cost. The ones with nothing recorded come first.",
        )
      : scope === "EXECUTIVE"
        ? t(
            "Pick the person, see what they have drawn, then record the new one.",
          )
        : t(
            "Search, or pick from a group. Anything new is saved for next time.",
          );
  const placeholder =
    scope === "FLIGHT"
      ? t("Search — customs, permit, transport…")
      : scope === "EXECUTIVE"
        ? t("Search — travel, allowance, advance…")
        : t("Search — port charges, fuel, salaries, rent…");

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        {/* Which of the two questions is being answered, and which is next.
            The first is a way back; the second never a way forward. */}
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`focus-ring rounded-full px-2 py-1 ${
              step === 1
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground"
            }`}
          >
            1 {t("What")}
          </button>
          <span className="h-px w-3 bg-border" />
          <span
            className={`rounded-full px-2 py-1 ${
              step === 2
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground"
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
          <h2 className="font-display text-lg font-bold">{scopeTitle}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{scopeHint}</p>

          {/*
            Pinned to one flight, there is nothing to choose — and on a screen
            that was never given the register's own list, there is nothing to
            choose it from: the flights and the people come from there, and
            offering a mode with an empty list is offering a dead end.
          */}
          {fixedDispatch || !picker ? null : (
            <div className="mt-3 flex flex-wrap gap-2">
              {SCOPES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  title={t(item.hint)}
                  onClick={() => {
                    setScope(item.key);
                    setGroupKey("used-most");
                    setQuery("");
                  }}
                  className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    scope === item.key
                      ? "border-brand bg-brand/10 text-brand"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
          )}

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              className="h-11 pl-9"
              aria-label={t("Search costs")}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:max-h-[19rem] sm:flex-col sm:overflow-y-auto sm:px-0 sm:pb-0">
              {scope === "FLIGHT"
                ? /* The empty ones first, under their own heading. A flight
                     carrying no cost at all is the one worth looking at: it
                     is either a flight that owed nothing or a receipt nobody
                     wrote down. */
                  [
                    {
                      key: "none",
                      label: "Nothing recorded yet",
                      list: flights.filter((f) => f.recorded === 0),
                    },
                    {
                      key: "some",
                      label: "Has costs",
                      list: flights.filter((f) => f.recorded > 0),
                    },
                  ]
                    .filter((section) => section.list.length > 0)
                    .flatMap((section) => [
                      <p
                        key={section.key}
                        className="shrink-0 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                      >
                        {t(section.label)}
                      </p>,
                      ...section.list.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setFlightId(item.id)}
                          className={`focus-ring flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors sm:w-full ${
                            flightId === item.id
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <Plane className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{item.label}</span>
                            <span className="block truncate text-[11px] font-normal text-muted-foreground">
                              {t(item.detail)}
                            </span>
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {item.recorded}
                          </span>
                        </button>
                      )),
                    ])
                : scope === "EXECUTIVE"
                  ? people.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => setPerson(item.name)}
                        className={`focus-ring flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors sm:w-full ${
                          person === item.name
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <UserRound className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{item.name}</span>
                          <span className="block truncate text-[11px] font-normal text-muted-foreground">
                            {t(item.role)}
                          </span>
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {item.draws}
                        </span>
                      </button>
                    ))
                  : [
                      {
                        key: "used-most",
                        label:
                          scope === "SPECIAL" ? "Special before" : "Used most",
                        count: history.length,
                        Icon: Sparkles,
                      },
                      ...officeGroups.map((group) => ({
                        key: group.key,
                        label: group.label,
                        count: group.items.filter((i) => i.times > 0).length,
                        Icon: GROUP_ICONS[group.key] ?? CircleDashed,
                      })),
                    ].map((group) => (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => {
                          setGroupKey(group.key);
                          setQuery("");
                        }}
                        className={`focus-ring flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:w-full ${
                          !searching && groupKey === group.key
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <group.Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {t(group.label)}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {group.count}
                        </span>
                      </button>
                    ))}
            </div>

            <div className="flex min-h-[15rem] min-w-0 flex-col rounded-lg border">
              <p className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {searching
                  ? `${shown.length} ${shown.length === 1 ? t("match") : t("matches")}`
                  : scope === "FLIGHT"
                    ? flight
                      ? `${flight.label} · ${t(flight.detail)}`
                      : t("Pick a flight")
                    : scope === "EXECUTIVE"
                      ? chosenPerson
                        ? `${chosenPerson.name} · ${
                            chosenPerson.draws === 0
                              ? t("nothing drawn yet")
                              : `${chosenPerson.draws} ${t("drawn")}`
                          }`
                        : t("Pick the person")
                      : groupKey === "used-most"
                        ? scope === "SPECIAL"
                          ? t("Recorded as special before")
                          : t("Used most")
                        : t(
                            officeGroups.find((g) => g.key === groupKey)
                              ?.label ?? "Used most",
                          )}
              </p>

              <div className="flex-1 overflow-y-auto sm:max-h-[15rem]">
                {scope === "FLIGHT" && !flight ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">
                    {flights.length === 0
                      ? t(
                          "No open flight to charge. A closed flight takes no more costs.",
                        )
                      : t(
                          "Pick a flight on the left — a cost belongs to one flight, or to none.",
                        )}
                  </p>
                ) : scope === "EXECUTIVE" && !chosenPerson ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">
                    {t("Pick the person on the left to see their draws.")}
                  </p>
                ) : shown.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">
                    {scope === "SPECIAL" && groupKey === "used-most"
                      ? t(
                          "Nothing recorded as special yet — pick a group, or add it below.",
                        )
                      : t("Nothing here yet — add it below.")}
                  </p>
                ) : (
                  shown.map((item) => {
                    const ItemIcon = iconFor(item.category);
                    /* On a flight, the question under every row is whether
                       THIS flight has carried it — not whether the business
                       ever has. A customs charge missing from a flight is the
                       receipt nobody wrote down. */
                    const missing =
                      scope === "FLIGHT" &&
                      flight !== null &&
                      !flight.recordedLabels.some(
                        (label) =>
                          label.trim().toLowerCase() ===
                          item.label.trim().toLowerCase(),
                      );
                    const sub =
                      scope === "FLIGHT" && flight
                        ? missing
                          ? t("Not recorded on this flight yet")
                          : t("Already recorded on this flight")
                        : subtitleOf(item);
                    return (
                      <button
                        key={`${item.label}-${item.category}`}
                        type="button"
                        onClick={() => pick(item)}
                        className="focus-ring flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                          <ItemIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {t(item.label)}
                          </span>
                          <span
                            className={`block truncate text-xs ${
                              missing ? "text-warning" : "text-muted-foreground"
                            }`}
                          >
                            {sub}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })
                )}
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
                        pick({
                          label: newLabel.trim(),
                          category: newCategory,
                          times: 0,
                          last: null,
                        })
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
                    setNewCategory(
                      scope === "EXECUTIVE"
                        ? "EXECUTIVE_DRAW"
                        : scope === "FLIGHT"
                          ? "CUSTOMS_DUTY"
                          : "OTHER",
                    );
                    setNaming(true);
                  }}
                  className="focus-ring flex w-full items-center gap-2 border-t px-3 py-2.5 text-sm font-medium text-brand hover:bg-accent"
                >
                  <Plus className="h-4 w-4" />
                  {searching
                    ? `${t("Add")} “${query.trim()}”`
                    : scope === "FLIGHT" && flight
                      ? `${t("Something else on")} ${flight.label}`
                      : scope === "EXECUTIVE"
                        ? t("Something else — a new draw")
                        : !searching && groupKey !== "used-most"
                          ? `${t("Something else in")} ${t(
                              officeGroups.find((g) => g.key === groupKey)
                                ?.label ?? "",
                            )}`
                          : t("Something else — add a new cost")}
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
          <input
            type="hidden"
            name="category"
            value={chosen?.category ?? "OTHER"}
          />
          {/*
            Special is not a label on this screen — it is the class the cost is
            recorded under, the one figure the business is judged on. Asked at
            the top, answered here, and still editable below.
          */}
          {scope === "SPECIAL" ? (
            <input type="hidden" name="expenseClass" value="NON_OPERATING" />
          ) : null}
          {/* A flight's cost belongs to that flight, whether it was pinned by
              the page or picked on the left. */}
          {fixedDispatch ? (
            <input type="hidden" name="batchId" value={fixedDispatch.id} />
          ) : scope === "FLIGHT" && flight ? (
            <input type="hidden" name="batchId" value={flight.id} />
          ) : null}

          <h2 className="font-display text-lg font-bold">
            {t("How much was paid?")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("It leaves the account you name, straight away.")}
          </p>

          <div className="mt-4 flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <ChosenIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {t(chosen?.label ?? "A new cost")}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[
                  t(
                    EXPENSE_CATEGORY_LABELS[chosen?.category ?? "OTHER"] ??
                      "Miscellaneous",
                  ) !== t(chosen?.label ?? "")
                    ? t(
                        EXPENSE_CATEGORY_LABELS[chosen?.category ?? "OTHER"] ??
                          "Miscellaneous",
                      )
                    : null,
                  scope === "FLIGHT" && flight
                    ? flight.label
                    : scope === "EXECUTIVE" && chosenPerson
                      ? `${t("Drawn by")} ${chosenPerson.name}`
                      : t(SCOPES.find((s) => s.key === scope)?.label ?? ""),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
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
            {/* The same bill usually costs what it cost last time, and the
                figure that is easiest to get a nought wrong on is the one
                somebody types from memory. */}
            {chosen?.last ? (
              <p className="text-xs text-muted-foreground">
                {t("Last time")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAmount(String(chosen.last!.amount));
                    setCurrency(chosen.last!.currency);
                    amountRef.current?.focus();
                  }}
                  className="focus-ring rounded font-medium text-brand hover:underline"
                >
                  {chosen.last.currency === "TZS" ? "TSh" : "USD"}{" "}
                  {chosen.last.amount.toLocaleString("en-US")} · {t("use it")}
                </button>
              </p>
            ) : null}
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
                {t(
                  "paid this personally. It is recorded as a normal cost, and the company now owes the money back.",
                )}
              </p>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/*
              WHO RECEIVED IT, IN PLAIN VIEW — AND STILL OPTIONAL.

              It is the one field that lets anyone trace a payment back to a
              real person or company months later. On a draw it is not
              optional in spirit: the person IS the record, so it arrives
              already filled with whoever was picked.
            */}
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="vendor" className="text-xs">
                {scope === "EXECUTIVE" ? t("Drawn by") : t("Paid to")}
              </Label>
              <Input
                id="vendor"
                name="vendor"
                key={chosenPerson?.name ?? "none"}
                defaultValue={
                  scope === "EXECUTIVE" ? (chosenPerson?.name ?? "") : ""
                }
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

                {!fixedDispatch &&
                scope !== "FLIGHT" &&
                dispatches &&
                dispatches.length > 0 ? (
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="expenseBatch" className="text-xs">
                      {t("Against a dispatch")}
                    </Label>
                    <NativeSelect
                      id="expenseBatch"
                      name="batchId"
                      defaultValue=""
                    >
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
                  <Input
                    id="incurredAt"
                    name="incurredAt"
                    type="date"
                    max={TODAY}
                  />
                  {/*
                    Nothing to type, most of the time. Left blank, the cost is
                    dated to this exact moment — the day AND the time, which a
                    plain "today" default would have lost.
                  */}
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      "Leave this blank — it is recorded as happening right now. Only set it when backdating a cost found later.",
                    )}
                  </p>
                </div>

                {scope === "SPECIAL" ? null : (
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
                        "Almost everything is Operating — leave it as it is. Special is only for something like an owner's personal draw, which should not count as a running cost of the business.",
                      )}
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <FormError state={state} />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* The button says what pressing it does, once there is a figure
                to say. A cost recorded by mistake is money missing from an
                account until somebody reverses it. */}
            <SubmitButton
              variant="brand"
              className="h-12 flex-1 rounded-xl text-base"
              disabled={!amountGiven || !paidFrom || !chosen}
              pendingLabel={t("Recording…")}
            >
              {!amountGiven
                ? t("Enter the amount")
                : !paidFrom
                  ? t("Say which account it left")
                  : `${scope === "EXECUTIVE" ? t("Record the draw") : t("Record")} ${moneyLabel}`}
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              onClick={() => setStep(1)}
            >
              {t("Back")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
