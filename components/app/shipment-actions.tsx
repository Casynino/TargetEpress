"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { Role, ShipmentStatus } from "@prisma/client";
import {

  Ban,
  Download,
  FileText,
  MessageCircle,
  Printer,
  QrCode,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { CreditRequest } from "@/components/app/credit-request";
import {
  IdempotencyKey,
  useIdempotencyKey,
} from "@/components/app/idempotency-key";
import { PaymentProofField } from "@/components/app/payment-proof-field";
import { PaymentDateField } from "@/components/app/payment-date-field";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmInvoicePrice,
  generateInvoice,
  issuePickupNote,
  recordPayment,
} from "@/lib/actions/finance";
import { cancelShipment } from "@/lib/actions/shipments";
import type { ActionResult } from "@/lib/actions/types";
import { can, canAmendCargo } from "@/lib/rbac";

type Props = {
  shipmentId: string;
  status: ShipmentStatus;
  role: Role;
  hasInvoice: boolean;
  invoiceId: string | null;
  outstanding: number | null;
  /** Credit granted on this bill, so the cargo may go before the money does. */
  creditApproved?: boolean;
  /**
   * The credit door, when this viewer may open one.
   *
   * The owner, standing on this exact page as Finance and told the credit
   * panel lived on the bill: "where". Fair — the one page a clerk has open
   * when a customer asks for terms is the cargo itself, and the panel that
   * carries Record payment must carry the other way of releasing the cargo
   * too. Absent (undefined) when there is no bill, it is settled, credit is
   * already granted or pending, or the viewer cannot ask.
   */
  credit?: {
    invoiceId: string;
    outstanding: string;
    defaultTerm: number;
    limitLabel: string | null;
    canApprove: boolean;
  };
  currency: string;
  pickupNoteId: string | null;
  pickupNoteNumber: string | null;
  pickupNoteStatus: string | null;
  /** Invoice number, when one exists — links straight to the document. */
  invoiceNumber: string | null;
  /**
   * The rate frozen onto the invoice, for converting a payment tendered in
   * another currency. Null when none was published when it was raised.
   */
  invoiceRate: number | null;
  /** DRAFT while the system's price is waiting on Finance to sign it off. */
  invoiceStatus: string | null;
  /**
   * A pre-composed WhatsApp link with the bill in it, or null when the
   * customer has no number on file. Built on the server so the message says
   * the same thing here as it does on the invoice page.
   */
  customerWhatsapp: string | null;
  /**
   * The company's own accounts, so a payment can say where it landed.
   *
   * Empty is a valid state — the picker simply does not render, and the
   * payment records exactly as it always did.
   */
  accounts?: AccountChoice[];
};

/** One of the company's accounts, as the payment form needs to see it. */
export type AccountChoice = {
  id: string;
  name: string;
  kind: "BANK" | "MOBILE_MONEY" | "CASH";
  currency: string;
  accountNumber: string | null;
};

/**
 * Everything a signed-in user is allowed to do to this shipment right now.
 * Actions appear only when both the role and the shipment's state permit them,
 * so nobody is offered a button that will simply fail.
 */
