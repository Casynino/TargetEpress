"use client";

import { useActionState, useState } from "react";
import { ExternalLink, MessageCircle } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { logCustomerMessage } from "@/lib/actions/messages";

export type ComposerTemplate = {
  kind: string;
  label: string;
  body: string;
};

const CHANNELS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PHONE", label: "Phone call" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "Email" },
  { value: "IN_PERSON", label: "In person" },
  { value: "SOCIAL", label: "Social media" },
];

/**
 * Contacting a customer, in two honest halves.
 *
 * "Open WhatsApp" hands the composed text to the clerk's own WhatsApp — that is
 * what actually delivers the message. "Record it" writes the contact log. They
 * are separate buttons because the system genuinely does not know whether the
 * clerk pressed send, and a log that assumes they did would be a log that lies.
 */
export function MessageComposer({
  customerId,
  customerName,
  customerPhone,
  shipmentId,
  invoiceId,
  templates,
  defaultKind,
  whatsappBase,
}: {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  shipmentId?: string | null;
  invoiceId?: string | null;
  templates: ComposerTemplate[];
  defaultKind: string;
  /** wa.me/<number>, without the text. Null when we have no phone on file. */
  whatsappBase: string | null;
}) {
  const [state, action] = useActionState(logCustomerMessage, undefined);
  const [kind, setKind] = useState(defaultKind);
  const [channel, setChannel] = useState("WHATSAPP");
  const [body, setBody] = useState(
    templates.find((t) => t.kind === defaultKind)?.body ?? ""
  );

  const pickTemplate = (nextKind: string) => {
    setKind(nextKind);
    const template = templates.find((t) => t.kind === nextKind);
    // Only overwrite what the clerk has not edited into something of their own —
    // switching template should not silently bin a message they just typed.
    if (template) setBody(template.body);
  };

  const whatsappHref =
    whatsappBase && channel === "WHATSAPP"
      ? `${whatsappBase}?text=${encodeURIComponent(body)}`
      : null;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="customerId" value={customerId} />
      {shipmentId ? <input type="hidden" name="shipmentId" value={shipmentId} /> : null}
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      <input type="hidden" name="body" value={body} />

      <FormError state={state} />
      {state?.ok ? (
        <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
          Logged against {customerName}&rsquo;s record.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Message</Label>
          <NativeSelect
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) => pickTemplate(event.target.value)}
          >
            {templates.map((template) => (
              <option key={template.kind} value={template.kind}>
                {template.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="channel">How</Label>
          <NativeSelect
            id="channel"
            name="channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
          >
            {CHANNELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="composer-body">Wording — edit it freely</Label>
        <Textarea
          id="composer-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={9}
          className="font-sans text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {whatsappHref ? (
          <Button asChild variant="secondary">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Open in WhatsApp
              <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-60" />
            </a>
          </Button>
        ) : channel === "WHATSAPP" ? (
          <p className="text-sm text-muted-foreground">
            No phone number on file for {customerName} — add one to their profile
            to message them.
          </p>
        ) : null}

        <SubmitButton pendingLabel="Recording…">Record as sent</SubmitButton>
      </div>

      <p className="text-xs text-muted-foreground">
        {customerPhone
          ? `Recorded against ${customerPhone}.`
          : "No number on file."}{" "}
        Recording it puts this on the customer&rsquo;s contact history so the next
        person who speaks to them knows what they were told.
      </p>
    </form>
  );
}
