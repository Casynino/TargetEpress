"use client";

import { useActionState } from "react";
import type { ExceptionStatus } from "@prisma/client";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { assignInvestigation } from "@/lib/actions/investigation-queue";
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
  const canAssign = allow.approve && assignees.length > 0;

  if (!canAssign) return null;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      {/* The lifecycle stepper is gone.
          It offered Open -> Under investigation -> Waiting for customer ->
          Compensation approved -> ... and the timeline it produced was status
          ping-pong: "under investigation -> waiting for customer -> under
          investigation" records that somebody pressed two buttons, not that
          anything happened to the cargo. The owner's rule is two states — it is
          being worked, or it is finished — and finishing is the resolve form,
          which at least demands an answer. */}
      {/* The standalone note box is gone. The resolve form already asks what
          happened, and two note fields stacked on one screen means typing the
          same sentence twice or guessing which one is read later. */}
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