export function ShipmentActions(props: Props) {
  const t = useT();
  const { role, status } = props;

  const canInvoice = can(role, "invoice.manage");
  const canPay = can(role, "payment.record") && props.hasInvoice;
  /*
    Two legitimate reasons to let cargo go, not one.

    This gate asked only whether the bill was settled, which made an approved
    credit unreachable from the interface: the server was taught to issue a note
    against granted credit and the button that calls it stayed disabled, saying
    "available once the invoice is settled in full" about a consignment the
    business had already agreed to release unpaid.
  */
  const releasable =
    (props.outstanding !== null && props.outstanding <= 0) ||
    props.creditApproved === true;
  const canIssueNote =
    can(role, "pickupNote.issue") && status === "RECEIVED_AT_DAR" && releasable;
  /**
   * The collections desk's way in.
   *
   * Customer Support holds payment.submit and not payment.record, so canPay is
   * false for them and this panel offered them nothing at all — the one screen
   * where a customer's cargo, bill and balance are all in front of them had no
   * way to act on a payment. They do not record money; they hand the customer's
   * proof to Finance, so the button goes there instead of opening a form that
   * would settle a bill.
   */
  const canCollect =
    !canPay &&
    can(role, "payment.submit") &&
    props.hasInvoice &&
    props.invoiceStatus !== "DRAFT" &&
    props.outstanding !== null &&
    props.outstanding > 0;

  /* Cancelling is now both warehouses', each over its own half of the journey,
     so holding the permission is no longer the whole question — canAmendCargo
     asks whose cargo this currently is. cancelShipment enforces the same pair.

     DELIVERED and CANCELLED stay out regardless: one is finished and the other
     already is this. */
  const canCancel =
    can(role, "shipment.cancel") &&
    canAmendCargo(role, status) &&
    status !== "DELIVERED" &&
    status !== "CANCELLED";

  const anything =
    canInvoice ||
    canPay ||
    canCollect ||
    canIssueNote ||
    canCancel ||
    /* On its own this is reason enough to show the panel: a desk with no
       permission to touch the money can still be the one who rings. */
    Boolean(props.customerWhatsapp);
  if (!anything) return null;

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      {/*
        THE ONE-TAP JOB SITS IN THE HEADING, NOT IN A BLOCK OF ITS OWN.

        Telling the customer their cargo is here is a single button with
        nothing to fill in, and it had a tinted panel, an icon, a heading and
        its own padding — a whole section's worth of space for one tap. Beside
        the word Actions it costs no height at all, and it is still the first
        thing on the panel, which is where it belongs.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("Actions")}</h2>
        {props.customerWhatsapp ? (
          <a
            href={props.customerWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-success px-2.5 py-1 text-xs font-semibold text-success-foreground transition-colors hover:bg-success/90"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {t("Notify on WhatsApp")}
          </a>
        ) : null}
      </div>
      <div className="divide-y">
        {/*
          THE ORDER THE OWNER PUT THEM IN, FOR EVERY DESK.

          Telling the customer is first: on a bill nobody has paid it is
          the only action anyone takes, and it was sitting third. Then
          taking the money, then the credit arrangement that is the
          alternative to taking it, then the bill, then the note that only
          exists once all of that is done.

          One panel serves all six roles — each block appears or does not
          by permission — so this order is what Finance, Support, both
          warehouses, the manager and the owner all see.
        */}
        {canPay ? <PaymentPanel {...props} /> : null}
        {canCollect ? (
          <div className="border-l-2 border-brand bg-brand/5 px-4 py-3.5">
            <p className="flex items-center gap-2 font-medium">
              <Wallet className="h-5 w-5 text-brand" />
              {t("Customer paid?")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                "Add their receipt. Finance verifies it before anything is settled."
              )}
            </p>
            <Link
              href={`/app/collections/record/${props.invoiceId}`}
              className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
            >
              {t("Record their payment")}
            </Link>
          </div>
        ) : null}
        {props.credit ? (
          /*
            The alternative to the button above it, and it reads that way.

            It had its own amber band and looked like a separate department's
            business. Releasing on credit is simply what you do INSTEAD of
            taking the money, so it sits directly under Confirm payment with
            no rule between them and no colour of its own — the same block,
            continued. !border-t-0 cancels the divider the panel draws between
            its children, which is the whole point here.
          */
          <div
            className={
              canPay
                ? /* Under Confirm payment: same block, continued. */
                  "!border-t-0 border-l-2 border-brand bg-brand/5 px-4 pb-3.5 pt-0"
                : /* On its own, for a desk that cannot take the money — it
                     needs the rule and the padding back or it floats. */
                  "border-l-2 border-brand bg-brand/5 px-4 py-3"
            }
          >
            <CreditRequest
              invoiceId={props.credit.invoiceId}
              outstanding={props.credit.outstanding}
              defaultTerm={props.credit.defaultTerm}
              limitLabel={props.credit.limitLabel}
              outstandingLabel={null}
              canApprove={props.credit.canApprove}
            />
          </div>
        ) : null}
        {canInvoice && props.invoiceStatus === "DRAFT" ? (
          <ConfirmPricePanel {...props} />
        ) : null}
        {/* Raising the first invoice, or opening the one that exists. There is
            no recalculate here: everything about an invoice is changed inside
            the invoice, and confirming a draft re-prices it anyway. Two ways to
            re-price from two screens is how they end up disagreeing. */}
        {canInvoice ? <InvoicePanel {...props} /> : null}
        {can(role, "pickupNote.view") ? <PickupNotePanel {...props} /> : null}
        {canCancel ? <CancelPanel shipmentId={props.shipmentId} /> : null}
      </div>
    </section>
  );
}

