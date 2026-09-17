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
  bookPerItem,
  pricedOn,
  weightKg,
  pieces,
  agreedQuantity = null,
  bookFreight: bookFreightOnBill = null,
  reason = null,
  asIcon = false,
  onSaved,
}: {
  invoiceId: string;
  /** The bill's currency — the rate is quoted in it. */
  currency: string;
  /** The rate book's own rate for this cargo. Null when none was recorded. */
  standard: number | null;
  /** What Finance has already agreed, if they have. */
  agreed: number | null;
  /** The unit the bill is charged in now — a switched unit wins. */
  perItem?: boolean;
  /** The rate book's own unit, which `standard` is quoted in. Defaults to
      `perItem` for a caller that has not been told the two can differ. */
  bookPerItem?: boolean;
  /** The chargeable weight, or the piece count — what the rate multiplies. */
  pricedOn: number;
  /**
   * BOTH UNITS, SO THE DESK CAN MOVE BETWEEN THEM.
   *
   * The rate book decides per-kg or per-piece by goods type, and the corridor
   * sells both: out of Hong Kong a customer is quoted per kilo or per document
   * depending on what was agreed with them. Passing the other quantity lets the
   * dialog switch without a round trip, and lets it say what the bill would
   * come to before anybody agrees to it.
   */
  weightKg?: number;
  pieces?: number;
  /** What the agreed rate was multiplied by, as stored — kept while the rate
      and unit are left alone, the way the server keeps it. */
  agreedQuantity?: number | null;
  /** The rate book's freight actually on this bill. Rebuilt as standard ×
      quantity instead, a pooled parcel carrying nothing read as USD 4.05. */
  bookFreight?: number | null;
  /** Why, when the desk gave a reason last time. */
  reason?: string | null;
  /**
   * AN ICON, WHERE THE ROW ALREADY HAS A COLUMN OF THEM.
   *
   * On the call list every other action on a row — open the cargo, message
   * them, take the money — is a bordered icon in one group at the end of it.
   * A worded link under the cargo instead put a seventh control somewhere none
   * of the others live, on every row of a hundred-row queue, and made the
   * column of tracking numbers three lines tall. The dialog it opens is the
   * same one either way.
   */
  asIcon?: boolean;
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
  /* The unit this rate is being quoted in. Opens on whatever the bill is
     charged in today, so doing nothing changes nothing. */
  const [byItem, setByItem] = useState(perItem);
  /*
    EVERY OPENING STARTS FROM THE BILL.

    The unit and the rate were set once, when the page drew, and a desk that
    clicked "Per kg" and cancelled reopened on per kg with the box empty — and
    pressing Save there, believing nothing had changed, dropped the agreed
    rate. Reset on the way in, so cancelling is cancelling.
  */
  const openDialog = () => {
    setTyped(agreed === null ? "" : String(agreed));
    setByItem(perItem);
    setOpen(true);
  };
  const bookByItem = bookPerItem ?? perItem;
  const bookUnit = bookByItem ? t("per item") : t("per kg");
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

  const unit = byItem ? t("per item") : t("per kg");
  /* The unit the bill is charged in, for the closed control — never the one
     a cancelled dialog was left on. */
  const billUnit = perItem ? t("per item") : t("per kg");
  const rateNow = Number(typed);
  const valid = typed.trim() !== "" && Number.isFinite(rateNow) && rateNow >= 0;
  /* The agreement on the bill, untouched: same rate, same unit. Its stored
     quantity stands, as it does on the server. */
  const sameAgreement =
    agreed !== null &&
    agreedQuantity !== null &&
    byItem === perItem &&
    valid &&
    Math.abs(rateNow - agreed) < 0.005;
  /* What the typed rate multiplies, in whichever unit is selected. Falls back
     to `pricedOn` where the caller has not passed both — every screen that has
     not been taught the switch keeps behaving exactly as it did. */
  const multiplier = sameAgreement
    ? agreedQuantity
    : byItem
      ? (pieces ?? (perItem ? pricedOn : 1))
      : (weightKg ?? (perItem ? 0 : pricedOn));
  /* Kilos print to the gram and no further, the way the scale reads. */
  const kgLabel = (kg: number) => `${Math.round(kg * 1000) / 1000} ${t("kg")}`;
  const quantity = byItem
    ? `${multiplier} ${t(multiplier === 1 ? "piece" : "pieces")}`
    : kgLabel(multiplier);
  /* Offered only where the dialog knows both quantities and the cargo could
     honestly be sold either way. */
  const canSwitch = weightKg !== undefined && pieces !== undefined;

  /* What the bill's freight will come to, shown before it is agreed rather
     than discovered on the bill afterwards. */
  const freight = valid ? Math.round(rateNow * multiplier * 100) / 100 : null;
  /*
    AGAINST THE BOOK — IN THE SAME UNIT, OR NOT AT ALL.

    A rate per kilo cannot be compared with a rate per document: it printed
    "−USD 26.50 per kg against the book" by subtracting 13.50 a kilo from 40 a
    piece, which is a number with no meaning. Where the unit has been switched,
    what the desk can honestly compare is what the BILL comes to — the book's
    unit on the book's quantity against the new one.
  */
  const switched = byItem !== bookByItem;
  const off =
    valid && standard !== null && !switched
      ? Math.round((standard - rateNow) * 100) / 100
      : null;
  const bookFreight =
    bookFreightOnBill ??
    (standard === null
      ? null
      : Math.round(
          standard *
            (bookByItem ? (pieces ?? pricedOn) : (weightKg ?? pricedOn)) *
            100
        ) / 100);

  if (!open) {
    if (asIcon) {
      return (
        <button
          type="button"
          onClick={openDialog}
          aria-label={`${t("Edit the rate")} ${billUnit}`}
          /* The same 7x7 bordered square its neighbours are, and brand-tinted
             when this cargo already carries an agreed rate, so a specially
             priced row can be picked out of the queue without opening it. */
          className={
            "focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors " +
            (agreed === null
              ? "border-brand/40 text-brand hover:bg-brand/10"
              : "border-brand bg-brand/15 text-brand hover:bg-brand/25")
          }
        >
          <Scale className="h-3.5 w-3.5" />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={openDialog}
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
          ? `${t("Edit the rate")} ${billUnit}`
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
                : `${currency} ${standard.toFixed(2)} ${bookUnit}`}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Current rate")}</dt>
            <dd className="tabular-nums font-medium">
              {agreed === null
                ? standard === null
                  ? t("not recorded")
                  : `${currency} ${standard.toFixed(2)} ${bookUnit}`
                : `${currency} ${agreed.toFixed(2)} ${perItem ? t("per item") : t("per kg")}`}
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
        {/* Sent always, so the server prices on the unit the desk was looking
            at rather than re-deriving one from the rate book. */}
        <input
          type="hidden"
          name="rateMethod"
          value={byItem ? "FIXED_PER_ITEM" : "WEIGHT_BASED"}
        />

        {/*
          PER KILO OR PER PIECE, FOR THIS CONSIGNMENT.

          The rate book sets the unit from the goods type — Documents are USD 40
          a piece whatever they weigh — and the corridor sells both. This is the
          commercial answer for one customer's cargo, not a change to the price
          list: every other consignment of the same goods keeps the book's unit.

          Switching re-reads the figure underneath rather than converting it. A
          rate agreed per document is not the same number as a rate per kilo,
          and quietly carrying one across would bill somebody at a price nobody
          said.
        */}
        {canSwitch ? (
          <div className="space-y-1">
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("Charge this cargo")}
            </span>
            <div className="flex rounded-lg border p-0.5">
              {[
                { key: false, label: `${t("Per kg")} · ${kgLabel(weightKg ?? 0)}` },
                {
                  key: true,
                  label: `${t("Per piece")} · ${pieces} ${t(pieces === 1 ? "piece" : "pieces")}`,
                },
              ].map((option) => (
                <button
                  key={String(option.key)}
                  type="button"
                  onClick={() => {
                    /* A rate agreed in one unit is not a rate in the other.
                       Emptied, so the desk types the figure actually agreed
                       instead of carrying 40 a document across as 40 a kilo. */
                    if (option.key !== byItem) setTyped("");
                    setByItem(option.key);
                  }}
                  className={
                    "focus-ring flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors " +
                    (byItem === option.key
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:bg-accent")
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            {switched ? (
              <p className="text-[11px] text-warning">
                {t("The rate book prices this")} {bookUnit}.{" "}
                {t("This changes it for this consignment only.")}
              </p>
            ) : null}
          </div>
        ) : null}

        <label className="block space-y-1">
          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("Freight rate")} {unit}
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
              /* The book's figure only where it is in the same unit — offered
                 as 40.00 in a per-kilo box it reads as the rate to type. */
              placeholder={
                standard === null || switched ? "0.00" : standard.toFixed(2)
              }
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
            {switched && bookFreight !== null && freight !== null ? (
              <>
                {" · "}
                <span className={freight < bookFreight ? "text-success" : "text-warning"}>
                  {t("the book's")} {currency} {bookFreight.toFixed(2)} → {currency}{" "}
                  {freight.toFixed(2)} {t("on the bill")}
                </span>
              </>
            ) : null}
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
        ) : switched ? (
          /* A unit moves with a rate, or not at all — the server refuses the
             empty box too, and this says why before anybody presses. */
          <p className="text-[11px] text-warning">
            {t("Type the rate agreed")} {unit}.{" "}
            {t("To price this cargo from the rate book again, choose")} {bookUnit}.
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
          <SubmitButton
            variant="brand"
            size="sm"
            pendingLabel="Saving…"
            disabled={switched && !valid}
          >
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
