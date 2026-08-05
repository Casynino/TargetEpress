import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const withOverride = await prisma.invoice.findMany({
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
    total: true,
    totalLocal: true,
    amountPaid: true,
    shipment: { select: { trackingNumber: true, batchId: true } },
  },
});
console.log(JSON.stringify(withOverride, null, 2));

await prisma.$disconnect();
