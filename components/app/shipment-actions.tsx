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
} from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { CreditRequest } from "@/components/app/credit-request";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmInvoicePrice,
  generateInvoice,
  issuePickupNote,
} from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";
import { can, canAmendCargo } from "@/lib/rbac";
import {
  PaymentPanel,
  type AccountChoice,
  type PaymentPanelProps as Props,
} from "@/components/app/payment-panel";

/* Re-exported from where it now lives, because pages import it from here. */
export type { AccountChoice };


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

  const anything =
    canInvoice ||
    canPay ||
    canCollect ||
    canIssueNote ||
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
