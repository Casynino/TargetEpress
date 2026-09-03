import { Role } from "@prisma/client";
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
const numeric = (
  label: string,
  { min = 0, max, int = false }: { min?: number; max?: number; int?: boolean } = {}
) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    /* isFinite, not just !isNaN: "Infinity" is a number to JavaScript and a
       crash to a Decimal column. */
    .refine((v) => Number.isFinite(Number(v)), `${label} must be a number.`)
    .refine((v) => Number(v) >= min, `${label} must be at least ${min}.`)
    .refine(
      (v) => max === undefined || Number(v) <= max,
      `${label} cannot be more than ${max}.`
    )
    .refine(
      (v) => !int || Number.isInteger(Number(v)),
      `${label} must be a whole number.`
    )
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
  customerName: z
    .string()
    .trim()
    .min(2, "A name or shipping mark is required.")
    .max(120, "That name is too long."),
  /**
   * Required. On every consignment, for every customer, new or existing.
   *
   * The phone number is the only key this system matches customers on, so cargo
   * registered without one cannot be joined to the person it belongs to — and
   * that is exactly how "Dickson Ndomba" and "dickson ndomba" became two
   * accounts with a bill each, one balance visible to the desk and the other
   * not. It was optional for customers imported from Guangzhou packing lists;
   * the cost of that convenience is paid later by Finance, so the number is
   * collected at the counter where it is easy to ask for.
   */
  customerPhone: z
    .string({
      /* Missing entirely, not just short — the field never reached the server,
         which is what an existing customer with no number on file looked like
         before the picker started asking for one. */
      message: "A phone number is required — cargo cannot be registered without one.",
    })
    .trim()
    .min(7, "A phone number is required — cargo cannot be registered without one.")
    .max(30)
    .regex(
      /^[\d+\s()-]+$/,
      "That does not look like a phone number."
    ),
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
  /*
    TWO CHARACTERS, NOT THREE.

    Three was an English assumption and it quietly excluded most of the Chinese
    product list: 衣服, 鞋子, 假发, 电池, 药品, 食品 — nineteen of the forty items
    this system sells freight for are two characters, and every one of them is a
    complete, precise description. A Guangzhou clerk typing the right word was
    told to describe the cargo.

    Two still does the job the rule exists for: it blocks empty and it blocks a
    single stray keystroke. Nothing in between was ever worth refusing.
  */
  description: z
    .string()
    .trim()
    .min(2, "Describe the cargo.")
    .max(500, "Keep the description under 500 characters."),
  /* The same ceilings the edit door enforces (lib/actions/cargo-edit.ts):
     registration materialises one Package row per unit, so an extra zero here
     is not a typo in a column, it is hundreds of QR labels. */
  packages: numeric("Number of packages", { min: 1, max: 999, int: true }),
  weightKg: numeric("Weight", { min: 0.01, max: 5000 }),
  volumeCbm: optionalNumeric,
  internalNotes: z
    .string()
    .trim()
    .max(1000, "Keep internal notes under 1000 characters.")
    .optional(),
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

/**
 * One payment, spread across several of a customer's bills.
 *
 * The allocations arrive as JSON because a form cannot carry a list of pairs
 * any other way, and are validated here rather than trusted: what a browser
 * sends is a proposal. Every arithmetic rule that protects the books —
 * allocated never exceeding received, and never exceeding what a bill still
 * owes — is checked again in the action against figures read inside the
 * transaction, because only those are current.
 */
