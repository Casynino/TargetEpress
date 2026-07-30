"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { nextSourcingNumber, nextTicketNumber } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * The support desk's own records.
 *
 * A ticket or a request is cheap to open and must stay cheap, because the
 * alternative is a clerk keeping it in their head and the customer being told
 * something different next time they call. So: a customer link is optional
 * (price inquiries arrive before people are customers), a phone number alone is
 * enough, and nothing here can touch cargo or cash.
 */

const CHANNEL = z.enum(["WHATSAPP", "PHONE", "SMS", "EMAIL", "IN_PERSON", "SOCIAL"]);
const PRIORITY = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

/* ----------------------------------------------------------------- tickets */

const ticketSchema = z.object({
  customerId: optionalText,
  contactName: optionalText,
  contactPhone: optionalText,
  trackingNumber: optionalText,
  category: z.enum([
    "PRICE_INQUIRY",
    "SHIPMENT_INQUIRY",
    "MISSING_CARGO",
    "DAMAGED_CARGO",
    "SOURCING",
    "GENERAL",
    "COMPLAINT",
    "FEEDBACK",
  ]),
  priority: PRIORITY,
  channel: CHANNEL,
  subject: z.string().trim().min(3, "Say what this is about in a few words."),
  body: z.string().trim().min(3, "Write down what the customer told you."),
});

