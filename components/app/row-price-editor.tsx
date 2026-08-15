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
    <div className="w-[21rem] rounded-lg border bg-card p-3 text-left shadow-lift">
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
        <input type="hidden" name="invoiceId" value={invoiceId} />

        {/*
          Three boxes on one row, not three labelled blocks down a column.

          It is a popover over a table row: every line it grows pushes the
          cargo underneath out of view, and the thing being edited is one
          price. Tiny captions instead of full labels, the working on its own
          line above, and the answer on the same line as the button that
          commits it.
        */}
        <p className="text-[11px] text-muted-foreground">
          {weightKg > 0 ? (
            <>
              <span className="tabular-nums text-foreground">
                {weightKg.toFixed(1)} kg × {(rateBookFreight / weightKg).toFixed(2)}
              </span>{" "}
              ={" "}
            </>
          ) : null}
          <span className="tabular-nums text-foreground">
            {rateBookFreight.toFixed(2)}
          </span>{" "}
          {t("from the rate book")} ·{" "}
          <a
            href="/app/finance/pricing"
            className="text-brand underline underline-offset-2"
          >
            {t("fix the rate")}
          </a>
        </p>

        <div className="flex gap-2">
          {[
            {
              id: `freight-${invoiceId}`,
              name: "freightOverride",
              label: t("Freight"),
              value: freight,
              set: setFreight,
              placeholder: rateBookFreight.toFixed(2),
              disabled: !canOverride,
            },
            {
              id: `extra-${invoiceId}`,
              name: "otherCharges",
              label: t("Extra"),
              value: extra,
              set: setExtra,
              placeholder: "0.00",
              disabled: false,
            },
            {
              id: `off-${invoiceId}`,
              name: "discount",
              label: t("Discount"),
              value: off,
              set: setOff,
              placeholder: "0.00",
              disabled: !canOverride,
            },
          ].map((box) => (
            <label key={box.id} className="flex-1 space-y-0.5">
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                {box.label}
              </span>
              <MoneyInput
                id={box.id}
                name={box.name}
                value={box.value}
                onValueChange={box.set}
                placeholder={box.placeholder}
                disabled={box.disabled}
                className="h-8 text-sm"
              />
            </label>
          ))}
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

        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs tabular-nums">
            <span className="text-muted-foreground">
              {(n(freight) || rateBookFreight).toFixed(2)}
              {storage > 0 ? ` + ${storage.toFixed(2)} ${t("storage")}` : ""}
              {n(extra) > 0 ? ` + ${n(extra).toFixed(2)}` : ""}
              {n(off) > 0 ? ` − ${n(off).toFixed(2)}` : ""} ={" "}
            </span>
            <span className="font-semibold">
              {currency} {preview.toFixed(2)}
            </span>
          </p>
          <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")}>
            {t("Save")}
          </SubmitButton>
        </div>

        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data
              ? `${t("Saved")} — ${currency} ${state.data.total.toFixed(2)}.`
              : null
          }
        />
      </form>
    </div>
  );
}