/**
 * The normal way to raise an invoice: one click, no typing.
 *
 * The price comes from the published rate book via the shipment's cargo
 * category, so nobody can mistype it and nobody has to look it up.
 */
/**
 * Finance signs the system's price off.
 *
 * The button says what actually happens — the price is re-worked out at this
 * moment, not merely approved — because an operator who thinks they are ticking
 * a box will not understand why the figure moved.
 */
function ConfirmPricePanel(props: Props) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ invoiceNumber: string; total: number }>,
    FormData
  >(confirmInvoicePrice, { ok: true });

  return (
    <div className="border-l-2 border-signal bg-signal/5 p-5">
      <form action={action} className="space-y-3">
        <input type="hidden" name="invoiceId" value={props.invoiceId ?? ""} />
        <p className="flex items-center gap-2 text-sm font-medium">
          <ReceiptText className="h-4 w-4 text-signal" />
          {t("Confirm the price")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            "Re-prices at today's rate and storage, then it can be sent and paid."
          )}
        </p>
        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data
              ? `${state.data.invoiceNumber} ${t("confirmed")} — ${props.currency} ${state.data.total.toFixed(2)}`
              : null
          }
        />
        <SubmitButton variant="signal" size="sm" pendingLabel="Confirming…">
          {t("Confirm price")}
        </SubmitButton>
      </form>
    </div>
  );
}

/**
 * The invoice for this cargo: raise the first one, or open the one there is.
 *
 * Nothing is re-priced from here. An invoice is edited inside the invoice,
 * where the whole document is in front of you, and confirming a draft
 * re-derives it anyway. Two buttons on two screens that both re-price is how
 * two figures end up disagreeing about the same cargo.
 */
