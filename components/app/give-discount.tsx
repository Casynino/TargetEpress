"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Tag } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { applyInvoiceDiscount } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Taking something off the bill without leaving the payment.
 *
 * Discounting is ordinary at this counter — a customer negotiates and the
 * figure moves — and it used to mean abandoning the payment form, opening the
 * invoice, editing it and coming back. It is a link rather than a button
 * because the button row beside it is for the two things that finish the job,
 * and a discount is a change to the bill they are about to settle.
 *
 * The reason is required. Money given away with nothing written against it is
 * exactly what nobody can answer for a year later, and the audit log is where
 * that answer has to live.
 */
export function GiveDiscount({
  invoiceId,
  currency,
  current,
  across = 1,
  rate,
  onSaved,
}: {
  invoiceId: string;
  currency: string;
  /** What is already off the bill, so the box opens on the truth. */
  current: number;
  /** How many bills this covers. One figure, shared out by the server. */
  across?: number;
  /**
   * The rate frozen on the bill, so a shilling figure can be shown as it will
   * land. Null means the bill has none and the figure has to be given in its
   * own currency.
   */
  rate?: number | null;
  /**
   * Called once the change has actually saved.
   *
   * A screen holding the bill in SERVER props gets the new figures for free —
   * these actions revalidate the pages that render them. A screen holding it
   * in CLIENT state does not: the dialog closes, the bill has moved, and every
   * figure around it is still the old one. The Record Payment dialog is that
   * second kind, and its money box follows the outstanding balance — so a
   * discount agreed inside it would be followed by a payment for the
   * pre-discount amount.
   */
  onSaved?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  /*
    SHILLINGS FIRST, BECAUSE THAT IS WHAT IS AGREED.

    The bill is written in dollars but the discount is settled at the counter
    in shillings — "punguza elfu tano" — and this box only ever accepted
    dollars, so the desk divided by 2,700 in its head and typed the result. It
    now takes either, opening on shillings, and the conversion is the server's
    at the rate frozen on the bill.
  */
  const local = "TSh";
  const canLocal = typeof rate === "number" && rate > 0 && currency !== "TZS";
  const [mode, setMode] = useState<"local" | "invoice">(
    canLocal ? "local" : "invoice"
  );

  /*
    THE SEED HAS TO BE IN THE UNITS OF THE BOX IT LANDS IN.

    `current` is the discount already on the bill, in the BILL's currency. The
    box opens armed in shillings, and this seeded the dollar figure into it: a
    USD 20 discount became the number 20 in a shilling box. A desk that read it
    as "the discount that is already there" and pressed Apply sent 20 shillings
    — the server converted at the frozen rate, wrote a discount of USD 0.01,
    and the bill went UP by nineteen dollars and ninety-nine cents. Nobody
    typed a figure and no money was refused; the customer was simply re-billed.

    Restated on the toggle too, for the same reason in the other direction.
  */
  const seedFor = (m: "local" | "invoice") =>
    current > 0
      ? m === "local" && canLocal
        ? String(Math.round(current * (rate as number)))
        : String(current)
      : "";
  const [typed, setTyped] = useState(() =>
    seedFor(canLocal ? "local" : "invoice")
  );

  /* What will actually come off, shown before it is agreed rather than
     discovered on the bill afterwards. A shilling figure rarely divides into
     whole cents, so the two lines can differ by a few shillings and the desk
     should see that here. */
  const amount = Number(typed);
  const usingLocal = mode === "local" && canLocal;
  const offInvoice =
    !Number.isFinite(amount) || amount <= 0
      ? 0
      : usingLocal
        ? Math.round((amount / (rate as number)) * 100) / 100
        : amount;
  const offLocal = canLocal ? Math.round(offInvoice * (rate as number)) : null;
  const [state, action] = useActionState<
    ActionResult<{ total: number }>,
    FormData
  >(applyInvoiceDiscount, { ok: true });

  /* Closes itself once the bill has moved — the panel around it re-renders
     with the new figure, and leaving the form open invites a second one. */
  useEffect(() => {
    if (state.ok && state.data) {
      setOpen(false);
      onSaved?.();
    }
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <Tag className="h-3.5 w-3.5" />
        {current > 0 ? t("Change the discount") : t("Give a discount")}
      </button>
    );
  }

  /*
    PORTALLED, BECAUSE A FORM MAY NOT LIVE INSIDE A FORM.

    The trigger sits in the payment panel, which is itself a form, and a nested
    <form> is invalid HTML — the browser drops the inner one and its fields
    silently join the outer submit. Pressing Apply would have tried to record a
    payment. So the button stays where it is and the form is rendered to the
    body, over the page, where it belongs to nobody.
  */
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
          <Tag className="h-4 w-4 text-brand" />
          {current > 0 ? t("Change the discount") : t("Give a discount")}
        </p>
        {/* Said before it is agreed, not discovered afterwards: one figure off
            the lot, shared out in proportion to what each bill is worth. */}
        {across > 1 ? (
          <p className="text-[11px] text-muted-foreground">
            {t("One figure off all")} {across} {t("bills, split between them by size.")}
          </p>
        ) : null}
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input
        type="hidden"
        name="discountIn"
        value={usingLocal ? "local" : "invoice"}
      />
      <div className="flex items-center gap-2">
        {canLocal ? (
          /* Two words, not a dropdown: there are exactly two answers and the
             desk should be able to see which one is armed. */
          <div className="flex shrink-0 overflow-hidden rounded-md border">
            {([
              ["local", local],
              ["invoice", currency],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  /* The same money, restated — never the same digits read as
                     a different currency. */
                  setTyped(seedFor(value));
                }}
                className={
                  "focus-ring px-2 py-1 text-[11px] font-semibold " +
                  (mode === value
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {currency}
          </span>
        )}
        <MoneyInput
          name="discount"
          key={mode}
          value={typed}
          onValueChange={setTyped}
          decimals={usingLocal ? 0 : 2}
          placeholder="0"
          className="h-8 text-xs"
          required
          autoFocus
        />
      </div>
      {offInvoice > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {t("Comes off the bill")}:{" "}
          <span className="font-semibold text-foreground">
            {currency} {offInvoice.toFixed(2)}
          </span>
          {offLocal !== null && offLocal > 0
            ? ` · ${local} ${offLocal.toLocaleString("en-US")}`
            : ""}
          {usingLocal
            ? ` — ${t("at the rate")} ${rate!.toLocaleString("en-US")}`
            : ""}
        </p>
      ) : null}
      {/* Offered, not demanded. The figure before, the figure after and the
          name of whoever gave it are all on the audit line already. */}
      <Input
        name="reason"
        placeholder={t("Note (optional) — agreed with the customer, damaged goods…")}
        className="h-8 text-xs"
      />
      <FormError state={state} />
      <div className="flex items-center gap-2">
        <SubmitButton variant="brand" size="sm" pendingLabel="Applying…">
          {t("Apply")}
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
