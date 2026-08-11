/**
 * Put the operation back to "cargo is arriving in China".
 * Dry unless --commit. Prints the database it is pointed at first.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

function target() {
  const url = process.env.DATABASE_URL || "";
  const host = (url.match(/@([^/:?]+)/) || [])[1] || "unknown host";
  const name = (url.match(/\/([^/?]+)(\?|$)/) || [])[1] || "unknown db";
  return host + " / " + name;
}

(async () => {
  console.log("\nDatabase: " + target());
  console.log(COMMIT ? "Mode:     COMMIT — this writes\n" : "Mode:     dry run\n");

  const loading = await prisma.batch.findMany({
    where: { permanent: true },
    select: { id: true, batchNumber: true, origin: true },
  });
  if (!loading.length) throw new Error("No permanent loading batches found.");
  const byOrigin = new Map(loading.map(b => [b.origin, b]));

  // Children before parents: some cascade, some do not, and guessing which is
  // how a reset half-runs and leaves an orphan that breaks a page mid-demo.
  const history = [
    ["delivery records", () => prisma.deliveryRecord.deleteMany({})],
    ["pickup notes", () => prisma.pickupNote.deleteMany({})],
    ["receipts", () => prisma.receipt.deleteMany({})],
    ["payment proofs", () => prisma.paymentProof.deleteMany({})],
    /*
      The ledger goes before the things it points at, not after.

      LedgerEntry.payment, .expense and .transfer are all onDelete: Restrict —
      deliberately, because a bank line that can be orphaned is a bank line you
      cannot audit. Deleting payments first therefore fails on a foreign key
      and leaves the reset half-run: receipts and notes gone, the money still
      there. That is exactly how this script died the first time.
    */
    ["ledger entries", () => prisma.ledgerEntry.deleteMany({})],
    ["payments", () => prisma.payment.deleteMany({})],
    ["payment submissions", () => prisma.paymentSubmission.deleteMany({})],
    ["invoices", () => prisma.invoice.deleteMany({})],
    ["expense receipts", () => prisma.expenseReceipt.deleteMany({})],
    ["expenses", () => prisma.expense.deleteMany({})],
    ["account transfers", () => prisma.accountTransfer.deleteMany({})],
    ["cash counts", () => prisma.cashCount.deleteMany({})],
    ["compensations", () => prisma.compensation.deleteMany({})],
    ["exception events", () => prisma.exceptionEvent.deleteMany({})],
    ["exceptions", () => prisma.shipmentException.deleteMany({})],
    ["batch verifications", () => prisma.batchVerification.deleteMany({})],
    ["shipment photos", () => prisma.shipmentPhoto.deleteMany({})],
    ["status history", () => prisma.shipmentStatusHistory.deleteMany({})],
    ["field changes", () => prisma.fieldChange.deleteMany({})],
    ["notifications", () => prisma.notification.deleteMany({})],
    ["customer messages", () => prisma.customerMessage.deleteMany({})],
    ["ticket notes", () => prisma.ticketNote.deleteMany({})],
    ["support tickets", () => prisma.supportTicket.deleteMany({})],
    ["sourcing requests", () => prisma.sourcingRequest.deleteMany({})],
    ["booking requests", () => prisma.bookingRequest.deleteMany({})],
    ["pickup requests", () => prisma.pickupRequest.deleteMany({})],
    ["audit log", () => prisma.auditLog.deleteMany({})],
    ["login events", () => prisma.loginEvent.deleteMany({})],
  ];

  console.log("Clearing history:");
  if (!COMMIT) {
    history.forEach(([label]) => console.log("         " + label));
  } else {
    /*
      One transaction, because the first run of this was not.

      It died on a foreign key partway down the list and left receipts and
      pickup notes deleted with the payments and invoices they belonged to
      still standing — a database in a state the application has no name for.
      Either the whole history goes or none of it does.

      The timeout is generous on purpose: this is a hundred-odd thousand rows
      across thirty tables, and the default five seconds is a rollback waiting
      to happen on a link to a database in another country.
    */
    const results = await prisma.$transaction(
      history.map(([, run]) => run()),
      { timeout: 180000, maxWait: 30000 }
    );
    results.forEach((r, i) =>
      console.log(String(r.count).padStart(8) + "  " + history[i][0])
    );
  }

  const shipments = await prisma.shipment.findMany({ select: { id: true, origin: true } });
  const orphans = [...new Set(shipments.filter(s => !byOrigin.has(s.origin)).map(s => s.origin))];
  if (orphans.length) throw new Error("No loading table for origin(s): " + orphans.join(", "));

  console.log("\nReturning cargo to the loading tables:");
  for (const [origin, batch] of byOrigin) {
    const ids = shipments.filter(s => s.origin === origin).map(s => s.id);
    console.log(String(ids.length).padStart(8) + "  -> " + batch.batchNumber);
    if (!COMMIT || !ids.length) continue;
    await prisma.shipment.updateMany({
      where: { id: { in: ids } },
      data: {
        batchId: batch.id,
        status: "READY_TO_DEPART",
        // The storage clock is derived from arrivedAt: leaving it set would
        // read as "6 days in Dar" on a screen saying it never left China.
        departedAt: null, arrivedAt: null, readyForPickup: null, deliveredAt: null,
        deletedAt: null, deletedById: null, deleteReason: null,
      },
    });
  }

  const pkgs = await prisma.package.count();
  console.log("\nPackages:\n" + String(pkgs).padStart(8) + "  received / delivered stamps cleared");
  if (COMMIT) {
    await prisma.package.updateMany({ where: {}, data: { receivedAt: null, receivedById: null, deliveredAt: null } });
  }

  const flown = await prisma.batch.findMany({ where: { permanent: false }, select: { id: true, batchNumber: true } });
  console.log("\nRemoving dispatched batches:");
  if (!flown.length) console.log("         (none)");
  flown.forEach(b => console.log("         " + b.batchNumber));
  if (COMMIT && flown.length) {
    await prisma.batch.deleteMany({ where: { id: { in: flown.map(b => b.id) } } });
    await prisma.batch.updateMany({
      where: { permanent: true },
      data: { status: "OPEN", departedAt: null, arrivedAt: null, verifiedAt: null, closedAt: null,
              departureDate: null, arrivalDate: null, airline: null, flightNumber: null, waybillNumber: null },
    });
  }

  if (!COMMIT) { console.log("\nNothing written. Re-run with --commit.\n"); await prisma.$disconnect(); return; }

  console.log("\nAfter:");
  for (const r of await prisma.shipment.groupBy({ by: ["status"], _count: true })) {
    console.log(String(r._count).padStart(8) + "  " + r.status);
  }
  for (const b of await prisma.batch.findMany({ select: { batchNumber: true, status: true, _count: { select: { shipments: true } } }, orderBy: { batchNumber: "asc" } })) {
    console.log("          " + b.batchNumber.padEnd(14) + b.status.padEnd(10) + b._count.shipments + " cargo");
  }
  console.log("  kept:");
  for (const [l, n] of [["customers", await prisma.customer.count()], ["staff", await prisma.user.count()],
                        ["cargo types", await prisma.cargoType.count()], ["company accounts", await prisma.companyAccount.count()]])
    console.log(String(n).padStart(8) + "  " + l);
  console.log("  cleared:");
  for (const [l, n] of [["invoices", await prisma.invoice.count()], ["payments", await prisma.payment.count()],
                        ["pickup notes", await prisma.pickupNote.count()], ["deliveries", await prisma.deliveryRecord.count()],
                        ["open cases", await prisma.shipmentException.count()]])
    console.log(String(n).padStart(8) + "  " + l);
  console.log("\nThe cargo is on the loading tables in China.\n");
  await prisma.$disconnect();
})().catch(e => { console.error("\nFailed:", e.message); process.exitCode = 1; });
