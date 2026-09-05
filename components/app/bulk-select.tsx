"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useActionState } from "react";
import { CheckSquare, Square, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/app/locale-provider";
import type { ActionResult } from "@/lib/actions/types";
import type { BulkOutcome } from "@/lib/actions/submission-bulk";

/**
 * TICKING ROWS, WITHOUT TURNING THE LIST INTO A CLIENT COMPONENT.
 *
 * The lists these serve are server-rendered, and they should stay that way —
 * they read money off the database and there is no reason for any of that to
 * ship to a browser. So the selection lives in a provider that WRAPS the list
 * and two small islands that sit inside it: a checkbox on each row and a bar
 * at the bottom. The rows themselves are passed through as children and never
 * become client code.
 *
 * The bar only appears once something is ticked. A list of twenty-two claims
 * with a permanent empty toolbar over it is a list somebody has to read past
 * every time; a bar that arrives when it has something to do is one they read
 * once, when it matters.
 */

type Selection = {
  selected: Set<string>;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
  selectAll: () => void;
  clear: () => void;
  allIds: string[];
};

const SelectionContext = createContext<Selection | null>(null);

function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error("Selection controls must sit inside <BulkSelect>.");
  }
  return ctx;
}

export function BulkSelect({
  ids,
  children,
}: {
  /** Every row on the page, in the order shown — what "select all" means. */
  ids: string[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* Only rows actually on the page. "All" cannot mean rows behind a filter the
     reader is not looking at — that is how somebody agrees money they never
     saw. */
  const selectAll = useCallback(() => setSelected(new Set(ids)), [ids]);
  const clear = useCallback(() => setSelected(new Set()), []);

  const value = useMemo<Selection>(
    () => ({
      selected,
      toggle,
      isSelected: (id: string) => selected.has(id),
      selectAll,
      clear,
      allIds: ids,
    }),
    [selected, toggle, selectAll, clear, ids]
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/** The tick on one row. */
export function RowTick({ id, label }: { id: string; label?: string }) {
  const { isSelected, toggle } = useSelection();
  const t = useT();
  const on = isSelected(id);
  return (
    <input
      type="checkbox"
      checked={on}
      onChange={() => toggle(id)}
      aria-label={label ?? t("Select this one")}
      className="h-4 w-4 shrink-0 cursor-pointer accent-brand"
    />
  );
}

/** Select-all / none, for the header of a list. */
export function SelectAllTick({ label }: { label?: string }) {
  const { selected, allIds, selectAll, clear } = useSelection();
  const t = useT();
  const all = allIds.length > 0 && selected.size === allIds.length;
  return (
    <button
      type="button"
      onClick={() => (all ? clear() : selectAll())}
      className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {all ? (
        <CheckSquare className="h-3.5 w-3.5 text-brand" />
      ) : (
        <Square className="h-3.5 w-3.5" />
      )}
      {label ?? (all ? t("Select none") : t("Select all"))}
    </button>
  );
}

/**
 * The bar that acts on what is ticked.
 *
 * It states the count before it states the button, because the count is the
 * thing somebody has to agree with — "Verify 14 payments" is a sentence a
 * person can check against the screen, and "Verify" is not.
 *
 * `reason` turns it into a two-step: the button reveals a box that has to be
 * filled before anything happens, which is what taking claims back needs and
 * agreeing them does not.
 */
export function BulkBar({
  action,
  verb,
  noun,
  nounPlural,
  pendingLabel,
  reason,
  reasonLabel,
  tone = "brand",
  note,
}: {
  action: (
    state: ActionResult<BulkOutcome> | undefined,
    form: FormData
  ) => Promise<ActionResult<BulkOutcome>>;
  /* The button says what it is ABOUT to do, with the count in the middle of
     the sentence: "Verify 14 payments" is something a person can check against
     the screen and "Verify" is not.

     Three words rather than one function, because a server component cannot
     hand a function to a client one — and these lists are server-rendered on
     purpose. Translated on the server, where the locale already is. */
  verb: string;
  noun: string;
  nounPlural: string;
  pendingLabel: string;
  /** Ask for a reason before doing it. */
  reason?: boolean;
  reasonLabel?: string;
  tone?: "brand" | "destructive";
  /** A sentence under the button — what this will and will not touch. */
  note?: string;
}) {
  const { selected, clear } = useSelection();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, run] = useActionState<ActionResult<BulkOutcome>, FormData>(
    action as never,
    { ok: true }
  );

  const ids = [...selected];
  /*
    THE ANSWER OUTLIVES THE SELECTION.

    Ticking clears the moment the run starts, which is right — those rows are
    being dealt with and must not be submitted twice. But it also emptied this
    bar, so the one thing a desk has to read never appeared: which of them did
    NOT go through. A run that half-worked and reported nothing is worse than
    one that failed outright, because the desk walks away believing all of it.

    So the bar stays for as long as it has something to say.
  */
  const answered = !state.ok || Boolean(state.ok && state.data);
  if (ids.length === 0 && !answered) return null;
  const label = `${verb} ${ids.length} ${ids.length === 1 ? noun : nounPlural}`;

  return (
    <div className="sticky bottom-4 z-20 mt-3">
      <form
        action={(formData) => {
          formData.set("ids", JSON.stringify(ids));
          run(formData);
          clear();
          setOpen(false);
        }}
        className="rounded-xl border bg-card p-3 shadow-soft"
      >
        <div className="flex flex-wrap items-center gap-3">
          {ids.length > 0 ? (
            <span className="text-sm font-semibold tabular-nums">
              {ids.length} {t("selected")}
            </span>
          ) : (
            <span className="text-sm font-semibold">{t("Done")}</span>
          )}

          {ids.length > 0 && reason && !open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                tone === "destructive"
                  ? "border border-destructive/40 text-destructive hover:bg-destructive/10"
                  : "bg-brand text-brand-foreground hover:bg-brand/90"
              }`}
            >
              {label}
            </button>
          ) : null}

          {ids.length > 0 && (!reason || open) ? (
            <SubmitButton
              size="sm"
              variant={tone === "destructive" ? "outline" : "brand"}
              pendingLabel={pendingLabel}
            >
              {label}
            </SubmitButton>
          ) : null}

          <button
            type="button"
            onClick={() => {
              clear();
              setOpen(false);
            }}
            className="focus-ring rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            aria-label={t("Clear the selection")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {ids.length > 0 && reason && open ? (
          <div className="mt-2 space-y-1">
            <Input
              name="reason"
              required
              minLength={3}
              placeholder={reasonLabel ?? t("Why are these being taken back?")}
              className="h-9 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {t("The same reason is written onto every one of them.")}
            </p>
          </div>
        ) : null}

        {ids.length > 0 && note ? (
          <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>
        ) : null}

        <FormError state={state} />
        {/* Said plainly when some of them did not go through. A run that
            half-worked and reported only success is worse than one that
            failed outright — the desk walks away believing all of it. */}
        {state.ok && state.data?.note ? (
          <p className="mt-2 text-xs text-warning">{state.data.note}</p>
        ) : null}
        {state.ok && state.data && !state.data.note ? (
          <p className="mt-2 text-xs text-success">
            {state.data.done} {t("done")}.
          </p>
        ) : null}
      </form>
    </div>
  );
}
