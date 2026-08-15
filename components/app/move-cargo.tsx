"use client";

import { useActionState } from "react";
import { X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { moveShipmentToBatch } from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Put a consignment on the flight it actually belongs to.
 *
 * A box gets scanned into the wrong pile and the mistake surfaces later, on a
 * batch whose weight does not match what is standing in the warehouse. The
 * desks that notice — Finance chasing a figure, Support taking the customer's
 * call — can fix it here rather than asking somebody with dispatch powers.
 *
 * A reason is required. "Which flight was this on" is a question somebody will
 * ask about a specific box six months from now, and the answer has to be more
 * than that it changed.
 */
export function MoveCargo({
  shipmentId,
  trackingNumber,
  batches,
  onDone,
}: {
  shipmentId: string;
  trackingNumber: string;
  /** Flights whose books are still open, this one's excluded. */
  batches: { id: string; batchNumber: string }[];
  /** The table owns which row is open, so closing is its business. */
  onDone: () => void;
}) {
  const t = useT();
  const [state, action] = useActionState<ActionResult<{ to: string }>, FormData>(
    moveShipmentToBatch,
    { ok: true }
  );

  if (batches.length === 0) return null;

  return (
    <div className="text-left">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-xs font-semibold">{trackingNumber}</p>
        <button
          type="button"
          onClick={onDone}
          className="focus-ring rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t("Close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* One line across the row: where it goes, why, and the button. */}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="shipmentId" value={shipmentId} />
        <NativeSelect name="toBatchId" required className="h-8 w-56 text-sm">
          <option value="">{t("Move it to…")}</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.batchNumber}
            </option>
          ))}
        </NativeSelect>
        <Input
          name="reason"
          required
          minLength={3}
          placeholder={t("e.g. scanned onto the wrong pallet")}
          className="h-8 min-w-[16rem] flex-1 text-sm"
        />
        <SubmitButton size="sm" variant="brand" pendingLabel={t("Moving…")}>
          {t("Move")}
        </SubmitButton>
        <p className="w-full text-[11px] text-muted-foreground">
          {t("Its bill and history move with it. Both flights' figures follow.")}
        </p>
        <FormError state={state} />
      </form>
    </div>
  );
}