function InvoicePanel(props: Props) {
  const t = useT();
  /* On our floor, or already gone from it. Anything earlier is still in
     China or in the air, and has no final weight to be priced on. */
  const arrived =
    props.status === "RECEIVED_AT_DAR" ||
    props.status === "READY_FOR_PICKUP" ||
    props.status === "DELIVERED";
  const [state, action] = useActionState<
    ActionResult<{ invoiceNumber: string; total: number }>,
    FormData
  >(generateInvoice, { ok: true });

  // Already has one: this is the door to it, and — once the price has been
  // signed off — the two things you do with a finished bill.
  if (props.invoiceNumber) {
    const confirmed = props.invoiceStatus !== "DRAFT";
    return (
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-brand" />
          {t("Invoice")} {props.invoiceNumber}
        </p>
        
        <div className="mt-2.5 flex flex-wrap gap-2">
          {/* Only on a confirmed price. A draft is the system's own working
              figure and must not leave the building. */}
          {confirmed ? (
            <>
              <Button asChild size="sm" variant="brand">
                <a href={`/app/finance/invoices/${props.invoiceNumber}/pdf`}>
                  <Download className="mr-2 h-4 w-4" />
                  {t("Download")}
                </a>
              </Button>
              {/* The message has its own panel above — one door, so nobody
                  wonders whether the two send the same thing. */}
            </>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/finance/invoices/${props.invoiceNumber}`}>
              {t("Open invoice")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // None yet. Cargo is normally priced automatically the moment it is checked
  // in at Dar, so reaching this means the rate book could not price it or the
  // cargo has not landed — either way, raising one by hand is the way out.
  return (
    <div className="px-4 py-3.5">
      {/*
        Nothing is priced before it lands.

        The figure comes from the weight and piece count the Dar floor
        confirms against the manifest, and the system raises the bill itself
        at that moment. Offering the button any earlier invites a bill on a
        packing list — which is exactly how a flight still in the air ended up
        with two hand-raised invoices, one of them paid. The action refuses
        this too; the panel simply stops asking for it.
      */}
      {!arrived ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t("Priced at check-in")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Priced automatically once Dar checks it off the manifest."
            )}
          </p>
        </div>
      ) : (
      <form action={action} className="space-y-3">
        <input type="hidden" name="shipmentId" value={props.shipmentId} />
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-signal" />
          {t("Generate invoice")}
        </p>
        
        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data
              ? `${state.data.invoiceNumber} — ${props.currency} ${state.data.total.toFixed(2)}`
              : null
          }
        />
        <SubmitButton variant="signal" size="sm" pendingLabel="Pricing…">
          {t("Generate invoice")}
        </SubmitButton>
      </form>
      )}
    </div>
  );
}

/**
 * Today, for the date input's `max`. A courtesy that stops the picker offering
 * next week — `paymentSchema` is what actually refuses a future date, because
 * the action is reachable without this form.
 */
const TODAY = new Date().toISOString().slice(0, 10);

function PaymentPanel(props: Props) {
  const t = useT();
  const settledOnLoad = props.outstanding !== null && props.outstanding <= 0;
  // Open unless there is nothing to take. A collapsed panel makes the main
  // job of this desk a thing you have to find first.
  const [open, setOpen] = useState(!settledOnLoad);
  // Shillings by default. Bills are quoted in dollars because that is what the
  // rate book is in, but almost every customer pays in shillings at the
  // counter — so the form opens on the currency the money is actually in, and
  // the dollar option is one click away for the ones who do not.
  const [currency, setCurrency] = useState(
    props.invoiceRate === null ? props.currency : "TZS"
  );
  const [rate, setRate] = useState(
    props.invoiceRate === null ? "" : String(props.invoiceRate)
  );
  // ...and the amount defaults to the balance expressed in that currency,
  // rounded to the shilling, because nobody hands over 405.27 TZS.
  const [amount, setAmount] = useState(() => {
    if (props.outstanding === null) return "";
    if (props.invoiceRate === null) return String(props.outstanding);
    return String(Math.round(props.outstanding * props.invoiceRate));
  });
  /* Follows the account. Mobile money until one is named, which is what it is
     at this counter nine times in ten. */
  const [accountId, setAccountId] = useState("");
  const [state, action] = useActionState<
    ActionResult<{ receiptNumber: string; pickupNoteNumber: string | null }>,
    FormData
  >(recordPayment, { ok: true });
  const idem = useIdempotencyKey();

  /* Part payments against one bill are normal at this counter, so the key is
     retired the moment one lands rather than held for the life of the page. */
  useEffect(() => {
    if (state.ok && state.data?.receiptNumber) idem.reset();
  }, [state]);

  const settled = props.outstanding !== null && props.outstanding <= 0;

  /*
    Only accounts that could really have received this money.

    One filter now, and it is physical: an account holds one currency, so
    shillings cannot land in the dollar account. It used to filter by method as
    well, which had it backwards — the clerk was asked HOW it was paid and then
    shown the accounts that answer matched. The account IS the answer: money in
    the tin is cash, money in a till is mobile money, money in a bank is a
    transfer. Asking both invites them to disagree, and a payment whose method
    and account contradict each other cannot be reconciled against a statement.
  */
  const eligibleAccounts = (props.accounts ?? []).filter(
    (account) => account.currency === currency
  );

  // Shown as the clerk types, so the figure that will land against the bill is
  // visible before it is committed. The server recomputes it from the invoice's
  // own frozen rate — this is a preview, never the stored value.
  const typed = Number(amount);
  const activeRate = Number(rate);
  const rateUsable = Number.isFinite(activeRate) && activeRate > 0;
  const converted =
    currency === props.currency
      ? null
      : !rateUsable
        ? `${t("Set an exchange rate to take a payment in")} ${currency}.`
        : Number.isFinite(typed) && typed > 0
          ? `${currency} ${typed.toLocaleString()} ${t("settles")} ${props.currency} ${(
              currency === "TZS" ? typed / activeRate : typed * activeRate
            ).toFixed(2)} ${t("at")} ${activeRate.toLocaleString()}.`
          : null;

  // Agreeing a different rate changes what the same shillings are worth, so a
  // figure that cleared the bill a moment ago may no longer. Say what would,
  // rather than leaving the clerk to work it out and leave 3 dollars behind —
  // an unsettled cent is a pickup note that never issues.
  const clearing =
    currency !== props.currency && rateUsable && props.outstanding !== null
      ? currency === "TZS"
        ? Math.round(props.outstanding * activeRate)
        : Number((props.outstanding / activeRate).toFixed(2))
      : null;
  const shortfall =
    clearing !== null &&
    Number.isFinite(typed) &&
    typed > 0 &&
    Math.abs(typed - clearing) > 0.5;

  // Switching currency re-expresses the outstanding balance, so the figure in
  // the box is always the whole balance in whatever is selected.
  const switchCurrency = (next: string) => {
    setCurrency(next);
    if (props.outstanding === null || !rateUsable) return;
    setAmount(
      next === "TZS"
        ? String(Math.round(props.outstanding * activeRate))
        : String(props.outstanding)
    );
  };

  return (
    <div
      className={
        settled ? "p-5" : "border-l-2 border-brand bg-brand/5 px-4 py-3.5"
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left font-medium"
        disabled={settled}
      >
        <Wallet
          className={settled ? "h-4 w-4 text-success" : "h-5 w-5 text-brand"}
        />
        <span className={settled ? "text-sm" : "text-base"}>
          {t(settled ? "Settled in full" : "Record payment")}
        </span>
        {!settled && props.outstanding !== null ? (
          <span className="ml-auto font-mono text-sm tabular-nums text-brand">
            {props.currency} {props.outstanding.toFixed(2)}
          </span>
        ) : null}
      </button>

      {open && !settled ? (
        <form action={action} className="mt-4 space-y-3">
          <IdempotencyKey value={idem.key} />
          <input type="hidden" name="invoiceId" value={props.invoiceId ?? ""} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-xs">
                {t("Amount")}
              </Label>
              {/* Cents matter. A bill of 39.15 part-paid with 39 leaves 0.15
                  outstanding, and a whole-number input made that last balance
                  impossible to clear — so the cargo could never be released. */}
              <MoneyInput
                id="amount"
                name="amount"
                value={amount}
                onValueChange={setAmount}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentCurrency" className="text-xs">
                {t("Paid in")}
              </Label>
              <NativeSelect
                id="paymentCurrency"
                name="currency"
                value={currency}
                onChange={(e) => switchCurrency(e.target.value)}
              >
                <option value={props.currency}>{props.currency}</option>
                {props.currency !== "TZS" ? <option value="TZS">TZS</option> : null}
                {props.currency !== "USD" ? <option value="USD">USD</option> : null}
              </NativeSelect>
            </div>
          </div>
          {currency !== props.currency ? (
            <div className="space-y-1.5">
              <Label htmlFor="paymentRate" className="text-xs">
                {t("Exchange rate")}{" "}
                <span className="text-muted-foreground">
                  ({props.currency} → TZS)
                </span>
              </Label>
              <MoneyInput
                id="paymentRate"
                name="exchangeRate"
                value={rate}
                onValueChange={setRate}
                placeholder={
                  props.invoiceRate === null
                    ? t("e.g. 2700")
                    : String(props.invoiceRate)
                }
                required
              />
              {/* Only where the box is empty and has to be filled. When the
                  invoice carries a rate it is already in the field, and saying
                  what it is a second time is the sentence, not the number. */}
              {props.invoiceRate === null ? (
                <p className="text-xs text-muted-foreground">
                  {t("No rate on this bill — use the one you agreed.")}
                </p>
              ) : null}
            </div>
          ) : null}
          {converted ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {converted}
              {shortfall ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setAmount(String(clearing))}
                    className="font-medium text-brand underline-offset-2 hover:underline"
                  >
                    {currency} {clearing!.toLocaleString()}{" "}
                    {t("clears the balance.")}
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
          {/* Where the money landed. Compulsory — the owner's rule: money is
              never recorded without saying where it went, and this counter is
              standing in front of the customer whose proof names it.
              recordPayment refuses a payment without one, so offering a blank
              here would only produce a refusal after the work was typed.
              The list is narrowed to accounts that could actually have received
              this money: a shilling account cannot hold dollars. */}
          {eligibleAccounts.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="accountId" className="text-xs">
                {t("Landed in")}
              </Label>
              <NativeSelect
                id="accountId"
                name="accountId"
                required
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="" disabled>
                  {t("Choose the account")}
                </option>
                {eligibleAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.accountNumber ? ` · ${account.accountNumber}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <PaymentProofField />
          {/*
              No Reference field.

              The owner took it out: the desk was typing an M-Pesa code beside
              the screenshot that already shows it, and the screenshot is the
              thing anybody actually opens in an argument. Two records of one
              fact, one of them retyped by hand at a counter with a customer
              waiting.

              The COLUMN stays and is still shown wherever an older payment has
              one — it is on receipts, it is searchable, and rewriting history
              is not on the table. Nothing new is asked for.
          */}
          <PaymentDateField today={TODAY} />
          {/*
              No Reference and no Note.

              The owner's rule, applied to every place a payment is recorded:
              the attachment is the record. A typed M-Pesa code duplicates the
              screenshot that already shows it, and a free-text note beside it
              is a third place for a fact nobody goes looking for. What matters
              — how much, into which account, and the proof — is on the form
              above.

              Both COLUMNS stay and older values still display wherever they
              were written. Nothing new is asked for.
            */}
          <FormError state={state} />
          <FormSuccess
            message={
              state.ok && state.data?.receiptNumber
                ? state.data.pickupNoteNumber
                  ? `${t("Receipt")} ${state.data.receiptNumber} ${t("issued, and pickup note")} ${state.data.pickupNoteNumber} — ${t("this cargo is now cleared for collection.")}`
                  : `${t("Receipt")} ${state.data.receiptNumber} ${t("issued.")}`
                : null
            }
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Paying in full releases the cargo."
            )}
          </p>
          <SubmitButton variant="brand" size="sm" pendingLabel="Confirming…">
            {t("Confirm payment")}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function PickupNotePanel(props: Props) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ noteNumber: string }>,
    FormData
  >(issuePickupNote, { ok: true });

  // An issued note is readable by anyone who may read notes at all — that is
  // the whole point of pickupNote.view. Support prints it at the counter.
  if (props.pickupNoteNumber && props.pickupNoteStatus !== "CANCELLED") {
    return (
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="h-4 w-4 text-success" />
          {t("Pickup note")} {props.pickupNoteNumber}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            props.pickupNoteStatus === "USED"
              ? "Used — cargo collected."
              : "Active — the customer can collect."
          )}
        </p>
        {props.pickupNoteId ? (
          /* Print is for the counter; the file is for the customer who is not
             standing at it. The invoice beside this block has offered both for
             months — the note, which is the document the customer actually
             brings back, offered only a print dialog. Same permission either
             way: the PDF route asks for pickupNote.view, exactly what put this
             panel on the screen. */
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/finance/pickup-notes/${props.pickupNoteId}`}>
                <Printer className="mr-2 h-4 w-4" />
                {t("Open & print")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`/app/finance/pickup-notes/${props.pickupNoteId}/pdf`}
                download
              >
                <Download className="mr-2 h-4 w-4" />
                {t("Download PDF")}
              </a>
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  // No note yet. Issuing one says the bill is settled and the cargo may go,
  // which is Finance's call — Support sees nothing here until it exists.
  if (!can(props.role, "pickupNote.issue")) {
    return (
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          {t("No pickup note yet")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            "Appears once the bill is settled."
          )}
        </p>
      </div>
    );
  }

  /* The same two reasons as the gate above. An approved credit is not an unpaid
     bill waiting to be settled — it is a bill the business chose to defer. */
  const onCredit = props.creditApproved === true;
  const blocked =
    props.status !== "RECEIVED_AT_DAR" ||
    (!onCredit && (props.outstanding === null || props.outstanding > 0));

  return (
    <div className="px-4 py-3.5">
      <form action={action} className="space-y-3">
        <input type="hidden" name="shipmentId" value={props.shipmentId} />
        <p className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="h-4 w-4 text-brand" />
          {t("Issue pickup note")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            blocked
              ? "Needs the cargo at Dar and the bill settled."
              : onCredit
                ? "Released on credit — the note will say the bill is still owed, with its due date."
                : "This clears the cargo for release and notifies the warehouse."
          )}
        </p>
        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data?.noteNumber
              ? `${t("Pickup note")} ${state.data.noteNumber} ${t("issued.")}`
              : null
          }
        />
        <SubmitButton
          variant="brand"
          size="sm"
          disabled={blocked}
          pendingLabel="Issuing…"
        >
          {t("Issue pickup note")}
        </SubmitButton>
      </form>
    </div>
  );
}

function CancelPanel({ shipmentId }: { shipmentId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(cancelShipment, {
    ok: true,
  });

  return (
    <div className="px-4 py-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-sm font-medium text-destructive"
      >
        <Ban className="h-4 w-4" />
        {t("Cancel cargo")}
      </button>

      {open ? (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs">
              {t("Reason")}
            </Label>
            <Textarea id="reason" name="reason" rows={2} required />
          </div>
          <FormError state={state} />
          <div className="flex gap-2">
            <SubmitButton variant="destructive" size="sm" pendingLabel="Cancelling…">
              {t("Confirm cancel")}
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {t("Keep it")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
