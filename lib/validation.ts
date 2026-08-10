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
  /// Required, not defaulted. A quantity with a silently assumed unit is the
  /// thing this field exists to prevent — the desk has to say what it counted.
  packageType: z.enum(
    ["CARTON", "PIECE", "PACKAGE", "BAG", "BOX", "ENVELOPE", "OTHER"],
    { message: "Say what the quantity is counted as." }
  ),
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
  /**
   * What the customer actually handed over. A bill in USD is routinely settled
   * in shillings at the counter, and recording it as USD would put a figure on
   * the receipt that nobody in the room ever said out loud.
   *
   * The conversion back to the invoice's currency happens in the action, at
   * the rate frozen onto that invoice — never at today's rate, or a bill would
   * settle for a different amount depending on when it was paid.
   */
  currency: z.enum(["USD", "TZS"]).optional(),
  /**
   * The rate to convert this payment at, when it is tendered in a currency the
   * invoice is not denominated in.
   *
   * Defaults to the rate frozen onto the invoice — that is what the customer
   * was quoted. It is editable because the counter sometimes agrees a
   * different one: a bill raised weeks ago at 2,700 settled today when the
   * street rate is 2,760 is a conversation, and whatever they agree has to be
   * the number that goes in the books.
   *
   * Banded like every other rate in the app, so a mistyped digit is refused
   * rather than silently crediting ten times the money.
   */
  exchangeRate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 100 && v <= 100_000),
      "That rate looks wrong for USD→TZS. Check the number of digits."
    ),
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
  /**
   * Which company account the money landed in — the CRDB account, the M-Pesa
   * till, the cash tin in the office.
   *
   * Optional, deliberately. Taking the money is the job; saying where it went
   * is bookkeeping that follows it, and blocking the counter on a field the
   * clerk may not know yet would change a workflow that already works. What
   * nobody attributes shows up as exactly that on the Accounts view, which is
   * how a skipped field stays visible instead of being quietly invented.
   */
  accountId: z.string().trim().optional(),
  /**
   * When the money actually moved, which is not always when it was typed in.
   * A Friday transfer entered on Monday belongs to Friday — the payments page
   * groups on this, so backdating moves it into the right month.
   *
   * Empty means now. A future date is refused: money that has not arrived
   * cannot be recorded as received.
   */
  paidAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null))
    .refine(
      (d) => d === null || !Number.isNaN(d.getTime()),
      "That payment date is not valid."
    )
    .refine(
      // A whole day of slack, so a clerk in Dar is never told their own
      // "today" is in the future because the server is behind them.
      (d) => d === null || d.getTime() <= Date.now() + 86_400_000,
      "A payment cannot be dated in the future."
    ),
});

export const releaseSchema = z.object({
  /**
   * Optional: the scan identifies the cargo, and the cargo has exactly one
   * pickup note open at a time.
   *
   * It was required, which forced the counter to pick a customer's note off a
   * list before scanning anything — a step that could pick the WRONG note, and
   * that the scan then only re-proved. Passed in it is still checked against
   * the scanned shipment; left out, the note is found from the cargo.
   */
  pickupNoteId: z.string().min(1).optional(),
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
  /// Optional, but unique when given. Payroll and the audit trail refer to it,
  /// and the employee can never change it themselves.
  employeeId: z
    .string()
    .trim()
    .max(24, "Employee IDs are short — TX-014, not a sentence.")
    .optional()
    .transform((v) => (v?.length ? v.toUpperCase() : null)),
  /// Warehouse staff only; ignored for Finance, Support and the CEO.
  rank: z
    .enum(["OPERATOR", "MANAGER"])
    .optional()
    .transform((v) => v ?? null),
  status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]).default("ACTIVE"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters."),
});

/** Collapses a ZodError into the first message per field, for form display. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
