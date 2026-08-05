import { prisma } from "./lib/prisma";

const users = await prisma.user.findMany({ select: { email: true, name: true, role: true, status: true } });
console.log("USERS:", JSON.stringify(users, null, 1));

const withOverride = await prisma.invoice.findMany({
  where: { freightOverride: { not: null } },
  select: { invoiceNumber: true, status: true, freightCost: true, freightOverride: true,
            freightOverrideReason: true, storageCharge: true, otherCharges: true, discount: true,
            total: true, amountPaid: true, exchangeRate: true, notes: true },
  take: 10,
});
console.log("INVOICES WITH OVERRIDE:", JSON.stringify(withOverride, null, 1));

const counts = await prisma.invoice.groupBy({ by: ["status"], _count: true });
console.log("INVOICE STATUS COUNTS:", JSON.stringify(counts));
await prisma.$disconnect();
