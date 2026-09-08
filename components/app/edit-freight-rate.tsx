"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Scale } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { setFreightRate } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * THE RATE AGREED FOR THIS CONSIGNMENT, CHANGED WHERE THE MONEY IS TAKEN.
 *
 * A large customer is given USD 11.50/kg where the rate book says 12.50. That
 * conversation happens at the counter, with the payment on the screen — so the
 * rate moves from there, next to the discount, rather than by leaving the
 * payment, opening the bill and working out 11.50 × 3.4 kg by hand.
 *
 * The desk types the RATE and the freight follows. Per-item cargo is priced per
 * piece and everything else per kilo, and the box says which before anything is
 * typed, so a rate agreed on a five-piece consignment is never multiplied by
 * its weight.
 *
 * It is a link rather than a button for the same reason GiveDiscount is: the
 * buttons beside it are the two that finish the job, and this is a change to
 * the bill they are about to settle.
 */
export function EditFreightRate({
  invoiceId,
  currency,
  standard,
  agreed,
  perItem = false,
  pricedOn,
  reason = null,
  onSaved,
}: {
  invoiceId: string;
  /** The bill's currency — the rate is quoted in it. */
  currency: string;
  /** The rate book's own rate for this cargo. Null when none was recorded. */
  standard: number | null;
  /** What Finance has already agreed, if they have. */
  agreed: number | null;
  /** Per-piece cargo is priced per item, not per kilo. */
  perItem?: boolean;
  /** The chargeable weight, or the piece count — what the rate multiplies. */
  pricedOn: number;
  /** Why, when the desk gave a reason last time. */
  reason?: string | null;
  /**
   * Called once the change has actually saved.
   *
   * A screen holding the bill in SERVER props gets the new figures for free.
   * One holding it in CLIENT state does not — the dialog closes, the bill has
   * moved, and the money box beside it still follows the old balance. The
   * Record Payment panel is that second kind, which is why this exists.
   */
  onSaved?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(agreed === null ? "" : String(agreed));
  const [state, action] = useActionState<
    ActionResult<{ total: number; freight: number }>,
    FormData
  >(setFreightRate, { ok: true });

  useEffect(() => {
    if (state.ok && state.data) {
      setOpen(false);
      onSaved?.();
    }
  }, [state]);

  const unit = perItem ? t("per item") : t("per kg");
  const quantity = perItem
    ? `${pricedOn} ${t(pricedOn === 1 ? "piece" : "pieces")}`
    : `${pricedOn} ${t("kg")}`;

  /* What the bill's freight will come to, shown before it is agreed rather
     than discovered on the bill afterwards. */
  const rateNow = Number(typed);
  const valid = typed.trim() !== "" && Number.isFinite(rateNow) && rateNow >= 0;
  const freight = valid ? Math.round(rateNow * pricedOn * 100) / 100 : null;
  const off =
    valid && standard !== null
      ? Math.round((standard - rateNow) * 100) / 100
      : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <Scale className="h-3.5 w-3.5" />
        {/*
          THE UNIT THE CARGO IS ACTUALLY CHARGED IN.

          This said "per kg" on every consignment, including the per-piece
          rates — so a desk pricing five cartons of electronics was invited to
          set a rate per kilo on cargo that is not sold by weight, and had to
          open the box to find out what the figure would be multiplied by.
        */}
        {agreed === null
          ? `${t("Edit the rate")} ${unit}`
          : t("Change the agreed rate")}
      </button>
    );
  }

  /* Portalled, because a form may not live inside a form — the trigger sits in
     the payment panel, which is itself a form, and the browser would drop a
     nested one and hand its fields to the outer submit. */
  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <form
        action={action}
        className="w-full max-w-sm space-y-2.5 rounded-xl border bg-card p-4 shadow-lg"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Scale className="h-4 w-4 text-brand" />
          {t("The rate for this cargo")}
        </p>

        {/*
          THE BOOK'S RATE AND THE AGREED ONE, BOTH NAMED, BEFORE ANYTHING IS
          TYPED. A box that opened on 11.50 with nothing beside it would make
          the special rate look like the price.
        */}
        <dl className="space-y-1 rounded-lg border bg-muted/40 px-2.5 py-2 text-[11px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Standard rate")}</dt>
            <dd className="tabular-nums font-medium">
              {standard === null
                ? t("not recorded")
                : `${currency} ${standard.toFixed(2)} ${unit}`}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Current rate")}</dt>
            <dd className="tabular-nums font-medium">
              {agreed === null
                ? standard === null
                  ? t("not recorded")
                  : `${currency} ${standard.toFixed(2)} ${unit}`
                : `${currency} ${agreed.toFixed(2)} ${unit}`}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Special rate")}</dt>
            <dd
              className={
                agreed === null ? "text-muted-foreground" : "font-semibold text-brand"
              }
            >
              {agreed === null ? t("No") : t("Yes")}
            </dd>
          </div>
        </dl>

        <input type="hidden" name="invoiceId" value={invoiceId} />
        <label className="block space-y-1">
          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("Rate")} {unit}
          </span>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {currency}
            </span>
            <MoneyInput
              name="freightRate"
              value={typed}
              onValueChange={setTyped}
              decimals={2}
              placeholder={standard === null ? "0.00" : standard.toFixed(2)}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
        </label>

        {/* The arithmetic, so nobody multiplies in their head to check it. */}
        {freight !== null ? (
          <p className="text-[11px] text-muted-foreground">
            {rateNow.toFixed(2)} × {quantity} ={" "}
            <span className="font-semibold tabular-nums text-foreground">
              {currency} {freight.toFixed(2)}
            </span>
            {off !== null && Math.abs(off) > 0.005 ? (
              <>
                {" · "}
                <span className={off > 0 ? "text-success" : "text-warning"}>
                  {off > 0 ? "−" : "+"}
                  {currency} {Math.abs(off).toFixed(2)} {unit}{" "}
                  {t("against the book")}
                </span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {t("Leave it empty to drop the special rate and price this cargo from the rate book again.")}
          </p>
        )}

        {/* Offered, not demanded — the rate before, the rate after and who
            agreed it are on the audit line either way. */}
        <Input
          name="reason"
          defaultValue={reason ?? ""}
          placeholder={t("Note (optional) — agreed with the customer, large cargo…")}
          className="h-8 text-xs"
        />
        <FormError state={state} />
        <div className="flex items-center gap-2">
          <SubmitButton variant="brand" size="sm" pendingLabel="Saving…">
            {t("Save the rate")}
          </SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("Cancel")}
          </button>
        </div>
      </form>
    </div>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(dialog, document.body);
}
