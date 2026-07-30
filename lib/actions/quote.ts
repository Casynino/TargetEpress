"use server";

import { z } from "zod";

import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { quote, type Quote } from "@/lib/pricing";

const schema = z.object({
  category: z.enum(["NORMAL_GOODS", "ELECTRONICS", "LIQUID_SPECIAL"]),
  cargoTypeId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  weightKg: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : 0))
    .refine((v) => !Number.isNaN(v) && v >= 0, "Weight is not valid."),
  volumeCbm: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || (!Number.isNaN(v) && v >= 0), "Volume is not valid."),
  quantity: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : 1))
    .refine((v) => Number.isFinite(v) && v >= 1, "Quantity must be at least 1."),
});

/**
 * Public rate estimate.
 *
 * Unauthenticated on purpose — anyone should be able to price a shipment before
 * they talk to us. It only reads the published rate book, so there is nothing
 * here to leak.
 */
export async function estimateQuote(
  _prev: ActionResult<Quote> | undefined,
  formData: FormData
): Promise<ActionResult<Quote>> {
  const parsed = schema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  }

  const input = parsed.data;

  // Electronics are priced per item, so a piece count is what matters and the
  // weight is irrelevant. Everything else needs a weight to price at all.
  const weightBased = input.category !== "ELECTRONICS";
  if (weightBased && input.weightKg <= 0) {
    return fail("Enter the weight of your cargo.");
  }
  if (!weightBased && !input.cargoTypeId) {
    return fail("Choose which electronic item you are sending.");
  }

  try {
    return ok(await quote(input));
  } catch (error) {
    return fail(toActionError(error));
  }
}
