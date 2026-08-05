import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const rows = await prisma.invoice.findMany({
  where: { freightOverride: { not: null } },
  select: {
    invoiceNumber: true,
    status: true,
    currency: true,
    freightCost: true,
    freightOverride: true,
    freightOverrideReason: true,
    storageCharge: true,
    storageDays: true,
    otherCharges: true,
    discount: true,
    total: true,
    amountPaid: true,
    confirmedAt: true,
    updatedAt: true,
  },
  orderBy: { invoiceNumber: "asc" },
});
console.log("invoices WITH override:", rows.length);
for (const r of rows) {
  const fc = Number(r.freightCost);
  const fo = r.freightOverride === null ? null : Number(r.freightOverride);
  const st = Number(r.storageCharge);
  const oc = Number(r.otherCharges);
  const dc = Number(r.discount);
  const tot = Number(r.total);
  const usingOverride = (fo ?? fc) + st + oc - dc;
  const usingRateBook = fc + st + oc - dc;
  console.log({
    inv: r.invoiceNumber,
    status: r.status,
    freightCost: fc,
    freightOverride: fo,
    storage: st,
    other: oc,
    discount: dc,
    total: tot,
    sumWithOverride: usingOverride,
    sumWithRateBook: usingRateBook,
    totalMatchesOverride: Math.abs(usingOverride - tot) < 0.005,
    totalMatchesRateBook: Math.abs(usingRateBook - tot) < 0.005,
    paid: Number(r.amountPaid),
    reason: r.freightOverrideReason,
    confirmedAt: r.confirmedAt,
  });
}

const all = await prisma.invoice.count();
console.log("total invoices:", all);
await prisma.$disconnect();
