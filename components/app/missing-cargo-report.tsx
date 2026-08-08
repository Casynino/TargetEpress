"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertTriangle, Lock, SearchX } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  reportMissingCargo,
  reportUnableToLocate,
} from "@/lib/actions/missing-cargo";
import type { ActionResult } from "@/lib/actions/types";

type LossResult = { trackingNumber: string; caseRef: string };

/**
 * Saying the box is not there.
 *
 * Kept behind a second click on purpose. This is the counter's alternative to
 * handing cargo over, and it locks the shipment for everybody until an
 * investigation closes it — not something to fire by brushing a button while
 * reaching for "Deliver". The textarea is required and short answers are
 * refused server-side, because "where did you look" is the only thing the
 * person searching tomorrow has to go on.
 */
function LossReport({
  action,
  hidden,
  trackingNumber,
  trigger,
  heading,
  blurb,
  placeholder,
  confirmLabel,
  onReported,
}: {
  action: (
    prev: ActionResult<LossResult> | undefined,
    formData: FormData
  ) => Promise<ActionResult<LossResult>>;
  hidden: Record<string, string>;
  trackingNumber: string;
  trigger: string;
  heading: string;
  blurb: string;
  placeholder: string;
  confirmLabel: string;
  onReported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<
    ActionResult<LossResult>,
    FormData
  >(action, { ok: true });

  if (state.ok && state.data) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-warning">
          <Lock className="h-4 w-4 shrink-0" />
          {state.data.trackingNumber} is locked
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Investigation {state.data.caseRef} is open. The cargo cannot be
          released until it is closed, Admin and Customer Support have been
          notified, and the customer&apos;s tracking now shows it as under
          investigation.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="rounded-lg">
            <Link href="/app/exceptions">Open the investigation queue</Link>
          </Button>
          {onReported ? (
            <Button size="sm" variant="ghost" onClick={onReported}>
              Next customer
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <SearchX className="mr-1.5 h-3.5 w-3.5" />
        {trigger}
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {heading}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`loss-note-${trackingNumber}`} className="text-xs">
          Where did you look?
        </Label>
        <Textarea
          id={`loss-note-${trackingNumber}`}
          name="note"
          rows={3}
          required
          minLength={5}
          placeholder={placeholder}
        />
      </div>

      <FormError state={state} />

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          variant="destructive"
          size="sm"
          className="rounded-lg"
          pendingLabel="Locking cargo…"
        >
          {confirmLabel}
        </SubmitButton>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * At the counter, with the customer in front of you. Stops the pickup rather
 * than recording a delivery that did not happen.
 */
export function UnableToLocateForm({
  pickupNoteId,
  trackingNumber,
  onReported,
}: {
  pickupNoteId: string;
  trackingNumber: string;
  onReported?: () => void;
}) {
  return (
    <LossReport
      action={reportUnableToLocate}
      hidden={{ pickupNoteId }}
      trackingNumber={trackingNumber}
      trigger="Unable to locate cargo"
      heading="Stop this pickup"
      blurb="Do not mark this delivered. Reporting it opens an investigation, locks the cargo against any further pickup attempt, and tells Admin and Customer Support straight away."
      placeholder="e.g. Not in bay C where the manifest puts it, not on the overflow rack, not in the Dar office van."
      confirmLabel="Stop pickup and open investigation"
      onReported={onReported}
    />
  );
}

/**
 * The same discovery made before anyone arrives — from the pickup queue or a
 * cargo record. Takes a pickup note or a shipment; screens pass whichever
 * identity they already hold.
 */
export function ReportMissingCargoForm({
  shipmentId,
  pickupNoteId,
  trackingNumber,
}: {
  shipmentId?: string;
  pickupNoteId?: string;
  trackingNumber: string;
}) {
  return (
    <LossReport
      action={reportMissingCargo}
      hidden={
        shipmentId ? { shipmentId } : { pickupNoteId: pickupNoteId ?? "" }
      }
      trackingNumber={trackingNumber}
      trigger="Report missing cargo"
      heading="Report this cargo missing"
      blurb="This takes the cargo out of the pickup queue and prevents delivery until the case is closed. Admin and Customer Support are notified, and the customer sees “Under investigation” instead of “Ready for pickup”."
      placeholder="e.g. Bay C is empty, checked the whole aisle and the returns shelf. Last seen at check-in on Tuesday."
      confirmLabel="Lock cargo and open investigation"
    />
  );
}
