"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
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
  weightKg,
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
  /** What it weighs, so the freight can show its own working. */
  weightKg: number;
  freightOverride: number | null;
  storage: number;
  otherCharges: number;
  discount: number;
  /** invoice.discount — the same authority that may move a price down. */
  canOverride: boolean;
}) {
  const t = useT();
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
        {t("Edit")}
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
          aria-label={t("Close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form action={action} className="space-y-2.5">
        <input type="hidden" name="invoiceId" value={invoiceId} />

        <div className="space-y-1">
          <Label htmlFor={`freight-${invoiceId}`} className="text-xs">
            {t("Freight")} ({currency})
          </Label>
          <MoneyInput
            id={`freight-${invoiceId}`}
            name="freightOverride"
            value={freight}
            onValueChange={setFreight}
            placeholder={rateBookFreight.toFixed(2)}
            disabled={!canOverride}
            className="h-8 text-sm"
          />
          {/*
            The working, not just the answer.

            "Rate book says USD 110.70" is a figure to accept or argue with;
            "8.2 kg × USD 13.50 a kilo" is a figure somebody can check. It is
            the same number with the reason attached, and the reason is what
            gets quoted to a customer asking why their bill is what it is.
          */}
          <p className="text-xs text-muted-foreground">
            {t("Rate book")}:{" "}
            {weightKg > 0 ? (
              <>
                <span className="tabular-nums text-foreground">
                  {weightKg.toFixed(1)} kg × {currency}{" "}
                  {(rateBookFreight / weightKg).toFixed(2)}
                </span>{" "}
                {t("a kilo")} ={" "}
              </>
            ) : null}
            <span className="tabular-nums text-foreground">
              {currency} {rateBookFreight.toFixed(2)}
            </span>
            . {t("Leave blank to use it.")}
          </p>
        </div>

        {freight.trim() !== "" && n(freight) !== rateBookFreight ? (
          <div className="space-y-1">
            <Label htmlFor={`why-${invoiceId}`} className="text-xs">
              {t("Why is it different?")}
            </Label>
            <Input
              id={`why-${invoiceId}`}
              name="freightOverrideReason"
              placeholder={t("e.g. weight re-checked on the floor scale")}
              required
              className="h-8 text-sm"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`extra-${invoiceId}`} className="text-xs">
              {t("Extra charge")}
            </Label>
            <MoneyInput
              id={`extra-${invoiceId}`}
              name="otherCharges"
              value={extra}
              onValueChange={setExtra}
              placeholder="0.00"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`off-${invoiceId}`} className="text-xs">
              {t("Discount")}
            </Label>
            <MoneyInput
              id={`off-${invoiceId}`}
              name="discount"
              value={off}
              onValueChange={setOff}
              placeholder="0.00"
              disabled={!canOverride}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/*
          Every part that makes the total, added up in front of the reader.

          A discount that does not visibly come off is a discount somebody has
          to take on trust, and this is the box where a customer is being given
          one. Freight, storage, extra, less the discount — then the answer.
        */}
        <p className="rounded border bg-muted/40 px-2 py-1.5 text-xs tabular-nums">
          <span className="text-muted-foreground">
            {currency} {(n(freight) || rateBookFreight).toFixed(2)}
            {storage > 0 ? ` + ${storage.toFixed(2)} ${t("storage")}` : ""}
            {n(extra) > 0 ? ` + ${n(extra).toFixed(2)} ${t("extra")}` : ""}
            {n(off) > 0 ? ` − ${n(off).toFixed(2)} ${t("discount")}` : ""} ={" "}
          </span>
          <span className="font-semibold">
            {t("New total")} {currency} {preview.toFixed(2)}
          </span>
        </p>

        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data
              ? `${t("Saved")} — ${currency} ${state.data.total.toFixed(2)}.`
              : null
          }
        />

        <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")}>
          {t("Save price")}
        </SubmitButton>
      </form>
    </div>
  );
}
