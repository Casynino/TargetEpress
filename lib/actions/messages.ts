"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * The contact log.
 *
 * Records that a member of staff contacted a customer, with what and how. It
 * does not send anything — the WhatsApp link does that, in the clerk's own
 * WhatsApp — so this action is called after the fact. Calling it "log" rather
 * than "send" is the point: the log must only ever claim what actually happened.
 */

const schema = z.object({
  customerId: z.string().trim().min(1, "Missing customer."),
  shipmentId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  invoiceId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  kind: z.enum([
    "SHIPMENT_REGISTERED",
    "IN_TRANSIT",
    "ARRIVED_DAR",
    "INVOICE_ISSUED",
    "PAYMENT_REMINDER",
    "READY_FOR_PICKUP",
    "STORAGE_REMINDER",
    "GENERAL",
  ]),
  channel: z.enum(["WHATSAPP", "PHONE", "SMS", "EMAIL", "IN_PERSON", "SOCIAL"]),
  body: z.string().trim().min(2, "Nothing to record."),
});

export async function logCustomerMessage(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("message.send");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = schema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the message.");
  }
  const input = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const message = await tx.customerMessage.create({
        data: {
          customerId: input.customerId,
          shipmentId: input.shipmentId,
          invoiceId: input.invoiceId,
          kind: input.kind,
          channel: input.channel,
          body: input.body,
          sentById: user.id,
        },
        select: { id: true, customer: { select: { code: true, name: true } } },
      });

      // Sending the invoice is the one message that changes the invoice's own
      // state: an unsent invoice is not yet a demand for money.
      if (input.kind === "INVOICE_ISSUED" && input.invoiceId) {
        await tx.invoice.updateMany({
          where: { id: input.invoiceId, sentAt: null },
          data: { sentAt: new Date(), sentById: user.id },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "message.log",
          entity: "CustomerMessage",
          entityId: message.id,
          summary: `${input.kind} to ${message.customer.name} via ${input.channel}`,
          metadata: { kind: input.kind, channel: input.channel },
        },
        tx
      );

      return message;
    });

    revalidatePath(`/app/customers/${input.customerId}`);
    revalidatePath("/app/support");
    revalidatePath("/app/support/follow-up");
    if (input.invoiceId) revalidatePath(`/app/finance/invoices/${input.invoiceId}`);
    return ok({ id: created.id });
  } catch (error) {
    return fail(toActionError(error));
  }
}
