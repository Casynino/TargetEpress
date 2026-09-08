"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { formatWeight } from "@/lib/format";
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
  chargeableKg,
  freightOverride,
  agreedRate,
  standardRate: bookRate = null,
  perItem = false,
  pieces = 1,
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
  /** What the freight was actually billed on — 1 kg minimum applied. */
  chargeableKg?: number;
  freightOverride: number | null;
  /** The rate Finance agreed for this consignment, if they have. */
  agreedRate?: number | null;
  /**
   * THE RATE BOOK'S OWN RATE, READ RATHER THAN DIVIDED OUT.
   *
   * `rateBookFreight / pricedOn` looks like the same answer and is not: on a
   * bill whose freight was typed over it divides the TYPED total, so the
   * "standard" shown was whatever somebody had already agreed. The book's
   * figure is stamped on the shipment when Dar prices it and never overwritten
   * by an agreement, which is the whole reason the two can be shown together.
   */
  standardRate?: number | null;
  /** Per-piece cargo is priced per item, not per kilo. */
  perItem?: boolean;
  /** How many pieces, for the per-item rates. */
  pieces?: number;
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
  /*
    THE RATE, WHICH IS THE NUMBER ACTUALLY AGREED.

    A large customer is given 11.50 where the book says 12.50. That is what was
    said on the phone; the freight is what falls out of it. Typing the rate and
    letting the total follow is both fewer keystrokes and the figure the desk
    can check against what they promised.

    Typing a freight directly still works and clears the rate — a total nobody
    derived from a rate should not claim to have been.
  */
  const [rate, setRate] = useState(agreedRate === null || agreedRate === undefined ? "" : String(agreedRate));
  /* What the rate book prices this cargo on: pieces, or the chargeable weight
     with the 1 kg minimum already applied. */
  const pricedOn = perItem ? pieces : (chargeableKg ?? weightKg);
  /* The book's own figure where the page passed one; the division only as a
     fallback for callers that have not been given it yet — see the prop. */
  const standardRate =
    bookRate ?? (pricedOn > 0 ? rateBookFreight / pricedOn : null);
  const unit = perItem ? t("per item") : t("per kg");
  const [extra, setExtra] = useState(otherCharges ? String(otherCharges) : "");
  const [off, setOff] = useState(discount ? String(discount) : "");

  const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
  /* A typed rate wins, exactly as it does on the server. */
  const fromRate =
    rate.trim() === "" ? null : Math.round(n(rate) * pricedOn * 100) / 100;
  const effectiveFreight =
    fromRate ?? (freight.trim() === "" ? rateBookFreight : n(freight));
  const preview = effectiveFreight + storage + n(extra) - n(off);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        /* A bordered control, not muted text with an icon in front of it.
           Plain text beside a price column reads as a caption — the same thing
           that hid the register's own fix-it door until it was given edges. */
        className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-brand sm:min-h-0 sm:h-7"
      >
        <Pencil className="h-3.5 w-3.5" />
        {t("Edit")}
        {/* A cargo already carrying an agreed rate says so before it is
            opened: this is the only place on the flight list where that fact
            can be seen at a glance. */}
        {agreedRate !== null && agreedRate !== undefined ? (
          <span className="rounded bg-brand/15 px-1 py-px text-[10px] font-semibold text-brand">
            {t("Special rate")}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    // 21rem is what the panel wants beside a price column. On a 375px phone it
    // is wider than the card it now opens inside, so the width is a preference
    // clamped by the viewport rather than a promise the layout cannot keep.
    <div className="w-[21rem] max-w-full rounded-lg border bg-card p-3 text-left shadow-lift">
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
        {/*
          WHAT THIS CARGO IS PRICED AT, THE SAME THREE LINES THE DIALOG SHOWS.

          This was one sentence of working with a "fix the rate" link after it,
          and the link goes to the RATE BOOK — the price for every consignment
          the company will ever carry. A desk wanting to give one customer a
          figure had the whole book offered to them and nothing else, so the
          only per-cargo move on this panel was typing a freight total by hand.
          Named the same way here as everywhere else, so a reader moving
          between the flight list and the cargo page reads one thing.
        */}
        <dl className="space-y-1 rounded-lg border bg-muted/40 px-2.5 py-2 text-[11px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Standard rate")}</dt>
            <dd className="tabular-nums font-medium">
              {standardRate === null
                ? t("not recorded")
                : `${currency} ${standardRate.toFixed(2)} ${unit}`}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Current rate")}</dt>
            <dd className="tabular-nums font-medium">
              {agreedRate === null || agreedRate === undefined
                ? standardRate === null
                  ? t("not recorded")
                  : `${currency} ${standardRate.toFixed(2)} ${unit}`
                : `${currency} ${agreedRate.toFixed(2)} ${unit}`}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Special rate")}</dt>
            <dd
              className={
                agreedRate === null || agreedRate === undefined
                  ? "text-muted-foreground"
                  : "font-semibold text-brand"
              }
            >
              {agreedRate === null || agreedRate === undefined ? t("No") : t("Yes")}
            </dd>
          </div>
        </dl>
        {/* Kept, and told apart from the box above it. Changing the book is a
            decision about every consignment the company carries; the box is a
            decision about this one. */}
        <p className="text-[11px] text-muted-foreground">
          <a
            href="/app/finance/pricing"
            className="text-brand underline underline-offset-2"
          >
            {t("Change the rate book")}
          </a>{" "}
          {t("— that price applies to every cargo, not just this one.")}
        </p>

        {/*
          THE RATE, ON ITS OWN LINE, ABOVE THE TOTALS IT PRODUCES.

          The owner's flow: open the cargo, type the rate agreed with the
          customer, save. So the rate is the first thing on the form and the
          freight below follows it — rather than making the desk multiply
          11.50 by 3.4 kg in their head and type the answer.
        */}
        {canOverride && pricedOn > 0 ? (
          <label className="block space-y-0.5">
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("Rate")} {unit}
            </span>
            <MoneyInput
              id={`rate-${invoiceId}`}
              name="freightRateOverride"
              decimals={2}
              value={rate}
              onValueChange={(raw) => {
                setRate(raw);
                /* The freight box is the derived figure while a rate is
                   typed; clearing the rate hands it back. */
                setFreight("");
              }}
              placeholder={standardRate === null ? "" : standardRate.toFixed(2)}
            />
            {/* The arithmetic and what it gives away, worded exactly as the
                cargo page's dialog words it — two screens describing the same
                concession two ways is how a desk starts checking one against
                the other. */}
            <span className="block text-[11px] text-muted-foreground">
              {rate.trim() === "" ? (
                t("Leave it empty to price this cargo from the rate book.")
              ) : (
                <span className="tabular-nums">
                  {n(rate).toFixed(2)} ×{" "}
                  {/* formatWeight carries its own unit — saying "kg" after it
                      printed "4 kg kg". */}
                  {perItem
                    ? `${pieces} ${t(pieces === 1 ? "piece" : "pieces")}`
                    : formatWeight(pricedOn)}{" "}
                  ={" "}
                  <span className="font-semibold text-foreground">
                    {currency} {(fromRate ?? 0).toFixed(2)}
                  </span>
                  {standardRate !== null &&
                  Math.abs(standardRate - n(rate)) > 0.005 ? (
                    <>
                      {" · "}
                      <span
                        className={
                          standardRate - n(rate) > 0
                            ? "text-success"
                            : "text-warning"
                        }
                      >
                        {standardRate - n(rate) > 0 ? "−" : "+"}
                        {currency} {Math.abs(standardRate - n(rate)).toFixed(2)}{" "}
                        {unit} {t("against the book")}
                      </span>
                    </>
                  ) : null}
                </span>
              )}
            </span>
          </label>
        ) : null}

        <div className="flex gap-2">
          {[
            {
              id: `freight-${invoiceId}`,
              name: "freightOverride",
              label: t("Freight"),
              value: fromRate === null ? freight : fromRate.toFixed(2),
              set: (v: string) => {
                setFreight(v);
                /* A total typed by hand is not a rate anybody agreed. */
                setRate("");
              },
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
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
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
              {t("Note")}{" "}
              <span className="text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Input
              id={`why-${invoiceId}`}
              name="freightOverrideReason"
              placeholder={t("e.g. weight re-checked on the floor scale")}
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
