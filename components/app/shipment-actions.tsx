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
  /** What is already off this bill, so the discount box opens on the truth. */
  invoiceDiscount?: number;
  /** Whether this desk may change it — Finance, the manager and the owner. */
  canDiscount?: boolean;
  /** Storage on the bill, and whether this desk may forgive it. Support may:
      it is bounded by the clock, unlike a discount. */
  invoiceStorage?: number;
  /** Accrued but not on the bill — a different figure, a different press. */
  invoiceStorageUncharged?: number;
  /** Free days left when nothing has accrued, so the panel says why. */
  invoiceStorageFreeDays?: number | null;
  canWaiveStorage?: boolean;
  /** The bill's own total, so the rate dialog can show what it becomes. */
  invoiceTotal?: number;
  /** fx.manage — the same permission the invoice edit demands. */
  canChangeRate?: boolean;
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
        {canPay ? (
          <PaymentPanel
            {...props}
            beside={
              props.credit ? (
                <CreditRequest
                  invoiceId={props.credit.invoiceId}
                  outstanding={props.credit.outstanding}
                  defaultTerm={props.credit.defaultTerm}
                  limitLabel={props.credit.limitLabel}
                  outstandingLabel={null}
                  canApprove={props.credit.canApprove}
                />
              ) : null
            }
          />
        ) : null}
        {/*
          THE SAME PANEL, WHATEVER THE DESK CAN DO.

          Support does a different job here — they hand a claim to Finance
          rather than settling it — but the panel is the same panel, and it was
          drawn differently: a bigger icon, a bigger button in a different
          shape, and asking for credit stranded in a band of its own below.
          Two departments looking at one screen should see one design.
        */}
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
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="brand" className="px-2.5">
                <Link href={`/app/collections/record/${props.invoiceId}`}>
                  {t("Record their payment")}
                </Link>
              </Button>
              {/* Beside it, exactly as Release on credit sits beside Confirm
                  payment — the two ways this bill can be cleared. */}
              {props.credit ? (
                <CreditRequest
                  invoiceId={props.credit.invoiceId}
                  outstanding={props.credit.outstanding}
                  defaultTerm={props.credit.defaultTerm}
                  limitLabel={props.credit.limitLabel}
                  outstandingLabel={null}
                  canApprove={props.credit.canApprove}
                />
              ) : null}
            </div>
          </div>
        ) : null}
        {/*
          Only where there is no payment form to sit beside. A desk that can
          release cargo on credit but cannot take the money gets the button on
          its own; everyone else sees it next to Confirm payment, because the
          two are alternatives and a reader compares them side by side.
        */}
        {props.credit && !canPay && !canCollect ? (
          <div className="border-l-2 border-brand bg-brand/5 px-4 py-3">
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
        {/* The number is on the invoice itself, one press away, and on every
            row that names this bill. Repeating it as a heading told the reader
            something they were not looking for in the place they look for what
            they can DO. */}
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-brand" />
          {t("The bill (invoice)")}
        </p>
        
        <div className="mt-2.5 flex flex-wrap gap-2">
          {/* Only on a confirmed price. A draft is the system's own working
              figure and must not leave the building. */}
          {confirmed ? (
            <>
              {/* The same rule the pair above follows: the filled one carries
                  no icon, the outline one does, and both share the padding.
                  Two rows of buttons on one panel have to look like one
                  decision made twice, not two designs. */}
              <Button asChild size="sm" variant="brand" className="px-2.5">
                <a href={`/app/finance/invoices/${props.invoiceNumber}/pdf`}>
                  {t("Download")}
                </a>
              </Button>
              {/* The message has its own panel above — one door, so nobody
                  wonders whether the two send the same thing. */}
            </>
          ) : null}
          <Button asChild size="sm" variant="outline" className="gap-1.5 px-2.5">
            <Link href={`/app/finance/invoices/${props.invoiceNumber}`}>
              <FileText className="h-3.5 w-3.5" />
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

function PaymentPanel({
  beside,
  ...props
}: Props & {
  /**
   * Rendered on the same row as Confirm payment. Releasing on credit is the
   * alternative to taking the money, so the two belong side by side the way
   * Download and Open invoice do — and that means the credit control has to
   * live inside this form's button row rather than in a block beneath it.
   */
  beside?: React.ReactNode;
}) {
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
  /*
    THE TOTAL FOLLOWS THE BILL UNTIL SOMEBODY TYPES OVER IT.

    Null means "still following", exactly as the merge screen's typedTotal
    does. It matters because of what the transport box now does: while the
    total is following, a fare ADDS to it, because the customer hands over the
    bill AND the fare. Once a clerk has typed the figure off the customer's
    screenshot, that figure is the truth and nothing may move it under them.

    Before this, the box was seeded with the bill and the fare was carved OUT
    of it — so the ordinary case (leave the box alone, type the fare) left the
    bill short by exactly the fare, with no sentence anywhere on the screen.
  */
  const [typedTotal, setTypedTotal] = useState<string | null>(null);
  /* Follows the account. Mobile money until one is named, which is what it is
     at this counter nine times in ten. */
  const [accountId, setAccountId] = useState("");
  /* The delivery half of what was handed over, and the account it is settled
     out of — see the note beside the fields. */
  const [transport, setTransport] = useState("");
  const [transportSourceId, setTransportSourceId] = useState("");
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
  /* Cash and the Lipa number only — a bank account is not something anybody
     hands a driver from. */
  const transportAccounts = (props.accounts ?? []).filter(
    (a) => a.currency === currency && (a.kind === "CASH" || a.kind === "MOBILE_MONEY")
  );
  const eligibleAccounts = (props.accounts ?? []).filter(
    (account) => account.currency === currency
  );

  const activeRate = Number(rate);
  const rateUsable = Number.isFinite(activeRate) && activeRate > 0;

  /*
    WHAT THE BILL COMES TO IN THE MONEY BEING HANDED OVER.

    Derived on every render rather than seeded once, so a discount given, a
    rate agreed or storage waived on this same panel moves the figure instead
    of leaving a stale one the server will refuse.
  */
  const billInTender =
    props.outstanding === null
      ? null
      : currency === props.currency
        ? props.outstanding
        : !rateUsable
          ? null
          : currency === "TZS"
            ? Math.round(props.outstanding * activeRate)
            : Math.round((props.outstanding / activeRate) * 100) / 100;

  const fare = Math.max(0, Number(transport) || 0);

  /*
    THE FARE IS ADDED, NOT TAKEN OUT.

    The customer owes the bill and also hands over the delivery, so what they
    actually send is the two together — and that is the figure on the phone
    screenshot the clerk is holding. Rounded rather than concatenated: adding
    a fare to a dollar balance produces floats like 8.399999999999999, and the
    money box truncates instead of rounding, so a cent would go missing.
  */
  const followedTotal =
    billInTender === null
      ? ""
      : currency === "TZS"
        ? String(Math.round(billInTender + fare))
        : String(Math.round((billInTender + fare) * 100) / 100);

  /* Shown as the clerk types, so the figure that will land against the bill
     is visible before it is committed. The server recomputes it from the
     invoice's own frozen rate — this is a preview, never the stored value. */
  const amount = typedTotal ?? followedTotal;
  const typed = Number(amount);
  /* What actually reaches the bill. Every figure below measures from here —
     the whole point is that the two are no longer the same number. */
  const cargoHalf =
    Number.isFinite(typed) && typed > 0
      ? Math.round((typed - fare) * 100) / 100
      : 0;

  /*
    THE CARGO HALF IS WHAT SETTLES THE BILL, SO IT IS WHAT THIS CONVERTS.

    This sentence used to convert the WHOLE typed figure and call the answer
    what the payment settles. With a fare inside the transfer it overstated
    the bill's share by exactly the fare — the screen said "TZS 36,450 settles
    USD 13.50" while the server credited USD 9.80 — and it was the last line
    the clerk read before pressing Confirm.
  */
  const converted =
    currency === props.currency
      ? null
      : !rateUsable
        ? `${t("Set an exchange rate to take a payment in")} ${currency}.`
        : cargoHalf > 0
          ? `${currency} ${cargoHalf.toLocaleString()} ${t("settles")} ${props.currency} ${(
              currency === "TZS" ? cargoHalf / activeRate : cargoHalf * activeRate
            ).toFixed(2)} ${t("at")} ${activeRate.toLocaleString()}.`
          : null;

  /*
    IS THE BILL ACTUALLY BEING CLEARED?

    Asked of the cargo half against the balance, in whatever money is being
    handed over — and asked for a same-currency payment too, which it never
    was. It only existed for cross-currency payments before, so a shilling
    bill paid in shillings with a fare inside it produced no sentence at all
    while the bill was left short. That silence is the bug the owner reported.

    The tolerance is a cent, not half a unit: half a shilling is nothing but
    fifty cents on a dollar bill is a balance that never clears and a pickup
    note that never issues.
  */
  const clearing = billInTender;
  const tolerance = currency === "TZS" ? 0.5 : 0.005;
  const short =
    clearing !== null && cargoHalf > 0 && clearing - cargoHalf > tolerance;
  const overpaid =
    clearing !== null && cargoHalf > 0 && cargoHalf - clearing > tolerance;

  /*
    A FARE LARGER THAN THE CARGO IS USUALLY AN EXTRA NOUGHT.

    It is not impossible — a short haul on a small consignment really can cost
    more than the freight — so this is a question, not a refusal. But the
    server refuses it without an answer, because the fare's old ceiling ("it
    cannot be more than what came in") is an identity once the total is the
    bill plus the fare, and an unchecked mistyped fare empties the till.
  */
  const fareOverCargo =
    fare > 0 && typed > 0 && fare > cargoHalf + 0.001;
  const [fareConfirmed, setFareConfirmed] = useState(false);

  /*
    SWITCHING THE MONEY CLEARS THE FARE.

    The fare is typed in whatever was selected at the time, and this switch
    used to leave it alone — so a TZS 10,000 fare typed before the clerk
    learned the customer had sent dollars became a USD 10,000 fare, ten
    thousand dollars out of a till, and the old ceiling could not catch it
    because the total had grown to match. The bill's own figure re-expresses
    itself; a fare cannot be re-expressed without inventing a rate for money
    that never had one, so it is asked for again.
  */
  const switchCurrency = (next: string) => {
    setCurrency(next);
    setTypedTotal(null);
    setTransport("");
    setTransportSourceId("");
    setFareConfirmed(false);
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
                {t("Total received")}
              </Label>
              {/* Cents matter. A bill of 39.15 part-paid with 39 leaves 0.15
                  outstanding, and a whole-number input made that last balance
                  impossible to clear — so the cargo could never be released. */}
              {/* Typing here latches the figure: from that moment it is the
                  clerk's own reading of the customer's message and the fare
                  stops moving it. */}
              <MoneyInput
                id="amount"
                name="amount"
                value={amount}
                /* Emptying the box hands it BACK to the bill rather than
                   latching an empty string — otherwise clearing it to retype
                   left the panel following nothing, with a breakdown of
                   zeroes and a fare hanging off no total at all. */
                onValueChange={(raw) => setTypedTotal(raw === "" ? null : raw)}
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

          {/*
            THE DELIVERY, INSIDE THE SAME TRANSFER.

            Directly under the figure it comes out of, because that is the
            conversation: the customer sent one amount and this is how much of
            it was the delivery. Down beside the account it read as a separate
            decision about a separate payment, which is exactly what it is not.

            THE CUSTOMER MAY PAY INTO ANYTHING — bank included, because that is
            their choice and the money is recorded where it landed. Paying the
            driver is the company's own business and happens out of the till or
            off the Lipa number, so this list is those two and nothing else.
            The server refuses a bank here as well.
          */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              {/* "Of that" was the old carve-out speaking. The fare is money
                  the customer hands over ON TOP of the bill, and the label has
                  to say so or the total above reads as already including it. */}
              <Label htmlFor="transport" className="text-xs">
                {t("Transport they added")}
              </Label>
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
                decimals={currency === "TZS" ? 0 : 2}
                placeholder="0"
              />
            </div>
            {/*
              ALWAYS HERE, NOT REVEALED.

              It appeared only once a transport figure was typed, so a desk
              looking at the panel could see where the customer's money landed
              and no sign of where the driver's half comes from — and had no
              reason to think typing would produce one. Shown beside the
              amount and greyed until there is transport to settle: a disabled
              field is not submitted, so nothing is asked for when there is
              nothing to pay.
            */}
            <div className="space-y-1.5">
              <Label htmlFor="transportSourceId" className="text-xs">
                {t("Transport settled from")}
              </Label>
              <NativeSelect
                id="transportSourceId"
                name="transportSourceId"
                required={Number(transport) > 0}
                disabled={!(Number(transport) > 0)}
                value={transportSourceId}
                onChange={(event) => setTransportSourceId(event.target.value)}
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


          {/* Straight under the figure it changes. A discount moves what the
              customer owes, so it belongs beside the amount rather than down
              among the fields about where the money landed — and on its own
              line, so it does not depend on the customer paying in another
              currency for the conversion box to carry it. */}
          {props.canDiscount && props.invoiceId ? (
            <div className="text-xs">
              <GiveDiscount
                invoiceId={props.invoiceId}
                currency={props.currency}
                current={props.invoiceDiscount ?? 0}
                rate={props.invoiceRate}
              />
            </div>
          ) : null}
          {props.canWaiveStorage && props.invoiceId ? (
            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <AddStorage
                invoiceId={props.invoiceId}
                amount={props.invoiceStorageUncharged ?? 0}
                currency={props.currency}
                rate={props.invoiceRate}
              />
              <WaiveStorage
                invoiceId={props.invoiceId}
                storage={props.invoiceStorage ?? 0}
                freeDaysLeft={props.invoiceStorageFreeDays}
                currency={props.currency}
                rate={props.invoiceRate}
              />
            </div>
          ) : null}
          {/*
            THE RATE IS THE BILL'S, NOT THIS FORM'S.

            It was an editable box on every payment, for something the desk
            almost never changes — and a rate typed here belongs to this
            payment alone, while the same number on the invoice is what the
            customer was quoted. Changing it is an invoice decision, so it is
            made on the invoice, and the line below still says which rate this
            payment is settling at. recordPayment falls back to the invoice's
            own rate when the form sends none.

            The box comes back for the one bill that has no rate at all, where
            there is nothing to fall back to and the counter has to say what
            they agreed.
          */}
          {currency !== props.currency && props.invoiceRate === null ? (
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
                placeholder={t("e.g. 2700")}
                required
              />
              <p className="text-xs text-muted-foreground">
                {t("No rate on this bill — use the one you agreed.")}
              </p>
            </div>
          ) : null}
          {converted ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {converted}
              {props.canChangeRate && props.invoiceId ? (
                <>
                  {" "}
                  <ChangeRate
                    invoiceId={props.invoiceId}
                    currency={props.currency}
                    current={props.invoiceRate}
                    total={props.invoiceTotal ?? 0}
                  />
                </>
              ) : null}

            </p>
          ) : null}

          {/*
            THE SPLIT, IN WORDS, WHERE IT CANNOT BE MISSED.

            The customer's proof shows ONE figure. This is how that figure was
            separated, said in the same order the clerk types it, so the total
            on the screen can be laid beside the total on the phone. Without
            it the panel showed a bill's figure, a fare, and nothing joining
            them — and the arithmetic happened on the server where nobody
            could see it.
          */}
          {fare > 0 ? (
            <div className="rounded-lg border border-warning/40 bg-warning/[0.06] p-3 text-xs">
              <p className="font-semibold uppercase tracking-wide text-warning">
                {t("The customer paid cargo plus transport")}
              </p>
              <dl className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {t("Cargo charge")}
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {currency} {cargoHalf.toLocaleString()}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {t("Transport (passed on)")}
                  </dt>
                  <dd className="font-semibold tabular-nums text-warning">
                    {currency} {fare.toLocaleString()}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-warning/20 pt-1">
                  <dt className="font-medium">{t("Total received")}</dt>
                  <dd className="font-bold tabular-nums">
                    {currency} {typed.toLocaleString()}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 border-t border-warning/20 pt-2 text-[11px] text-muted-foreground">
                {t("Check this total against the customer's message.")}
              </p>
            </div>
          ) : null}

          {/*
            THE BILL IS NOT BEING CLEARED, AND SOMEBODY IS TOLD.

            A part payment is perfectly legitimate. A SILENT one is not — and
            with the fare carved out of the bill's own figure, this was the
            everyday case and no sentence appeared anywhere. The button puts
            the total where it clears the balance WITH the fare still on top,
            rather than back to the bare bill, which is what it used to do and
            was how the shortfall came back the moment it was dismissed.
          */}
          {short && clearing !== null ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {t("This leaves")} {props.currency}{" "}
              {(currency === props.currency
                ? clearing - cargoHalf
                : (clearing - cargoHalf) /
                  (currency === "TZS" ? activeRate : 1 / activeRate)
              ).toFixed(2)}{" "}
              {t("still owing on the bill.")}{" "}
              <button
                type="button"
                onClick={() =>
                  setTypedTotal(
                    currency === "TZS"
                      ? String(Math.round(clearing + fare))
                      : String(Math.round((clearing + fare) * 100) / 100)
                  )
                }
                className="font-semibold underline underline-offset-2"
              >
                {currency} {(clearing + fare).toLocaleString()}{" "}
                {t("clears it in full.")}
              </button>
            </p>
          ) : null}

          {/*
            A FARE BIGGER THAN THE CARGO — ALMOST ALWAYS AN EXTRA NOUGHT.

            The server refuses this without the tick, because the fare's old
            ceiling cannot fire any more: once the total is the bill plus the
            fare, "the fare is smaller than the total" is true no matter what
            was typed. A hundred thousand where ten was meant would settle the
            bill correctly and quietly empty the till.
          */}
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
          {/* The same shape as Release on credit sitting under it — h-8, small
              type, an icon — because the two are the alternatives to each
              other and a reader compares them. Filled rather than outlined, so
              which one is the money is still obvious. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* No icon, and a notch less padding: the two have to fit on one
                line in a 318px sidebar, and the icon was the twenty pixels
                that pushed them onto two. */}
            <SubmitButton variant="brand" size="sm" className="px-2.5" pendingLabel="Confirming…">
              {t("Confirm payment")}
            </SubmitButton>
            {beside}
          </div>
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
          className="px-2.5"
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
