"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, Send } from "lucide-react";

import { logCustomerMessage } from "@/lib/actions/messages";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Telling a customer what they owe, in one press.
 *
 * The follow-up queue said "Send the invoice" in every row and gave nobody a
 * way to send one — the next action was described and then withheld, which is
 * the dead end the owner has objected to more than once.
 *
 * Two things have to happen together and neither is optional: WhatsApp opens
 * with the message already written, and the invoice is marked as sent so it
 * leaves this queue and joins the one for chasing. Recording the send without
 * opening WhatsApp would mark a bill delivered that nobody delivered; opening
 * WhatsApp without recording it means the same customer is told twice tomorrow.
 *
 * The window is opened from the click itself rather than after the action
 * resolves, because a popup blocker will swallow anything a server round-trip
 * opens later.
 */
export function SendInvoiceButton({
  customerId,
  shipmentId,
  invoiceId,
  whatsapp,
  body,
  alreadySent,
}: {
  customerId: string;
  shipmentId: string;
  invoiceId: string;
  /** Null when there is no number on file — then this is not offered. */
  whatsapp: string | null;
  /** The message, already built from the template on the server. */
  body: string;
  alreadySent: boolean;
}) {
  const [state, action] = useActionState<ActionResult<{ id: string }>, FormData>(
    logCustomerMessage,
    { ok: true }
  );
  const opened = useRef(false);

  useEffect(() => {
    if (state.ok && opened.current) opened.current = false;
  }, [state]);

  if (!whatsapp) {
    return (
      <span className="text-[11px] text-muted-foreground">no phone on file</span>
    );
  }

  if (alreadySent) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-success">
        <Check className="h-3 w-3" />
        sent
      </span>
    );
  }

  return (
    <form
      action={action}
      onSubmit={() => {
        // Opened synchronously with the gesture, or the browser blocks it.
        if (!opened.current) {
          opened.current = true;
          window.open(whatsapp, "_blank", "noopener,noreferrer");
        }
      }}
    >
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="kind" value="INVOICE_ISSUED" />
      <input type="hidden" name="channel" value="WHATSAPP" />
      <input type="hidden" name="body" value={body} />
      <button
        type="submit"
        className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-[11px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
      >
        <Send className="h-3 w-3" />
        Send invoice
      </button>
      {state.ok ? null : (
        <span className="mt-1 block text-[10px] text-destructive">
          {state.error}
        </span>
      )}
    </form>
  );
}
