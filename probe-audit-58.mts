import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const inv = await prisma.invoice.findUnique({
  where: { invoiceNumber: "INV-2026-000058" },
  select: {
    id: true,
    shipmentId: true,
    issuedAt: true,
    confirmedAt: true,
    updatedAt: true,
    status: true,
    freightCost: true,
    freightOverride: true,
    total: true,
    totalLocal: true,
    exchangeRate: true,
    amountPaid: true,
    shipment: { select: { trackingNumber: true, weightKg: true, cargoCategory: true, cargoTypeId: true, packages: true } },
  },
});
console.log("INV-2026-000058:", JSON.stringify(inv, null, 2));

const audits = await prisma.auditLog.findMany({
  where: { OR: [{ entityId: inv?.id ?? "x" }, { entityId: inv?.shipmentId ?? "x" }] },
  orderBy: { createdAt: "asc" },
  select: { action: true, summary: true, createdAt: true, metadata: true },
});
console.log("\naudit trail (", audits.length, "rows )");
for (const a of audits) {
  console.log(a.createdAt.toISOString(), "|", a.action, "|", a.summary);
  console.log("      meta:", JSON.stringify(a.metadata));
}

const pays = await prisma.payment.findMany({
  where: { invoiceId: inv?.id ?? "x" },
  select: { amount: true, currency: true, creditedAmount: true, exchangeRate: true, paidAt: true },
});
console.log("\npayments:", JSON.stringify(pays, null, 2));

await prisma.$disconnect();
