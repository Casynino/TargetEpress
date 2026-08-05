import { z } from "zod";
import { PrismaClient, Prisma } from "@prisma/client";
import { can } from "./lib/rbac";
import { toNumber } from "./lib/format";

const prisma = new PrismaClient();

// EXACT copy of the schema in adjustInvoice (lib/actions/finance.ts:442-476)
const schema = z.object({
  invoiceId: z.string().trim().min(1, "Missing invoice."),
  discount: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : 0))
    .refine((v) => Number.isFinite(v) && v >= 0, "The discount is not a valid amount."),
  otherCharges: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : 0))
    .refine((v) => Number.isFinite(v) && v >= 0, "That charge is not a valid amount."),
  exchangeRate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 100 && v <= 100_000),
      "rate"
    ),
  notes: z.string().trim().optional(),
  freightOverride: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "freight"),
  freightOverrideReason: z.string().trim().optional(),
});

// What a Customer Care agent's browser actually posts from InvoiceEditor:
// freightOverride and discount inputs are disabled => omitted from FormData.
const posted = new FormData();
posted.set("invoiceId", "PLACEHOLDER");
posted.set("otherCharges", "0");
posted.set("exchangeRate", "2700");
posted.set("notes", "customer says he collects Thursday");

const parsed = schema.safeParse(Object.fromEntries(posted) as Record<string, string>);
console.log("=== 1. zod parse of the Customer-Care payload ===");
console.log(JSON.stringify(parsed, null, 2));

console.log("\n=== 2. RBAC ===");
for (const p of ["invoice.edit", "invoice.discount", "finance.view"] as const) {
  console.log(`CUSTOMER_CARE can ${p}: ${can("CUSTOMER_CARE" as never, p)}`);
}

console.log("\n=== 3. Live invoices that carry a freight override ===");
const overridden = await prisma.invoice.findMany({
  where: { freightOverride: { not: null } },
  select: {
    invoiceNumber: true,
    status: true,
    freightCost: true,
    freightOverride: true,
    freightOverrideReason: true,
    storageCharge: true,
    otherCharges: true,
    discount: true,
    amountPaid: true,
    total: true,
    exchangeRate: true,
    totalLocal: true,
  },
});
for (const i of overridden) {
  console.log({
    invoiceNumber: i.invoiceNumber,
    status: i.status,
    rateBookFreight: toNumber(i.freightCost),
    freightOverride: i.freightOverride === null ? null : toNumber(i.freightOverride),
    reason: i.freightOverrideReason,
    storage: toNumber(i.storageCharge),
    otherCharges: toNumber(i.otherCharges),
    discount: toNumber(i.discount),
    amountPaid: toNumber(i.amountPaid),
    total: toNumber(i.total),
    totalLocal: i.totalLocal === null ? null : toNumber(i.totalLocal),
  });
}

console.log("\n=== 4. Replay of the adjustInvoice guard body for each of them ===");
const input = parsed.success ? parsed.data : null;
for (const i of overridden) {
  if (!input) break;
  const role = "CUSTOMER_CARE" as never;
  const paid = toNumber(i.amountPaid);
  const rateBook = toNumber(i.freightCost);
  const prev = i.freightOverride === null ? null : toNumber(i.freightOverride);
  const lines: string[] = [];
  if (paid > 0) {
    lines.push("BLOCKED: money already received");
  } else {
    const discountChanged = input.discount !== toNumber(i.discount);
    if (discountChanged && !can(role, "invoice.discount")) {
      lines.push("BLOCKED: discount guard (invoice carries a discount)");
    } else {
      const overrideChanged = input.freightOverride !== prev;
      let blocked = false;
      if (overrideChanged && input.freightOverride !== null) {
        blocked = true;
        lines.push("BLOCKED: freight guard");
      }
      if (!blocked) {
        const freight = input.freightOverride ?? rateBook;
        const total = freight + toNumber(i.storageCharge) + input.otherCharges - input.discount;
        lines.push(
          `PASSES. overrideChanged=${overrideChanged} freightUsed=${freight} ` +
            `oldTotal=${toNumber(i.total)} newTotal=${total} delta=${(total - toNumber(i.total)).toFixed(2)} ` +
            `freightOverride -> null, freightOverrideReason -> null`
        );
      }
    }
  }
  console.log(i.invoiceNumber, "::", lines.join(" | "));
}

console.log("\n=== 5. Audit metadata that would be written (fields only) ===");
console.log(Object.keys({ discount: 0, otherCharges: 0, exchangeRate: 0, notes: "" }));

await prisma.$disconnect();
