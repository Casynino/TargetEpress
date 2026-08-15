"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft } from "lucide-react";

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
}: {
  shipmentId: string;
  trackingNumber: string;
  /** Flights whose books are still open, this one's excluded. */
  batches: { id: string; batchNumber: string }[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult<{ to: string }>, FormData>(
    moveShipmentToBatch,
    { ok: true }
  );

  if (batches.length === 0) return null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${t("Move")} ${trackingNumber}`}
        className="focus-ring inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowRightLeft className="h-3 w-3" />
        {t("Move")}
      </button>

      {open ? (
        <span className="absolute right-0 top-6 z-20 block w-[19rem] rounded-lg border bg-card p-3 text-left shadow-lift">
          <span className="mb-2 flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold">
              {trackingNumber}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </span>

          <form action={action} className="space-y-2">
            <input type="hidden" name="shipmentId" value={shipmentId} />
            <NativeSelect name="toBatchId" required className="h-8 text-sm">
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
              className="h-8 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "Its bill, payments and history move with it. Both flights' figures follow."
              )}
            </p>
            <SubmitButton size="sm" variant="brand" pendingLabel={t("Moving…")}>
              {t("Move")}
            </SubmitButton>
            <FormError state={state} />
          </form>
        </span>
      ) : null}
    </span>
  );
}
