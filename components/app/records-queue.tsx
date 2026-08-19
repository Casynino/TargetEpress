"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronDown, Undo2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Textarea } from "@/components/ui/textarea";
import { reviewRecords } from "@/lib/actions/control";
import type { ActionResult } from "@/lib/actions/types";
import { cn } from "@/lib/utils";

export type QueueRowView = {
  id: string;
  href: string;
  title: string;
  meta: string;
  amount: string;
  out: boolean;
  /** Rendered by the server so this file formats nothing. */
  badge: { label: string; className: string } | null;
  selected: boolean;
};

/**
 * THE QUEUE, WITH A TICK BOX ON EVERY ROW.
 *
 * The owner: "we are going to have busy scheled so and i shluld be able to pick
 * and choose and i shulud be able to choose all and reconcele". Agreeing
 * twenty-seven records one at a time is right when each needs thought and
 * wrong when a fortnight of routine expenses is sitting there — so the rows can
 * be ticked, all of them at once, and given one verdict.
 *
 * TICKING IS NOT OPENING. A row's tick box selects it for the bulk verdict; the
 * rest of the row still opens it in the panel beside the list. They are two
 * different intentions and neither should trigger the other, which is why the
 * box stops the click from reaching the link.
 *
 * The bar only exists while something is ticked. A toolbar that sits there
 * greyed out all day is furniture; one that appears when it can act is an
 * answer to what you just did.
 */
export function RecordsQueue({
  rows,
  canReview,
  emptyLabel,
}: {
  rows: QueueRowView[];
  canReview: boolean;
  emptyLabel: string;
}) {
  const t = useT();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"RECONCILED" | "SENT_BACK" | null>(null);
  const [state, action] = useActionState<
    ActionResult<{ written: number; skipped: number; state: string }> | undefined,
    FormData
  >(reviewRecords, undefined);

  const allPicked = rows.length > 0 && picked.size === rows.length;
  const ids = useMemo(() => [...picked], [picked]);

  /*
    A verdict lands and the ticks go with it — ONCE.

    The first version cleared during render whenever state.ok was true, and
    useActionState keeps the last success around forever, so after one bulk
    action every new tick was wiped the instant it was made. The owner: "it
    wont let me tik or pick". The latch compares object identity — each
    completed action returns a fresh state object — so the clear fires exactly
    once per verdict and never again.
  */
  const clearedFor = useRef<typeof state>(undefined);
  useEffect(() => {
    if (state?.ok && clearedFor.current !== state) {
      clearedFor.current = state;
      setPicked(new Set());
      setMode(null);
    }
  }, [state]);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canReview && rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--brand))]"
              checked={allPicked}
              onChange={() =>
                setPicked(allPicked ? new Set() : new Set(rows.map((row) => row.id)))
              }
            />
            {picked.size > 0
              ? `${picked.size} ${t("picked")}`
              : t("Pick all on this page")}
          </label>

          {picked.size > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode(mode === "RECONCILED" ? null : "RECONCILED")}
                className={cn(
                  "focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  mode === "RECONCILED"
                    ? "bg-success text-success-foreground"
                    : "border-success/40 text-success hover:bg-success/10"
                )}
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                {t("Reconcile")} {picked.size}
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === "SENT_BACK" ? null : "SENT_BACK")}
                className={cn(
                  "focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  mode === "SENT_BACK"
                    ? "bg-warning text-warning-foreground"
                    : "border-warning/40 text-warning hover:bg-warning/10"
                )}
              >
                <Undo2 className="h-3.5 w-3.5" />
                {t("Send back")} {picked.size}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode ? (
        <form action={action} className="border-b bg-muted/20 px-4 py-3">
          <input type="hidden" name="target" value="LEDGER_ENTRY" />
          <input type="hidden" name="state" value={mode} />
          {ids.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <p className="text-xs text-muted-foreground">
            {mode === "RECONCILED"
              ? `${t("Agreeing")} ${ids.length} ${t("records. Each keeps its own line in the history.")}`
              : `${t("Handing")} ${ids.length} ${t("records back to Finance, with this reason on each.")}`}
          </p>
          <Textarea
            name="reason"
            rows={2}
            required={mode === "SENT_BACK"}
            className="mt-2 text-xs"
            placeholder={
              mode === "RECONCILED"
                ? t("Note (optional) — e.g. checked against the statement of the 18th.")
                : t("What has to be corrected on all of these?")
            }
          />
          <FormError state={state} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SubmitButton pendingLabel="Recording…">
              {mode === "RECONCILED"
                ? `${t("Reconcile")} ${ids.length}`
                : `${t("Send back")} ${ids.length}`}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="focus-ring inline-flex min-h-9 items-center rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("Cancel")}
            </button>
          </div>
        </form>
      ) : null}

      {/* The receipt for the LAST verdict, gone the moment a new pick starts —
          a success banner sitting over fresh work reads as if the new ticks
          were already recorded. */}
      {state?.ok && state.data && picked.size === 0 && !mode ? (
        <p className="border-b bg-success/10 px-4 py-2 text-xs font-medium text-success">
          {state.data.written} {t("recorded")}
          {state.data.skipped > 0 ? ` · ${state.data.skipped} ${t("skipped")}` : ""}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        /* Capped at roughly eight rows — the growth is HERE, so the limit is
           here, the same rule as the flights list. min-h-0 + flex-1 lets it
           fill the card when the panel beside it is the taller one; max-h stops
           it dragging the whole band down the page when the week is busy. */
        <ul className="min-h-0 max-h-[30rem] flex-1 divide-y overflow-y-auto">
          {rows.map((row) => (
            <li key={row.id} className="flex items-stretch">
              {canReview ? (
                <label
                  className="flex cursor-pointer items-center pl-3 pr-1"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[hsl(var(--brand))]"
                    checked={picked.has(row.id)}
                    onChange={() => toggle(row.id)}
                    aria-label={`${t("Pick")} ${row.title}`}
                  />
                </label>
              ) : null}
              <Link
                href={row.href}
                scroll={false}
                className={cn(
                  "focus-ring block min-w-0 flex-1 border-l-2 px-3 py-2.5 transition-colors hover:bg-muted/40",
                  row.selected ? "border-l-brand bg-brand/[0.06]" : "border-l-transparent"
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p
                    className={cn(
                      "shrink-0 font-mono text-sm font-semibold tabular-nums",
                      row.out ? "text-destructive" : "text-success"
                    )}
                  >
                    {row.amount}
                  </p>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">{row.meta}</p>
                  {row.badge ? (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                        row.badge.className
                      )}
                    >
                      {row.badge.label}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
          {/* The end of a short list, said rather than left as ground. The two
              panels are held level so neither leaves a black column beside it,
              which means the shorter one carries slack; a line at the foot of
              it reads as finished instead of as something failing to load. */}
          <li className="px-4 py-3 text-center text-[11px] text-muted-foreground">
            {t("That is everything in this view.")}
          </li>
        </ul>
      )}
    </div>
  );
}
