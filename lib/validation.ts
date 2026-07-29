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

export const shipmentSchema = z.object({
  customerName: z.string().trim().min(2, "Customer name is required."),
  customerPhone: z.string().trim().min(7, "A valid phone number is required."),
  customerCity: z.string().trim().optional(),
  goodsType: z.enum(GOODS_TYPES),
  description: z.string().trim().min(3, "Describe the cargo."),
  packages: numeric("Number of packages", { min: 1 }),
  weightKg: numeric("Weight", { min: 0.01 }),
  volumeCbm: optionalNumeric,
  origin: z.enum(ORIGINS),
  unitRate: optionalNumeric,
  internalNotes: z.string().trim().optional(),
  batchId: z.string().trim().optional(),
});

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
  role: z.enum(["ADMIN", "CHINA_WAREHOUSE", "DAR_WAREHOUSE", "FINANCE"]),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});

/** Collapses a ZodError into the first message per field, for form display. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
