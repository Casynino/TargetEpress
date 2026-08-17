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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("Change or extend the due date")}
        aria-label={t("Change or extend the due date")}
        className="focus-ring rounded px-1.5 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <CalendarClock className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-1 w-full space-y-2 rounded-lg border bg-card p-2.5 text-left"
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
  );
}
