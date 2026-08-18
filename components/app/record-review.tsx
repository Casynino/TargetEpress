"use client";

import { useActionState, useState } from "react";
import {
  BadgeCheck,
  CornerUpLeft,
  Flag,
  MessageCircleQuestion,
} from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions/types";

/** Mirrors ReviewTarget / ReviewState in the schema. Kept as string unions so
 *  this client file does not pull the Prisma enums across the boundary. */
export type ReviewTargetKind =
  | "PAYMENT"
  | "EXPENSE"
  | "BATCH"
  | "LEDGER_ENTRY"
  | "INVOICE";

export type ReviewStateKind =
  | "RECONCILED"
  | "PENDING"
  | "MISMATCH"
  | "UNDER_REVIEW"
  | "SENT_BACK";

/** A record's newest verdict, resolved and formatted by the server. */
export type ReviewStanding = {
  state: ReviewStateKind;
  /** Required on SENT_BACK and MISMATCH — it is the instruction to Finance. */
  reason: string | null;
  by: string;
  /** Already formatted server-side, so the row needs no date machinery. */
  at: string;
};

type ReviewAction = (
  prevState: ActionResult<unknown> | undefined,
  formData: FormData
) => Promise<ActionResult<unknown> | undefined>;

/** The verdicts that need words before they are worth recording. Verify is not
 *  here: it is one press, because demanding prose for "this is fine" is how
 *  reviewers stop reviewing. */
const ASKS = [
  {
    verdict: "SENT_BACK",
    icon: CornerUpLeft,
    label: "Send back",
    prompt: "What must Finance correct?",
  },
  {
    verdict: "MISMATCH",
    icon: Flag,
    label: "Flag",
    prompt: "What does not match?",
  },
  {
    verdict: "UNDER_REVIEW",
    icon: MessageCircleQuestion,
    label: "Ask",
    prompt: "What do you need to know?",
  },
] as const;

const STANDING_META: Record<
  ReviewStateKind,
  { label: string; className: string }
> = {
  RECONCILED: {
    label: "Verified",
    className: "border-success/40 bg-success/10 text-success",
  },
  SENT_BACK: {
    label: "Sent back",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  MISMATCH: {
    label: "Flagged",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  UNDER_REVIEW: {
    label: "Info requested",
    className: "border-brand/40 bg-brand/10 text-brand",
  },
  PENDING: {
    label: "Pending",
    className: "border-border bg-muted/60 text-muted-foreground",
  },
};

/**
 * The manager's verdict on one financial record, given beside it.
 *
 * Four verdicts, in the row, no modal — a reviewer works down a register, and
 * a dialog per row turns an afternoon's check into a hundred interruptions.
 * Verify is one press. Send back and Flag will not submit without a reason,
 * because a record bounced with no explanation just comes straight back; Ask
 * takes a question but does not insist on one.
 *
 * None of these verdicts edits the record. Each writes a NEW ManagerReview row
 * beside it — append-only, newest row is the standing — and the reason is
 * rendered here for whoever opens the row next, which is the entire mechanism:
 * the manager's dispute travels with the record while the record itself stays
 * exactly as Finance wrote it.
 *
 * The action arrives as a prop rather than an import so the same controls can
 * sit on any review surface — the transaction review, a batch, an invoice —
 * without this row widget naming every screen that uses it.
 */
export function RecordReview({
  target,
  targetId,
  standing,
  canReview,
  action,
}: {
  target: ReviewTargetKind;
  targetId: string;
  standing: ReviewStanding | null;
  /** record.review — without it the standing still shows, read-only. */
  canReview: boolean;
  action: ReviewAction;
}) {
  const t = useT();
  const [state, dispatch] = useActionState<
    ActionResult<unknown> | undefined,
    FormData
  >(action, undefined);
  const [asking, setAsking] = useState<(typeof ASKS)[number] | null>(null);

  const meta = standing ? STANDING_META[standing.state] : null;

  return (
    <div className="min-w-[13rem] space-y-1">
      {standing && meta ? (
        <div className="text-[11px] leading-tight">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span
              className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-px font-semibold ${meta.className}`}
            >
              {t(meta.label)}
            </span>
            <span className="whitespace-nowrap text-muted-foreground">
              {standing.by} · {standing.at}
            </span>
          </span>
          {/* The reason is the message. A send-back whose reason hides behind a
              click is a record Finance corrects blind — so it sits in the row,
              always. */}
          {standing.reason ? (
            <p className="mt-0.5 text-muted-foreground">“{standing.reason}”</p>
          ) : null}
        </div>
      ) : null}

      {canReview ? (
        <div className="flex flex-wrap items-center gap-1">
          <form action={dispatch}>
            <input type="hidden" name="target" value={target} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="state" value="RECONCILED" />
            <SubmitButton size="sm" className="h-6 px-2 text-[11px]">
              <BadgeCheck className="mr-1 h-3 w-3" />
              {t("Verify")}
            </SubmitButton>
          </form>

          {ASKS.map((ask) => (
            <button
              key={ask.verdict}
              type="button"
              onClick={() =>
                setAsking((v) => (v?.verdict === ask.verdict ? null : ask))
              }
              aria-expanded={asking?.verdict === ask.verdict}
              className="focus-ring inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ask.icon className="h-3 w-3" />
              {t(ask.label)}
            </button>
          ))}
        </div>
      ) : null}

      {canReview && asking ? (
        <form action={dispatch} className="flex flex-wrap items-center gap-1">
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="state" value={asking.verdict} />
          <Input
            name="reason"
            required={asking.verdict !== "UNDER_REVIEW"}
            aria-label={t(asking.prompt)}
            placeholder={t(asking.prompt)}
            className="h-6 min-w-[11rem] flex-1 px-2 text-[11px]"
          />
          <SubmitButton size="sm" className="h-6 px-2 text-[11px]">
            {t("Record it")}
          </SubmitButton>
        </form>
      ) : null}

      <FormError state={state} />
    </div>
  );
}
