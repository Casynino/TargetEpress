"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CloudUpload, FileText, Paperclip, X } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import {
  IdempotencyKey,
  useIdempotencyKey,
} from "@/components/app/idempotency-key";
import { ChangeRate } from "@/components/app/change-rate";
import { AddStorage } from "@/components/app/add-storage";
import { GiveDiscount } from "@/components/app/give-discount";
import { WaiveStorage } from "@/components/app/waive-storage";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { submitPaymentForVerification } from "@/lib/actions/collections";
import { recordPayment } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Handing a customer's payment up to Finance.
 *
 * Everything the system already knows is shown and not asked for: the customer,
 * the cargo, the bill, what is outstanding. The desk types the reference off
 * the customer's message and attaches what they sent. That is the whole form.
 *
 * The amount is pre-filled with the outstanding balance because that is what a
 * customer settling a bill almost always sends, and left editable because
 * part-payments happen. It is the one figure worth a second look, so it is the
 * one field that is not read-only.
 *
 * This desk never says money arrived — only that a customer says it did.
 */
export function RecordCollectionForm({
  invoiceId,
  invoiceNumber,
  customerName,
  trackingNumber,
  goods,
  outstanding,
  currency,
  rate,
  banks,
  canRecord,
  canDiscount,
  canChangeRate,
  invoiceDiscount,
  invoiceTotal,
  storage,
  storageUncharged,
  storageFreeDaysLeft,
  canWaiveStorage,
}: {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  trackingNumber: string;
  goods: string;
  /** In the invoice's currency. */
  outstanding: number;
  currency: string;
  rate: number | null;
  /**
   * Every account the money could have landed in.
   *
   * Passed to both desks now. It used to arrive only for Finance, and its
   * presence doubled as the signal for which action this form is — which
   * stopped working the moment Support also had to name an account. The
   * mode is its own flag below.
   */
  banks?: { id: string; name: string; currency: string; kind: string }[] | null;
  /**
   * Whether this reader may say the money ARRIVED.
   *
   * Finance was submitting claims to Finance: it filled this form, pressed
   * "Submit to Finance", then walked to the verify queue to approve its own
   * submission. The two-step exists so the desk that hears "I paid" is not the
   * desk that says "the money arrived" — and it stops making sense the moment
   * the person is the one who says that.
   */
  canRecord?: boolean;
  /** invoice.discount — Finance, the manager and the owner. */
  canDiscount?: boolean;
  /** invoice.rate — the per-bill rate, which Support holds too. */
  canChangeRate?: boolean;
  /** What is already off the bill, so the box opens on the truth. */
  invoiceDiscount?: number;
  /** The bill's own total, for the rate dialog's preview. */
  invoiceTotal?: number;
  /** Storage on the bill. Nothing to forgive when it is zero. */
  storage?: number;
  /** Accrued but not on the bill — a different figure, a different press. */
  storageUncharged?: number;
  /** Free days left when it is zero, so the screen can say why. */
  storageFreeDaysLeft?: number | null;
  /** invoice.storage.waive — Support holds this one, unlike the discount. */
  canWaiveStorage?: boolean;
}) {
  const t = useT();
  /* The authority decides which action this form is. Support files a claim;
     Finance records the money. Same fields either way — paymentSchema and the
     submission schema ask for the same things — so nothing about the form moves
     around under somebody who learned it. */
  const direct = Boolean(canRecord);
  /* The two actions return differently shaped payloads — a submission number or
     a receipt number — so the state is the union of both and the success line
     reads whichever arrived. Cast at the boundary rather than widening either
     action's own contract, which other callers depend on. */
  type Outcome = { submissionNumber?: string; receiptNumber?: string };
  const [state, action] = useActionState<ActionResult<Outcome>, FormData>(
    (direct ? recordPayment : submitPaymentForVerification) as unknown as (
      state: ActionResult<Outcome>,
      payload: FormData
    ) => Promise<ActionResult<Outcome>>,
    { ok: true }
  );
  const idem = useIdempotencyKey();

  /* A customer may pay the same bill twice in one sitting — half now, half
     later — and the second one is a real payment, not a repeat of the first. */
  useEffect(() => {
    if (state.ok && (state.data?.receiptNumber || state.data?.submissionNumber)) {
      idem.reset();
    }
  }, [state]);

  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * A customer paying a dollar bill sends shillings, so shillings are the
   * default and the figure is converted for them. Nobody at this desk should
   * be doing arithmetic while a customer is on the phone.
   */
  const [currencyChoice, setCurrencyChoice] = useState(rate ? "TZS" : currency);
  const suggested =
    currencyChoice === currency
      ? outstanding
      : currencyChoice === "TZS" && rate
        ? Math.round(outstanding * rate)
        : outstanding;
  /*
    NULL MEANS THE TOTAL IS STILL FOLLOWING THE BILL.

    While it is, a fare ADDS to it: the customer owes the bill and hands over
    the delivery on top, so what they send is the two together. This was a
    plain string seeded once, so the ordinary case — leave it, type the fare —
    carved the fare out of the bill's own figure and left the bill short by
    exactly the fare, with nothing on screen saying so. Seeding once also meant
    a discount or a rate agreed on this same form left a stale figure behind.
  */
  const [typedTotal, setTypedTotal] = useState<string | null>(null);

  /*
    Only accounts that could really have received THIS money.

    An account holds one currency, so shillings cannot land in the dollar
    account. A picker that offers impossible answers is a picker people stop
    reading — the same filter the cargo page's payment panel applies.
  */
  const eligible = (banks ?? []).filter((a) => a.currency === currencyChoice);
  const [accountId, setAccountId] = useState("");
  /* The delivery half of what was handed over, and the account it leaves from
     — see the note beside the fields. */
  const [transport, setTransport] = useState("");
  const [transportSourceId, setTransportSourceId] = useState("");
  /* The desk looked at a fare bigger than the cargo and said it was right. */
  const [fareConfirmed, setFareConfirmed] = useState(false);

  /* Derived every render, so a bill that moves underneath moves the total. */
  const fare = Math.max(0, Number(transport) || 0);
  const followedTotal =
    currencyChoice === "TZS"
      ? String(Math.round(suggested + fare))
      : String(Math.round((suggested + fare) * 100) / 100);
  const amount = typedTotal ?? followedTotal;
  const total = Number(amount);
  const cargoHalf =
    Number.isFinite(total) && total > 0
      ? Math.round((total - fare) * 100) / 100
      : 0;
  const tolerance = currencyChoice === "TZS" ? 0.5 : 0.005;
  const short = cargoHalf > 0 && suggested - cargoHalf > tolerance;
  const fareOverCargo = fare > 0 && total > 0 && fare > cargoHalf + 0.001;
  /*
    Derived, not corrected in an effect.

    Switching the currency can strand a selection on an account that no longer
    accepts it, and the honest fix is to read through to the first account that
    does — not to write state during a render, which loops.
  */
  const chosen = eligible.some((a) => a.id === accountId)
    ? accountId
    : (eligible[0]?.id ?? "");

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((current) => [...current, ...Array.from(incoming)]);
  };

  // The file input is the source of truth on submit, so the drop zone writes
  // into it rather than keeping a second list the form cannot see.
  const syncInput = (next: File[]) => {
    if (!inputRef.current) return;
    const bag = new DataTransfer();
    next.forEach((file) => bag.items.add(file));
    inputRef.current.files = bag.files;
  };

  return (
    <form
      action={action}
      className="space-y-5"
      onSubmit={() => syncInput(files)}
    >
      <IdempotencyKey value={idem.key} />
      <input type="hidden" name="invoiceId" value={invoiceId} />

      {/* Already known. Shown so the desk can check they are on the right
          record, never retyped. */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
        {[
          { label: "Customer", value: customerName },
          { label: "Cargo", value: `${trackingNumber} · ${goods}` },
          { label: "Bill", value: invoiceNumber },
          {
            label: "Outstanding",
            value: `${currency} ${outstanding.toFixed(2)}${
              rate ? ` · TSh ${Math.round(outstanding * rate).toLocaleString("en-US")}` : ""
            }`,
          },
        ].map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t(fact.label)}
            </dt>
            <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {/* The bill's own two controls, on the form that settles it — the same
          pair the cargo panel carries, so a desk sees one set of choices
          wherever it takes the money. */}
      {canDiscount || canChangeRate ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {canDiscount ? (
            <GiveDiscount
              invoiceId={invoiceId}
              currency={currency}
              current={invoiceDiscount ?? 0}
              rate={rate}
            />
          ) : null}
          {canWaiveStorage && (storageUncharged ?? 0) > 0.005 ? (
            <AddStorage
              invoiceId={invoiceId}
              amount={storageUncharged ?? 0}
              currency={currency}
              rate={rate}
            />
          ) : null}
          {canWaiveStorage ? (
            <WaiveStorage
              invoiceId={invoiceId}
              storage={storage ?? 0}
              freeDaysLeft={storageFreeDaysLeft}
              currency={currency}
              rate={rate}
            />
          ) : null}
          {canChangeRate ? (
            <ChangeRate
              invoiceId={invoiceId}
              currency={currency}
              current={rate}
              total={invoiceTotal ?? outstanding}
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="collectionAmount" className="text-xs">
            {t("Total received")}
          </Label>
          {/* Emptying it hands the figure back to the bill rather than
              latching an empty string. */}
          <MoneyInput
            id="collectionAmount"
            name="amount"
            value={amount}
            onValueChange={(raw) => setTypedTotal(raw === "" ? null : raw)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collectionCurrency" className="text-xs">
            {t("In")}
          </Label>
          <NativeSelect
            id="collectionCurrency"
            name="currency"
            value={currencyChoice}
            /* The bill re-expresses itself; a fare cannot be re-expressed
               without inventing a rate for money that never had one, so it is
               asked for again. Leaving it put a TZS 10,000 fare through as a
               USD 10,000 one. */
            onChange={(event) => {
              setCurrencyChoice(event.target.value);
              setTypedTotal(null);
              setTransport("");
              setTransportSourceId("");
              setFareConfirmed(false);
            }}
            className="h-11 w-[6.5rem]"
          >
            <option value="TZS">{t("TSh")}</option>
            <option value="USD">USD</option>
          </NativeSelect>
        </div>
        {/*
          WHERE the money went, not HOW it travelled.

          This asked both, which is the same question twice: the accounts are
          named — the CRDB Lipa number, the Mixx till, the cash tin — and naming
          one already says whether it was a bank transfer, mobile money or cash.
          Two pickers meant somebody could also answer them inconsistently, and
          then no report could say which half to believe.

          So the account is the choice and the method is derived from it. A desk
          that has just watched money land knows the place; it should not have to
          classify the mechanism as well.
        */}
        {/*
          Asked of both desks now, and required of both.

          This used to be Finance's question alone; Support got a hidden
          "mobile money" and no say in where it landed, on the reasoning that
          they could not know. The owner's rule replaces that: nothing is
          recorded without saying where the money is, and the proof the
          customer sent names the destination. Support's answer is a claim
          Finance checks and can correct on the way through — the same status
          as the figure beside it.
        */}
        <div className="space-y-1.5">
          <Label htmlFor="collectionAccount" className="text-xs">
            {direct ? t("Where it went") : t("Where did it land")}
          </Label>
          <NativeSelect
            id="collectionAccount"
            name="accountId"
            required
            value={chosen}
            onChange={(event) => setAccountId(event.target.value)}
            className="h-11"
          >
            <option value="" disabled>
              {t("Choose the account")}
            </option>
            {eligible.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </NativeSelect>
          {/* Derived, never asked. Cash tin → CASH, a till → mobile money,
              anything else → a transfer into the bank. */}
        </div>
      </div>

      {/*
        THE DELIVERY, INSIDE THE SAME TRANSFER.

        The figure above stays whole — it is what the customer sent and what
        the receipt says. This is the part of it that was never the company's:
        it comes off the cargo before the bill is settled, and goes back out of
        whichever account the driver is paid from. Its own account on purpose:
        they can pay by bank while the till hands over cash.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="transport">{t("Transport they added")}</Label>
          <MoneyInput
            id="transport"
            name="transport"
            value={transport}
            onValueChange={(raw) => {
                setTransport(raw);
                /* A tick confirms ONE figure. Left standing, a clerk who
                   confirmed 100,000 and then slipped another nought onto
                   it would send 1,000,000 through already confirmed. */
                setFareConfirmed(false);
              }}
            decimals={currencyChoice === "TZS" ? 0 : 2}
            placeholder="0"
          />
        </div>
        {/* Always here, greyed until there is transport to settle — a disabled
            field is not submitted. */}
        <div className="space-y-1.5">
            <Label htmlFor="transportSourceId">
              {t("Transport settled from")}
            </Label>
            <NativeSelect
              id="transportSourceId"
              name="transportSourceId"
              required={Number(transport) > 0}
              disabled={!(Number(transport) > 0)}
              value={transportSourceId}
              onChange={(event) => setTransportSourceId(event.target.value)}
              className="h-11 disabled:opacity-50"
            >
              <option value="" disabled>
                {t("Cash or the Lipa number")}
              </option>
              {/* The customer may pay into anything, bank included. Paying the
                  driver is the company's own business and happens out of the
                  till or off the Lipa number — the server refuses a bank
                  here too. */}
              {eligible
                .filter((a) => a.kind === "CASH" || a.kind === "MOBILE_MONEY")
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </NativeSelect>
        </div>
      </div>

      {/*
        No Reference field.

        This asked, firmly and with a badge, for the M-Pesa code — beside a
        drop zone for the screenshot that already shows it. The owner took it
        out: it is one fact recorded twice, and the retyped half is the one
        that gets a digit wrong at a counter with a customer waiting. The
        evidence below is what Finance opens.

        The column stays and older references still display; nothing new is
        asked for.
      */}

      {/* The evidence. A submission without it is refused by the action, so it
          is given the room that importance deserves rather than being a row of
          small print at the bottom. */}
      {/* The same words and the same amber every other proof field carries —
          this screen keeps its drop zone, which is the nicest way to take a
          screenshot, and gains the colour that says read this one. */}
      <div className="space-y-1.5 rounded-xl border border-warning/40 bg-warning/5 p-3.5">
        <Label className="flex items-center gap-1.5 text-sm font-semibold text-warning">
          <Paperclip className="h-4 w-4 shrink-0" />
          {t("Payment proof — the slip or the screenshot")}
        </Label>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = Array.from(event.dataTransfer.files);
            const next = [...files, ...dropped];
            setFiles(next);
            syncInput(next);
          }}
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? "border-brand bg-brand/10" : "border-warning/40 bg-card/40"
          }`}
        >
          <CloudUpload className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">
            {t("Drop the screenshot or slip here")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("or")}{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="focus-ring rounded font-medium text-brand hover:underline"
            >
              {t("choose a file")}
            </button>
          </p>
          {/* Why it is worth the extra ten seconds. The same sentence sits on
              every other place evidence is asked for — see AttachmentManager. */}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t(
              "Not compulsory, but it is what settles an argument months from now. Without it Finance is agreeing to this on somebody's word."
            )}
          </p>
          <input
            ref={inputRef}
            id="collectionProof"
            name="proof"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="sr-only"
            onChange={(event) => addFiles(event.target.files)}
          />
        </div>

        {files.length > 0 ? (
          <ul className="space-y-1.5 pt-1">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {file.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {Math.max(1, Math.round(file.size / 1024))} KB
                </span>
                <button
                  type="button"
                  aria-label={`${t("Remove")} ${file.name}`}
                  onClick={() => {
                    const next = files.filter((_, i) => i !== index);
                    setFiles(next);
                    syncInput(next);
                  }}
                  className="focus-ring rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <FormError state={state} />
      <FormSuccess
        message={
          state.ok && state.data
            ? state.data.receiptNumber
              ? `${t("Receipt")} ${state.data.receiptNumber} ${t("issued. The bill and the account are updated.")}`
              : state.data.submissionNumber
                ? `${state.data.submissionNumber} ${t("is with Finance. You will see it move once they check it.")}`
                : null
            : null
        }
      />

      {/* THE SPLIT, BEFORE THE BUTTON. The customer's message shows one
          figure; this says how it was separated, so the two can be compared
          without anybody doing arithmetic on the phone. */}
      {fare > 0 ? (
        <p className="rounded-md border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs leading-relaxed text-warning">
          <span className="font-semibold">
            {t("The customer paid cargo plus transport")}
          </span>{" "}
          — {currencyChoice} {cargoHalf.toLocaleString()} {t("to the bill")},{" "}
          {currencyChoice} {fare.toLocaleString()} {t("transport")}.{" "}
          {t("Total received")}: {currencyChoice} {total.toLocaleString()}.
        </p>
      ) : null}

      {short ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {t("This leaves")} {currencyChoice}{" "}
          {(suggested - cargoHalf).toLocaleString()}{" "}
          {t("still owing on the bill.")}{" "}
          <button
            type="button"
            onClick={() =>
              setTypedTotal(
                currencyChoice === "TZS"
                  ? String(Math.round(suggested + fare))
                  : String(Math.round((suggested + fare) * 100) / 100)
              )
            }
            className="font-semibold underline underline-offset-2"
          >
            {currencyChoice} {(suggested + fare).toLocaleString()}{" "}
            {t("clears it in full.")}
          </button>
        </p>
      ) : null}

      {fareOverCargo ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <input
            type="checkbox"
            name="transportConfirmed"
            value="1"
            checked={fareConfirmed}
            onChange={(event) => setFareConfirmed(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <span>
            <span className="font-semibold">
              {t("The transport is more than the cargo.")}
            </span>{" "}
            {t("Check the figure. Tick this if it is right.")}
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton variant="brand" pendingLabel={direct ? "Recording…" : "Sending…"}>
          {direct ? t("Record the payment") : t("Submit to Finance")}
        </SubmitButton>
        <p className="text-xs text-muted-foreground">
          {direct
            ? t(
                "This banks the money against the bill and prints a receipt. No second approval — you are the one who says it arrived."
              )
            : t(
                "Nothing is settled until Finance verifies it. No money moves on this screen."
              )}
        </p>
      </div>
    </form>
  );
}
