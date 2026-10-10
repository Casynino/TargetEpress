import "server-only";

import { recordAudit } from "@/lib/audit";
import { nextPickupNoteNumber } from "@/lib/ids";
import { poolHold, poolShareFor } from "@/lib/minimum-pool";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * PAYING THE CHARGE RELEASES EVERY PARCEL IT WAS CHARGED FOR.
 *
 * The other half of poolHold. A customer's small parcels on one flight share
 * the route's minimum: one bill carries it and the rest come to nothing, and
 * none of them may be collected until that one bill is settled. The moment it
 * is, the parcels it paid for have to become collectable by themselves —
 * otherwise the customer has paid in full and is still turned away, which is
 * worse than the leak the hold was closing.
 *
 * RUN AFTER THE PAYMENT COMMITS, NOT INSIDE IT. Working out a pool asks the
 * rate book per consignment, and a read loop has no business inside the
 * transaction that is holding a receipt. A failure here costs nothing that
 * cannot be recovered: the money is recorded, the parcels stay held, and the
 * next payment or the counter's own check clears them.
 *
 * Only what the counter would do anyway: a note is minted for a parcel whose
 * own bill asks for nothing, that is standing on the Dar floor, has no note
 * already and no investigation open — the same four conditions every other
 * door applies.
 */
export async function clearPoolAfterPayment(
  shipmentId: string,
  actor: SessionUser
): Promise<string[]> {
  const share = await poolShareFor(shipmentId);
  /* Only the bill that carries the charge releases the others. */
  if (!share || !share.carries) return [];

  const siblings = share.memberTrackings.filter(
    (tn) => tn !== share.carrierTracking
  );
  if (siblings.length === 0) return [];

  const cleared: string[] = [];
  for (const trackingNumber of siblings) {
    const shipment = await prisma.shipment.findUnique({
      where: { trackingNumber },
      select: {
        id: true,
        status: true,
        customerId: true,
        pickupNote: { select: { id: true } },
        invoice: { select: { currency: true, status: true } },
        exceptions: {
          where: { status: { in: ["OPEN", "UNDER_INVESTIGATION"] } },
          select: { id: true },
        },
      },
    });
    if (!shipment) continue;
    if (shipment.status !== "RECEIVED_AT_DAR") continue;
    if (shipment.exceptions.length > 0) continue;
    if (!shipment.invoice) continue;
    if (shipment.invoice.status !== "PAID") continue;
    /* Asked again rather than assumed: the charge may have been part-paid, or
       another parcel of the same customer may carry its own hold. */
    if (await poolHold(shipment.id)) continue;

    /*
      A NOTE IT ALREADY HOLDS IS THE CLEARANCE.

      Cargo cleared before this rule existed, and pulled back off the shelf by
      the catch-up, keeps its note: PickupNote.shipmentId is unique, so a
      cancelled one can never be replaced and cancelling would strand the
      cargo for ever. Paying the charge simply makes it collectable again —
      the same thing paying storage does.
    */
    if (shipment.pickupNote) {
      try {
        await prisma.$transaction(async (tx) => {
          const moved = await tx.shipment.updateMany({
            where: { id: shipment.id, status: "RECEIVED_AT_DAR" },
            data: { status: "READY_FOR_PICKUP", readyForPickup: new Date() },
          });
          if (moved.count === 0) throw new Error("moved underneath us");
          await tx.shipmentStatusHistory.create({
            data: {
              shipmentId: shipment.id,
              fromStatus: "RECEIVED_AT_DAR",
              toStatus: "READY_FOR_PICKUP",
              location: "Dar es Salaam warehouse",
              note: `The shared minimum on ${share.carrierTracking} was paid. This parcel carries no charge of its own; the note it holds stands.`,
              actorId: actor.id,
            },
          });
        });
        cleared.push(trackingNumber);
      } catch (error) {
        console.error("Could not clear a pooled parcel after payment", {
          trackingNumber,
          error,
        });
      }
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const note = await tx.pickupNote.create({
          data: {
            noteNumber: await nextPickupNoteNumber(tx),
            shipmentId: shipment.id,
            customerId: shipment.customerId,
            amountPaid: 0,
            currency: shipment.invoice!.currency,
            issuedById: actor.id,
          },
        });
        /* Claimed on the status it was read at, so a parcel somebody moved in
           between is left alone rather than dragged onto the ready shelf. */
        const moved = await tx.shipment.updateMany({
          where: { id: shipment.id, status: "RECEIVED_AT_DAR" },
          data: { status: "READY_FOR_PICKUP", readyForPickup: new Date() },
        });
        if (moved.count === 0) throw new Error("moved underneath us");
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: "RECEIVED_AT_DAR",
            toStatus: "READY_FOR_PICKUP",
            location: "Dar es Salaam warehouse",
            note: `The shared minimum on ${share.carrierTracking} was paid. This parcel carries no charge of its own. Pickup note ${note.noteNumber} issued.`,
            actorId: actor.id,
          },
        });
        await recordAudit(
          {
            actor,
            action: "pickupNote.issue",
            entity: "Shipment",
            entityId: shipment.id,
            summary: `${trackingNumber} cleared for collection — the shared minimum was paid on ${share.carrierTracking}`,
            metadata: {
              pickupNote: note.noteNumber,
              carrier: share.carrierTracking,
              pooledFreight: share.pooledFreight,
            },
          },
          tx
        );
      });
      cleared.push(trackingNumber);
    } catch (error) {
      console.error("Could not clear a pooled parcel after payment", {
        trackingNumber,
        error,
      });
    }
  }
  return cleared;
}
