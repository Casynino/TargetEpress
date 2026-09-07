"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { MoneyInput } from "@/components/ui/money-input";
import { PaymentDateField } from "@/components/app/payment-date-field";
import { PaymentProofField } from "@/components/app/payment-proof-field";
import { ChangeRate } from "@/components/app/change-rate";
import { GiveDiscount } from "@/components/app/give-discount";
import { PaymentDifference } from "@/components/app/payment-difference";
import { TransportSplit } from "@/components/app/transport-split";
import {
  rejectPaymentSubmission,
  verifyPaymentSubmission,
} from "@/lib/actions/collections";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Finance's decision on one claim.
 *
 * Two buttons and a choice of account, because that is the whole job: is this
 * real, and where did it land. Verifying hands the figures to the same
 * recordPayment the counter uses, so a verified claim produces exactly the
 * receipt, ledger entry and pickup note a counter payment would have.
 *
 * Rejecting demands a reason, and specifically the PROBLEM rather than the next
 * step. Finance had been typing things like "will update through batch" — an
 * instruction about what would happen later, which stopped being true the day
 * Support could fix a refused claim and send it straight back from their own
 * list. What the desk needs is the fault: no such transaction, wrong figure,
 * money into an account that is not ours. That is what they ring the customer
 * about, and it is the sentence the next person reading the row is given.
 */
