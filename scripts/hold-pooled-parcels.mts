import { prisma } from "@/lib/prisma";
import { poolHold } from "@/lib/minimum-pool";

/**
 * THE ONE-OFF PASS FOR CARGO CLEARED BEFORE THE RULE EXISTED.
 *
 * A parcel whose freight came to nothing — because a sibling on the same
 * flight carries the whole minimum — used to be cleared for collection the
 * moment Finance confirmed its price, while the charge stood unpaid. The rule
 * now holds those parcels, but cargo cleared under the old one is still
 * standing at READY_FOR_PICKUP with a live note: the list says ready and the
 * counter refuses it, which is the confusion this is here to end.
 *
 * So each one goes back to RECEIVED_AT_DAR, exactly where an unpaid
 * consignment sits. The owner's words: if something was not paid it should
 * look like everything else that was not paid.
 *
 * THE NOTE IS LEFT ALIVE, DELIBERATELY. PickupNote.shipmentId is unique, so a
 * cancelled note can never be replaced and the cargo would be unreleasable for
 * ever. Paying the charge puts the parcel back on the shelf against the note
 * it already holds — see clearPoolAfterPayment.
 *
 * NOTHING ABOUT MONEY IS TOUCHED. No bill, no total, no payment, no figure.
 * Only where the cargo stands.
 *
 *   npx tsx --conditions=react-server scripts/hold-pooled-parcels.mts         (dry run)
 *   npx tsx --conditions=react-server scripts/hold-pooled-parcels.mts --apply
 */
const apply = process.argv.includes("--apply");

const candidates = await prisma.shipment.findMany({
  where: { status: "READY_FOR_PICKUP", deliveredAt: null, deletedAt: null },
  select: {
    id: true,
    trackingNumber: true,
    customer: { select: { name: true } },
    batch: { select: { batchNumber: true } },
    pickupNote: { select: { noteNumber: true, status: true } },
  },
});

console.log(`${candidates.length} consignment(s) currently cleared for collection.`);

let held = 0;
for (const shipment of candidates) {
  const hold = await poolHold(shipment.id);
  if (!hold) continue;
  held += 1;
  console.log(
    `  ${shipment.trackingNumber}  ${shipment.customer.name}  ${shipment.batch?.batchNumber ?? "—"}` +
      `  → charge on ${hold.carrierTracking}, ${hold.currency} ${hold.owed.toFixed(2)} owing`
  );
  if (!apply) continue;

  await prisma.$transaction(async (tx) => {
    const moved = await tx.shipment.updateMany({
      where: { id: shipment.id, status: "READY_FOR_PICKUP" },
      data: { status: "RECEIVED_AT_DAR" },
    });
    if (moved.count === 0) return;
    await tx.shipmentStatusHistory.create({
      data: {
        shipmentId: shipment.id,
        fromStatus: "READY_FOR_PICKUP",
        toStatus: "RECEIVED_AT_DAR",
        location: "Dar es Salaam warehouse",
        note: `This parcel carries no charge of its own — the shared minimum is on ${hold.carrierTracking}, which is unpaid. Held until that is settled; the pickup note it holds stands.`,
      },
    });
  });
}

console.log(
  held === 0
    ? "Nothing to hold — no cleared parcel is waiting on an unpaid sibling."
    : apply
      ? `${held} parcel(s) put back to Received at Dar warehouse. No money was touched.`
      : `${held} parcel(s) would be put back. Re-run with --apply to do it.`
);
await prisma.$disconnect();
