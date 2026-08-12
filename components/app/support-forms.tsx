"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  addTicketNote,
  createSourcingRequest,
  createTicket,
  updateSourcingRequest,
  updateTicket,
} from "@/lib/actions/support";

export const TICKET_CATEGORIES = [
  { value: "PRICE_INQUIRY", label: "Price inquiry" },
  { value: "SHIPMENT_INQUIRY", label: "Shipment inquiry" },
  { value: "MISSING_CARGO", label: "Missing cargo" },
  { value: "DAMAGED_CARGO", label: "Damaged cargo" },
  { value: "SOURCING", label: "Sourcing" },
  { value: "GENERAL", label: "General inquiry" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "FEEDBACK", label: "Feedback" },
];

export const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export const CHANNELS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PHONE", label: "Phone call" },
  { value: "IN_PERSON", label: "Walk-in" },
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "SOCIAL", label: "Social media" },
];

export const TICKET_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CUSTOMER", label: "Waiting for customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

export const SOURCING_TYPES = [
  { value: "FIND_SUPPLIER", label: "Find a supplier" },
  { value: "FIND_PRODUCT", label: "Find a product" },
  { value: "REQUEST_QUOTATION", label: "Request a quotation" },
  { value: "VERIFY_SUPPLIER", label: "Verify a supplier" },
  { value: "BUY_ON_BEHALF", label: "Buy on the customer's behalf" },
];

