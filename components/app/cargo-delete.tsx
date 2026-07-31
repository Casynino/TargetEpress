"use client";

import { useActionState, useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteCargo, purgeCargo, restoreCargo } from "@/lib/actions/cargo-admin";

/**
 * Deleting a piece of cargo.
 *
 * The reason is required and is kept forever, because the useful question six
 * months later is never "was it deleted" but "why". Nothing is destroyed: the
 * row, its photos and its history survive, and an admin can put it back.
 */
export function DeleteCargoForm({
  shipmentId,
  trackingNumber,
  photoCount,
}: {
  shipmentId: string;
  trackingNumber: string;
  photoCount: number;
}) {
  const [state, action] = useActionState(deleteCargo, undefined);
  const [open, setOpen] = useState(false);

  if (state?.ok && state.data) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
        <p className="font-medium">{state.data.trackingNumber} deleted.</p>
        <p className="mt-1 text-muted-foreground">
          It is out of every list and the customer can no longer track it. An
          admin can restore it from Deleted records.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="flex items-center gap-2 font-medium text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete this cargo
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Hidden everywhere, but kept on the record with its photos.
          </span>
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">
          {open ? "Cancel" : "Delete"}
        </span>
      </button>

      {open ? (
        <form action={action} className="mt-4 space-y-3 border-t pt-4">
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <FormError state={state} />

          <div className="space-y-1.5">
            <Label htmlFor="reason">Why is it being deleted?</Label>
            <Textarea
              id="reason"
              name="reason"
              rows={2}
              placeholder="e.g. Duplicate entry — same carton recorded twice"
              required
            />
            <p className="text-xs text-muted-foreground">
              Kept permanently against {trackingNumber}.
            </p>
          </div>

          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            {photoCount > 0
              ? `${photoCount} photo${photoCount === 1 ? "" : "s"} will be preserved and stay viewable by an admin.`
              : "Nothing is destroyed — the record and its history are kept."}
          </p>

          <SubmitButton variant="destructive" pendingLabel="Deleting…">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete {trackingNumber}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

/** Puts a deleted piece of cargo back, from the admin's deleted-records screen. */
export function RestoreCargoButton({
  shipmentId,
  trackingNumber,
}: {
  shipmentId: string;
  trackingNumber: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await restoreCargo(shipmentId);
            if (!result.ok) setError(result.error);
          })
        }
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        Restore {trackingNumber}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}


/**
 * Erasing a record for good.
 *
 * Everything else in this system is reversible; this is not. So it is folded
 * shut by default, it states plainly what will be destroyed, and it will not
 * proceed until the tracking number has been typed out in full. That last step
 * is the whole safety mechanism — it is the difference between removing the
 * record you are looking at and the one you meant.
 */
export function PurgeCargoForm({
  shipmentId,
  trackingNumber,
  photoCount,
  packageCount,
}: {
  shipmentId: string;
  trackingNumber: string;
  photoCount: number;
  packageCount: number;
}) {
  const [state, action] = useActionState(purgeCargo, undefined);
  const [open, setOpen] = useState(false);

  if (state?.ok && state.data) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
        {state.data.trackingNumber} has been permanently removed. Only the audit
        entry remains.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-destructive hover:underline"
      >
        {open ? "Cancel" : "Remove permanently"}
      </button>

      {open ? (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <FormError state={state} />

          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <p className="font-medium text-destructive">
              This cannot be undone.
            </p>
            <p className="mt-1 text-muted-foreground">
              The record, its {packageCount} package
              {packageCount === 1 ? "" : "s"} and {photoCount} photo
              {photoCount === 1 ? "" : "s"} will be destroyed. The customer will
              no longer be able to track it. Only the audit entry survives.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`confirm-${shipmentId}`} className="text-xs">
              Type {trackingNumber} to confirm
            </Label>
            <input
              id={`confirm-${shipmentId}`}
              name="confirm"
              required
              autoComplete="off"
              placeholder={trackingNumber}
              className="h-9 w-full rounded-md border bg-background px-3 font-mono text-xs uppercase tabular outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            />
          </div>

          <SubmitButton size="sm" variant="destructive" pendingLabel="Removing…">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove permanently
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
