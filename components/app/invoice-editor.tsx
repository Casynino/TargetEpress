"use client";

import { useActionState, useState } from "react";
import { Lock, Pencil } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adjustInvoice } from "@/lib/actions/finance";

/**
 * Editing a bill before it is paid.
 *
 * Freight and storage are shown but not editable: they come from the published
 * rate book and the arrival date, and letting a clerk retype them would make
 * the rate book decorative. Everything a human should be able to decide — a
 * discount, an extra charge, the rate, a note — is editable, and the running
 * total updates as they type so nobody publishes a figure they did not intend.
 */
export function InvoiceEditor({
  invoiceId,
  currency,
  freight,
  freightOverride,
  storage,
  discount,
  otherCharges,
  exchangeRate,
  localCurrency,
  notes,
  locked,
  canDiscount,
}: {
  invoiceId: string;
  currency: string;
  /** The rate-book figure. Never overwritten — the override sits beside it. */
  freight: number;
  freightOverride: number | null;
  storage: number;
  discount: number;
  otherCharges: number;
  exchangeRate: number | null;
  localCurrency: string;
  notes: string | null;
  /** Money has landed — nothing here may change. */
  locked: boolean;
  canDiscount: boolean;
}) {
  const [state, action] = useActionState(adjustInvoice, undefined);
  const [open, setOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState(String(discount || ""));
  const [otherDraft, setOtherDraft] = useState(String(otherCharges || ""));
  const [freightDraft, setFreightDraft] = useState(
    freightOverride === null ? "" : String(freightOverride)
  );
  const [rateDraft, setRateDraft] = useState(
    exchangeRate === null ? "" : String(exchangeRate)
  );

  const num = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  const total = freight + storage + num(otherDraft) - num(discountDraft);
  const rate = num(rateDraft);

  if (locked) {
    return (
      <div className="no-print flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Money has been received against this invoice, so it can no longer be
          edited. Corrections after payment are handled as a new charge or a
          refund, not by rewriting the bill.
        </p>
      </div>
    );
  }

  return (
    <div className="no-print rounded-xl border bg-card shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div>
          <p className="font-semibold">Adjust this invoice</p>
          <p className="text-sm text-muted-foreground">
            Freight, extra charges, discount, exchange rate and notes — before
            it is paid.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand">
          <Pencil className="h-4 w-4" />
          {open ? "Close" : "Edit"}
        </span>
      </button>

      {open ? (
        <form action={action} className="space-y-4 border-t p-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <FormError state={state} />
          {state?.ok ? (
            <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
              Invoice updated. The customer&rsquo;s copy shows the new total.
            </p>
          ) : null}

          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Storage</span>
              <span className="font-mono tabular-nums">
                {currency} {storage.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Storage is not typed — it comes from the arrival date and the free
              window.
            </p>

            <div className="space-y-1.5 border-t pt-3">
              <Label htmlFor="freightOverride">Air freight ({currency})</Label>
              <Input
                id="freightOverride"
                name="freightOverride"
                inputMode="decimal"
                value={freightDraft}
                onChange={(event) => setFreightDraft(event.target.value)}
                placeholder={freight.toFixed(2)}
                disabled={locked || !canDiscount}
              />
              <p className="text-xs text-muted-foreground">
                The rate book says {currency} {freight.toFixed(2)}. Leave blank
                to use it. Anything else is recorded as a variance against the
                price list, with your reason.
              </p>
            </div>

            {freightDraft.trim() !== "" &&
            Number(freightDraft) !== freight ? (
              <div className="space-y-1.5">
                <Label htmlFor="freightOverrideReason">
                  Why is it different?
                </Label>
                <Input
                  id="freightOverrideReason"
                  name="freightOverrideReason"
                  placeholder="e.g. re-weighed on the floor scale at 8.9 kg"
                  required
                  disabled={locked}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="otherCharges">Additional charge ({currency})</Label>
              <Input
                id="otherCharges"
                name="otherCharges"
                inputMode="decimal"
                value={otherDraft}
                onChange={(event) => setOtherDraft(event.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Repacking, special handling, delivery.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="discount">Discount ({currency})</Label>
              <Input
                id="discount"
                name="discount"
                inputMode="decimal"
                value={discountDraft}
                onChange={(event) => setDiscountDraft(event.target.value)}
                placeholder="0.00"
                disabled={!canDiscount}
              />
              <p className="text-xs text-muted-foreground">
                {canDiscount
                  ? "Recorded against your name in the audit log."
                  : "You are not authorised to give discounts."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exchangeRate">
                Exchange rate ({localCurrency} per {currency})
              </Label>
              <Input
                id="exchangeRate"
                name="exchangeRate"
                inputMode="decimal"
                value={rateDraft}
                onChange={(event) => setRateDraft(event.target.value)}
                placeholder="2700"
              />
              <p className="text-xs text-muted-foreground">
                Overrides the published rate for this invoice only.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoice-notes">Note on the invoice</Label>
              <Textarea
                id="invoice-notes"
                name="notes"
                rows={3}
                defaultValue={notes ?? ""}
                placeholder="Shown to the customer on the printed invoice."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
            <div>
              <p className="text-xs text-muted-foreground">New total</p>
              <p className="font-display text-xl font-bold tabular-nums">
                {currency} {total.toFixed(2)}
              </p>
              {rate > 0 ? (
                <p className="text-sm text-muted-foreground">
                  ≈ {localCurrency} {Math.round(total * rate).toLocaleString()}
                </p>
              ) : null}
            </div>
            {total < 0 ? (
              <p className="text-sm font-medium text-destructive">
                The discount is larger than the rest of the invoice.
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <SubmitButton pendingLabel="Saving…" disabled={total < 0}>
              Save changes
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
