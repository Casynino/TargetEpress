"use client";

import { useActionState, useState } from "react";
import { Undo2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { undoRelease } from "@/lib/actions/delivery";

/**
 * Taking a handover back.
 *
 * Sits at the foot of the delivery record rather than up beside Edit and
 * Delete, because it belongs to the thing it undoes: whoever is looking at a
 * handover that did not happen is already reading this panel.
 *
 * Shut until opened, and it names what it is about to remove — the delivery
 * record and its photographs — because that is the part nobody expects.
 */
export function ReleaseUndo({
  shipmentId,
  trackingNumber,
  receiverName,
}: {
  shipmentId: string;
  trackingNumber: string;
  receiverName: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(undoRelease, undefined);

  if (state?.ok) {
    return (
      <div className="border-t bg-warning/5 p-4 text-sm">
        <p className="font-medium">
          {trackingNumber} {t("is back on the shelf.")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t(
            "The pickup note is live again. If the money has been taken back too, cancel the note as well — otherwise the counter will hand this cargo over."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="flex items-center gap-2 text-sm font-medium text-warning">
            <Undo2 className="h-4 w-4" />
            {t("This cargo was not collected")}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("Take the handover back — the boxes never left the warehouse.")}
          </span>
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">
          {open ? t("Cancel") : t("Take it back")}
        </span>
      </button>

      {open ? (
        <form action={action} className="space-y-3 border-t px-4 py-4">
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <FormError state={state} />

          <div className="space-y-1.5">
            <Label htmlFor="undoReleaseReason">
              {t("Note")}{" "}
              <span className="text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Textarea
              id="undoReleaseReason"
              name="reason"
              rows={2}
              placeholder={t("e.g. Released by mistake — the cargo is still on the shelf")}
            />
          </div>

          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            {t("The delivery record naming")} {receiverName}{" "}
            {t(
              "is removed, and so are the proof-of-delivery photos — a photo of a handover that is being retracted would be read later as evidence the cargo went out. Who was named, and when, is kept on the audit record."
            )}
          </p>

          <SubmitButton variant="destructive" pendingLabel="Taking it back…">
            <Undo2 className="mr-2 h-4 w-4" />
            {t("Take back the handover of")} {trackingNumber}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
