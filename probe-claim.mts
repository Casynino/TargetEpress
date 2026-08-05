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
    otherCharges: true,
    discount: true,
    total: true,
    amountPaid: true,
    confirmedAt: true,
    shipment: { select: { trackingNumber: true, batchId: true } },
  },
  orderBy: { invoiceNumber: "asc" },
});

const n = (d: any) => (d === null ? null : Number(d));
console.log("invoices carrying a freight override:", rows.length);
for (const r of rows) {
  const ov = n(r.freightOverride)!;
  const rb = n(r.freightCost)!;
  const st = n(r.storageCharge)!;
  const oc = n(r.otherCharges)!;
  const di = n(r.discount)!;
  const expectedWithOverride = ov + st + oc - di;
  const expectedRateBook = rb + st + oc - di;
  const actual = n(r.total)!;
  console.log(
    JSON.stringify({
      inv: r.invoiceNumber,
      track: r.shipment.trackingNumber,
      status: r.status,
      confirmed: r.confirmedAt ? "yes" : "no",
      rateBookFreight: rb,
      financeOverride: ov,
      reason: r.freightOverrideReason,
      storage: st,
      other: oc,
      discount: di,
      billedTotal: actual,
      shouldBeIfOverrideHonoured: expectedWithOverride,
      matchesRateBook: Math.abs(actual - expectedRateBook) < 0.005,
      overbilledBy: +(actual - expectedWithOverride).toFixed(2),
    })
  );
}
await prisma.$disconnect();
