"use client";

import { useActionState, useState } from "react";
import {
  BadgeCheck,
  Flag,
  MessageCircleQuestion,
  Search,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { reviewRecord } from "@/lib/actions/control";
import type { ActionResult } from "@/lib/actions/types";
import { cn } from "@/lib/utils";

type Verdict = "RECONCILED" | "SENT_BACK" | "FLAGGED" | "INFO_REQUESTED" | "UNDER_REVIEW";

const FLAG_KINDS = [
  "Incorrect amount",
  "Missing document",
  "Wrong account",
  "Duplicate transaction",
  "Unknown transaction",
  "Other",
];

/**
 * WHAT EACH VERDICT IS, IN THE WORDS OF THE JOB RATHER THAN THE ENUM.
 *
 * The button says what the manager is doing; the sentence under the open panel
 * says what it will mean to the person on the other end. "Send back" and "flag"
 * both mean something is wrong, and the difference — whether Finance is being
 * asked to fix it or the business is being warned about it — is the whole
 * reason both exist.
 */
const VERDICTS: Record<
  Verdict,
  {
    label: string;
    blurb: string;
    prompt: string;
    icon: LucideIcon;
    tone: string;
    solid: string;
    /** A verdict with no words is refused by the action; say so up here. */
    needsWords: boolean;
  }
> = {
  RECONCILED: {
    label: "Reconcile",
    blurb: "The record agrees with the evidence. This closes it.",
    prompt: "Note (optional)",
    icon: BadgeCheck,
    tone: "border-success/40 text-success hover:bg-success/10",
    solid: "bg-success text-success-foreground hover:bg-success/90",
    needsWords: false,
  },
  SENT_BACK: {
    label: "Send back",
    blurb:
      "Finance sees this on their desk with your reason, corrects it, and it comes back to you. The record itself is untouched.",
    prompt: "What has to be corrected",
    icon: Undo2,
    tone: "border-warning/40 text-warning hover:bg-warning/10",
    solid: "bg-warning text-warning-foreground hover:bg-warning/90",
    needsWords: true,
  },
  FLAGGED: {
    label: "Flag issue",
    blurb: "Raises it in the control room. Use when something is wrong beyond a figure.",
    prompt: "What is wrong with it",
    icon: Flag,
    tone: "border-destructive/40 text-destructive hover:bg-destructive/10",
    solid: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    needsWords: true,
  },
  INFO_REQUESTED: {
    label: "Request information",
    blurb:
      "Asks the desk that recorded it a question. Nothing is disputed — you are waiting on an answer.",
    prompt: "What do you need from them",
    icon: MessageCircleQuestion,
    tone: "border-info/40 text-info hover:bg-info/10",
    solid: "bg-info text-info-foreground hover:bg-info/90",
    needsWords: true,
  },
  UNDER_REVIEW: {
    label: "Investigate",
    blurb: "Parks it as yours to look into, so it is not mistaken for unread.",
    prompt: "What are you looking into (optional)",
    icon: Search,
    tone: "border-brand/40 text-brand hover:bg-brand/10",
    solid: "bg-brand text-brand-foreground hover:bg-brand/90",
    needsWords: false,
  },
};

/**
 * The manager's verdict on one record, recorded beside it and never inside it.
 *
 * ACTIONS ARE BUTTONS, NOT A MENU. This is the whole reason the page exists, so
 * every verdict is on the surface with its own words on it — the owner's
 * instruction was explicit that the work must not hide behind three dots.
 *
 * Opening one closes the others, because the panel below is the reason: a
 * sentence for the person on the other end, and it belongs to exactly one
 * verdict at a time.
 */
export function ReviewActions({
  target,
  targetId,
  /** Only the verdicts that make sense for where this record stands now. */
  offer,
  className,
}: {
  target: "LEDGER_ENTRY" | "BATCH" | "PAYMENT" | "EXPENSE" | "INVOICE";
  targetId: string;
  offer: Verdict[];
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<Verdict | null>(null);
  const [state, action] = useActionState<ActionResult<{ state: string }> | undefined, FormData>(
    reviewRecord,
    undefined
  );

  const chosen = open ? VERDICTS[open] : null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2">
        {offer.map((verdict) => {
          const meta = VERDICTS[verdict];
          const Icon = meta.icon;
          const active = open === verdict;
          return (
            <button
              key={verdict}
              type="button"
              onClick={() => setOpen(active ? null : verdict)}
              aria-expanded={active}
              className={cn(
                "focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors",
                active ? meta.solid : meta.tone
              )}
            >
              <Icon className="h-4 w-4" />
              {t(meta.label)}
            </button>
          );
        })}
      </div>

      {chosen && open ? (
        <form action={action} className="rounded-xl border bg-muted/20 p-3">
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="state" value={open} />

          <p className="text-xs leading-snug text-muted-foreground">{t(chosen.blurb)}</p>

          {open === "FLAGGED" ? (
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="issue">{t("What kind of problem")}</Label>
              <NativeSelect id="issue" name="issue" defaultValue={FLAG_KINDS[0]}>
                {FLAG_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(kind)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}

          <div className="mt-3 space-y-1.5">
            <Label htmlFor={`reason-${open}`}>
              {t(chosen.prompt)}
              {chosen.needsWords ? <span className="ml-1 text-destructive">*</span> : null}
            </Label>
            <Textarea
              id={`reason-${open}`}
              name="reason"
              rows={3}
              required={chosen.needsWords}
              placeholder={t(
                open === "SENT_BACK"
                  ? "e.g. The amount does not match the bank slip — 2,700,000 on the slip, 2,070,000 here."
                  : open === "INFO_REQUESTED"
                    ? "e.g. Please attach the bank statement line for this payment."
                    : open === "FLAGGED"
                      ? "e.g. This looks like the same payment recorded twice on the same day."
                      : "e.g. Checked against the statement of the 18th."
              )}
            />
          </div>

          <FormError state={state} />
          {state?.ok ? <FormSuccess message={t("Recorded. The history below has it.")} /> : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <SubmitButton pendingLabel="Recording…">{t(chosen.label)}</SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="focus-ring inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {t("Cancel")}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
