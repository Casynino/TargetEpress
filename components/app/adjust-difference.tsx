"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Scale, TriangleAlert } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { adjustDifference } from "@/lib/actions/invoice-adjustments";
import { isLargeAdjustment } from "@/lib/invoice-balance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * CLEARING WHAT IS NEVER GOING TO ARRIVE.
 *
 * A bill comes to 4,424,625 and the transfer says 4,424,000. The 625 is a
 * rounding at the other end, or a bank fee, or simply what the customer sent.
 * Somebody has to be able to close the bill without inventing 625 shillings.
 *
 * ONE BUTTON, AN AMOUNT, AN OPTIONAL NOTE, CONFIRM — the owner was explicit,
 * and the box opens with the whole difference already in it, so the ordinary
 * case is two clicks and no typing. There is no approval step, no pending
 * state and no maximum: Finance judges whether a difference should be cleared.
 *
 * A large one is FLAGGED, not blocked. The warning appears as the figure is
 * typed and the button stays live underneath it — the flag exists so that
 * management can find the decision afterwards, not so the system can argue
 * with the person making it.
 *
 * This is NOT a payment. Nothing reaches an account; it only closes the
 * customer's balance, and the payment row goes on saying what actually
 * arrived.
 */
export function AdjustDifference({
  invoiceId,
  currency,
  balance,
  total,
  money,
  rate,
  pendingCargo = 0,
  onSaved,
}: {
  invoiceId: string;
  currency: string;
  /** What is still owed — the figure the box opens on. */
  balance: number;
  /** The bill, for deciding whether a figure is large enough to flag. */
  total: number;
  /** How this screen writes money, so the dialog speaks its host's units. */
  money: (value: number) => string;
  /**
   * The rate frozen on the bill. With one, the desk can clear the difference
   * in shillings — which is the money they are actually looking at, and the
   * money the customer was short by. Without one the figure has to be given
   * in the bill's own currency.
   */
  rate?: number | null;
  /**
   * WHAT IS SITTING IN THE PAYMENT BOX BESIDE THIS, UNSAVED. In the bill's own
   * currency, and zero when the payment panel is shut.
   *
   * THE ACCIDENT THIS EXISTS TO STOP. A bill of 36,450 is answered by 36,000.
   * The desk types 36,000 into the payment box, sees 450 still owing, and
   * reaches for the control named "Adjust the difference" — which is exactly
   * what it sounds like. But this dialog is seeded from the SAVED balance, and
   * nothing has been saved: it offers to clear the whole 36,450. Confirming
   * settles the bill, releases the cargo, and the customer's 36,000 is never
   * recorded anywhere. The money simply leaves the books.
   *
   * Nothing about that is visible at the moment of pressing Confirm. The
   * figure looks large but a large adjustment is legal here, and the flag that
   * fires reads like a formality.
   *
   * So while a payment is pending this asks first, and names the control that
   * does the right thing. It does not refuse — writing a bill off when no
   * money is coming is a real job, and the desk may have typed into that box
   * and thought better of it.
   */
  pendingCargo?: number;
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
  /* Cleared every time the dialog closes, so the warning is answered afresh
     rather than once per page load. */
  const [warned, setWarned] = useState(false);
  /* Shillings first when the bill carries a rate: the panel around this
     dialog is working in shillings and the desk should not convert in their
     head to answer it. */
  const canLocal = typeof rate === "number" && rate > 0 && currency !== "TZS";
  const [inLocal, setInLocal] = useState(canLocal);
  const asLocal = (v: number) => Math.round(v * (rate ?? 1));
  const [amount, setAmount] = useState(
    canLocal ? String(asLocal(balance)) : String(balance)
  );
  const [state, action] = useActionState<
    ActionResult<{ amount: number; large: boolean }>,
    FormData
  >(adjustDifference, { ok: true });

  /* Closed once it lands. The page revalidates with the balance gone, and a
     form left open invites a second clearing of a difference that no longer
     exists. */
  useEffect(() => {
    if (state.ok && state.data) {
      setOpen(false);
      setWarned(false);
      onSaved?.();
    }
  }, [state]);

  /* Re-opens on the current difference. The balance moves when a payment is
     recorded, and the box must not remember a figure from before it did. */
  useEffect(() => {
    if (!open) setAmount(inLocal ? String(asLocal(balance)) : String(balance));
    // asLocal is derived from rate, which is a prop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, balance, inLocal, rate]);

  if (balance <= 0.005) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <Scale className="h-3.5 w-3.5" />
        {t("Write off the balance")}
      </button>
    );
  }

  /* The unsaved payment beside this, and what the bill would be short by if it
     were recorded — the figure the desk was actually reaching for. */
  const pending = Math.max(0, pendingCargo);
  /*
    NOT ROUNDED TO CENTS FIRST.

    A 40.50 bill answered by 108,850 shillings is short by 0.185185 dollars.
    Rounded to 0.19 and then multiplied by 2,700 that reads as TSh 513, while
    the button in the payment form beside it — which does the subtraction in
    shillings, where the customer is — says TSh 500. Two figures for one gap on
    one screen, and neither is the one the server would write.

    Converted once, at the end, by shownLocal.
  */
  const gapAfterPayment = Math.max(0, balance - pending);
  const asksFirst = pending > 0.005 && !warned;

  const shownLocal = (v: number) =>
    canLocal ? `TSh ${asLocal(v).toLocaleString()}` : money(v);

  if (asksFirst) {
    const warning = (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="w-full max-w-sm space-y-3 rounded-xl border bg-card p-4 shadow-lg">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            {t("There is a payment in the box that has not been recorded")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("The payment box beside this holds")}{" "}
            <span className="font-semibold text-foreground">
              {shownLocal(pending)}
            </span>
            . {t("Writing the bill off now would settle it and let the cargo go, and that money would never be recorded anywhere.")}
          </p>
          {gapAfterPayment > 0.005 ? (
            <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
              {t("If the customer sent it, record the payment first — the notice under the amount offers to clear the last")}{" "}
              <span className="font-semibold">{shownLocal(gapAfterPayment)}</span>{" "}
              {t("in the same step, which keeps their money on the books.")}
            </p>
          ) : (
            <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
              {t("That covers the bill in full. Record it instead — there is nothing left to write off.")}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="focus-ring rounded-md bg-brand px-3 py-2 text-xs font-semibold text-brand-foreground"
            >
              {t("Go back to the payment")}
            </button>
            <button
              type="button"
              onClick={() => setWarned(true)}
              className="focus-ring rounded-md px-2 py-2 text-xs font-medium text-destructive underline-offset-2 hover:underline"
            >
              {t("No money is coming — write off")} {shownLocal(balance)}
            </button>
          </div>
        </div>
      </div>
    );
    return typeof document === "undefined"
      ? null
      : createPortal(warning, document.body);
  }

  const typed = Math.max(0, Number(amount) || 0);
  /* Everything below judges the figure in the BILL's money, whichever money
     it was typed in — the flag, the ceiling and the server all speak that. */
  const inBillMoney = inLocal ? typed / (rate || 1) : typed;
  const large = inBillMoney > 0 && isLargeAdjustment(inBillMoney, total, currency);
  const over = inBillMoney > balance + 0.005;
  const unit = inLocal ? "TSh" : currency;

  /* Portalled: the trigger sits inside the payment form, and a form inside a
     form is invalid HTML — the browser drops the inner one and its fields join
     the outer submit, so Confirm would have recorded a payment. */
  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <form
        action={action}
        className="w-full max-w-sm space-y-3 rounded-xl border bg-card p-4 shadow-lg"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Scale className="h-4 w-4 text-brand" />
          {t("Adjust the difference")}
        </p>

        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input
          type="hidden"
          name="adjustIn"
          value={inLocal ? "local" : "invoice"}
        />

        {/* What is being closed, before it is closed — in both monies where
            the bill carries a rate, because the desk reads one and the bill is
            written in the other. */}
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("Still owing")}:{" "}
          <span className="font-semibold text-foreground">
            {canLocal ? `TSh ${asLocal(balance).toLocaleString()}` : money(balance)}
          </span>
          {canLocal ? ` · ${money(balance)}` : ""}
        </p>

        <div className="space-y-1">
          <label htmlFor="adjustAmount" className="text-xs font-medium">
            {t("Clear how much?")}
          </label>
          <div className="flex items-center gap-2">
            {canLocal ? (
              /* Two words rather than a dropdown: there are exactly two
                 answers and the desk should see which one is armed. */
              <div className="flex shrink-0 overflow-hidden rounded-md border">
                {([
                  [true, "TSh"],
                  [false, currency],
                ] as const).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setInLocal(value);
                      setAmount(value ? String(asLocal(balance)) : String(balance));
                    }}
                    className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                      inLocal === value
                        ? "bg-brand text-brand-foreground"
                        : "bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <MoneyInput
              id="adjustAmount"
              name="amount"
              decimals={inLocal || currency === "TZS" ? 0 : 2}
              value={amount}
              onValueChange={setAmount}
              required
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="adjustReason" className="text-xs font-medium">
            {t("Why? (optional)")}
          </label>
          <Input
            id="adjustReason"
            name="reason"
            placeholder={t("e.g. bank charge on the transfer")}
            className="h-9 text-sm"
          />
        </div>

        {/*
          FLAG, DO NOT BLOCK. The button below stays live: this says the figure
          is unusual so it can be found later, and says nothing about whether
          it is right — that is the judgement of the person reading it.
        */}
        {large && !over ? (
          <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-semibold">
                {t("Large adjustment")} — {unit} {typed.toLocaleString()}
              </span>{" "}
              {t("This will be flagged for management to review.")}
            </span>
          </p>
        ) : null}

        {over ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
            {t("That is more than the bill still owes.")}
          </p>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          {t(
            "This closes the balance. No money moves and the payment stays exactly as it was."
          )}
        </p>

        <FormError state={state} />

        <div className="flex items-center gap-2">
          <SubmitButton size="sm" variant="brand" disabled={over || typed <= 0} pendingLabel="Clearing…">
            {t("Confirm")}
          </SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("Cancel")}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1 rounded font-medium text-brand underline-offset-2 hover:underline"
      >
        <Scale className="h-3.5 w-3.5" />
        {t("Adjust the difference")}
      </button>
      {typeof document !== "undefined"
        ? createPortal(dialog, document.body)
        : null}
    </>
  );
}