export const SOURCING_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CUSTOMER", label: "Waiting for customer" },
  { value: "SUPPLIER_FOUND", label: "Supplier found" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export type CustomerOption = { id: string; name: string; phone: string | null };

/**
 * A collapsed panel that opens into a form.
 *
 * The desk spends its day reading queues, not filling forms, so the form stays
 * out of the way until it is wanted — but it is one click away, because a ticket
 * that is awkward to open is a ticket that gets remembered instead of written.
 */
function Disclosure({
  title,
  cta,
  children,
}: {
  title: string;
  cta: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="font-semibold">{t(title)}</span>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
          {open ? (
            <>
              {t("Close")}
              <ChevronDown className="h-4 w-4 rotate-180" />
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              {t(cta)}
            </>
          )}
        </span>
      </button>
      {open ? <div className="border-t p-4">{children}</div> : null}
    </section>
  );
}

/** Picks an existing customer, or takes a name and number for someone new. */
function ContactFields({
  customers,
  presetCustomerId,
}: {
  customers: CustomerOption[];
  presetCustomerId?: string;
}) {
  const [customerId, setCustomerId] = useState(presetCustomerId ?? "");
  const t = useT();

  return (
    <>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="customerId">{t("Existing customer")}</Label>
        <NativeSelect
          id="customerId"
          name="customerId"
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">
            {t("Not a customer yet — enter details below")}
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
              {customer.phone ? ` · ${customer.phone}` : ""}
            </option>
          ))}
        </NativeSelect>
      </div>

      {customerId ? null : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="contactName">{t("Their name")}</Label>
            <Input
              id="contactName"
              name="contactName"
              placeholder={t("e.g. Mama Zainab")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">{t("Their phone")}</Label>
            <Input
              id="contactPhone"
              name="contactPhone"
              inputMode="tel"
              placeholder="0688 887 784"
            />
          </div>
        </>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- tickets */

export function NewTicketForm({
  customers,
  presetCustomerId,
}: {
  customers: CustomerOption[];
  presetCustomerId?: string;
}) {
  const [state, action] = useActionState(createTicket, undefined);
  const t = useT();

  return (
    <Disclosure title="Support tickets" cta="New ticket">
      <form action={action} className="space-y-4">
        <FormError state={state} />
        {state?.ok && state.data ? (
          <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            {t("Ticket")} {state.data.ticketNumber}{" "}
            {t("opened and assigned to you.")}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ContactFields customers={customers} presetCustomerId={presetCustomerId} />

          <div className="space-y-1.5">
            <Label htmlFor="category">{t("What is it about")}</Label>
            <NativeSelect id="category" name="category" defaultValue="SHIPMENT_INQUIRY">
              {TICKET_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="priority">{t("Priority")}</Label>
            <NativeSelect id="priority" name="priority" defaultValue="NORMAL">
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="channel">{t("How they reached us")}</Label>
            <NativeSelect id="channel" name="channel" defaultValue="WHATSAPP">
              {CHANNELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trackingNumber">
              {t("Shipment")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("optional")}
              </span>
            </Label>
            <Input
              id="trackingNumber"
              name="trackingNumber"
              placeholder="TX-000123"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="subject">{t("Summary")}</Label>
            <Input
              id="subject"
              name="subject"
              placeholder={t(
                "e.g. Carton arrived open, two pairs of shoes missing"
              )}
              required
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="body">{t("What the customer said")}</Label>
            <Textarea id="body" name="body" rows={3} required />
          </div>
        </div>

        <SubmitButton pendingLabel={t("Opening…")}>
          {t("Open ticket")}
        </SubmitButton>
      </form>
    </Disclosure>
  );
}

export function TicketWorkflow({
  ticket,
  staff,
}: {
  ticket: {
    id: string;
    status: string;
    priority: string;
    resolution: string | null;
    assignedToId: string | null;
  };
  staff: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(updateTicket, undefined);
  const [status, setStatus] = useState(ticket.status);
  const t = useT();
  const closing = status === "RESOLVED" || status === "CLOSED";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticketId" value={ticket.id} />
      <FormError state={state} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="status">{t("Status")}</Label>
          <NativeSelect
            id="status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {TICKET_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ticket-priority">{t("Priority")}</Label>
          <NativeSelect
            id="ticket-priority"
            name="priority"
            defaultValue={ticket.priority}
          >
            {PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assignedToId">{t("Handled by")}</Label>
          <NativeSelect
            id="assignedToId"
            name="assignedToId"
            defaultValue={ticket.assignedToId ?? ""}
          >
            <option value="">{t("Unassigned")}</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="resolution">
          {t("Resolution")}{" "}
          {closing ? (
            <span className="font-normal text-destructive">
              {t("required to close")}
            </span>
          ) : (
            <span className="font-normal text-muted-foreground">
              {t("optional")}
            </span>
          )}
        </Label>
        <Textarea
          id="resolution"
          name="resolution"
          rows={3}
          defaultValue={ticket.resolution ?? ""}
          placeholder={t("What did we actually do for this customer?")}
        />
      </div>

      <SubmitButton pendingLabel={t("Saving…")}>
        {t("Save ticket")}
      </SubmitButton>
    </form>
  );
}

export function TicketNoteForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(addTicketNote, undefined);
  const t = useT();
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormError state={state} />
      <Textarea
        name="body"
        rows={2}
        placeholder={t(
          "Add an internal note — what you tried, who you spoke to."
        )}
        required
      />
      <SubmitButton pendingLabel={t("Adding…")} variant="secondary" size="sm">
        {t("Add note")}
      </SubmitButton>
    </form>
  );
}

/* ---------------------------------------------------------------- sourcing */

export function NewSourcingForm({
  customers,
  presetCustomerId,
}: {
  customers: CustomerOption[];
  presetCustomerId?: string;
}) {
  const [state, action] = useActionState(createSourcingRequest, undefined);
  const t = useT();

  return (
    <Disclosure title="Sourcing requests" cta="New request">
      <form action={action} className="space-y-4">
        <FormError state={state} />
        {state?.ok && state.data ? (
          <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            {t("Request")} {state.data.requestNumber}{" "}
            {t("opened and assigned to you.")}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ContactFields customers={customers} presetCustomerId={presetCustomerId} />

          <div className="space-y-1.5">
            <Label htmlFor="type">{t("What they need")}</Label>
            <NativeSelect id="type" name="type" defaultValue="FIND_PRODUCT">
              {SOURCING_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sourcing-priority">{t("Priority")}</Label>
            <NativeSelect id="sourcing-priority" name="priority" defaultValue="NORMAL">
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product">{t("Product")}</Label>
            <Input
              id="product"
              name="product"
              placeholder={t("e.g. LED shop signs, 1.2 m")}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sourcing-category">
              {t("Category")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("optional")}
              </span>
            </Label>
            <Input
              id="sourcing-category"
              name="category"
              placeholder={t("Electronics")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budgetUsd">
              {t("Budget in USD")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("optional")}
              </span>
            </Label>
            <Input id="budgetUsd" name="budgetUsd" inputMode="decimal" placeholder="500" />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">{t("Details")}</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder={t(
                "Quantity, colours, quality, any sample photos they sent."
              )}
              required
            />
          </div>
        </div>

        <SubmitButton pendingLabel={t("Opening…")}>
          {t("Open request")}
        </SubmitButton>
      </form>
    </Disclosure>
  );
}

export function SourcingWorkflow({
  request,
}: {
  request: { id: string; status: string; priority: string; findings: string | null };
}) {
  const [state, action] = useActionState(updateSourcingRequest, undefined);
  const [status, setStatus] = useState(request.status);
  const t = useT();
  const finishing = status === "COMPLETED" || status === "SUPPLIER_FOUND";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="requestId" value={request.id} />
      <FormError state={state} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sourcing-status">{t("Status")}</Label>
          <NativeSelect
            id="sourcing-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {SOURCING_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-priority">{t("Priority")}</Label>
          <NativeSelect id="req-priority" name="priority" defaultValue={request.priority}>
            {PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="findings">
          {t("What we found")}{" "}
          {finishing ? (
            <span className="font-normal text-destructive">
              {t("required")}
            </span>
          ) : (
            <span className="font-normal text-muted-foreground">
              {t("optional")}
            </span>
          )}
        </Label>
        <Textarea
          id="findings"
          name="findings"
          rows={4}
          defaultValue={request.findings ?? ""}
          placeholder={t(
            "Supplier, market stall, unit price, minimum order, lead time."
          )}
        />
      </div>

      <SubmitButton pendingLabel={t("Saving…")}>
        {t("Save request")}
      </SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------------ search box */

export function QuickAction({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  const t = useT();
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-4 shadow-soft transition-colors hover:border-brand/40 hover:bg-accent/40"
    >
      <p className="font-medium group-hover:text-brand">{t(label)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t(hint)}</p>
    </Link>
  );
}
