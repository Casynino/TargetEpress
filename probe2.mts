import { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma";
import { toNumber } from "./lib/format";
import { quote } from "./lib/pricing";
import { currentRateValue, toLocal, LOCAL_CURRENCY } from "./lib/fx";
import { STORAGE_POLICY, storageDaysFor } from "./lib/constants";

const rate = await currentRateValue();
console.log("PUBLISHED RATE USD->TZS:", rate);
console.log("STORAGE_POLICY:", STORAGE_POLICY);

// ---- a real DRAFT invoice from the live DB -------------------------------
const inv = await prisma.invoice.findFirst({
  where: { invoiceNumber: "INV-2026-000086" },
  include: { shipment: true },
});
if (!inv) throw new Error("no such invoice");
const s = inv.shipment;
const priced = await quote({
  category: s.cargoCategory,
  cargoTypeId: s.cargoTypeId,
  weightKg: toNumber(s.weightKg),
  quantity: s.packages,
});
if (!priced.ok) throw new Error("unpriceable");
const storageDays = storageDaysFor(s.arrivedAt, s.deliveredAt);
const storageCharge = storageDays * STORAGE_POLICY.perDayUsd;

console.log("\n=== INV-2026-000086 (live DRAFT) ===");
console.log("rate-book freight  :", priced.total, priced.currency, `(${priced.method} @ ${priced.rate})`);
console.log("storageDays/charge :", storageDays, storageCharge);
console.log("stored total       :", inv.total.toString());

// --- what adjustInvoice would compute with a freight override -------------
const OVERRIDE = 120.00;
const adjTotal = OVERRIDE + storageCharge + toNumber(inv.otherCharges) - toNumber(inv.discount);
console.log("\nadjustInvoice(freightOverride=120.00, reason='re-weighed'):");
console.log("  total  ->", adjTotal.toFixed(2), " totalLocal ->", rate === null ? null : toLocal(adjTotal, rate));

// --- what confirmInvoicePrice would then compute --------------------------
const confTotal = priced.total + storageCharge + toNumber(inv.otherCharges) - toNumber(inv.discount);
console.log("confirmInvoicePrice() immediately after (freightOverride is NOT read):");
console.log("  total  ->", confTotal.toFixed(2), " totalLocal ->", rate === null ? null : toLocal(confTotal, rate));
console.log("  freightOverride column still says:", OVERRIDE.toFixed(2));
console.log("  >>> billed", confTotal.toFixed(2), "instead of", adjTotal.toFixed(2), " => USD", (adjTotal - confTotal).toFixed(2), "lost");

// --- what each document then prints ---------------------------------------
console.log("\nPDF route   freight line :", (OVERRIDE).toFixed(2), " total:", confTotal.toFixed(2), " (lines sum to", (OVERRIDE + storageCharge).toFixed(2) + ")");
console.log("Screen page freight line :", priced.total.toFixed(2), " total:", confTotal.toFixed(2));

await prisma.$disconnect();
