"use client";

import { useActionState, useState } from "react";
import { CalendarClock } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { adjustCredit } from "@/lib/actions/credit";
import { CREDIT_TERMS } from "@/lib/credit";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Move the date a credit falls due — by a term, or off the calendar.
 *
 * Both ways, because they answer different sentences. "Give them another two
 * weeks" is a term; "they said they will pay on the 26th" is a date, and forcing
 * that second one through a dropdown of 7/14/30 makes somebody do arithmetic to
 * express something they already know exactly.
 *
 * The calendar is bounded in the input itself — min today, max thirty days out —
 * so the limit is visible while choosing rather than explained after being
 * refused. The server checks the same two bounds, because a date input's min and
 * max are a courtesy to the person, not a control.
 *
 * A reason is required. This is not a typo being corrected: the date is a promise
 * the customer was given, and every screen in the app reads it.
 *
 * Support may use this as well as Finance, because the desk on the phone when a
 * customer renegotiates is the desk that should be able to write the new date
 * down. What bounds it is the thirty-day ceiling, the reason and the name on the
 * audit row — not who is holding the mouse. Granting credit in the first place is
 * still Finance's alone.
 */
export function CreditAdjust({
  invoiceId,
  dueOn,
  overdue,
  /** yyyy-mm-dd for today and the ceiling, computed on the server. */
  today,
  ceiling,
}: {
  invoiceId: string;
  dueOn: string | null;
  overdue: boolean;
  today: string;
  ceiling: string;
}) {
  const t = useT();
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    adjustCredit,
    undefined
  );
  const [open, setOpen] = useState(false);

  /*
    THE DATE IS THE BUTTON.

    The first version put a bare 14px calendar icon between the date and the
    Collect link, and nobody found it — reasonably, since the row already carries
    five other things. Clicking the thing you want to change needs no discovering,
    so the due date itself opens the editor, dotted-underlined the way editable
    text is underlined everywhere.

    The panel is a popover rather than an inline block: this row is a flex line
    with the amount aligned to a column, and a form expanding inside it shoved
    every neighbouring row's figures sideways.
  */
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={t("Change or extend the due date")}
        className={
          overdue
            ? "focus-ring inline-flex items-center gap-1 rounded px-1 font-semibold text-destructive underline decoration-dotted decoration-1 underline-offset-2 transition-colors hover:bg-destructive/10"
            : "focus-ring inline-flex items-center gap-1 rounded px-1 tabular underline decoration-dotted decoration-1 underline-offset-2 transition-colors hover:bg-accent hover:text-foreground"
        }
      >
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        {dueOn ?? t("set a date")}
      </button>

      {open ? (
    <form
      action={action}
      className="absolute right-0 top-full z-30 mt-1 w-[17rem] space-y-2 rounded-lg border bg-card p-2.5 text-left shadow-lg"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <p className="text-[11px] font-semibold">
        {overdue ? t("Give them more time") : t("Move the due date")}
        {dueOn ? (
          <span className="ml-1 font-normal text-muted-foreground">
            · {t("now")} {dueOn}
          </span>
        ) : null}
      </p>

      {/* The exact date, when somebody already knows it. */}
      <label className="block text-[11px] text-muted-foreground">
        {t("Pick a date")}
        <Input
          type="date"
          name="dueDate"
          min={today}
          max={ceiling}
          className="mt-1 h-8 text-xs"
        />
      </label>

      {/* Or count from today, when the sentence is "another two weeks". */}
      <label className="block text-[11px] text-muted-foreground">
        {t("Or from today")}
        <select
          name="termDays"
          defaultValue=""
          className="focus-ring mt-1 h-8 w-full rounded-md border bg-card px-2 text-xs"
        >
          <option value="">{t("— use the date above —")}</option>
          {CREDIT_TERMS.map((d) => (
            <option key={d} value={d}>
              +{d} {t("days")}
            </option>
          ))}
        </select>
      </label>

      <Input
        name="reason"
        required
        placeholder={t("Why is the date moving?")}
        className="h-8 text-xs"
      />

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton size="sm" className="h-7 px-2.5 text-[11px]">
          {t("Save the new date")}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("Never mind")}
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t(
          "Thirty days is the furthest one decision can push it — the longest term the business offers. Recorded with your name and the reason."
        )}
      </p>

      <FormError state={state} />
    </form>
      ) : null}
    </span>
  );
}
