import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const drafts = await prisma.invoice.count({ where: { status: "DRAFT" } });
const withOverride = await prisma.invoice.count({ where: { freightOverride: { not: null } } });
console.log("DRAFT invoices:", drafts, "| invoices carrying an override:", withOverride);

const sample = await prisma.invoice.findMany({
  where: { status: "DRAFT" },
  take: 5,
  select: {
    invoiceNumber: true,
    status: true,
    freightCost: true,
    freightOverride: true,
    storageCharge: true,
    otherCharges: true,
    discount: true,
    total: true,
    amountPaid: true,
    exchangeRate: true,
    totalLocal: true,
    shipment: {
      select: {
        id: true,
        trackingNumber: true,
        cargoCategory: true,
        cargoTypeId: true,
        weightKg: true,
        packages: true,
        arrivedAt: true,
        deliveredAt: true,
        batchId: true,
      },
    },
  },
});
for (const s of sample) console.log(JSON.stringify(s));

// Which batches have drafts sitting on them (the Confirm-all target)?
const byBatch = await prisma.invoice.groupBy({
  by: ["status"],
  _count: true,
});
console.log("invoice status counts:", byBatch);

await prisma.$disconnect();
