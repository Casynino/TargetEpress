"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { normalisePhone } from "@/lib/format";
import { nextBookingReference, nextPickupReference } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Requests from the public website.
 *
 * These are the only writes in the system that come from someone who is not
 * signed in, so they are deliberately narrow: a name, a way to reach the
 * person, and a description. Nothing here creates a shipment, sets a price or
 * touches a batch. A booking is a promise that cargo is coming; it becomes a
 * shipment when the boxes are physically on the counter in Guangzhou and a
 * member of staff weighs them.
 *
 * Keeping that line sharp is what stops a form on the internet from putting
 * numbers into the operational record that nobody has checked.
 */

const contact = {
  customerName: z.string().trim().min(2, "Please give us your name."),
  phone: z
    .string()
    .trim()
    .min(9, "A phone number we can reach you on, please.")
    .max(30),
  email: z
    .string()
    .trim()
    .email("That email does not look right.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
};

const bookingSchema = z.object({
  ...contact,
  company: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v?.length ? v : null)),
  description: z
    .string()
    .trim()
    .min(3, "Tell us roughly what you are sending."),
  cargoCategory: z
    .enum(["NORMAL_GOODS", "ELECTRONICS", "LIQUID_SPECIAL"])
    .default("NORMAL_GOODS"),
  estimatedWeightKg: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v?.length ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v < 100000), {
      message: "Weight should be a number of kilograms.",
    }),
  packages: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v?.length ? Number.parseInt(v, 10) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v < 10000), {
      message: "How many pieces? A whole number, please.",
    }),
  origin: z.enum(["GUANGZHOU", "HONG_KONG"]).default("GUANGZHOU"),
  pickupNeeded: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  wantedBy: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v?.length ? new Date(v) : null))
    .refine((v) => v === null || !Number.isNaN(v.getTime()), {
      message: "That date does not look right.",
    }),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v?.length ? v : null)),
});

export async function submitBooking(
  _prev: ActionResult<{ reference: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ reference: string }>> {
  const parsed = bookingSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  }
  const input = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const reference = await nextBookingReference(tx);
      return tx.bookingRequest.create({
        data: {
          reference,
          customerName: input.customerName,
          phone: normalisePhone(input.phone),
          email: input.email,
          company: input.company,
          description: input.description,
          cargoCategory: input.cargoCategory,
          estimatedWeightKg: input.estimatedWeightKg,
          packages: input.packages,
          origin: input.origin,
          pickupNeeded: input.pickupNeeded,
          wantedBy: input.wantedBy,
          notes: input.notes,
        },
        select: { reference: true },
      });
    });

    revalidatePath("/app/requests");
    return ok({ reference: created.reference });
  } catch (error) {
    return fail(toActionError(error));
  }
}

const pickupSchema = z.object({
  ...contact,
  address: z
    .string()
    .trim()
    .min(5, "Where should the driver go? A street and a building."),
  city: z.string().trim().min(2, "Which city?"),
  mapsUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v?.length ? v : null)),
  description: z
    .string()
    .trim()
    .min(3, "What is being collected?"),
  estimatedWeightKg: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v?.length ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v < 100000), {
      message: "Weight should be a number of kilograms.",
    }),
  packages: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v?.length ? Number.parseInt(v, 10) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v < 10000), {
      message: "How many pieces? A whole number, please.",
    }),
  preferredAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v?.length ? new Date(v) : null))
    .refine((v) => v === null || !Number.isNaN(v.getTime()), {
      message: "That date does not look right.",
    }),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v?.length ? v : null)),
});

export async function submitPickup(
  _prev: ActionResult<{ reference: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ reference: string }>> {
  const parsed = pickupSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  }
  const input = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const reference = await nextPickupReference(tx);
      return tx.pickupRequest.create({
        data: {
          reference,
          customerName: input.customerName,
          phone: normalisePhone(input.phone),
          email: input.email,
          address: input.address,
          city: input.city,
          mapsUrl: input.mapsUrl,
          description: input.description,
          estimatedWeightKg: input.estimatedWeightKg,
          packages: input.packages,
          preferredAt: input.preferredAt,
          notes: input.notes,
        },
        select: { reference: true },
      });
    });

    revalidatePath("/app/requests");
    return ok({ reference: created.reference });
  } catch (error) {
    return fail(toActionError(error));
  }
}
