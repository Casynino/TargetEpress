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
import { PaymentDifference } from "@/components/app/payment-difference";
import { GiveDiscount } from "@/components/app/give-discount";
import { TransportSplit } from "@/components/app/transport-split";
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
import { submitPaymentForVerification } from "@/lib/actions/collections";
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
  /** ledger.adjust — the desk that may close a difference money will not. */
  canAdjust?: boolean;
  /** Storage on the bill, and whether this desk may forgive it. Support may:
      it is bounded by the clock, unlike a discount. */
  invoiceStorage?: number;
  /** Accrued but not on the bill — a different figure, a different press. */
  invoiceStorageUncharged?: number;
  /** Free days left when nothing has accrued, so the panel says why. */
  invoiceStorageFreeDays?: number | null;
  canWaiveStorage?: boolean;
  /**
   * invoice.edit — what chargeStorageFee actually authorizes.
   *
   * Every screen gated Add storage on invoice.storage.waive, which is the
   * permission for FORGIVING the fee, not for charging it. It is harmless
   * today because every role holding one holds the other — which is exactly
   * why it would stay harmless right up until somebody split them, and then a
   * control would quietly vanish for a desk that may press it, or appear for
   * one the action refuses.
   */
  canChargeStorage?: boolean;
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
        {canPay || canCollect ? (
          <PaymentPanel
            {...props}
            /* Finance banks it; Support hands it to Finance. Same panel. */
            direct={canPay}
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
          NO SEPARATE CARD FOR SUPPORT ANY MORE.

          This used to be a "Customer paid?" panel whose button left for a page
          of its own — on the one screen where a customer's cargo, bill,
          balance, photos and history are already in front of the reader. Two
          desks doing the same job on the same consignment now do it in the
          same place, with the same fields in the same order; the only
          differences are the ones that are true, which the panel states for
          itself: where the money goes, and what the button says.
        */}
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
  direct,
  ...props
}: Props & {
  /**
   * TRUE FOR THE DESK THAT BANKS THE MONEY, FALSE FOR THE DESK THAT CLAIMS IT.
   *
   * Support does a different job on this screen — they hand the customer's
   * proof to Finance rather than settling anything — but it is the same job
   * shaped the same way: the same figures, the same fare, the same account,
   * the same slip. They were sent to a page of their own to do it, which is
   * the one screen where a customer's cargo, bill and balance are all in
   * front of them and they had to leave it.
   *
   * Only two things differ, and both are the truth about who is pressing:
   * which action the form posts to, and what the button says. The server
   * authorises each of those separately, so this flag decides what is offered
   * and never what is allowed.
   */
  direct: boolean;
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
  /*
    THE RATE IS THE BILL'S WHENEVER THE BILL HAS ONE.

    Only asked for on a bill that carries none — the box below renders on
    exactly that condition — so this state is a mirror of the prop the rest of
    the time. Seeded once, it went stale the moment somebody agreed a new rate
    from this same panel: the page revalidated, the prop changed, and the
    figure the panel was deriving the total from did not. Derived instead, so
    there is only ever one rate on the screen.
  */
  const [typedRate, setTypedRate] = useState("");
  const rate = props.invoiceRate === null ? typedRate : String(props.invoiceRate);
  const setRate = setTypedRate;
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
  const [typedCargo, setTypedCargo] = useState<string | null>(null);
  /* Follows the account. Mobile money until one is named, which is what it is
     at this counter nine times in ten. */
  const [accountId, setAccountId] = useState("");
  /* The delivery half of what was handed over, and the account it is settled
     out of — see the note beside the fields. */
  const [transport, setTransport] = useState("");
  const [transportSourceId, setTransportSourceId] = useState("");
  const [state, action] = useActionState<
    ActionResult<{
      receiptNumber?: string;
      pickupNoteNumber?: string | null;
      submissionNumber?: string;
    }>,
    FormData
  >(
    (direct ? recordPayment : submitPaymentForVerification) as unknown as (
      state: ActionResult<{
        receiptNumber?: string;
        pickupNoteNumber?: string | null;
        submissionNumber?: string;
      }>,
      payload: FormData
    ) => Promise<
      ActionResult<{
        receiptNumber?: string;
        pickupNoteNumber?: string | null;
        submissionNumber?: string;
      }>
    >,
    { ok: true }
  );
  const idem = useIdempotencyKey();

  /*
    A CLAIM IS A SUCCESS TOO.

    This asked for a receipt number, which only recordPayment returns. Support
    submits through this same panel and gets a submission number back — so for
    her the confirmation never rendered and the idempotency key was never
    retired. She saw a form that looked exactly as it had before pressing, and
    the natural response to that is to press again, which is then refused as a
    repeat of a claim she was never told about.
  */
  const done = state.ok ? state.data : undefined;
  const saved = done?.receiptNumber ?? done?.submissionNumber ?? null;

  /* Part payments against one bill are normal at this counter, so the key is
     retired the moment one lands rather than held for the life of the page. */
  useEffect(() => {
    if (saved) idem.reset();
    // `saved` is derived from state, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    THE BOX IS THE CARGO MONEY. THE FARE IS ADDED TO IT.

    It used to hold the whole transfer, which was arithmetically right and read
    wrong: a box labelled "Total received" sitting beside a box labelled
    "Transport they added" says, to anybody who reads it as a sentence, that
    the fare goes on top of a figure that already contains it. The owner read
    it that way, and he was right to.

    So the two boxes are now the two halves of one addition, and the sum is
    read back underneath where it can be checked against the customer's
    message. Only the screen changed: the form still SUBMITS the whole
    transfer, because that is what reached the account and what the bank
    statement will say.
  */
  const followedCargo =
    billInTender === null
      ? ""
      : currency === "TZS"
        ? String(Math.round(billInTender))
        : String(Math.round(billInTender * 100) / 100);

  /* The cargo half is typed now, not worked out — so the figure the clerk sees
     is the figure the bill receives. */
  const cargoShown = typedCargo ?? followedCargo;
  const cargoHalf = Math.max(0, Number(cargoShown) || 0);

  /*
    The one figure on the customer's message, worked out for them.

    Rounded here rather than at the field, because a dollar cargo plus a dollar
    fare produces floats like 8.399999999999999 and the money box truncates
    instead of rounding — a cent would go missing between the screen and the
    database.
  */
  const totalShown =
    currency === "TZS"
      ? String(Math.round(cargoHalf + fare))
      : String(Math.round((cargoHalf + fare) * 100) / 100);
  const typed = Number(totalShown);

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
  /* The difference, in the money being handed over — which is the money the
     clerk is looking at. SIGNED: positive when the customer is short, negative
     when they sent too much, because PaymentDifference reads the sign to know
     which of the two it is looking at. */
  const gapInTender = clearing === null ? 0 : clearing - cargoHalf;
  /*
    NO "the fare is bigger than the total" CHECK ANY MORE.

    It asked whether the fare exceeded the whole transfer, and the whole
    transfer is now the cargo PLUS the fare — so it asked whether the fare
    exceeded itself plus a positive number, which nothing can. The box the
    clerk types cannot go below zero, so a fare that swallows everything is
    caught by fareOverCargo below, which compares it against the half that
    settles the bill and is the check that was always doing the work.
  */

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

  /*
    THE MISTAKE THIS CHANGE INVITES, CAUGHT BY ITS OWN SIGNATURE.

    This box held the whole transfer until today, and the whole transfer is the
    one figure printed on the customer's message — so the habit of typing it
    here is the correct habit, learned from the screen itself. Typed into a box
    that now means the cargo, it adds the fare a second time: a 4,444,625
    transfer with a 20,000 fare becomes 4,464,625, which is a real overpayment
    the server will take.

    It has an exact signature — the typed cargo is the bill plus the fare — so
    it is worth saying rather than leaving to be noticed in a reconciliation.
  */
  const looksLikeTheWholeTransfer =
    typedCargo !== null &&
    fare > 0 &&
    clearing !== null &&
    Math.abs(cargoHalf - (clearing + fare)) < (currency === "TZS" ? 1 : 0.01);
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
    setTypedCargo(null);
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
      {/*
        A SETTLED BILL IS STILL A BILL SOMEBODY CAN HAVE GOT WRONG.

        This toggle was disabled the moment the balance reached zero, and the
        whole body unmounted with it — so every bill control on the richest
        screen in the app disappeared the instant the money arrived. A rate
        quoted wrong, a discount that should have been given, storage charged
        on days the warehouse was shut: all of them are discovered AFTER the
        customer pays, and none of them could be corrected from here by anyone,
        including the owner.

        The money form stays shut on a settled bill — there is nothing to
        collect and a second box invites a second payment. What opens instead
        is the row of corrections underneath.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left font-medium"
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

      {/*
        THE CORRECTIONS, ON A BILL THAT IS ALREADY PAID.

        The same three controls the open form carries, and nothing else: no
        money box, no account, no submit. Each is still gated on the reader's
        own permission, and each acts on the bill rather than on a payment, so
        they are exactly as safe here as they are above.
      */}
      {open && settled ? (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "This bill is settled. These change the bill itself — use them to correct a price, a rate or a storage charge that was wrong."
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {props.canDiscount && props.invoiceId ? (
              <GiveDiscount
                invoiceId={props.invoiceId}
                currency={props.currency}
                current={props.invoiceDiscount ?? 0}
                rate={props.invoiceRate}
              />
            ) : null}
            {props.canChangeRate && props.invoiceId ? (
              <ChangeRate
                invoiceId={props.invoiceId}
                currency={props.currency}
                current={props.invoiceRate}
                total={props.invoiceTotal ?? 0}
              />
            ) : null}
            {props.canWaiveStorage && props.invoiceId ? (
              <WaiveStorage
                invoiceId={props.invoiceId}
                currency={props.currency}
                storage={props.invoiceStorage ?? 0}
                rate={props.invoiceRate}
                freeDaysLeft={props.invoiceStorageFreeDays}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {open && !settled ? (
        <form action={action} className="mt-4 space-y-3">
          <IdempotencyKey value={idem.key} />
          <input type="hidden" name="invoiceId" value={props.invoiceId ?? ""} />
          {/* WHAT ACTUALLY REACHED THE ACCOUNT. The clerk types the two halves;
              this is their sum, and it is what the bank statement will show. */}
          <input type="hidden" name="amount" value={totalShown} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="cargoShown" className="text-xs">
                {t("Cargo charge")}
              </Label>
              {/* Cents matter. A bill of 39.15 part-paid with 39 leaves 0.15
                  outstanding, and a whole-number input made that last balance
                  impossible to clear — so the cargo could never be released.
                  Shillings take none, because nobody hands over half of one. */}
              {/*
                DISPLAY ONLY — the submitted figure is the hidden field below.

                MoneyInput always emits its own hidden input under whatever
                name it is given, so a box that must not BE the submitted
                figure has to be named something else. Two fields called
                "amount" would let the browser send the cargo half as the whole
                transfer, and the bill would land short by exactly the fare.
              */}
              <MoneyInput
                id="cargoShown"
                name="cargoShown"
                decimals={currency === "TZS" ? 0 : 2}
                value={cargoShown}
                /* Emptying the box hands it BACK to the bill rather than
                   latching an empty string — otherwise clearing it to retype
                   left the panel following nothing. */
                onValueChange={(raw) => setTypedCargo(raw === "" ? null : raw)}
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
          {/*
            NO STANDALONE WRITE-OFF ON THIS PANEL EITHER.

            The owner's call, and the third time he asked for it. When the desk
            types less than the bill the notice below offers to clear the rest
            in the same step, and when they type more it says the bill is
            settled — between them they answer the whole question, in the place
            the desk is already looking, with the figure already worked out.

            A second control that writes the balance off on its own only fires
            correctly when NO money is arriving, which is not what anybody
            opened a payment panel to do. Offered here it greeted the desk with
            a warning telling them to use the box above instead.

            The capability is not deleted: adjustDifference still exists and
            still guards itself with ledger.adjust, and AdjustDifference is one
            line away from any screen that turns out to need it. Nothing here
            is lost except a button that was in the way.
          */}
          {props.canWaiveStorage || props.canChargeStorage ? (
            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {props.canChargeStorage && props.invoiceId ? (
                <AddStorage
                  invoiceId={props.invoiceId}
                  amount={props.invoiceStorageUncharged ?? 0}
                  currency={props.currency}
                  rate={props.invoiceRate}
                />
              ) : null}
              {props.canWaiveStorage && props.invoiceId ? (
              <WaiveStorage
                invoiceId={props.invoiceId}
                storage={props.invoiceStorage ?? 0}
                freeDaysLeft={props.invoiceStorageFreeDays}
                currency={props.currency}
                rate={props.invoiceRate}
              />
              ) : null}
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
            </p>
          ) : null}

          {/*
            A CONTROL OF ITS OWN, NOT A LINK INSIDE A SENTENCE.

            Change the rate lived inside the conversion sentence, which renders
            only when the payment crosses currencies AND a figure has been
            typed. So on a shilling payment against a shilling bill — or with
            the money box momentarily empty — the control simply was not there,
            for anybody, however plainly they held invoice.rate.

            The rate is a fact about the BILL, not about this payment: it
            decides what a shilling figure credits and what the customer was
            quoted. It belongs beside the other bill controls, visible whenever
            the desk may change it.
          */}
          {props.canChangeRate && props.invoiceId ? (
            <div className="text-xs">
              <ChangeRate
                invoiceId={props.invoiceId}
                currency={props.currency}
                current={props.invoiceRate}
                total={props.invoiceTotal ?? 0}
              />
            </div>
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
          <TransportSplit
            cargo={cargoHalf}
            transport={fare}
            total={typed}
            money={(v) => `${currency} ${v.toLocaleString()}`}
          />

          {/*
            THE BILL IS NOT BEING CLEARED, AND SOMEBODY IS TOLD.

            A part payment is perfectly legitimate. A SILENT one is not — and
            with the fare carved out of the bill's own figure, this was the
            everyday case and no sentence appeared anywhere. The button fills
            the cargo box with what the bill comes to; the fare stays where the
            clerk put it and the total underneath follows.
          */}
          {looksLikeTheWholeTransfer && clearing !== null ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {t("That looks like the whole transfer, transport included.")}{" "}
              {t("The cargo charge on its own is")} {currency}{" "}
              {clearing.toLocaleString()}.{" "}
              <button
                type="button"
                onClick={() =>
                  setTypedCargo(
                    currency === "TZS"
                      ? String(Math.round(clearing))
                      : String(Math.round(clearing * 100) / 100)
                  )
                }
                className="font-semibold underline underline-offset-2"
              >
                {t("Use that.")}
              </button>
            </p>
          ) : null}

          {/*
            LESS THAN THE BILL — SAID PLAINLY, AND ANSWERABLE HERE.

            See ClearShortfall. The link this replaced typed the bill's figure
            into the box, which cleared the bill by recording money that never
            arrived.
          */}
          {(short || overpaid) && clearing !== null ? (
            <PaymentDifference
              gap={gapInTender}
              paid={cargoHalf}
              tendered={currency}
              billCurrency={props.currency}
              gapInBill={
                currency === props.currency
                  ? gapInTender
                  : gapInTender / (currency === "TZS" ? activeRate : 1 / activeRate)
              }
              /*
                SUPPORT PRESSES THIS TOO — the same rule the other two money
                forms already follow. She is not exercising ledger.adjust: she
                is telling Finance "the rest is not coming", and the tick rides
                on her claim for Finance to confirm on the verify screen. Gated
                on ledger.adjust alone, this panel was the one door where that
                answer could not be given.
              */
              canClear={direct ? Boolean(props.canAdjust) : true}
              submitting={!direct}
            />
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
          ) : (
            /*
              NO ACCOUNT CAN HOLD THIS MONEY — SAID BEFORE THE FORM IS FILLED.

              The picker hides itself when no active account is denominated in
              the tendered currency, and accountId is REQUIRED by both schemas.
              So the desk filled in the amount, the transport, the proof and
              the date, pressed Confirm, and got "Say which account the money
              landed in" — pointing at a field that was never on the screen.
              A dead end reached only after all the work.

              Said up front instead, with the way out: switch the money, or
              open the account.
            */
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {t("No open account can hold")} {currency}.{" "}
              {t(
                "Switch the money above to one that has an account, or open an account for it first — a payment cannot be recorded without saying where it landed."
              )}
            </p>
          )}

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
              done?.receiptNumber
                ? done.pickupNoteNumber
                  ? `${t("Receipt")} ${done.receiptNumber} ${t("issued, and pickup note")} ${done.pickupNoteNumber} — ${t("this cargo is now cleared for collection.")}`
                  : `${t("Receipt")} ${done.receiptNumber} ${t("issued.")}`
                : done?.submissionNumber
                  ? `${t("Sent to Finance")} · ${done.submissionNumber} — ${t("they verify it and the money is recorded from there.")}`
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
            <SubmitButton
              variant="brand"
              size="sm"
              className="px-2.5"
              pendingLabel={direct ? "Confirming…" : "Sending…"}
            >
              {t(direct ? "Confirm payment" : "Submit to Finance")}
            </SubmitButton>
            {beside}
          </div>

          {/* Said plainly to the desk that is not settling anything, because
              the panel is otherwise identical to the one that does. */}
          {!direct ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("Nothing is settled until Finance verifies it. No money moves on this screen.")}
            </p>
          ) : null}
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
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
            {t(
              "The money comes back off the bill and the cargo stops being collectable. The payment stays visible in the records, marked cancelled."
            )}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs">
              {t("Note")}{" "}
              <span className="text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Textarea id="reason" name="reason" rows={2} />
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
