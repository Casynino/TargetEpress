import { prisma } from "./lib/prisma";
import { toNumber } from "./lib/format";

const rates = await prisma.exchangeRate.findMany({ orderBy: { effectiveFrom: "desc" }, take: 5 });
console.log("RATES:", rates.map(r => ({ from: r.fromCurrency, to: r.toCurrency, rate: r.rate.toString(), active: r.active, eff: r.effectiveFrom.toISOString().slice(0,10) })));

const rules = await prisma.pricingRule.findMany({ where: { active: true }, orderBy: { effectiveFrom: "desc" } });
console.log("RULES:", rules.map(r => ({ cat: r.category, type: r.cargoTypeId, method: r.method, price: r.price.toString(), min: r.minWeightKg?.toString(), max: r.maxWeightKg?.toString(), cur: r.currency })));

const invs = await prisma.invoice.findMany({
  select: { invoiceNumber: true, status: true, currency: true, freightCost: true, freightOverride: true, freightOverrideReason: true, storageCharge: true, otherCharges: true, discount: true, total: true, amountPaid: true, exchangeRate: true, totalLocal: true, shipment: { select: { trackingNumber: true, weightKg: true, packages: true, cargoCategory: true, cargoTypeId: true, arrivedAt: true, deliveredAt: true } } },
  orderBy: { issuedAt: "desc" },
});
console.log("INVOICE COUNT:", invs.length);
for (const i of invs.slice(0, 25)) {
  console.log([i.invoiceNumber, i.status, i.currency, "freight=" + i.freightCost, "ovr=" + i.freightOverride, "stor=" + i.storageCharge, "other=" + i.otherCharges, "disc=" + i.discount, "total=" + i.total, "paid=" + i.amountPaid, "fx=" + i.exchangeRate, "wt=" + i.shipment.weightKg, "pk=" + i.shipment.packages, i.shipment.cargoCategory].join(" | "));
}
const pays = await prisma.payment.findMany({ select: { amount: true, currency: true, creditedAmount: true, exchangeRate: true, invoice: { select: { invoiceNumber: true, currency: true, total: true, amountPaid: true } } }, take: 20, orderBy: { createdAt: "desc" } });
console.log("PAYMENTS:", pays.length);
for (const p of pays) console.log([p.invoice.invoiceNumber, "tender=" + p.amount + " " + p.currency, "credited=" + p.creditedAmount, "fx=" + p.exchangeRate, "invtotal=" + p.invoice.total, "invpaid=" + p.invoice.amountPaid].join(" | "));
await prisma.$disconnect();
