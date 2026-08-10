"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { packageProgress, resolveScannedCode } from "@/lib/packages";
import { findPickupLock, pickupLockMessage } from "@/lib/pickup-lock";
import { prisma } from "@/lib/prisma";
import { filesFrom, putImages } from "@/lib/storage";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError, releaseSchema } from "@/lib/validation";

/**
 * Handing cargo over.
 *
 * Two things must agree before anything leaves the building: the pickup note
 * Finance issued, and the QR physically on the carton. Matching them here — in
 * one transaction, against the database rather than the operator's memory — is
 * the whole point of the QR system.
 */
export async function releaseShipment(
  _prev: ActionResult<{ trackingNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("shipment.release");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = releaseSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  const scanned = await resolveScannedCode(input.shipmentQr);
  if (!scanned) {
    return fail("That code is not a Target Express label.");
  }

  // Proof of handover. Required before anything leaves the building, and
  // enforced here rather than only in the form.
  const photoFiles = filesFrom(formData, "photos");
  if (photoFiles.length === 0) {
    return fail(
      "Take a photo of the cargo being handed over before completing the release."
    );
  }

  let uploaded;
  try {
    uploaded = await putImages(photoFiles, "delivery");
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    const trackingNumber = await prisma.$transaction(async (tx) => {
      /**
       * The note follows the cargo, not the other way round.
       *
       * One scan of the carton is the whole identification: a package label
       * resolves to its shipment, and a shipment has one open pickup note. The
       * counter used to choose the note from a list and then scan to prove the
       * choice — two steps where the second could only ever agree with the
       * first, and the first could be wrong.
       *
       * Every guard below is unchanged. Finding the note this way is stricter
       * than choosing it: a clerk cannot land on another customer's note.
       */
      const note = await tx.pickupNote.findFirst({
        where: input.pickupNoteId
          ? { id: input.pickupNoteId }
          : { shipmentId: scanned.shipmentId, status: "ACTIVE" },
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          noteNumber: true,
          status: true,
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              status: true,
              packageType: true,
              packageList: {
                select: {
                  id: true,
                  sequence: true,
                  receivedAt: true,
                  deliveredAt: true,
                },
                orderBy: { sequence: "asc" },
              },
            },
          },
        },
      });
      if (!note) {
        // Said in the counter's terms: the cargo is real and in front of them,
        // what is missing is Finance's clearance to hand it over.
        throw new Error(
          "No pickup note is open for this cargo. Finance issues one once the invoice is settled — check the payment first."
        );
      }
      if (note.status === "USED") {
        throw new Error(
          `${note.noteNumber} has already been used. This cargo was collected.`
        );
      }
      if (note.status === "CANCELLED") {
        throw new Error(`${note.noteNumber} was cancelled by Finance.`);
      }

      // The scanned carton must belong to the exact shipment on the note. A
      // package label resolves to its shipment, so scanning any one of the five
      // boxes is enough to identify the consignment.
      if (note.shipment.id !== scanned.shipmentId) {
        throw new Error(
          `The scanned cargo is not the one on this pickup note (${note.shipment.trackingNumber}). Do not release it.`
        );
      }
      if (note.shipment.status !== "READY_FOR_PICKUP") {
        throw new Error("This shipment is not cleared for release.");
      }

      // The investigation lock, and it is checked here rather than only in the
      // queue because this is the last point at which anything can be stopped.
      // A shipment can be READY_FOR_PICKUP, fully paid, every box ticked in —
      // and still be under investigation for damage, wrong contents, or a box
      // nobody can find. The shipment status answers "has Finance cleared it";
      // it does not answer "may this leave the building", and only an open case
      // answers that. The lock lifts by itself when the case reaches
      // CARGO_FOUND or is closed; nobody has to remember to unlock anything.
      const lock = await findPickupLock(tx, note.shipment.id);
      if (lock) {
        throw new Error(pickupLockMessage(lock, note.shipment.trackingNumber));
      }

      // Everything the customer paid for has to be on the floor. Handing over
      // four of five boxes and sorting it out later is how a claim starts, so
      // the release simply does not happen.
      const progress = packageProgress(
        note.shipment.packageList,
        note.shipment.packageType
      );
      if (!progress.complete) {
        throw new Error(
          `Only ${progress.received} of ${progress.total} packages have been checked in — ${progress.missing.map((n) => `package ${n}`).join(", ")} still missing. Do not release a partial shipment.`
        );
      }

      const now = new Date();

      await tx.deliveryRecord.create({
        data: {
          shipmentId: note.shipment.id,
          pickupNoteId: note.id,
          receiverName: input.receiverName,
          receiverPhone: input.receiverPhone,
          receiverIdNumber: input.receiverIdNumber || null,
          relationship: input.relationship,
          note: input.note || null,
          releasedById: user.id,
          releasedAt: now,
        },
      });

      await tx.shipmentPhoto.createMany({
        data: uploaded.map((image) => ({
          shipmentId: note.shipment.id,
          url: image.url,
          kind: "PROOF_OF_DELIVERY" as const,
          caption: `Released to ${input.receiverName}`,
          uploadedById: user.id,
        })),
      });

      await tx.pickupNote.update({
        where: { id: note.id },
        data: { status: "USED", usedAt: now },
      });

      await tx.shipment.update({
        where: { id: note.shipment.id },
        data: { status: "DELIVERED", deliveredAt: now },
      });

      // Every box left with the customer, so every box is marked handed over.
      await tx.package.updateMany({
        where: { shipmentId: note.shipment.id, deliveredAt: null },
        data: { deliveredAt: now },
      });

      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: note.shipment.id,
          fromStatus: "READY_FOR_PICKUP",
          toStatus: "DELIVERED",
          location: "Collected by customer",
          note: `Released to ${input.receiverName} against ${note.noteNumber}.`,
          actorId: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "shipment.release",
          entity: "Shipment",
          entityId: note.shipment.id,
          summary: `Released ${note.shipment.trackingNumber} to ${input.receiverName}`,
          metadata: {
            pickupNote: note.noteNumber,
            receiverPhone: input.receiverPhone,
            relationship: input.relationship,
            deliveryPhotos: uploaded.length,
            packagesReleased: note.shipment.packageList.length,
            scannedPackage: scanned.package?.reference ?? "shipment label",
          },
        },
        tx
      );

      return note.shipment.trackingNumber;
    });

    revalidatePath("/app/release");
    revalidatePath("/app/dashboard");
    return ok({ trackingNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}
