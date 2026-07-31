import { z } from "zod";

const GOODS_TYPES = [
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
] as const;

const ORIGINS = ["GUANGZHOU", "HONG_KONG"] as const;

/** Form numbers arrive as strings; empty means "not provided", not zero. */
const numeric = (label: string, { min = 0 }: { min?: number } = {}) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine((v) => !Number.isNaN(Number(v)), `${label} must be a number.`)
    .refine((v) => Number(v) >= min, `${label} must be at least ${min}.`)
    .transform(Number);

const optionalNumeric = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v) : null))
  .refine((v) => v === null || !Number.isNaN(v), "Must be a number.");

/**
 * Cargo registration, as the warehouse sees it.
 *
 * Note what is absent: no price, and no departure airport. The warehouse
 * records what the cargo IS; the system derives where it flies from and what it
 * costs. A rate field here would let a warehouse clerk set a price, which is
 * exactly what the operations/finance split exists to prevent.
 */
export const shipmentSchema = z.object({
  /// Set when the clerk picked someone from the customer book. Takes priority
  /// over the name and phone, which then only describe an existing record.
  customerId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  customerName: z.string().trim().min(2, "A name or shipping mark is required."),
  /// Empty only when an existing customer was picked — some of the customers
  /// imported from Guangzhou packing lists genuinely have no number on file.
  /// Creating a new customer always requires one; see the refine below.
  customerPhone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || v.length >= 7, "That phone number is too short."),
  customerCity: z.string().trim().optional(),
  cargoCategory: z.enum(["NORMAL_GOODS", "ELECTRONICS", "LIQUID_SPECIAL"]),
  cargoTypeId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  goodsType: z.enum(GOODS_TYPES).optional().default("GENERAL_MERCHANDISE"),
  description: z.string().trim().min(3, "Describe the cargo."),
  packages: numeric("Number of packages", { min: 1 }),
  weightKg: numeric("Weight", { min: 0.01 }),
  volumeCbm: optionalNumeric,
  internalNotes: z.string().trim().optional(),
  batchId: z.string().trim().optional(),
})
  .refine(
    (input) => input.customerId !== null || input.customerPhone !== null,
    {
      message: "A phone number is required for a new customer.",
      path: ["customerPhone"],
    }
  );

export const batchSchema = z.object({
  origin: z.enum(ORIGINS),
  notes: z.string().trim().optional(),
});

export const departureSchema = z.object({
  batchId: z.string().min(1),
  airline: z.string().trim().min(2, "Airline is required."),
  flightNumber: z.string().trim().min(2, "Flight number is required."),
  waybillNumber: z.string().trim().min(3, "Waybill number is required."),
  departureDate: z.string().trim().min(1, "Departure date is required."),
});

export const invoiceSchema = z.object({
  shipmentId: z.string().min(1),
  freightCost: numeric("Freight cost"),
  otherCharges: optionalNumeric,
  discount: optionalNumeric,
  notes: z.string().trim().optional(),
});

export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: numeric("Amount", { min: 0.01 }),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CHEQUE"]),
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export const releaseSchema = z.object({
  pickupNoteId: z.string().min(1),
  shipmentQr: z.string().trim().min(1, "Scan the cargo label to confirm."),
  receiverName: z.string().trim().min(2, "Receiver name is required."),
  receiverPhone: z.string().trim().min(7, "Receiver phone is required."),
  receiverIdNumber: z.string().trim().optional(),
  relationship: z.enum(["SELF", "AGENT", "EMPLOYEE", "FAMILY"]),
  note: z.string().trim().optional(),
});

export const exceptionSchema = z.object({
  shipmentId: z.string().min(1),
  type: z.enum([
    "MISSING_SHIPMENT",
    "DAMAGED_CARGO",
    "WEIGHT_MISMATCH",
    "PACKAGE_COUNT_MISMATCH",
    "WRONG_BATCH",
    "OTHER",
  ]),
  description: z.string().trim().min(3, "Describe what is wrong."),
});

export const userSchema = z.object({
  name: z.string().trim().min(2, "Name is required."),
  email: z.string().trim().email("A valid email is required."),
  phone: z.string().trim().optional(),
  role: z.enum(["ADMIN", "CHINA_WAREHOUSE", "DAR_WAREHOUSE", "FINANCE", "CUSTOMER_CARE"]),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});

/** Collapses a ZodError into the first message per field, for form display. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
