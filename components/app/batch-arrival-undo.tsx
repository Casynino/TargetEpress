"use client";

import { useActionState, useState } from "react";
import { PlaneTakeoff } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { undoBatchArrival } from "@/lib/actions/batches";

/**
 * The flight had not landed.
 *
 * Marking a batch in is the act that tells the whole system the boxes are on
 * the floor — statuses move, packages are receipted, cargo is priced, and the
 * storage clock starts. Done to a flight still in the air it does not merely
 * read wrong: seven days later it begins charging customers for a shelf their
 * cargo has never stood on.
 *
 * Shut by default, and under the figures rather than beside the manifest
 * button. Nobody needs this on the way past — it is a correction, and the
 * warehouse's ordinary day never touches it.
 */
export function BatchArrivalUndo({
  batchId,
  batchNumber,
  consignments,
}: {
  batchId: string;
  batchNumber: string;
  consignments: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(undoBatchArrival, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-info/40 bg-info/5 p-4 text-sm">
        <p className="font-medium">
          {batchNumber} {t("is back in the air.")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t(
            "Its cargo is in transit again and nothing is priced. The warehouse can check it in properly when it lands."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="flex items-center gap-2 font-medium text-warning">
            <PlaneTakeoff className="h-4 w-4" />
            {t("This flight has not landed yet")}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t(
              "Put it back in the air. The cargo returns to in transit, the boxes are un-ticked and the storage clock is unwound."
            )}
          </span>
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">
          {open ? t("Cancel") : t("Undo arrival")}
        </span>
      </button>

      {open ? (
        <form action={action} className="mt-4 space-y-3 border-t pt-4">
          <input type="hidden" name="batchId" value={batchId} />
          <FormError state={state} />

          <div className="space-y-1.5">
            <Label htmlFor="undoArrivalReason">
              {t("Why is it going back in the air?")}
            </Label>
            <Textarea
              id="undoArrivalReason"
              name="reason"
              rows={2}
              required
              placeholder={t("e.g. Marked in by mistake — the plane has not landed")}
            />
            <p className="text-xs text-muted-foreground">
              {t("Kept permanently against")} {batchNumber}.
            </p>
          </div>

          {/* What is about to happen, in the numbers of this flight. A warning
              that does not say how much it is about to touch is decoration. */}
          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            {consignments} {t("consignment(s) go back to in transit, and every bill and price on this flight is cancelled with it. Cargo already collected, a standing pickup note, or money already taken will stop this — undo those first.")}
          </p>

          <SubmitButton variant="destructive" pendingLabel="Putting it back…">
            <PlaneTakeoff className="mr-2 h-4 w-4" />
            {t("Put")} {batchNumber} {t("back in the air")}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
