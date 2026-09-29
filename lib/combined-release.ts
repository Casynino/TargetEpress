import "server-only";

import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { outstandingOf } from "@/lib/invoice-balance";
import type { Locale } from "@/lib/locale";
import { findPickupLock, pickupLockMessage } from "@/lib/pickup-lock";
import { prisma } from "@/lib/prisma";

/**
 * A CARTON WITH SEVERAL CONSIGNMENTS TAPED INSIDE IT, AT THE COUNTER.
 *
 * Dar packs a customer's parcels into one carton so they travel as one piece.
 * Every box inside keeps its own label, its own tick on the manifest and its
 * own bill — and the release counter clears ONE consignment at a time, so
 * handing the carton over used to be refused outright: the boxes taped to it
 * might be unpaid, and a clerk should not be settling several bills by
 * pressing one button.
 *
 * That refusal was right about the danger and wrong about the remedy. The
 * warehouse cannot open a taped carton to hand over one parcel — the owner's
 * words: "why can't they release merged, if the payment is merged they should
 * be able to" — so the counter was left with cargo it could neither release
 * nor take apart, and the customer went home empty-handed.
 *
 * So the rule becomes a test rather than a wall: the carton goes out when
 * EVERY consignment in it is ready to go out on its own. Each one is put
 * through exactly the checks it would face if it were scanned by itself —
 * a live pickup note, cleared for pickup, every box on the floor, no
 * investigation open. One of them failing refuses the carton and says which
 * one and why, so the counter can tell the customer something true.
 *
 * THE SAME-CUSTOMER RULE IS THE REASON THIS IS SAFE. A combination cannot
 * span two people — the model carries customerId and the action that builds
 * one refuses to mix — so releasing the carton hands one person their own
 * goods. It is checked again here anyway: the one fact this whole thing rests
 * on is not one to take on trust from another file.
 */
export type CartonMember = {
  shipmentId: string;
  trackingNumber: string;
  noteId: string | null;
  noteNumber: string | null;
  /** Ready to leave on its own terms. */
  ready: boolean;
  /** Why not, in the words the counter reads out. Null when ready. */
  reason: string | null;
  boxesHere: number;
  boxesTotal: number;
  /** The one that was scanned — it is released by the ordinary path. */
  scanned: boolean;
};

export type LiveCarton = {
  reference: string;
  customerId: string;
  customerName: string;
  members: CartonMember[];
  /** Every consignment in it may go. */
  allReady: boolean;
};

export async function cartonFor(
  shipmentId: string,
  locale: Locale
): Promise<LiveCarton | null> {
  const box = await prisma.package.findFirst({
    where: {
      shipmentId,
      combinationId: { not: null },
      combination: { undoneAt: null },
    },
    select: {
      combination: {
        select: {
          id: true,
          reference: true,
          customerId: true,
          customer: { select: { name: true } },
          members: { select: { shipmentId: true } },
        },
      },
    },
  });
  const carton = box?.combination;
  if (!carton) return null;

  const shipmentIds = Array.from(
    new Set(carton.members.map((m) => m.shipmentId))
  );
  const shipments = await prisma.shipment.findMany({
    where: { id: { in: shipmentIds } },
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      customerId: true,
      packageList: { select: { receivedAt: true } },
      pickupNote: { select: { id: true, noteNumber: true, status: true } },
      invoice: {
        select: {
          total: true,
          amountPaid: true,
          amountAdjusted: true,
          currency: true,
          storageCharge: true,
          storageDays: true,
        },
      },
    },
  });

  const members: CartonMember[] = [];
  for (const shipment of shipments) {
    const boxesTotal = shipment.packageList.length;
    const boxesHere = shipment.packageList.filter(
      (p) => p.receivedAt !== null
    ).length;
    const lock = await findPickupLock(prisma, shipment.id);
    const owing = shipment.invoice ? outstandingOf(shipment.invoice) : 0;
    const storage = shipment.invoice
      ? toNumber(shipment.invoice.storageCharge)
      : 0;

    /* In the order the counter needs to hear them: whose goods these are, then
       whether anything is wrong with the cargo, then whether it is paid for. */
    let reason: string | null = null;
    if (shipment.customerId !== carton.customerId) {
      reason = t(locale, "belongs to another customer — do not release");
    } else if (lock) {
      reason = pickupLockMessage(lock, shipment.trackingNumber, locale);
    } else if (boxesHere < boxesTotal) {
      reason = `${boxesHere}/${boxesTotal} ${t(locale, "boxes here")}`;
    } else if (owing > 0.005 && storage > 0.005) {
      reason = `${t(locale, "STORAGE OUTSTANDING — DO NOT RELEASE")} · ${shipment.invoice!.storageDays} ${t(locale, "day(s) of storage beyond the free week")}`;
    } else if (!shipment.pickupNote) {
      reason = t(locale, "no pickup note — Finance has not cleared it");
    } else if (shipment.pickupNote.status === "USED") {
      reason = t(locale, "already collected");
    } else if (shipment.pickupNote.status !== "ACTIVE") {
      reason = t(locale, "the pickup note was cancelled");
    } else if (shipment.status !== "READY_FOR_PICKUP") {
      reason = t(locale, "not cleared for release — check the payment");
    }

    members.push({
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      noteId: shipment.pickupNote?.id ?? null,
      noteNumber: shipment.pickupNote?.noteNumber ?? null,
      ready: reason === null,
      reason,
      boxesHere,
      boxesTotal,
      scanned: shipment.id === shipmentId,
    });
  }

  members.sort((a, b) =>
    a.scanned === b.scanned
      ? a.trackingNumber.localeCompare(b.trackingNumber)
      : a.scanned
        ? -1
        : 1
  );

  return {
    reference: carton.reference,
    customerId: carton.customerId,
    customerName: carton.customer?.name ?? "—",
    members,
    allReady: members.every((m) => m.ready),
  };
}
