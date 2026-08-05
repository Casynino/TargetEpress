import { prisma } from "./lib/prisma";
import { toNumber } from "./lib/format";
import { STORAGE_POLICY, storageDaysFor } from "./lib/constants";

const drafts = await prisma.invoice.findMany({
  where: { status: "DRAFT" },
  select: {
    invoiceNumber: true,
    status: true,
    total: true,
    freightCost: true,
    freightOverride: true,
    storageDays: true,
    storageCharge: true,
    discount: true,
    otherCharges: true,
    currency: true,
    exchangeRate: true,
    totalLocal: true,
    sentAt: true,
    issuedAt: true,
    customer: { select: { name: true, phone: true } },
    shipment: {
      select: { trackingNumber: true, arrivedAt: true, deliveredAt: true, weightKg: true },
    },
  },
  orderBy: { issuedAt: "asc" },
  take: 12,
});

console.log("DRAFT invoices in live DB:", drafts.length);
const now = new Date();
for (const d of drafts) {
  const storedDays = d.storageDays;
  const liveDays = storageDaysFor(d.shipment.arrivedAt, d.shipment.deliveredAt, now);
  const storedTotal = toNumber(d.total);
  const wouldBe =
    toNumber(d.freightCost) +
    liveDays * STORAGE_POLICY.perDayUsd +
    toNumber(d.otherCharges) -
    toNumber(d.discount);
  console.log(
    [
      d.invoiceNumber,
      d.shipment.trackingNumber,
      `arrived=${d.shipment.arrivedAt?.toISOString().slice(0, 10) ?? "-"}`,
      `storedDays=${storedDays}`,
      `liveDays=${liveDays}`,
      `PAGE/WhatsApp total=${d.currency} ${storedTotal.toFixed(2)}`,
      `confirm-would-give=${d.currency} ${wouldBe.toFixed(2)}`,
      `delta=${(wouldBe - storedTotal).toFixed(2)}`,
      `sentAt=${d.sentAt?.toISOString() ?? "null"}`,
      `phone=${d.customer.phone ? "yes" : "no"}`,
    ].join(" | ")
  );
}

const counts = await prisma.invoice.groupBy({ by: ["status"], _count: { _all: true } });
console.log("\nInvoice status counts:", JSON.stringify(counts));

const overrides = await prisma.invoice.count({ where: { freightOverride: { not: null } } });
console.log("invoices with freightOverride set:", overrides);

await prisma.$disconnect();
