"use client";

import { useActionState, useState } from "react";
import { ArrowRight, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { advanceInvestigation } from "@/lib/actions/investigation-queue";
import {
  LIFECYCLE_STEPS,
  NOTE_REQUIRED_ON,
  type LifecycleStep,
} from "@/lib/investigation-lifecycle";
import type { InvestigationAllowances } from "@/components/app/investigation-actions";
import type { ActionResult } from "@/lib/actions/types";
import type { ExceptionStatus, ExceptionType } from "@prisma/client";

/**
 * The desk a step belongs to, in the words the owner uses for it.
 *
 * Capabilities, not job titles. These two used to read "the CEO", which was
 * true only while the CEO was the sole holder of exception.approve — the
 * manager holds both now, so the screen was telling a blocked reader to chase
 * the wrong person while the right one sat on the queue. A permission can be
 * regranted; a name in a string cannot follow it. Naming what the other desk
 * is able to do stays true whoever ends up holding it.
 */
const DESK: Record<string, string> = {
  "exception.investigate": "the warehouse or the support desk",
  "exception.approve": "whoever rules on claims",
  "exception.close": "whoever signs cases off",
};

const TONES: Record<LifecycleStep["tone"], string> = {
  brand: "border-brand/40 hover:bg-brand/10",
  success: "border-success/40 hover:bg-success/10",
  warning: "border-warning/40 hover:bg-warning/10",
  danger: "border-destructive/40 hover:bg-destructive/10",
  neutral: "hover:bg-accent/40",
};

/**
 * Where this case can go, and who can take it there.
 *
 * The Issues & Claims showed a case and offered nothing to do with it, and
 * for most desks that was correct — a missing box is worked by the warehouse
 * and the payout is the CEO's call, so Finance genuinely has no move until
 * compensation is approved. What it never did was SAY so. A page that shows a
 * problem, offers no button, and does not name whose turn it is reads as
 * broken software rather than as somebody else's turn.
 *
 * So every open case now states its next moves. The ones this desk may take
 * are buttons; the rest name the desk that holds them. Nobody is left guessing
 * whether they are blocked or the screen is.
 *
 * One control per step, in one place. `advanceInvestigation` routes the two
 * specialist steps to their own actions, so finding a box and approving a
 * payout are reached from the same list as everything else rather than from
 * separate panels that would each be a second way to do one thing.
 */
/*
  THE SAME STEP, IN THE WORDS THAT FIT THE FAULT.

  Every case reaching CARGO_FOUND was offered "Cargo found — the boxes are back
  on the floor and count as received again". True of a consignment that was
  lost and turned up. Nonsense on a carton with the wrong contents, which was
  never anywhere else; and wrong on a customs hold, where the sentence a clerk
  needs is "customs released it".

  What the step DOES is unchanged — the same status, the same server action,
  the same package handling, all still decided by REPORTED_CARGO_ABSENT. This
  only says it in the words of the fault in front of the reader. Anything not
  named here keeps the general wording.
*/
const STEP_WORDS: Partial<
  Record<ExceptionType, Record<string, { label: string; hint: string }>>
> = {
  HELD_BY_CUSTOMS: {
    CARGO_FOUND: {
      label: "Cargo released",
      hint: "Customs has let it go. It comes onto the floor and counts as received.",
    },
  },
  SHORT_LANDED: {
    CARGO_FOUND: {
      label: "It arrived",
      hint: "The later flight brought it. It counts as received from now.",
    },
  },
  WRONG_ITEM: {
    CARGO_FOUND: {
      label: "Contents sorted out",
      hint: "The right goods are with the right customer.",
    },
  },
  UNIDENTIFIED_CARGO: {
    CARGO_FOUND: {
      label: "Owner identified",
      hint: "The box has a name against it and can be handed over.",
    },
  },
  RESTRICTED_ITEM: {
    CARGO_FOUND: {
      label: "Cleared to release",
      hint: "A decision has been taken and the cargo may leave the building.",
    },
  },
  OVER_SHIPPED: {
    CARGO_FOUND: {
      label: "Extra box accounted for",
      hint: "Whose the spare carton is has been settled.",
    },
  },
};

export function LifecycleSteps({
  exceptionId,
  type,
  status,
  allow,
}: {
  exceptionId: string;
  /** The fault, so the step can be named in its own words. */
  type: ExceptionType;
  status: ExceptionStatus;
  allow: InvestigationAllowances;
}) {
  const [chosen, setChosen] = useState<LifecycleStep | null>(null);
  const [state, action] = useActionState<ActionResult, FormData>(
    advanceInvestigation,
    { ok: true }
  );
  const t = useT();

  const raw = LIFECYCLE_STEPS[status] ?? [];
  if (raw.length === 0) return null;
  const words = STEP_WORDS[type];
  const steps = words
    ? raw.map((step) => ({ ...step, ...(words[step.to] ?? {}) }))
    : raw;

  const may = (permission: string) =>
    permission === "exception.investigate"
      ? allow.investigate
      : permission === "exception.approve"
        ? allow.approve
        : permission === "exception.close"
          ? allow.close
          : false;

  const mine = steps.filter((step) => may(step.permission));
  const others = steps.filter((step) => !may(step.permission));
  const waitingOn = Array.from(
    new Set(others.map((step) => t(DESK[step.permission] ?? "another desk")))
  );

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t("What happens next")}
      </p>

      {chosen ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="exceptionId" value={exceptionId} />
          <input type="hidden" name="to" value={chosen.to} />
          <p className="text-sm font-semibold">{t(chosen.label)}</p>
          <p className="text-xs text-muted-foreground">{t(chosen.hint)}</p>
          <div className="space-y-1">
            <Label htmlFor={`note-${exceptionId}`} className="text-xs">
              {NOTE_REQUIRED_ON.includes(chosen.to)
                ? t("What happened? The next person will ask.")
                : t("Note (optional)")}
            </Label>
            <Textarea
              id={`note-${exceptionId}`}
              name="note"
              rows={2}
              required={NOTE_REQUIRED_ON.includes(chosen.to)}
              className="text-sm"
            />
          </div>
          <FormError state={state} />
          <div className="flex items-center gap-2">
            <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")}>
              {t(chosen.label)}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              {t("Cancel")}
            </button>
          </div>
        </form>
      ) : mine.length > 0 ? (
        <ul className="space-y-1.5">
          {mine.map((step) => (
            <li key={step.to}>
              <button
                type="button"
                onClick={() => setChosen(step)}
                className={`focus-ring group flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${TONES[step.tone]}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {t(step.label)}
                  </span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    {t(step.hint)}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Not a disabled button. Somebody who cannot take a step does not need
          to see it greyed out — they need to know who to chase. */}
      {mine.length === 0 && waitingOn.length > 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("Nothing here is yours to do — this case is with")}{" "}
          <span className="font-medium text-foreground">
            {waitingOn.join(` ${t("and")} `)}
          </span>
          .
          {allow.compensate
            ? ` ${t("Your part comes if a payout is approved: you record what actually goes out.")}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
