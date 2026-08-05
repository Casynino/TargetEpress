import { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma";
import { toNumber } from "./lib/format";
import { nextReceiptNumber, nextPickupNoteNumber } from "./lib/ids";

// ---------------------------------------------------------------------------
// Throwaway fixture. Everything created here is deleted at the end.
// ---------------------------------------------------------------------------
const TAG = "ZZRACE" + Date.now();

const user = await prisma.user.findFirst({ select: { id: true } });
if (!user) throw new Error("no user");

const customer = await prisma.customer.create({
  data: { code: `CUS-${TAG}`, name: `ZZ Race Probe ${TAG}` },
});

async function makeFixture(label: string) {
  const shipment = await prisma.shipment.create({
    data: {
      trackingNumber: `TX-${TAG}-${label}`,
      qrToken: `TXQ${TAG}${label}`,
      customerId: customer.id,
      goodsType: "GENERAL_MERCHANDISE",
      description: "race probe",
      packages: 1,
      weightKg: new Prisma.Decimal(10),
      origin: "GUANGZHOU",
      status: "RECEIVED_AT_DAR",
      currency: "USD",
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-${TAG}-${label}`,
      shipmentId: shipment.id,
      customerId: customer.id,
      currency: "USD",
      freightCost: new Prisma.Decimal(100),
      total: new Prisma.Decimal(100),
      amountPaid: new Prisma.Decimal(0),
      status: "UNPAID",
      exchangeRate: new Prisma.Decimal(2700),
      issuedAt: new Date(Date.now() - 86400000),
    },
  });
  return { shipment, invoice };
}

// ---------------------------------------------------------------------------
// A faithful replica of the recordPayment transaction body, in the same
// operation order: read invoice -> compute -> payment.create -> counter upsert
// (nextReceiptNumber) -> receipt.create -> invoice.update -> pickup note.
// `beforeWrite` lets us hold the transaction open after the read, to prove the
// window exists; with it set to a no-op the two run at natural speed.
// ---------------------------------------------------------------------------
async function recordPaymentReplica(
  invoiceId: string,
  amount: number,
  beforeWrite: () => Promise<void>
) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        amountPaid: true,
        status: true,
        currency: true,
        exchangeRate: true,
        issuedAt: true,
        shipment: { select: { id: true, trackingNumber: true } },
      },
    });
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status === "VOID") throw new Error("This invoice is void.");
    if (invoice.status === "DRAFT") throw new Error("draft");

    const total = toNumber(invoice.total);
    const paid = toNumber(invoice.amountPaid);
    const outstanding = total - paid;
    if (outstanding <= 0) throw new Error("This invoice is already settled.");

    const credited = amount;
    if (credited > outstanding + 0.001) throw new Error("overpayment refused");

    await beforeWrite();

    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: new Prisma.Decimal(amount),
        currency: "USD",
        creditedAmount: new Prisma.Decimal(credited),
        method: "CASH",
        receivedById: null,
      },
    });

    const receipt = await tx.receipt.create({
      data: { receiptNumber: await nextReceiptNumber(tx), paymentId: payment.id },
    });

    const newPaid = paid + credited;
    const settled = newPaid + 0.001 >= total;

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: new Prisma.Decimal(newPaid),
        status: settled ? "PAID" : "PARTIALLY_PAID",
      },
    });

    let note: string | null = null;
    if (settled) {
      const shipment = await tx.shipment.findUnique({
        where: { id: invoice.shipment.id },
        select: {
          id: true,
          status: true,
          customerId: true,
          pickupNote: { select: { id: true, status: true } },
          exceptions: { where: { status: { in: ["OPEN", "UNDER_INVESTIGATION"] } }, select: { id: true } },
        },
      });
      const alreadyActive = shipment?.pickupNote?.status === "ACTIVE";
      const blocked = (shipment?.exceptions.length ?? 0) > 0;
      const atDar = shipment?.status === "RECEIVED_AT_DAR";
      if (shipment && !alreadyActive && !blocked && atDar) {
        const pn = await tx.pickupNote.create({
          data: {
            noteNumber: await nextPickupNoteNumber(tx),
            shipmentId: shipment.id,
            customerId: shipment.customerId,
            amountPaid: new Prisma.Decimal(newPaid),
            currency: invoice.currency,
          },
        });
        await tx.shipment.update({
          where: { id: shipment.id },
          data: { status: "READY_FOR_PICKUP", readyForPickup: new Date() },
        });
        note = pn.noteNumber;
      }
    }
    return { receipt: receipt.receiptNumber, note };
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function report(label: string, f: { shipment: { id: string }; invoice: { id: string } }) {
  const inv = await prisma.invoice.findUnique({
    where: { id: f.invoice.id },
    select: { total: true, amountPaid: true, status: true },
  });
  const pays = await prisma.payment.findMany({
    where: { invoiceId: f.invoice.id },
    select: { amount: true, creditedAmount: true },
  });
  const ship = await prisma.shipment.findUnique({
    where: { id: f.shipment.id },
    select: { status: true, pickupNote: { select: { noteNumber: true, status: true } } },
  });
  const tendered = pays.reduce((s, p) => s + toNumber(p.amount), 0);
  console.log(`\n--- ${label} ---`);
  console.log("payment rows   :", pays.map((p) => toNumber(p.amount)).join(" + "), "=", tendered);
  console.log("invoice.total  :", inv && toNumber(inv.total));
  console.log("invoice.paid   :", inv && toNumber(inv.amountPaid), " status:", inv?.status);
  console.log("shipment       :", ship?.status, " note:", JSON.stringify(ship?.pickupNote));
  console.log("UNACCOUNTED    :", tendered - (inv ? toNumber(inv.amountPaid) : 0));
}

const created: { shipmentId: string; invoiceId: string }[] = [];

try {
  // === A. Forced interleave: both read, then both write =====================
  const A = await makeFixture("A");
  created.push({ shipmentId: A.shipment.id, invoiceId: A.invoice.id });
  let readsDone = 0;
  const barrier = async () => {
    readsDone += 1;
    while (readsDone < 2) await sleep(5);
  };
  const rA = await Promise.allSettled([
    recordPaymentReplica(A.invoice.id, 60, barrier),
    recordPaymentReplica(A.invoice.id, 40, barrier),
  ]);
  console.log("A outcomes:", rA.map((r) => (r.status === "fulfilled" ? JSON.stringify(r.value) : "REJECTED: " + (r.reason as Error).message)));
  await report("A. forced interleave, 60 + 40 against USD 100", A);

  // === B. Natural race: fired together, no instrumentation =================
  const B = await makeFixture("B");
  created.push({ shipmentId: B.shipment.id, invoiceId: B.invoice.id });
  const noop = async () => {};
  const rB = await Promise.allSettled([
    recordPaymentReplica(B.invoice.id, 60, noop),
    recordPaymentReplica(B.invoice.id, 40, noop),
  ]);
  console.log("B outcomes:", rB.map((r) => (r.status === "fulfilled" ? JSON.stringify(r.value) : "REJECTED: " + (r.reason as Error).message)));
  await report("B. natural race, 60 + 40 against USD 100", B);

  // === C. Settle-while-part-pay: cargo released on a part-paid invoice =====
  const C = await makeFixture("C");
  created.push({ shipmentId: C.shipment.id, invoiceId: C.invoice.id });
  let reads2 = 0;
  const barrier2 = async () => {
    reads2 += 1;
    while (reads2 < 2) await sleep(5);
  };
  const rC = await Promise.allSettled([
    recordPaymentReplica(C.invoice.id, 100, barrier2),
    (async () => {
      await sleep(30); // let the settling one go first
      return recordPaymentReplica(C.invoice.id, 30, barrier2);
    })(),
  ]);
  console.log("C outcomes:", rC.map((r) => (r.status === "fulfilled" ? JSON.stringify(r.value) : "REJECTED: " + (r.reason as Error).message)));
  await report("C. 100 (settles) + 30 concurrent", C);
} finally {
  // ---- cleanup: remove every throwaway row ---------------------------------
  for (const c of created) {
    await prisma.deliveryRecord.deleteMany({ where: { shipmentId: c.shipmentId } });
    await prisma.pickupNote.deleteMany({ where: { shipmentId: c.shipmentId } });
    const pays = await prisma.payment.findMany({ where: { invoiceId: c.invoiceId }, select: { id: true } });
    await prisma.receipt.deleteMany({ where: { paymentId: { in: pays.map((p) => p.id) } } });
    await prisma.paymentProof.deleteMany({ where: { paymentId: { in: pays.map((p) => p.id) } } });
    await prisma.payment.deleteMany({ where: { invoiceId: c.invoiceId } });
    await prisma.invoice.deleteMany({ where: { id: c.invoiceId } });
    await prisma.shipmentStatusHistory.deleteMany({ where: { shipmentId: c.shipmentId } });
    await prisma.shipment.deleteMany({ where: { id: c.shipmentId } });
  }
  await prisma.customer.deleteMany({ where: { id: customer.id } });
  const leftInv = await prisma.invoice.count({ where: { invoiceNumber: { contains: TAG } } });
  const leftShip = await prisma.shipment.count({ where: { trackingNumber: { contains: TAG }, deletedAt: undefined } });
  const leftCust = await prisma.customer.count({ where: { code: { contains: TAG } } });
  console.log(`\nCLEANUP: invoices=${leftInv} shipments=${leftShip} customers=${leftCust} (all must be 0)`);
  await prisma.$disconnect();
}
