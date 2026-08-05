import { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma";
import { toNumber, formatMoney } from "./lib/format";
import { quote } from "./lib/pricing";
import { currentRateValue, toLocal, LOCAL_CURRENCY } from "./lib/fx";
import { autoPriceShipments } from "./lib/auto-price";

const rate = (await currentRateValue())!;
const anyUser = await prisma.user.findFirst({ select: { id: true } });
let customerId = "", shipmentId = "", invoiceId = "";
try {
  const customer = await prisma.customer.create({ data: { code: "CUS-PROBE-9", name: "PROBE-DELETE-ME", phone: "+255700000999" } });
  customerId = customer.id;
  const shipment = await prisma.shipment.create({
    data: { trackingNumber: "TX-PROBE-9", customerId, cargoCategory: "NORMAL_GOODS", packageType: "CARTON",
      description: "PROBE", packages: 1, weightKg: new Prisma.Decimal(5.8), status: "RECEIVED_AT_DAR",
      arrivedAt: new Date(), qrToken: "probe-qr-9", goodsType: "GENERAL_MERCHANDISE", origin: "GUANGZHOU" },
  });
  shipmentId = shipment.id;
  const p = await quote({ category: "NORMAL_GOODS", cargoTypeId: null, weightKg: 5.8, quantity: 1 });
  if (!p.ok) throw new Error("x");
  const inv = await prisma.invoice.create({
    data: { invoiceNumber: "INV-PROBE-000009", shipmentId, customerId, currency: p.currency,
      freightCost: new Prisma.Decimal(p.total), storageDays: 0, storageCharge: new Prisma.Decimal(0),
      total: new Prisma.Decimal(p.total), exchangeRate: new Prisma.Decimal(rate), localCurrency: LOCAL_CURRENCY,
      totalLocal: new Prisma.Decimal(toLocal(p.total, rate)), status: "DRAFT", issuedById: anyUser?.id ?? null },
  });
  invoiceId = inv.id;

  // Finance adds a USD 40 customs-handling charge and a USD 10 goodwill discount (adjustInvoice)
  const adjTotal = p.total + 0 + 40 - 10;
  await prisma.invoice.update({ where: { id: invoiceId }, data: {
    otherCharges: new Prisma.Decimal(40), discount: new Prisma.Decimal(10),
    total: new Prisma.Decimal(adjTotal), totalLocal: new Prisma.Decimal(toLocal(adjTotal, rate)) } });
  let i = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  console.log("after adjustInvoice(other=40, disc=10)  other=" + i.otherCharges + " disc=" + i.discount + " total=" + i.total);

  // The clerk re-scans the same carton at Dar -> checkInShipment -> autoPriceShipments
  await autoPriceShipments([shipmentId], anyUser!.id);
  i = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  console.log("after a SECOND check-in (autoPrice)     other=" + i.otherCharges + " disc=" + i.discount + " total=" + i.total);
  console.log("  invoice lines say " + [toNumber(i.freightCost), "+", toNumber(i.otherCharges), "-", toNumber(i.discount), "=", (toNumber(i.freightCost)+toNumber(i.otherCharges)-toNumber(i.discount)).toFixed(2)].join(" ") + " but Total says " + i.total);
} finally {
  if (invoiceId) { await prisma.payment.deleteMany({ where: { invoiceId } }); await prisma.invoice.deleteMany({ where: { id: invoiceId } }); }
  if (shipmentId) { await prisma.shipmentStatusHistory.deleteMany({ where: { shipmentId } }); await prisma.shipment.deleteMany({ where: { id: shipmentId } }); }
  if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
  console.log("CLEANUP leftovers:", await prisma.shipment.count({ where: { trackingNumber: "TX-PROBE-9" } }), await prisma.invoice.count({ where: { invoiceNumber: "INV-PROBE-000009" } }), await prisma.customer.count({ where: { code: "CUS-PROBE-9" } }));
}

// ---- live aggregates: Payment.amount summed across currencies -------------
const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
const monthAgg = await prisma.payment.aggregate({ _sum: { amount: true } });
const byMethod = await prisma.payment.groupBy({ by: ["method"], _sum: { amount: true } });
const rows = await prisma.payment.findMany({ select: { amount: true, currency: true, creditedAmount: true } });
console.log("\n=== live payments ===");
for (const r of rows) console.log("  tendered", r.amount.toString(), r.currency, " credited", r.creditedAmount?.toString(), "USD");
console.log("payments page 'This month' card renders:", formatMoney(monthAgg._sum.amount));
for (const b of byMethod) console.log("  by method", b.method, "->", formatMoney(b._sum.amount));
const trueUsd = rows.reduce((s, r) => s + toNumber(r.creditedAmount), 0);
console.log("truth: USD", trueUsd.toFixed(2), "collected  = TZS", toLocal(trueUsd, rate).toLocaleString());
await prisma.$disconnect();
