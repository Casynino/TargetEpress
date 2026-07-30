"use server";

import { z } from "zod";

import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { quote, type Quote } from "@/lib/pricing";

const schema = z.object({
  origin: z.enum(["GUANGZHOU", "HONG_KONG"]),
  method: z.enum(["AIR_NORMAL", "AIR_EXPRESS", "SEA_FREIGHT"]),
  goodsType: z.enum([
    "GENERAL_MERCHANDISE",
    "ELECTRONICS",
    "PHONE_ACCESSORIES",
    "TEXTILES_GARMENTS",
    "FOOTWEAR",
    "COSMETICS",
    "MACHINERY_PARTS",
    "AUTO_SPARES",
    "FURNITURE_FITTINGS",
    "MEDICAL_SUPPLIES",
    "STATIONERY",
    "OTHER",
  ]),
  weightKg: z
    .string()
    .trim()
    .min(1, "Enter the weight of your cargo.")
    .refine((v) => Number(v) > 0, "Weight must be greater than zero.")
    .transform(Number),
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
 * they talk to us. It only ever reads the published rate card, so there is
 * nothing here to leak.
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

  try {
    const result = await quote(parsed.data);
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}
