"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, X } from "lucide-react";

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

  /*
    In place, not floating over the table.

    The first version put the panel in an absolutely-positioned span inside a
    table cell: it escaped its row, laid itself over five consignments below,
    and left the price column showing through it. The price editor beside it
    has always got this right by simply REPLACING its own button when open —
    the cell grows, the row grows, nothing overlaps anything. Same here.
  */
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t("Move")} ${trackingNumber}`}
        className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-brand"
      >
        <ArrowRightLeft className="h-3 w-3" />
        {t("Move")}
      </button>
    );
  }

  return (
    <div className="w-[19rem] rounded-lg border bg-card p-3 text-left shadow-lift">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-xs font-semibold">{trackingNumber}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t("Close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

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
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            {t("Its bill and history move with it.")}
          </p>
          <SubmitButton size="sm" variant="brand" pendingLabel={t("Moving…")}>
            {t("Move")}
          </SubmitButton>
        </div>
        <FormError state={state} />
      </form>
    </div>
  );
}
