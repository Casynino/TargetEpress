"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adjustInvoice } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Fix one price without leaving the list.
 *
 * The owner's flow is to read down a flight, correct the two or three lines
 * that look wrong, and confirm the rest in one press. Sending them into the
 * cargo record and back for each correction breaks that rhythm — by the fourth
 * one they have lost their place in an eighty-seven line list.
 *
 * The rate-book figure is shown beside the box, never replaced by it. An
 * override is a departure from the price list and has to be explained, so the
 * reason is required and both figures survive on the invoice.
 */
export function RowPriceEditor({
  invoiceId,
  trackingNumber,
  currency,
  rateBookFreight,
  freightOverride,
  storage,
  otherCharges,
  discount,
  canOverride,
}: {
  invoiceId: string;
  trackingNumber: string;
  currency: string;
  rateBookFreight: number;
  freightOverride: number | null;
  storage: number;
  otherCharges: number;
  discount: number;
  /** invoice.discount — the same authority that may move a price down. */
  canOverride: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult<{ total: number }>, FormData>(
    adjustInvoice,
    { ok: true }
  );

  const [freight, setFreight] = useState(
    freightOverride === null ? "" : String(freightOverride)
  );
  const [extra, setExtra] = useState(otherCharges ? String(otherCharges) : "");
  const [off, setOff] = useState(discount ? String(discount) : "");

  const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const effectiveFreight = freight.trim() === "" ? rateBookFreight : n(freight);
  const preview = effectiveFreight + storage + n(extra) - n(off);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-brand"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </button>
    );
  }

  return (
    <div className="min-w-[22rem] rounded-lg border bg-card p-3 text-left shadow-lift">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-xs font-semibold">{trackingNumber}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form action={action} className="space-y-2.5">
        <input type="hidden" name="invoiceId" value={invoiceId} />

        <div className="space-y-1">
          <Label htmlFor={`freight-${invoiceId}`} className="text-[11px]">
            Freight ({currency})
          </Label>
          <Input
            id={`freight-${invoiceId}`}
            name="freightOverride"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={freight}
            onChange={(e) => setFreight(e.target.value)}
            placeholder={rateBookFreight.toFixed(2)}
            disabled={!canOverride}
            className="h-8 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Rate book says {currency} {rateBookFreight.toFixed(2)}. Leave blank
            to use it.
          </p>
        </div>

        {freight.trim() !== "" && n(freight) !== rateBookFreight ? (
          <div className="space-y-1">
            <Label htmlFor={`why-${invoiceId}`} className="text-[11px]">
              Why is it different?
            </Label>
            <Input
              id={`why-${invoiceId}`}
              name="freightOverrideReason"
              placeholder="e.g. weight re-checked on the floor scale"
              required
              className="h-8 text-sm"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`extra-${invoiceId}`} className="text-[11px]">
              Extra charge
            </Label>
            <Input
              id={`extra-${invoiceId}`}
              name="otherCharges"
              type="number"
              min="0"
              step="0.01"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="0.00"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`off-${invoiceId}`} className="text-[11px]">
              Discount
            </Label>
            <Input
              id={`off-${invoiceId}`}
              name="discount"
              type="number"
              min="0"
              step="0.01"
              value={off}
              onChange={(e) => setOff(e.target.value)}
              placeholder="0.00"
              disabled={!canOverride}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <p className="rounded border bg-muted/40 px-2 py-1.5 text-xs tabular-nums">
          New total {currency} {preview.toFixed(2)}
          {storage > 0 ? (
            <span className="text-muted-foreground">
              {" "}
              · includes {currency} {storage.toFixed(2)} storage
            </span>
          ) : null}
        </p>

        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data
              ? `Saved — ${currency} ${state.data.total.toFixed(2)}.`
              : null
          }
        />

        <SubmitButton size="sm" variant="brand" pendingLabel="Saving…">
          Save price
        </SubmitButton>
      </form>
    </div>
  );
}