export function VerifySubmission({
  submissionId,
  accounts,
  currency = "TZS",
  transport = 0,
  cargo = 0,
  transportSourceId = null,
  transportSourceName = null,
  transportAccounts = [],
  shortfall = 0,
  billCurrency = "USD",
  billRate = null,
  clearShortfallClaimed = false,
  clearsOn = null,
  subject = null,
  today,
  bill = null,
}: {
  submissionId: string;
  /** Today, yyyy-mm-dd from the server, so the date picker and the action
      agree about what day it is. */
  today: string;
  /**
   * THE BILL'S OWN CONTROLS, THE ONES THE COUNTER HAS.
   *
   * Discounting and re-rating change the BILL rather than this payment, which
   * is why they are their own doors — but the moment Finance is deciding a
   * claim is exactly when they find the price is wrong, and sending them to
   * another screen to fix it is how a claim gets confirmed at a figure
   * everybody already knows is wrong.
   *
   * Null when there is nothing to offer: no bill, or a viewer who may not.
   */
  bill?: {
    invoiceId: string;
    total: number;
    discount: number;
    canDiscount: boolean;
    canChangeRate: boolean;
    canAdjust: boolean;
  } | null;
  accounts: { id: string; name: string; currency: string }[];
  /**
   * WHOSE MONEY, AGAINST WHAT — READ BACK BEFORE THE DECISION.
   *
   * Finance was agreeing to a figure with the customer's name and the bill it
   * answers only on the row behind the panel. The dialog puts the claim's own
   * header inside it, the way the correction dialog does, so the decision and
   * the facts it rests on are on one surface.
   */
  subject?: {
    submissionNumber: string;
    customerName: string;
    customerPhone: string | null;
    trackingNumber: string;
    invoiceNumber: string;
    batchNumbers: string[];
    amount: number;
    outstanding: number;
    submittedByName: string | null;
    submittedAtLabel: string;
  } | null;
  /** The currency the customer sent it in — what the split below is quoted in. */
  currency?: string;
  /** The delivery half of the claim, as Support wrote it down. */
  transport?: number;
  /** The rest of it: what actually settles the bill. */
  cargo?: number;
  /** Where Support expects the fare to be paid from. Finance may change it. */
  transportSourceId?: string | null;
  transportSourceName?: string | null;
  /** Cash and Lipa accounts only — a driver is not paid out of a bank. */
  transportAccounts?: { id: string; name: string; currency: string }[];
  /** What this claim leaves owing on the bill once it is recorded, in the
      bill's own money. Zero when it settles or overpays. */
  shortfall?: number;
  billCurrency?: string;
  /**
   * The rate frozen on the bill, so this panel can lead in shillings.
   *
   * Support presses a button reading "Clear the last TZS 500" and Finance was
   * shown "USD 0.19" for the same gap — two figures for one difference, and
   * the desk checking one against the other doing the division in its head.
   * Money leads in shillings everywhere else in this app; it leads here too.
   */
  billRate?: number | null;
  /** Support ticked "the rest is not coming" when they raised it. */
  clearShortfallClaimed?: boolean;
  /**
   * The bill the write-off lands on, when this claim covers several.
   *
   * "The rest is not coming" does not say WHICH bill's rest when one transfer
   * answers four — so the tick used to be withheld here and the desk sent to
   * the bill's own page to do by hand what the tick exists to do. Support's
   * screen already decides it (the largest of the ticked bills), and naming it
   * here is what lets Finance simply confirm.
   *
   * Null on a single-bill claim, where there is nothing to name.
   */
  clearsOn?: string | null;
}) {
  const [mode, setMode] = useState<"idle" | "verify" | "reject">("idle");
  /*
    Support's answer, and Finance's to change.

    It starts where Support left it because that desk took the call and heard
    what the customer said. Finance is the desk that signs for it, so the tick
    here is the one that travels — and it is stated either way rather than
    left absent, so an untick on this screen means NO rather than falling back
    to the claim's own yes.
  */
  const [clearRest, setClearRest] = useState(clearShortfallClaimed);

  /* Shillings first, the bill's own money beside it — the house style, and
     what makes this figure comparable with the one Support pressed. */
  const gapShown = (() => {
    const inBill = shortfall.toLocaleString(undefined, {
      maximumFractionDigits: billCurrency === "TZS" ? 0 : 2,
    });
    if (!billRate || billRate <= 0 || billCurrency === "TZS") {
      return `${billCurrency} ${inBill}`;
    }
    return `TSh ${Math.round(shortfall * billRate).toLocaleString()} · ${billCurrency} ${inBill}`;
  })();
  /* Finance and Support both work this panel, and the Guangzhou desk reads it
     in Chinese when a claim comes back to them. */
  const t = useT();
  /* The fare Finance states, seeded from what Support wrote down. Kept as a
     string like every other money box, so clearing it to retype is not a
     fight with a zero. */
  const [fare, setFare] = useState(transport > 0 ? String(transport) : "");
  const [source, setSource] = useState(transportSourceId ?? "");
  /*
    THE CARGO HALF, TYPEABLE.

    Support writes what the customer told them; Finance reads the slip. When
    the two differ, the desk deciding the claim is the desk that should be able
    to say so — the same box the counter has, in the same place.
  */
  const [typedCargo, setTypedCargo] = useState<string | null>(null);
  /* What the customer handed over: the two halves as the claim states them. */
  const claimed = cargo + transport;
  const fareNow = Math.max(0, Number(fare) || 0);
  const cargoNow =
    typedCargo === null ? Math.max(0, claimed - fareNow) : Math.max(0, Number(typedCargo) || 0);
  const tendered = cargoNow + fareNow;

  /*
    THE GAP, IN THE MONEY THAT ARRIVED AND IN THE BILL'S.

    `shortfall` is what the claim as Support raised it leaves owing. Once
    Finance moves the cargo half or the fare, the gap moves with it — so it is
    derived from what is on the screen rather than read off the claim, exactly
    as the counter derives it.
  */
  const owedInTender =
    billRate && billCurrency !== currency
      ? currency === "TZS"
        ? shortfall * billRate + cargoNow
        : shortfall / billRate + cargoNow
      : shortfall + cargoNow;
  const gapInTender = Math.round((owedInTender - cargoNow) * 100) / 100;
  const gapInBill =
    billRate && billCurrency !== currency
      ? currency === "TZS"
        ? gapInTender / billRate
        : gapInTender * billRate
      : gapInTender;
  /* Portalled, so it waits for the document. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [verifyState, verify] = useActionState<
    ActionResult<{ receiptNumber: string }>,
    FormData
  >(verifyPaymentSubmission, { ok: true });
  const [rejectState, reject] = useActionState<ActionResult, FormData>(
    rejectPaymentSubmission,
    { ok: true }
  );

  if (mode === "idle") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("verify")}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-success px-3.5 py-1.5 text-xs font-semibold text-success-foreground transition-colors hover:bg-success/90"
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          {t("Verify payment")}
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          {t("Send it back")}
        </button>
      </div>
    );
  }

  if (mode === "verify") {
    /*
      A DIALOG, NOT A PANEL WEDGED INTO THE ROW.

      The decision used to unfold inside the row itself, in the width left over
      beside the figures — which on the one screen where Finance agrees to
      money meant a cramped column, the claim's own details out of sight behind
      it, and everything the counter offers left off for want of room. The
      owner's words: the design here is bad, we should get a pop-up like the way
      when I edit.

      So it is the same dialog the correction opens, carrying what the counter
      carries: what came in, the split between the bill and the driver, where
      each half goes, the difference and whether to clear it, and the date.
    */
    const cargoNow = Math.max(0, claimed - (Number(fare) || 0));
    const body = (
      <form action={verify} className="space-y-3">
        <input type="hidden" name="submissionId" value={submissionId} />

        {subject ? (
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-medium">{subject.customerName}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {subject.submissionNumber}
              </span>
            </div>
            {subject.customerPhone ? (
              <p className="text-xs text-muted-foreground">{subject.customerPhone}</p>
            ) : null}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{subject.trackingNumber}</span>
              {subject.batchNumbers.length ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{subject.batchNumbers.join(" · ")}</span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <span className="font-mono">{subject.invoiceNumber}</span>
              <span aria-hidden>·</span>
              <span>
                {t("owed")} {billCurrency} {subject.outstanding.toLocaleString()}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("Submitted by")}{" "}
              <span className="text-brand">{subject.submittedByName ?? "—"}</span> ·{" "}
              {subject.submittedAtLabel}
            </p>
          </div>
        ) : null}

        {/*
          THE SAME FIELDS, IN THE SAME ORDER, AS THE COUNTER.

          The cargo charge and the money it came in; the fare the customer
          added and the till it goes out of; then the bill's own controls, the
          split in words, and the difference. A desk that has learned this
          panel on the cargo page has learned it here.
        */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor={`cargo-${submissionId}`} className="text-xs">
              {t("Cargo charge")}
            </Label>
            <MoneyInput
              id={`cargo-${submissionId}`}
              name="amount"
              decimals={currency === "TZS" ? 0 : 2}
              value={typedCargo ?? String(cargoNow)}
              /* Emptying it hands the figure back to the claim rather than
                 latching an empty string. */
              onValueChange={(raw) => setTypedCargo(raw === "" ? null : raw)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`currency-${submissionId}`} className="text-xs">
              {t("Paid in")}
            </Label>
            {/* Read back, not chosen: what the customer sent is the claim's
                own fact, and changing it restates the fare with it — that is
                the correction door's question, not this one's. */}
            <NativeSelect
              id={`currency-${submissionId}`}
              value={currency}
              disabled
              className="disabled:opacity-70"
            >
              <option value={currency}>{currency}</option>
            </NativeSelect>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`fare-${submissionId}`} className="text-xs">
              {t("Transport they added")}
            </Label>
            <MoneyInput
              id={`fare-${submissionId}`}
              name="transportAmount"
              decimals={currency === "TZS" ? 0 : 2}
              value={fare}
              onValueChange={(raw) => setFare(raw)}
              placeholder="0"
            />
          </div>
          {/* Always here, greyed until there is a fare to settle — a disabled
              field is not submitted, so nothing is asked for when there is
              nothing to pay. */}
          <div className="space-y-1.5">
            <Label htmlFor={`transport-source-${submissionId}`} className="text-xs">
              {t("Transport settled from")}
            </Label>
            <NativeSelect
              id={`transport-source-${submissionId}`}
              name="transportSourceId"
              required={fareNow > 0}
              disabled={!(fareNow > 0)}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className="disabled:opacity-50"
            >
              <option value="" disabled>
                {t("Cash or the Lipa number")}
              </option>
              {transportAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {/* Straight under the figure it changes, as on the cargo page. */}
        {bill?.canDiscount ? (
          <div className="text-xs">
            <GiveDiscount
              invoiceId={bill.invoiceId}
              currency={billCurrency}
              current={bill.discount}
              rate={billRate}
            />
          </div>
        ) : null}

        {bill?.canChangeRate ? (
          <div className="text-xs">
            <ChangeRate
              invoiceId={bill.invoiceId}
              currency={billCurrency}
              current={billRate}
              total={bill.total}
            />
          </div>
        ) : null}

        {/* The split in words, so the figure on the screen can be laid beside
            the figure on the customer's phone. */}
        <TransportSplit
          cargo={cargoNow}
          transport={fareNow}
          total={tendered}
          money={(v) => `${currency} ${v.toLocaleString()}`}
        />

        {/* Short of the bill, or over it — said plainly and answerable here,
            the same control the counter uses. */}
        {Math.abs(gapInTender) > 0.005 ? (
          <PaymentDifference
            gap={gapInTender}
            paid={cargoNow}
            tendered={currency}
            billCurrency={billCurrency}
            gapInBill={gapInBill}
            canClear={bill?.canAdjust ?? false}
            onArmedChange={setClearRest}
          />
        ) : null}

        {/* Support's own words about the difference, kept beside the control
            that answers it — and, when one transfer covers several bills, WHICH
            bill the write-off lands on. "The rest is not coming" does not say
            which bill's rest when a claim answers four. */}
        {Math.abs(gapInTender) > 0.005 && (clearShortfallClaimed || clearsOn) ? (
          <p className="text-[11px] text-muted-foreground">
            {clearShortfallClaimed
              ? `${t("Support was told the rest is not coming.")} `
              : ""}
            {clearsOn
              ? `${t("Taken off")} ${clearsOn} ${t("— the largest of the bills it covers.")}`
              : ""}
          </p>
        ) : null}

        {/* Stated either way, so an untick is a NO rather than a silence the
            action would read as Support's yes. */}
        {gapInTender > 0.005 ? (
          <>
            <input type="hidden" name="clearShortfall" value={clearRest ? "1" : "0"} />
            <input
              type="hidden"
              name="clearShortfallUpTo"
              value={Math.max(0, gapInBill).toFixed(2)}
            />
          </>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`account-${submissionId}`} className="text-xs">
            {t("Where it landed")}
          </Label>
          {/* Finance names the account, never Support — that desk does not know
              and must not guess. */}
          <NativeSelect id={`account-${submissionId}`} name="accountId" required>
            <option value="">{t("Not said yet")}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        {/* The customer's slip, if Finance is holding one Support did not
            attach. The same field the counter has. */}
        <PaymentProofField />

        {/* The day the money actually arrived, when it was not today. The same
            control the counter uses, so a claim agreed on Monday for a transfer
            that landed on Friday is dated Friday. */}
        <PaymentDateField id={`paid-${submissionId}`} today={today} />

        <FormError state={verifyState} />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton size="sm" variant="brand" pendingLabel="Recording…">
            {t("Confirm and record")}
          </SubmitButton>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="focus-ring rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {t("Leave it")}
          </button>
        </div>
      </form>
    );

    return mounted
      ? createPortal(
          /* Portalled to the body for the same reason the correction dialog is:
             the queue sits inside an overflow-x-auto ancestor, and that ancestor
             clips even a position:fixed child. */
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
            <div className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl border bg-card p-5 text-left shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display font-semibold">
                  {t("Confirm this payment")}
                </h2>
                <button
                  type="button"
                  onClick={() => setMode("idle")}
                  aria-label={t("Close")}
                  className="focus-ring rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {body}
            </div>
          </div>,
          document.body
        )
      : null;
  }

  return (
    <form action={reject} className="space-y-2 rounded-lg border bg-card p-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      <div className="space-y-1">
        <Label htmlFor={`reason-${submissionId}`} className="text-xs">
          What is wrong with it? <span className="text-muted-foreground">(optional)</span>
        </Label>
        {/* Offered rather than demanded. It is worth writing — Support reads
            it and it is the difference between "fix it" and "fix what" — but
            a desk clearing a queue of duplicates should not have to type the
            same sentence ten times to get through it. */}
        <Input
          id={`reason-${submissionId}`}
          name="reason"
          placeholder="e.g. no transaction with that code on the statement"
          className="h-9 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          The fault, not the next step — Support fixes it and sends it straight
          back from their own list, and this is what they tell the customer.
        </p>
      </div>
      <FormError state={rejectState} />
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" variant="outline" pendingLabel="Sending back…">
          {t("Send it back")}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setMode("idle")}
          className="focus-ring rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          aria-label={t("Cancel")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}