export const customerPaymentSchema = z.object({
  customerId: z.string().min(1, "Choose the customer who paid."),
  amount: numeric("Amount", { min: 0.01 }),
  currency: z.enum(["USD", "TZS"]),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  /* Required, same rule as paymentSchema above — and this schema is shared by
     Finance recording a combined payment and Support claiming one, so both
     sides of that handover are held to it in one place. */
  accountId: z.string().trim().min(1, "Say which account the money landed in."),
  paidAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null))
    .refine(
      (d) => d === null || (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 86_400_000),
      "Money cannot have arrived in the future."
    ),
  /**
   * Which bills this money is being put against — possibly none of them.
   *
   * An empty list is a DEPOSIT: the customer has paid before their cargo
   * landed, so there is no bill yet to settle. The money is theirs, it sits in
   * the account it arrived in, and it settles their invoice the moment Dar
   * checks the cargo in.
   */
  allocations: z
    .string()
    .min(2, "Allocations could not be read.")
    .transform((raw, ctx) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The allocations could not be read." });
        return z.NEVER;
      }
      const rows = z
        .array(z.object({ invoiceId: z.string().min(1), amount: z.number().finite() }))
        .safeParse(parsed);
      if (!rows.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The allocations could not be read." });
        return z.NEVER;
      }
      /* A share of nothing is not a settlement, and a negative one is money
         walking backwards out of a bill. */
      if (rows.data.some((r) => !(r.amount > 0))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every bill you pick has to be given something.",
        });
        return z.NEVER;
      }
      /* The same bill twice would be two answers to "how much did this payment
         put against it", and the database refuses the pair anyway. */
      if (new Set(rows.data.map((r) => r.invoiceId)).size !== rows.data.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The same bill is listed twice.",
        });
        return z.NEVER;
      }
      return rows.data;
    }),
});

export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: numeric("Amount", { min: 0.01 }),
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
  reference: z.string().trim().max(120, "That reference is too long.").optional(),
  note: z.string().trim().max(1000, "Keep the note under 1000 characters.").optional(),
  /**
   * Which company account the money landed in — the CRDB account, the M-Pesa
   * till, the cash tin in the office.
   *
   * REQUIRED, on the owner's instruction, and it reverses how this worked.
   * It used to be optional on the argument that taking the money is the job
   * and the bookkeeping follows it — with unattributed payments left visible
   * on the Accounts view rather than invented. In practice that left money
   * the business could not point at, and the owner's rule is now the simpler
   * one: nothing is recorded anywhere without saying where it is. Every desk,
   * every screen. The proof a customer sends names the destination, so there
   * is an answer to give.
   */
  accountId: z.string().trim().min(1, "Say which account the money landed in."),
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
  /**
   * The code read off the box. Optional ONLY when a pickupNoteId names the
   * cargo instead.
   *
   * A torn or soaked label cannot be scanned, and that is exactly when somebody
   * is standing at the counter with the box and the customer. Refusing the
   * handover there is not a security control, it is a queue; the mandatory
   * proof-of-delivery photograph is what carries the evidence in that case.
   *
   * The absence is recorded on the delivery, so "released without a scan" is a
   * thing the record says rather than a thing nobody can tell afterwards. Every
   * other guard — note open, status, investigation lock, every carton present —
   * is unchanged and still runs inside the release transaction.
   */
  shipmentQr: z.string().trim().min(1).optional(),
  receiverName: z.string().trim().min(2, "Receiver name is required."),
  receiverPhone: z.string().trim().min(7, "Receiver phone is required."),
  receiverIdNumber: z.string().trim().optional(),
  relationship: z.enum(["SELF", "AGENT", "EMPLOYEE", "FAMILY"]),
  note: z.string().trim().optional(),
})
  .refine((v) => Boolean(v.shipmentQr || v.pickupNoteId), {
    message: "Scan the cargo label to confirm.",
    path: ["shipmentQr"],
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
  /*
    THE ROLES, ASKED FOR RATHER THAN LISTED.

    This was a hand-typed list of five, and when the Manager role was added the
    dropdown offered it while this refused it — so creating a manager failed with
    a raw validator message on the owner's screen. Changing an existing person TO
    manager worked the whole time, because that path checks against ROLE_LABELS,
    which is a Record<Role, …> the compiler forces you to complete.

    That is the difference worth keeping: a typed map is a build error when a role
    is added, a string array is a runtime surprise found by a user. Reading the
    enum Prisma generates means this list cannot fall behind the database again.

    (Not to be confused with `rank` below, whose OPERATOR/MANAGER is a warehouse
    grade and has nothing to do with this field despite sharing a word.)
  */
  role: z.nativeEnum(Role, {
    errorMap: () => ({ message: "Choose a role for them." }),
  }),
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
