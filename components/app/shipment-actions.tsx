"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PAYMENT_METHOD_LABELS, enumOptions } from "@/lib/constants";
import { can } from "@/lib/rbac";

type Props = {
  shipmentId: string;
  status: ShipmentStatus;
  role: Role;
  hasInvoice: boolean;
  invoiceId: string | null;
  outstanding: number | null;
  currency: string;
  pickupNoteId: string | null;
  pickupNoteNumber: string | null;
  pickupNoteStatus: string | null;
  defaultFreight: number;
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
};

/**
 * Everything a signed-in user is allowed to do to this shipment right now.
 * Actions appear only when both the role and the shipment's state permit them,
 * so nobody is offered a button that will simply fail.
 */
export function ShipmentActions(props: Props) {
  const { role, status } = props;

  const canInvoice = can(role, "invoice.manage");
  const canPay = can(role, "payment.record") && props.hasInvoice;
  const canIssueNote =
    can(role, "pickupNote.issue") &&
    status === "RECEIVED_AT_DAR" &&
    props.outstanding !== null &&
    props.outstanding <= 0;
  const canCancel =
    can(role, "shipment.cancel") &&
    status !== "DELIVERED" &&
    status !== "CANCELLED";

  const anything = canInvoice || canPay || canIssueNote || canCancel;
  if (!anything) return null;

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <h2 className="border-b px-5 py-3.5 text-sm font-semibold">Actions</h2>
      <div className="divide-y">
        {/* Money first. Everything else on this panel is preparation for it,
            and a clerk with a customer at the counter should not have to read
            past two other panels to find the one button they came for. */}
        {canPay ? <PaymentPanel {...props} /> : null}
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
          Confirm the price
        </p>
        <p className="text-xs text-muted-foreground">
          The system priced this from the rate book when the cargo was checked
          in. Confirming re-works it out now — picking up storage days accrued
          since, and today&apos;s exchange rate — and turns it into a real bill
          that can be sent and paid.
        </p>
        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data
              ? `${state.data.invoiceNumber} confirmed — ${props.currency} ${state.data.total.toFixed(2)}`
              : null
          }
        />
        <SubmitButton variant="signal" size="sm" pendingLabel="Confirming…">
          Confirm price
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
  const [state, action] = useActionState<
    ActionResult<{ invoiceNumber: string; total: number }>,
    FormData
  >(generateInvoice, { ok: true });

  // Already has one: this is the door to it, and — once the price has been
  // signed off — the two things you do with a finished bill.
  if (props.invoiceNumber) {
    const confirmed = props.invoiceStatus !== "DRAFT";
    return (
      <div className="p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-brand" />
          Invoice {props.invoiceNumber}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {confirmed
            ? "Confirmed. Send it to the customer, or open it to adjust anything before they pay."
            : "Open it to change the freight, add a charge, apply a discount or move the exchange rate. Confirm the price above before sending it."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Only on a confirmed price. A draft is the system's own working
              figure and must not leave the building. */}
          {confirmed ? (
            <>
              <Button asChild size="sm" variant="brand">
                <a href={`/app/finance/invoices/${props.invoiceNumber}/pdf`}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
              {props.customerWhatsapp ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={props.customerWhatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Share
                  </a>
                </Button>
              ) : null}
            </>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/finance/invoices/${props.invoiceNumber}`}>
              Open invoice
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
    <div className="p-5">
      <form action={action} className="space-y-3">
        <input type="hidden" name="shipmentId" value={props.shipmentId} />
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-signal" />
          Generate invoice
        </p>
        <p className="text-xs text-muted-foreground">
          Prices from the cargo category, weight and the published rates, and
          adds storage if the free days have run out.
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
          Generate invoice
        </SubmitButton>
      </form>
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
  const [state, action] = useActionState<
    ActionResult<{ receiptNumber: string; pickupNoteNumber: string | null }>,
    FormData
  >(recordPayment, { ok: true });

  const settled = props.outstanding !== null && props.outstanding <= 0;

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
        ? `Set an exchange rate to take a payment in ${currency}.`
        : Number.isFinite(typed) && typed > 0
          ? `${currency} ${typed.toLocaleString()} settles ${props.currency} ${(
              currency === "TZS" ? typed / activeRate : typed * activeRate
            ).toFixed(2)} at ${activeRate.toLocaleString()}.`
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
        settled ? "p-5" : "border-l-2 border-brand bg-brand/5 p-5"
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
          {settled ? "Settled in full" : "Record payment"}
        </span>
        {!settled && props.outstanding !== null ? (
          <span className="ml-auto font-mono text-sm tabular-nums text-brand">
            {props.currency} {props.outstanding.toFixed(2)}
          </span>
        ) : null}
      </button>

      {open && !settled ? (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="invoiceId" value={props.invoiceId ?? ""} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-xs">
                Amount
              </Label>
              {/* Cents matter. A bill of 39.15 part-paid with 39 leaves 0.15
                  outstanding, and a whole-number input made that last balance
                  impossible to clear — so the cargo could never be released. */}
              <Input
                id="amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentCurrency" className="text-xs">
                Paid in
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
                Exchange rate{" "}
                <span className="text-muted-foreground">
                  ({props.currency} → TZS)
                </span>
              </Label>
              <Input
                id="paymentRate"
                name="exchangeRate"
                type="number"
                min="100"
                step="1"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder={
                  props.invoiceRate === null
                    ? "e.g. 2700"
                    : String(props.invoiceRate)
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                {props.invoiceRate === null
                  ? "This invoice carries no rate, so the one you agreed at the counter is the one that counts."
                  : `The invoice was raised at ${props.invoiceRate.toLocaleString()}. Change it if you agreed a different rate — this payment is recorded at whatever you put here.`}
              </p>
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
                    {currency} {clearing!.toLocaleString()} clears the balance.
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="method" className="text-xs">
              Method
            </Label>
            <NativeSelect id="method" name="method" defaultValue="CASH">
              {enumOptions(PAYMENT_METHOD_LABELS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proof" className="text-xs">
              Proof of payment
            </Label>
            <Input
              id="proof"
              name="proof"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
            />
            <p className="text-xs text-muted-foreground">
              The M-Pesa screenshot, bank slip or transfer confirmation. This is
              what settles an argument months later — a typed number is only a
              claim that it happened.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference" className="text-xs">
              Reference{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="reference"
              name="reference"
              placeholder="M-Pesa ID, slip or cheque number"
            />
            <p className="text-xs text-muted-foreground">
              Worth typing as well as attaching: it is what you search for when
              matching this against a bank statement.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paidAt" className="text-xs">
              Payment date{" "}
              <span className="text-muted-foreground">(leave blank for today)</span>
            </Label>
            <Input id="paidAt" name="paidAt" type="date" max={TODAY} />
            <p className="text-xs text-muted-foreground">
              When the money moved, not when it was typed in. A Friday transfer
              entered on Monday belongs to Friday, and the payments report
              follows this date.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paymentNote" className="text-xs">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="paymentNote"
              name="note"
              rows={2}
              placeholder="Anything the next person reading this receipt should know."
            />
          </div>
          <FormError state={state} />
          <FormSuccess
            message={
              state.ok && state.data?.receiptNumber
                ? state.data.pickupNoteNumber
                  ? `Receipt ${state.data.receiptNumber} issued, and pickup note ${state.data.pickupNoteNumber} — this cargo is now cleared for collection.`
                  : `Receipt ${state.data.receiptNumber} issued.`
                : null
            }
          />
          <p className="text-xs text-muted-foreground">
            Settling the balance in full also issues the pickup note and clears
            the cargo for collection.
          </p>
          <SubmitButton variant="brand" size="sm" pendingLabel="Confirming…">
            Confirm payment
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function PickupNotePanel(props: Props) {
  const [state, action] = useActionState<
    ActionResult<{ noteNumber: string }>,
    FormData
  >(issuePickupNote, { ok: true });

  // An issued note is readable by anyone who may read notes at all — that is
  // the whole point of pickupNote.view. Support prints it at the counter.
  if (props.pickupNoteNumber && props.pickupNoteStatus !== "CANCELLED") {
    return (
      <div className="p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="h-4 w-4 text-success" />
          Pickup note {props.pickupNoteNumber}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {props.pickupNoteStatus === "USED"
            ? "Used — cargo collected."
            : "Active — the customer can collect."}
        </p>
        {props.pickupNoteId ? (
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={`/app/finance/pickup-notes/${props.pickupNoteId}`}>
              <Printer className="mr-2 h-4 w-4" />
              Open &amp; print
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }

  // No note yet. Issuing one says the bill is settled and the cargo may go,
  // which is Finance's call — Support sees nothing here until it exists.
  if (!can(props.role, "pickupNote.issue")) {
    return (
      <div className="p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          No pickup note yet
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Finance issues it once the invoice is settled in full. It will appear
          here, ready to print.
        </p>
      </div>
    );
  }

  const blocked =
    props.status !== "RECEIVED_AT_DAR" ||
    props.outstanding === null ||
    props.outstanding > 0;

  return (
    <div className="p-5">
      <form action={action} className="space-y-3">
        <input type="hidden" name="shipmentId" value={props.shipmentId} />
        <p className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="h-4 w-4 text-brand" />
          Issue pickup note
        </p>
        <p className="text-xs text-muted-foreground">
          {blocked
            ? "Available once the cargo is checked in at Dar and the invoice is settled in full."
            : "This clears the cargo for release and notifies the warehouse."}
        </p>
        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data?.noteNumber
              ? `Pickup note ${state.data.noteNumber} issued.`
              : null
          }
        />
        <SubmitButton
          variant="brand"
          size="sm"
          disabled={blocked}
          pendingLabel="Issuing…"
        >
          Issue pickup note
        </SubmitButton>
      </form>
    </div>
  );
}

function CancelPanel({ shipmentId }: { shipmentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(cancelShipment, {
    ok: true,
  });

  return (
    <div className="p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-sm font-medium text-destructive"
      >
        <Ban className="h-4 w-4" />
        Cancel shipment
      </button>

      {open ? (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs">
              Reason
            </Label>
            <Textarea id="reason" name="reason" rows={2} required />
          </div>
          <FormError state={state} />
          <div className="flex gap-2">
            <SubmitButton variant="destructive" size="sm" pendingLabel="Cancelling…">
              Confirm cancel
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Keep it
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
