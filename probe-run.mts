import { register } from "node:module";
import { pathToFileURL } from "node:url";

process.env.PROBE_ROOT = process.cwd();
register(pathToFileURL(`${process.cwd()}/probe-loader.mjs`).href);

const { prisma } = await import("./lib/prisma");

const care = await prisma.user.findFirstOrThrow({ where: { role: "CUSTOMER_CARE" } });
process.env.PROBE_USER_ID = care.id;
process.env.PROBE_USER_NAME = care.name;
process.env.PROBE_USER_EMAIL = care.email;
process.env.PROBE_USER_ROLE = care.role;
process.env.PROBE_USER_DEPT = care.department;
console.log("acting as:", care.email, care.role);

const stamp = Date.now();
const customer = await prisma.customer.create({
  data: { code: `PROBE-${stamp}`, name: "PROBE THROWAWAY" },
});
const shipment = await prisma.shipment.create({
  data: {
    trackingNumber: `PROBE-${stamp}`,
    qrToken: `probe-${stamp}`,
    customerId: customer.id,
    goodsType: "GENERAL_MERCHANDISE",
    description: "probe",
    packages: 1,
    weightKg: 9,
    origin: "GUANGZHOU",
  },
});
const invoice = await prisma.invoice.create({
  data: {
    invoiceNumber: `PROBE-INV-${stamp}`,
    shipmentId: shipment.id,
    customerId: customer.id,
    freightCost: "78.30",          // rate book
    freightOverride: "120.00",     // Finance's figure
    freightOverrideReason: "re-weighed on the floor scale at 8.9 kg",
    storageCharge: "0",
    otherCharges: "0",
    discount: "0",
    total: "120.00",
    amountPaid: "0",
    status: "UNPAID",              // confirmed, not a draft
    exchangeRate: "2700",
    totalLocal: "324000",
    notes: "Collect at Kariakoo counter",
  },
});
console.log("BEFORE:", {
  total: invoice.total.toString(),
  freightCost: invoice.freightCost.toString(),
  freightOverride: invoice.freightOverride?.toString(),
  reason: invoice.freightOverrideReason,
  totalLocal: invoice.totalLocal?.toString(),
});

// EXACTLY what the browser posts from InvoiceEditor when the signed-in role
// lacks invoice.discount: the freight box and the discount box are `disabled`,
// so the HTML form omits them entirely. The reason box IS rendered (override
// 120 != rate book 78.30) and is required, so the agent types something.
const fd = new FormData();
fd.set("invoiceId", invoice.id);
fd.set("otherCharges", "");
fd.set("exchangeRate", "2700");
fd.set("notes", "AWB 123-45678901");
fd.set("freightOverrideReason", "customer says agreed 120");
console.log("POST body:", Object.fromEntries(fd));

const { adjustInvoice } = await import("./lib/actions/finance");
const res = await adjustInvoice(undefined, fd);
console.log("ACTION RESULT:", JSON.stringify(res));

const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
console.log("AFTER:", {
  total: after.total.toString(),
  freightCost: after.freightCost.toString(),
  freightOverride: after.freightOverride?.toString() ?? null,
  reason: after.freightOverrideReason,
  totalLocal: after.totalLocal?.toString(),
  notes: after.notes,
});
console.log("DELTA USD:", Number(invoice.total) - Number(after.total));

// clean up everything this probe created
await prisma.auditLog.deleteMany({ where: { entityId: invoice.id } });
await prisma.invoice.delete({ where: { id: invoice.id } });
await prisma.shipment.delete({ where: { id: shipment.id } });
await prisma.customer.delete({ where: { id: customer.id } });
const left = await prisma.customer.count({ where: { code: `PROBE-${stamp}` } });
console.log("cleanup ok, probe customers left:", left);
await prisma.$disconnect();
