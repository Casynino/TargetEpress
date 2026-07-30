"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { nextSourcingNumber } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Public sourcing enquiry.
 *
 * Unauthenticated by necessity — the person filling this in is not a customer
 * yet. That makes it the one write path in the system open to the world, so it
 * is deliberately narrow:
 *
 *  - It can only create a SourcingRequest. It cannot touch a customer, a
 *    shipment or any money.
 *  - It never links to an existing customer record, even if the phone number
 *    matches one. Trusting an unauthenticated phone number to identify someone
 *    would let a stranger attach requests to a real customer's profile; the
 *    desk links it by hand once they have spoken to the person.
 *  - Fields are length-capped, and it lands as NEW and unassigned so a human
 *    reads it before anything happens.
 */

const schema = z.object({
  name: z.string().trim().min(2, "Tell us your name.").max(120),
  phone: z
    .string()
    .trim()
    .min(9, "We need a phone number to reply on.")
    .max(30)
    .regex(/^[\d+\s()-]+$/, "That does not look like a phone number."),
  type: z.enum([
    "FIND_SUPPLIER",
    "FIND_PRODUCT",
    "REQUEST_QUOTATION",
    "VERIFY_SUPPLIER",
    "BUY_ON_BEHALF",
  ]),
  product: z.string().trim().min(2, "What are you looking for?").max(200),
  description: z.string().trim().min(5, "Tell us a little more.").max(2000),
  budgetUsd: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 1_000_000),
      "That budget is not a number we can use."
    ),
});

export async function submitSourcingEnquiry(
  _prev: ActionResult<{ requestNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ requestNumber: string }>> {
  // Honeypot. Real people never fill a hidden field; scripts fill everything.
  if (String(formData.get("company") ?? "").trim().length > 0) {
    return fail("Something went wrong. Please message us on WhatsApp instead.");
  }

  const parsed = schema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  }
  const input = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const requestNumber = await nextSourcingNumber(tx);
      return tx.sourcingRequest.create({
        data: {
          requestNumber,
          contactName: input.name,
          contactPhone: input.phone,
          type: input.type,
          product: input.product,
          description: input.description,
          budgetUsd:
            input.budgetUsd === null ? null : new Prisma.Decimal(input.budgetUsd),
          // No customer link and no assignee: a person on the desk picks it up.
          status: "NEW",
        },
        select: { requestNumber: true },
      });
    });

    revalidatePath("/app/support");
    revalidatePath("/app/support/sourcing");
    return ok({ requestNumber: created.requestNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}
