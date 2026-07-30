"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { parseQrPayload } from "@/lib/qr";
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

  const scannedToken = parseQrPayload(input.shipmentQr);
  if (!scannedToken) {
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
      const note = await tx.pickupNote.findUnique({
        where: { id: input.pickupNoteId },
        select: {
          id: true,
          noteNumber: true,
          status: true,
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              qrToken: true,
              status: true,
            },
          },
        },
      });
      if (!note) throw new Error("Pickup note not found.");
      if (note.status === "USED") {
        throw new Error(
          `${note.noteNumber} has already been used. This cargo was collected.`
        );
      }
      if (note.status === "CANCELLED") {
        throw new Error(`${note.noteNumber} was cancelled by Finance.`);
      }

      // The scanned carton must be the exact shipment on the note.
      if (note.shipment.qrToken !== scannedToken) {
        throw new Error(
          `The scanned cargo is not the one on this pickup note (${note.shipment.trackingNumber}). Do not release it.`
        );
      }
      if (note.shipment.status !== "READY_FOR_PICKUP") {
        throw new Error("This shipment is not cleared for release.");
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