export async function createTicket(
  _prev: ActionResult<{ ticketNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ ticketNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("ticket.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = ticketSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the ticket details.");
  }
  const input = parsed.data;

  // Somebody has to be identifiable, or the ticket cannot be followed up.
  if (!input.customerId && !input.contactName && !input.contactPhone) {
    return fail("Give at least a name or a phone number so this can be followed up.");
  }

  try {
    let shipmentId: string | null = null;
    if (input.trackingNumber) {
      const shipment = await prisma.shipment.findUnique({
        where: { trackingNumber: input.trackingNumber.toUpperCase() },
        select: { id: true, customerId: true },
      });
      if (!shipment) {
        return fail(`No shipment found with tracking number ${input.trackingNumber}.`);
      }
      shipmentId = shipment.id;
      // Linking a shipment tells us who the customer is, so fill it in rather
      // than leaving a ticket that is about a shipment but attached to nobody.
      input.customerId ??= shipment.customerId;
    }

    const created = await prisma.$transaction(async (tx) => {
      const ticketNumber = await nextTicketNumber(tx);
      const ticket = await tx.supportTicket.create({
        data: {
          ticketNumber,
          customerId: input.customerId,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          shipmentId,
          category: input.category,
          priority: input.priority,
          channel: input.channel,
          subject: input.subject,
          body: input.body,
          // Whoever opens it owns it until someone reassigns it. An unowned
          // queue is a queue nobody works.
          assignedToId: user.id,
          openedById: user.id,
        },
        select: { id: true, ticketNumber: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "ticket.create",
          entity: "SupportTicket",
          entityId: ticket.id,
          summary: `Opened ticket ${ticket.ticketNumber}: ${input.subject}`,
          metadata: { category: input.category, priority: input.priority },
        },
        tx
      );

      return ticket;
    });

    revalidatePath("/app/support");
    revalidatePath("/app/support/tickets");
    return ok({ ticketNumber: created.ticketNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

const ticketUpdateSchema = z.object({
  ticketId: z.string().trim().min(1),
  status: z
    .enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"])
    .optional(),
  priority: PRIORITY.optional(),
  assignedToId: optionalText,
  resolution: optionalText,
});

export async function updateTicket(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("ticket.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = ticketUpdateSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the details.");
  }
  const input = parsed.data;

  try {
    const existing = await prisma.supportTicket.findUnique({
      where: { id: input.ticketId },
      select: { ticketNumber: true, status: true, resolution: true },
    });
    if (!existing) return fail("That ticket no longer exists.");

    const closing = input.status === "RESOLVED" || input.status === "CLOSED";
    const resolution = input.resolution ?? existing.resolution;

    // Closing a ticket with nothing written down loses the answer, which is the
    // one thing the next person handling this customer needs.
    if (closing && !resolution) {
      return fail("Write what you did to resolve this before closing it.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: input.ticketId },
        data: {
          status: input.status,
          priority: input.priority,
          assignedToId: input.assignedToId ?? undefined,
          resolution: input.resolution ?? undefined,
          resolvedAt: closing ? new Date() : undefined,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "ticket.update",
          entity: "SupportTicket",
          entityId: input.ticketId,
          summary:
            input.status && input.status !== existing.status
              ? `Ticket ${existing.ticketNumber}: ${existing.status} → ${input.status}`
              : `Updated ticket ${existing.ticketNumber}`,
          metadata: { ...input },
        },
        tx
      );
    });

    revalidatePath("/app/support");
    revalidatePath("/app/support/tickets");
    revalidatePath(`/app/support/tickets/${input.ticketId}`);
    return ok({ id: input.ticketId });
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function addTicketNote(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("ticket.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!ticketId) return fail("Missing ticket.");
  if (body.length < 2) return fail("Write the note first.");

  try {
    const note = await prisma.ticketNote.create({
      data: { ticketId, body, authorId: user.id },
      select: { id: true },
    });
    revalidatePath(`/app/support/tickets/${ticketId}`);
    return ok({ id: note.id });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/* -------------------------------------------------------- sourcing requests */

const sourcingSchema = z.object({
  customerId: optionalText,
  contactName: optionalText,
  contactPhone: optionalText,
  type: z.enum([
    "FIND_SUPPLIER",
    "FIND_PRODUCT",
    "REQUEST_QUOTATION",
    "VERIFY_SUPPLIER",
    "BUY_ON_BEHALF",
  ]),
  product: z.string().trim().min(2, "Say what the customer is looking for."),
  category: optionalText,
  description: z.string().trim().min(3, "Describe the request."),
  budgetUsd: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "That budget is not a number."),
  priority: PRIORITY,
});

export async function createSourcingRequest(
  _prev: ActionResult<{ requestNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ requestNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("sourcing.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = sourcingSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the request details.");
  }
  const input = parsed.data;

  if (!input.customerId && !input.contactName && !input.contactPhone) {
    return fail("Give at least a name or a phone number so this can be followed up.");
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const requestNumber = await nextSourcingNumber(tx);
      const request = await tx.sourcingRequest.create({
        data: {
          requestNumber,
          customerId: input.customerId,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          type: input.type,
          product: input.product,
          category: input.category,
          description: input.description,
          budgetUsd:
            input.budgetUsd === null ? null : new Prisma.Decimal(input.budgetUsd),
          priority: input.priority,
          assignedToId: user.id,
          openedById: user.id,
        },
        select: { id: true, requestNumber: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "sourcing.create",
          entity: "SourcingRequest",
          entityId: request.id,
          summary: `Opened sourcing request ${request.requestNumber}: ${input.product}`,
          metadata: { type: input.type, budgetUsd: input.budgetUsd },
        },
        tx
      );

      return request;
    });

    revalidatePath("/app/support");
    revalidatePath("/app/support/sourcing");
    return ok({ requestNumber: created.requestNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function updateSourcingRequest(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("sourcing.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const schema = z.object({
    requestId: z.string().trim().min(1),
    status: z
      .enum([
        "NEW",
        "IN_PROGRESS",
        "WAITING_CUSTOMER",
        "SUPPLIER_FOUND",
        "COMPLETED",
        "CANCELLED",
      ])
      .optional(),
    priority: PRIORITY.optional(),
    findings: optionalText,
  });

  const parsed = schema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the details.");
  }
  const input = parsed.data;

  try {
    const existing = await prisma.sourcingRequest.findUnique({
      where: { id: input.requestId },
      select: { requestNumber: true, status: true, findings: true },
    });
    if (!existing) return fail("That request no longer exists.");

    const finishing = input.status === "COMPLETED" || input.status === "SUPPLIER_FOUND";
    if (finishing && !(input.findings ?? existing.findings)) {
      return fail("Record what you found before marking this done.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.sourcingRequest.update({
        where: { id: input.requestId },
        data: {
          status: input.status,
          priority: input.priority,
          findings: input.findings ?? undefined,
          completedAt:
            input.status === "COMPLETED" || input.status === "CANCELLED"
              ? new Date()
              : undefined,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "sourcing.update",
          entity: "SourcingRequest",
          entityId: input.requestId,
          summary:
            input.status && input.status !== existing.status
              ? `Request ${existing.requestNumber}: ${existing.status} → ${input.status}`
              : `Updated request ${existing.requestNumber}`,
          metadata: { ...input },
        },
        tx
      );
    });

    revalidatePath("/app/support/sourcing");
    revalidatePath(`/app/support/sourcing/${input.requestId}`);
    return ok({ id: input.requestId });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/* ---------------------------------------------------------- customer notes */

export async function saveCustomerNotes(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("customer.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!customerId) return fail("Missing customer.");

  try {
    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: { notes: notes || null },
      select: { id: true, code: true },
    });
    await recordAudit({
      actor: user,
      action: "customer.notes",
      entity: "Customer",
      entityId: customer.id,
      summary: `Updated notes on ${customer.code}`,
    });
    revalidatePath(`/app/customers/${customerId}`);
    return ok({ id: customer.id });
  } catch (error) {
    return fail(toActionError(error));
  }
}
