import { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma";
import { autoPriceShipments } from "./lib/auto-price";

const cust = await prisma.customer.findFirst({ select: { id: true, name: true } });
const user = await prisma.user.findFirst({ select: { id: true, name: true } });
if (!cust || !user) throw new Error("need a customer and a user");

const stamp = Date.now();
const ship = await prisma.shipment.create({
  data: {
    trackingNumber: `ZZTEST-${stamp}`,
    qrToken: `zztest-${stamp}`,
    customerId: cust.id,
    cargoCategory: "NORMAL_GOODS",
    goodsType: "GENERAL_MERCHANDISE",
    description: "THROWAWAY probe cargo",
    packages: 1,
    weightKg: new Prisma.Decimal(9.8),   // 9.8 kg -> under-10 tier at 13.5/kg = 132.30
    origin: "GUANGZHOU",
    status: "IN_TRANSIT",
  },
  select: { id: true, trackingNumber: true },
});

const show = async (label: string) => {
  const inv = await prisma.invoice.findUnique({
    where: { shipmentId: ship.id },
    select: {
      invoiceNumber: true, status: true, currency: true,
      freightCost: true, freightOverride: true, freightOverrideReason: true,
      storageCharge: true, otherCharges: true, discount: true,
      total: true, exchangeRate: true, totalLocal: true,
    },
  });
  console.log(`\n--- ${label} ---`);
  console.log(inv ? {
    no: inv.invoiceNumber, status: inv.status,
    freightCost: inv.freightCost.toString(),
    freightOverride: inv.freightOverride?.toString() ?? null,
    reason: inv.freightOverrideReason,
    storage: inv.storageCharge.toString(),
    otherCharges: inv.otherCharges.toString(),
    discount: inv.discount.toString(),
    TOTAL: inv.total.toString(),
    totalLocal: inv.totalLocal?.toString() ?? null,
  } : "no invoice");
  return inv;
};

try {
  // 1. Dar check-in prices it. This is what verifyShipment's tail call does.
  const first = await autoPriceShipments([ship.id], user.id);
  console.log("run 1:", first);
  await show("after first check-in (auto-priced draft)");

  // 2. Finance edits the DRAFT on the flight page. Exactly the writes
  //    adjustInvoice performs: override 120 + reason, other charges 15,
  //    total = override + storage + other - discount.
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { shipmentId: ship.id },
    select: { id: true, storageCharge: true, exchangeRate: true },
  });
  const freight = 120, storage = Number(inv.storageCharge), other = 15, discount = 0;
  const total = freight + storage + other - discount;
  const rate = inv.exchangeRate ? Number(inv.exchangeRate) : null;
  await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      freightOverride: new Prisma.Decimal(freight),
      freightOverrideReason: "Agreed with the customer on the phone",
      otherCharges: new Prisma.Decimal(other),
      discount: new Prisma.Decimal(discount),
      total: new Prisma.Decimal(total),
      totalLocal: rate === null ? null : new Prisma.Decimal(total * rate),
    },
  });
  const edited = await show("after Finance's adjustInvoice on the DRAFT");

  // 3. Warehouse re-opens the same line (second pass at check-in). The tail of
  //    verifyShipment runs this again, because `arrived` is true and `landed`
  //    is the shipment id regardless of prior status.
  const second = await autoPriceShipments([ship.id], user.id);
  console.log("\nrun 2:", second);
  const after = await show("after the SECOND check-in re-run");

  console.log("\n=== VERDICT ===");
  console.log("total before re-run:", edited?.total.toString());
  console.log("total after  re-run:", after?.total.toString());
  console.log("override still stored:", after?.freightOverride?.toString() ?? null,
              "| reason still stored:", after?.freightOverrideReason);
  console.log("otherCharges still stored:", after?.otherCharges.toString());
  console.log("money moved by:",
    Number(after?.total ?? 0) - Number(edited?.total ?? 0));
} finally {
  await prisma.invoice.deleteMany({ where: { shipmentId: ship.id } });
  await prisma.shipmentStatusHistory.deleteMany({ where: { shipmentId: ship.id } });
  await prisma.shipment.delete({ where: { id: ship.id } });
  const left = await prisma.shipment.count({ where: { trackingNumber: { startsWith: "ZZTEST-" } } });
  console.log("\nthrowaway rows left behind:", left);
  await prisma.$disconnect();
}
