"use client";

import { useActionState, useState } from "react";
import { Lock, Pencil } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { adjustInvoice } from "@/lib/actions/finance";

/**
 * Editing a bill before it is paid.
 *
 * Freight is shown against the rate book; storage is editable, because the days
 * are derived but the decision to charge them is a person's. Both come from the published
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
  canCorrect = false,
  alreadyPaid = 0,
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
  /** May restate a bill money has already landed against — ledger.adjust. */
  canCorrect?: boolean;
  /** What the customer has handed over. The floor a correction cannot go under. */
  alreadyPaid?: number;
  canDiscount: boolean;
}) {
  const [state, action] = useActionState(adjustInvoice, undefined);
  const t = useT();
  const [open, setOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState(String(discount || ""));
  const [otherDraft, setOtherDraft] = useState(String(otherCharges || ""));
  /* Seeded with what is on the bill, so opening the editor and saving changes
     nothing — the field is a correction, not a re-entry. */
  const [storageDraft, setStorageDraft] = useState(String(storage || ""));
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

  const total =
    freight + num(storageDraft) + num(otherDraft) - num(discountDraft);
  /* Off the clock's figure by more than a cent: the reason field appears, and
     the server refuses without it. */
  const storageMoved = Math.abs(num(storageDraft) - storage) > 0.005;
  const rate = num(rateDraft);

  // Editing a bill that has already been paid, rather than one that has not.
  const correcting = locked && canCorrect;

  /*
    Paid, and not allowed to restate it: say so and stop.

    Whoever may adjust the ledger gets the form instead, with a reason field —
    a customer billed the wrong amount who then paid it is exactly the case
    Finance most needs to fix, and refusing outright only moves the correction
    into a conversation nobody writes down.
  */
  if (locked && !canCorrect) {
  return (
      <div className="no-print flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          {t(
            "Money has been received against this invoice, so correcting it needs someone who may adjust the ledger."
          )}
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
          <p className="font-semibold">{t("Adjust this invoice")}</p>
          <p className="text-sm text-muted-foreground">
            {t(
              "Freight, extra charges, discount, exchange rate and notes — before it is paid."
            )}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand">
          <Pencil className="h-4 w-4" />
          {open ? t("Close") : t("Edit")}
        </span>
      </button>

      {open ? (
        <form action={action} className="space-y-4 border-t p-4">
      {/* The reason, only when a paid bill is being restated. Required by the
          action too — a client that forgets it is refused rather than obeyed. */}
      {correcting ? (
        <div className="mb-4 rounded-lg border border-signal/30 bg-signal/5 p-3">
          <label
            htmlFor="correctionReason"
            className="text-xs font-medium text-signal"
          >
            {t("Why is this bill being corrected?")}
          </label>
          <Input
            id="correctionReason"
            name="correctionReason"
            required
            minLength={3}
            className="mt-1.5 h-8 text-sm"
            placeholder={t("What was wrong with it")}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("Already paid")}: {alreadyPaid.toFixed(2)}.{" "}
            {t("The corrected total cannot be less than that — refunding the difference is a payment out, not a change to the bill.")}
          </p>
        </div>
      ) : null}
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <FormError state={state} />
          {state?.ok ? (
            <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
              {t("Invoice updated. The customer’s copy shows the new total.")}
            </p>
          ) : null}

          {/*
            Storage, editable — the clock proposes and a person decides.

            This was printed read-only with "storage is not typed", which is true
            of how the figure is DERIVED and wrong about who owns it. The days
            come from the arrival date, but whether the customer is charged for
            them is a judgement somebody at the desk makes with the customer in
            front of them: our own delay, a goodwill call, a regular who always
            pays. Sending them to another screen to make it, or refusing it here
            at all, is how a figure gets argued about instead of decided.

            Moving it off the clock demands a reason — enforced by adjustInvoice,
            not just asked for here — and setting it to nothing is recorded as a
            waiver with a name against it rather than a number quietly going
            missing.
          */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="storageCharge">
                {t("Storage")} ({currency})
              </Label>
              <div className="flex items-center gap-2">
                <MoneyInput
                  id="storageCharge"
                  name="storageCharge"
                  value={storageDraft}
                  onValueChange={setStorageDraft}
                  placeholder={storage.toFixed(2)}
                />
                {num(storageDraft) > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStorageDraft("0")}
                    className="focus-ring shrink-0 rounded-md border border-warning/40 px-2.5 py-2 text-xs font-medium text-warning transition-colors hover:bg-warning/10"
                  >
                    {t("Waive it")}
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("The clock says")} {currency} {storage.toFixed(2)} —{" "}
                {t(
                  "the days since it landed, past the free window. Change it or waive it and say why; both are recorded against your name."
                )}
              </p>
            </div>

            {storageMoved ? (
              <div className="space-y-1.5">
                <Label htmlFor="storageReason">
                  {num(storageDraft) === 0
                    ? t("Why is the storage being waived?")
                    : t("Why is the storage changing?")}
                </Label>
                <Input
                  id="storageReason"
                  name="storageReason"
                  required
                  placeholder={t("Our delay, goodwill, agreed with the customer…")}
                />
              </div>
            ) : null}

            <div className="space-y-1.5 border-t pt-3">
              <Label htmlFor="freightOverride">
                {t("Air freight")} ({currency})
              </Label>
              <MoneyInput
                id="freightOverride"
                name="freightOverride"
                value={freightDraft}
                onValueChange={setFreightDraft}
                placeholder={freight.toFixed(2)}
                disabled={(locked && !canCorrect) || !canDiscount}
              />
              <p className="text-xs text-muted-foreground">
                {t("The rate book says")} {currency} {freight.toFixed(2)}.{" "}
                {t(
                  "Leave blank to use it. Anything else is recorded as a variance against the price list, with your reason."
                )}
              </p>
            </div>

            {freightDraft.trim() !== "" &&
            Number(freightDraft) !== freight ? (
              <div className="space-y-1.5">
                <Label htmlFor="freightOverrideReason">
                  {t("Why is it different?")}
                </Label>
                <Input
                  id="freightOverrideReason"
                  name="freightOverrideReason"
                  placeholder={t("e.g. re-weighed on the floor scale at 8.9 kg")}
                  required
                  disabled={locked && !canCorrect}
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="otherCharges">
                {t("Additional charge")} ({currency})
              </Label>
              <MoneyInput
                id="otherCharges"
                name="otherCharges"
                value={otherDraft}
                onValueChange={setOtherDraft}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                {t("Repacking, special handling, delivery.")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="discount">
                {t("Discount")} ({currency})
              </Label>
              <MoneyInput
                id="discount"
                name="discount"
                value={discountDraft}
                onValueChange={setDiscountDraft}
                placeholder="0.00"
                disabled={!canDiscount}
              />
              <p className="text-xs text-muted-foreground">
                {canDiscount
                  ? t("Recorded against your name in the audit log.")
                  : t("You are not authorised to give discounts.")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exchangeRate">
                {t("Exchange rate")} ({localCurrency} {t("per")} {currency})
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
                {t("Overrides the published rate for this invoice only.")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoice-notes">{t("Note on the invoice")}</Label>
              <Textarea
                id="invoice-notes"
                name="notes"
                rows={3}
                defaultValue={notes ?? ""}
                placeholder={t("Shown to the customer on the printed invoice.")}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("New total")}</p>
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
                {t("The discount is larger than the rest of the invoice.")}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <SubmitButton pendingLabel={t("Saving…")} disabled={total < 0}>
              {t("Save changes")}
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
