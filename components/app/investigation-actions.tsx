"use client";

import { useActionState } from "react";
import type { ExceptionStatus } from "@prisma/client";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  LIFECYCLE_STEPS,
  NOTE_REQUIRED_ON,
  type LifecycleStep,
} from "@/lib/investigation-lifecycle";
import {
  addInvestigationNote,
  advanceInvestigation,
  assignInvestigation,
} from "@/lib/actions/investigation-queue";
import type { ActionResult } from "@/lib/actions/types";

/**
 * The controls that move a case along, inside its expanded row.
 *
 * Which buttons exist is decided twice. Here, so nobody is shown a button that
 * would only tell them off; and again in the server action, against the case as
 * it stands at that instant — this component's job is to keep the screen
 * honest, not to be the gate.
 *
 * One form, one note box, a button per available step. The note is the same
 * field whichever button is pressed, because a clerk writing "found behind the
 * pallet rack" should not have to work out which of two boxes it belongs in.
 */

export type InvestigationAllowances = {
  /** exception.investigate — work the case, mark cargo found, write notes. */
  investigate: boolean;
  /** exception.approve — authorise a payout or a replacement, and reassign. */
  approve: boolean;
  /** exception.close — declare the case finished. */
  close: boolean;
};

function allowed(step: LifecycleStep, allow: InvestigationAllowances) {
  switch (step.permission) {
    case "exception.investigate":
      return allow.investigate;
    case "exception.approve":
      return allow.approve;
    case "exception.close":
      return allow.close;
    default:
      return false;
  }
}

const TONE_BUTTON: Record<
  LifecycleStep["tone"],
  { variant: "brand" | "outline" | "destructive"; className?: string }
> = {
  brand: { variant: "brand" },
  success: {
    variant: "outline",
    className: "border-success/50 text-success hover:bg-success/10",
  },
  warning: {
    variant: "outline",
    className: "border-warning/60 text-warning hover:bg-warning/10",
  },
  danger: { variant: "destructive" },
  neutral: { variant: "outline" },
};

export function InvestigationActions({
  exceptionId,
  status,
  allow,
  assignees,
  assignedToId,
}: {
  exceptionId: string;
  status: ExceptionStatus;
  allow: InvestigationAllowances;
  /** Empty unless the viewer may reassign. */
  assignees: { id: string; name: string; roleLabel: string }[];
  assignedToId: string | null;
}) {
  const steps = LIFECYCLE_STEPS[status].filter((step) => allowed(step, allow));
  const canAssign = allow.approve && assignees.length > 0;

  if (steps.length === 0 && !allow.investigate && !canAssign) return null;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      {steps.length > 0 ? (
        <AdvanceForm exceptionId={exceptionId} steps={steps} />
      ) : null}

      {allow.investigate ? <NoteForm exceptionId={exceptionId} /> : null}

      {canAssign ? (
        <AssignForm
          exceptionId={exceptionId}
          assignees={assignees}
          assignedToId={assignedToId}
        />
      ) : null}
    </div>
  );
}

function AdvanceForm({
  exceptionId,
  steps,
}: {
  exceptionId: string;
  steps: LifecycleStep[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    advanceInvestigation,
    { ok: true }
  );

  // The note is only compulsory for the decisions that have to be justified —
  // approving money, approving a replacement, closing a case. Requiring one to
  // say "I have started looking" only teaches people to type a full stop.
  const noteNeeded = steps.some((step) => NOTE_REQUIRED_ON.includes(step.to));

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="exceptionId" value={exceptionId} />

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          What happened
        </span>
        <Textarea
          name="note"
          rows={2}
          className="mt-1 min-h-0"
          placeholder={
            noteNeeded
              ? "Required when approving, closing, or marking cargo found — say why."
              : "Optional. Goes on the case timeline."
          }
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {steps.map((step) => {
          const tone = TONE_BUTTON[step.tone];
          return (
            <SubmitButton
              key={step.to}
              name="to"
              value={step.to}
              size="sm"
              variant={tone.variant}
              className={tone.className}
              title={step.hint}
              pendingLabel="Saving…"
            >
              {step.label}
            </SubmitButton>
          );
        })}
      </div>

      <FormError state={state} />
    </form>
  );
}

function NoteForm({ exceptionId }: { exceptionId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    addInvestigationNote,
    { ok: true }
  );

  return (
    <form action={action} className="space-y-2 border-t pt-3">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Textarea
          name="note"
          rows={1}
          className="min-h-0"
          placeholder="Add a note without changing the status — a phone call, a search, what the customer said."
          required
        />
        <SubmitButton
          size="sm"
          variant="outline"
          className="shrink-0"
          pendingLabel="Adding…"
        >
          Add note
        </SubmitButton>
      </div>
      <FormError state={state} />
    </form>
  );
}

function AssignForm({
  exceptionId,
  assignees,
  assignedToId,
}: {
  exceptionId: string;
  assignees: { id: string; name: string; roleLabel: string }[];
  assignedToId: string | null;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    assignInvestigation,
    { ok: true }
  );

  return (
    <form action={action} className="space-y-2 border-t pt-3">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Carried by
          </span>
          <NativeSelect
            name="assignedToId"
            defaultValue={assignedToId ?? ""}
            className="mt-1 h-9"
          >
            <option value="">Nobody yet</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} — {person.roleLabel}
              </option>
            ))}
          </NativeSelect>
        </label>
        <SubmitButton
          size="sm"
          variant="outline"
          className="shrink-0"
          pendingLabel="Saving…"
        >
          Reassign
        </SubmitButton>
      </div>
      <FormError state={state} />
    </form>
  );
}
