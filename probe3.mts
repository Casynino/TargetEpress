import { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma";
import { toNumber } from "./lib/format";
import { quote } from "./lib/pricing";
import { currentRateValue, toLocal, LOCAL_CURRENCY } from "./lib/fx";
import { STORAGE_POLICY, storageDaysFor } from "./lib/constants";
import { autoPriceShipments } from "./lib/auto-price";

const TAG = "PROBE-DELETE-ME";
const rate = (await currentRateValue())!;
const anyUser = await prisma.user.findFirst({ select: { id: true } });

let customerId = "", shipmentId = "", invoiceId = "";
try {
  const customer = await prisma.customer.create({
    data: { code: "CUS-PROBE-9", name: TAG, phone: "+255700000999" },
  });
  customerId = customer.id;
  const shipment = await prisma.shipment.create({
    data: {
      trackingNumber: "TX-PROBE-9",
      customerId,
      cargoCategory: "NORMAL_GOODS",
      packageType: "CARTON",
      description: TAG,
      packages: 1,
      weightKg: new Prisma.Decimal(5.8),
      status: "RECEIVED_AT_DAR",
      arrivedAt: new Date(),
      qrToken: "probe-qr-token-9",
      goodsType: "GENERAL_MERCHANDISE",
      origin: "GUANGZHOU",
    },
  });
  shipmentId = shipment.id;

  const priced = await quote({ category: "NORMAL_GOODS", cargoTypeId: null, weightKg: 5.8, quantity: 1 });
  if (!priced.ok) throw new Error("unpriceable");
  const total0 = priced.total;
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-PROBE-000009",
      shipmentId,
      customerId,
      currency: priced.currency,
      freightCost: new Prisma.Decimal(priced.total),
      storageDays: 0,
      storageCharge: new Prisma.Decimal(0),
      total: new Prisma.Decimal(total0),
      exchangeRate: new Prisma.Decimal(rate),
      localCurrency: LOCAL_CURRENCY,
      totalLocal: new Prisma.Decimal(toLocal(total0, rate)),
      status: "DRAFT",
      issuedById: anyUser?.id ?? null,
    },
  });
  invoiceId = invoice.id;
  const show = async (label: string) => {
    const i = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    console.log(
      label.padEnd(42),
      "status=" + i.status.padEnd(16),
      "freightCost=" + i.freightCost.toString().padEnd(8),
      "freightOverride=" + String(i.freightOverride).padEnd(8),
      "total=" + i.total.toString().padEnd(8),
      "totalLocal=" + String(i.totalLocal),
      "paid=" + i.amountPaid.toString()
    );
  };
  await show("after auto-price / generateInvoice");

  // ---- adjustInvoice: exact body, freightOverride = 120.00 ----------------
  {
    const i = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const freight = 120.00;
    const storage = toNumber(i.storageCharge);
    const total = freight + storage + 0 - 0;
    const totalLocal = toLocal(total, rate);
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        discount: new Prisma.Decimal(0),
        otherCharges: new Prisma.Decimal(0),
        freightOverride: new Prisma.Decimal(120.00),
        freightOverrideReason: "re-weighed on the floor scale",
        total: new Prisma.Decimal(total),
        exchangeRate: new Prisma.Decimal(rate),
        localCurrency: LOCAL_CURRENCY,
        totalLocal: new Prisma.Decimal(totalLocal),
      },
    });
  }
  await show("after adjustInvoice(override=120.00)");

  // ---- confirmInvoicePrice: exact body ------------------------------------
  {
    const i = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { shipment: true } });
    const priced2 = await quote({ category: i.shipment.cargoCategory, cargoTypeId: i.shipment.cargoTypeId, weightKg: toNumber(i.shipment.weightKg), quantity: i.shipment.packages });
    if (!priced2.ok) throw new Error("x");
    const storageDays = storageDaysFor(i.shipment.arrivedAt, i.shipment.deliveredAt);
    const storageCharge = storageDays * STORAGE_POLICY.perDayUsd;
    const total = priced2.total + storageCharge + toNumber(i.otherCharges) - toNumber(i.discount);
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        freightCost: new Prisma.Decimal(priced2.total),
        storageDays, storageCharge: new Prisma.Decimal(storageCharge),
        total: new Prisma.Decimal(total),
        exchangeRate: new Prisma.Decimal(rate),
        localCurrency: LOCAL_CURRENCY,
        totalLocal: new Prisma.Decimal(toLocal(total, rate)),
        status: "UNPAID", confirmedAt: new Date(), dueDate: new Date(),
      },
    });
  }
  await show("after confirmInvoicePrice()");

  // ---- and what autoPriceShipments would do to the same draft -------------
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "DRAFT", total: new Prisma.Decimal(120), freightOverride: new Prisma.Decimal(120) } });
  await show("reset to DRAFT w/ override 120");
  await autoPriceShipments([shipmentId], anyUser!.id);
  await show("after autoPriceShipments() re-check-in");

  // ---- Decimal(12,2) persistence of a non-2dp credited amount -------------
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "UNPAID", freightOverride: null, freightCost: new Prisma.Decimal(39.15), total: new Prisma.Decimal(39.15), amountPaid: new Prisma.Decimal(0) } });
  const total = 39.15;
  const tendered = 39.1451;            // same currency as the invoice -> NOT rounded
  const credited = tendered;           // finance.ts: credited = input.amount
  const outstanding = total - 0;
  console.log("\n--- same-currency tender 39.1451 against a 39.15 bill ---");
  console.log("overpay guard  credited > outstanding + 0.001 :", credited, ">", outstanding + 0.001, "=>", credited > outstanding + 0.001 ? "REJECT" : "ACCEPT");
  const newPaid = 0 + credited;
  const settled = newPaid + 0.001 >= total;
  console.log("settle test    newPaid + 0.001 >= total       :", newPaid + 0.001, ">=", total, "=>", settled);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { amountPaid: new Prisma.Decimal(newPaid), status: settled ? "PAID" : "PARTIALLY_PAID" } });
  const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  console.log("PERSISTED      amountPaid =", after.amountPaid.toString(), " total =", after.total.toString(), " status =", after.status);
  console.log("outstanding as every screen computes it       :", toNumber(after.total) - toNumber(after.amountPaid));
  console.log("recordPayment would now say                   :", (toNumber(after.total) - toNumber(after.amountPaid)) <= 0 ? '"This invoice is already settled."' : "accept more money");
  console.log("issuePickupNote would now say                 :", after.status !== "PAID" ? `"USD ${(toNumber(after.total)-toNumber(after.amountPaid)).toLocaleString()} is still outstanding on this invoice."` : "issues note");
} finally {
  if (invoiceId) await prisma.payment.deleteMany({ where: { invoiceId } });
  if (invoiceId) await prisma.invoice.deleteMany({ where: { id: invoiceId } });
  if (shipmentId) { await prisma.shipmentStatusHistory.deleteMany({ where: { shipmentId } }); await prisma.shipment.deleteMany({ where: { id: shipmentId } }); }
  if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.auditLog.deleteMany({ where: { summary: { contains: "PROBE" } } });
  const left = await prisma.shipment.count({ where: { trackingNumber: "TX-PROBE-9" } });
  console.log("\nCLEANUP: leftover probe shipments =", left, " invoices =", await prisma.invoice.count({ where: { invoiceNumber: "INV-PROBE-000009" } }), " customers =", await prisma.customer.count({ where: { code: "CUS-PROBE-9" } }));
  await prisma.$disconnect();
}
