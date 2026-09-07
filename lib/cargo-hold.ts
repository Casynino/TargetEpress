import type { InvoiceStatus } from "@prisma/client";

import type { TxClient } from "@/lib/prisma";

/**
 * PUTTING CARGO BACK ON THE SHELF WHEN ITS BILL REOPENS.
 *
 * Three doors in Finance can raise what a settled bill comes to: charging
 * storage, correcting the bill, and cutting a discount somebody granted. All
 * three move the status back off PAID, and the status is what the receivables
 * screens read — but it is NOT what lets the boxes out of the building. That is
 * the consignment's own status, and until now only the storage door moved it.
 *
 * So a bill corrected upward the morning after it was paid left the cargo
 * standing at READY_FOR_PICKUP holding a live pickup note. The counter had no
 * reason to refuse, the customer collected, and the difference Finance had just
 * discovered went with them out of the door.
 *
 * THE NOTE IS NOT CANCELLED, DELIBERATELY. `PickupNote.shipmentId` is unique, so
 * a consignment carries one note for its whole life and a cancelled one can
 * never be replaced — the customer would pay the new balance and find their
 * cargo permanently unreleasable, which is worse than the problem being solved.
 * Reverting the consignment is enough on its own: releaseShipment refuses
 * anything that is not READY_FOR_PICKUP, and paying puts it back.
 *
 * Returns what happened, because the audit line on each of those doors has to
 * be able to say it — including the case nobody can fix from a desk, where the
 * note has already been used and the cargo is long gone. That is a live debt
 * for somebody to chase, and it must be said out loud rather than left in a
 * status nobody reads.
 */
export type HoldOutcome = "held" | "already-collected" | "none";

export async function holdCargoUntilSettled(
  tx: TxClient,
  args: {
    shipment: {
      id: string;
      status: string;
      pickupNote: { noteNumber: string; status: string } | null;
    } | null;
    /** The status the bill has just been moved to. */
    nextStatus: InvoiceStatus | null;
    actorId: string;
    /** Why, in the words that go on the consignment's own timeline. */
    reason: string;
  }
): Promise<HoldOutcome> {
  const { shipment, nextStatus } = args;
  if (!shipment || !shipment.pickupNote) return "none";
  /* Still settled, or not a demand for money at all — nothing to hold for. */
  if (nextStatus === "PAID" || nextStatus === "DRAFT" || nextStatus === null) {
    return "none";
  }
  if (shipment.pickupNote.status === "USED") return "already-collected";
  if (shipment.pickupNote.status !== "ACTIVE") return "none";
  if (shipment.status !== "READY_FOR_PICKUP") return "held";

  await tx.shipment.update({
    where: { id: shipment.id },
    data: { status: "RECEIVED_AT_DAR" },
  });
  /* Said on the timeline, because a customer who was told their cargo is ready
     reads that page — and would otherwise find it still saying so while the
     counter turned them away. */
  await tx.shipmentStatusHistory.create({
    data: {
      shipmentId: shipment.id,
      fromStatus: "READY_FOR_PICKUP",
      toStatus: "RECEIVED_AT_DAR",
      location: "Dar es Salaam warehouse",
      note: args.reason,
      actorId: args.actorId,
    },
  });
  return "held";
}
