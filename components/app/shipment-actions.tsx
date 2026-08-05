"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Role, ShipmentStatus } from "@prisma/client";
import { Ban, FileText, Printer, QrCode, ReceiptText, Wallet } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
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
        {canInvoice ? <GenerateInvoicePanel {...props} /> : null}
        {canPay ? <PaymentPanel {...props} /> : null}
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
function GenerateInvoicePanel(props: Props) {
  const [state, action] = useActionState<
    ActionResult<{ invoiceNumber: string; total: number }>,
    FormData
  >(generateInvoice, { ok: true });

  const settled = props.outstanding !== null && props.outstanding <= 0;

  return (
    <div className="p-5">
      <form action={action} className="space-y-3">
        <input type="hidden" name="shipmentId" value={props.shipmentId} />
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-signal" />
          {props.hasInvoice ? "Recalculate invoice" : "Generate invoice"}
        </p>
        <p className="text-xs text-muted-foreground">
          {props.hasInvoice
            ? "Re-prices from the current rate book and storage days. Blocked once any money has been received."
            : "Prices automatically from the cargo category, weight and the published rates. Adds storage if the free days have run out."}
        </p>

        <FormError state={state} />
        <FormSuccess
          message={
            state.ok && state.data
              ? `${state.data.invoiceNumber} — ${props.currency} ${state.data.total.toFixed(2)}`
              : null
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton
            variant="signal"
            size="sm"
            disabled={settled}
            pendingLabel="Pricing…"
          >
            {props.hasInvoice ? "Recalculate" : "Generate invoice"}
          </SubmitButton>

          {props.invoiceNumber ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/finance/invoices/${props.invoiceNumber}`}>
                Open invoice
              </Link>
            </Button>
          ) : null}
        </div>
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
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<
    ActionResult<{ receiptNumber: string; pickupNoteNumber: string | null }>,
    FormData
  >(recordPayment, { ok: true });

  const settled = props.outstanding !== null && props.outstanding <= 0;

  return (
    <div className="p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-sm font-medium"
        disabled={settled}
      >
        <Wallet className="h-4 w-4 text-brand" />
        {settled ? "Settled in full" : "Confirm payment"}
      </button>

      {open && !settled ? (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="invoiceId" value={props.invoiceId ?? ""} />
          <div className="space-y-1.5">
            <Label htmlFor="amount" className="text-xs">
              Amount ({props.currency})
            </Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min="1"
              step="1"
              defaultValue={props.outstanding ?? ""}
              required
            />
          </div>
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
            <Label htmlFor="reference" className="text-xs">
              Reference
            </Label>
            <Input
              id="reference"
              name="reference"
              placeholder="M-Pesa ID, slip or cheque number"
            />
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
