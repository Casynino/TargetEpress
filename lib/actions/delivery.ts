"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";
import { packageProgress, resolveScannedCode } from "@/lib/packages";
import { findPickupLock, pickupLockMessage } from "@/lib/pickup-lock";
import { prisma } from "@/lib/prisma";
import { filesFrom, putImages } from "@/lib/storage";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError, releaseSchema } from "@/lib/validation";

/**
 * Handing cargo over.
 *
 * Two things must agree before anything leaves the building: the pickup note
 * Finance issued, and the QR physically on the carton. Matching them here — in
 * one transaction, against the database rather than the operator's memory — is
 * the whole point of the QR system.
 *
 * Every refusal below is read by the clerk standing at the counter, so it comes
 * back in the language that clerk works in. The locale is resolved from the
 * signed-in user rather than passed in: React calls a form action with
 * (previous state, FormData) and nothing else. What is written to the database
 * — the delivery note, the status history line, the audit summary — stays in
 * English, because both floors read those rows afterwards.
 */
export async function releaseShipment(
  _prev: ActionResult<{ trackingNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("shipment.release");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = releaseSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  /**
   * The scan, when there was one.
   *
   * A code identifies the cargo AND proves the box was in somebody's hand. A
   * pickup note id identifies it only — used when the label is unreadable, and
   * recorded below as exactly that.
   */
  const scanned = input.shipmentQr
    ? await resolveScannedCode(input.shipmentQr)
    : null;
  if (input.shipmentQr && !scanned) {
    return fail(t(locale, "That code is not a Target Express label."));
  }
  if (!scanned && !input.pickupNoteId) {
    return fail(t(locale, "Scan the cargo label to confirm."));
  }

  // Proof of handover. Required before anything leaves the building, and
  // enforced here rather than only in the form.
  const photoFiles = filesFrom(formData, "photos");
  if (photoFiles.length === 0) {
    return fail(
      t(
        locale,
        "Take a photo of the cargo being handed over before completing the release."
      )
    );
  }

  let uploaded;
  try {
    uploaded = await putImages(photoFiles, "delivery");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
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
          : { shipmentId: scanned!.shipmentId, status: "ACTIVE" },
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
          t(
            locale,
            "No pickup note is open for this cargo. Finance issues one once the invoice is settled — check the payment first."
          )
        );
      }
      if (note.status === "USED") {
        throw new Error(
          `${note.noteNumber} ${t(locale, "has already been used. This cargo was collected.")}`
        );
      }
      if (note.status === "CANCELLED") {
        throw new Error(
          `${note.noteNumber} ${t(locale, "was cancelled by Finance.")}`
        );
      }

      // The scanned carton must belong to the exact shipment on the note. A
      // package label resolves to its shipment, so scanning any one of the five
      // boxes is enough to identify the consignment.
      if (scanned && note.shipment.id !== scanned.shipmentId) {
        throw new Error(
          `${t(locale, "The scanned cargo is not the one on this pickup note")} (${note.shipment.trackingNumber})${t(locale, ". Do not release it.")}`
        );
      }
      if (note.shipment.status !== "READY_FOR_PICKUP") {
        throw new Error(t(locale, "This shipment is not cleared for release."));
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
        throw new Error(pickupLockMessage(lock, note.shipment.trackingNumber, locale));
      }

      // Everything the customer paid for has to be on the floor. Handing over
      // four of five boxes and sorting it out later is how a claim starts, so
      // the release simply does not happen.
      const progress = packageProgress(
        note.shipment.packageList,
        note.shipment.packageType
      , locale);
      if (!progress.complete) {
        // Built from fragments with the counts between them, because "3 of 5"
        // and the sentence around it do not sit in the same order in Chinese.
        // The boxes are named the way the sticker names them — TX-000125-P2 is
        // "P2" on the label — so the list itself needs no translation.
        const missing = progress.missing.map((n) => `P${n}`).join(", ");
        throw new Error(
          `${t(locale, "Only")} ${progress.received}/${progress.total} ${t(locale, "packages have been checked in. Still missing:")} ${missing}${t(locale, ". Do not release a partial shipment.")}`
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
          /*
            The record says when nothing was scanned.

            Written by the server, from whether a code actually arrived — not
            from a flag the browser could set. A handover backed only by a
            photograph must be distinguishable months later, when it is the
            thing a claim turns on.
          */
          note: scanned
            ? input.note || null
            : [
                "Released without scanning the label (label unreadable).",
                input.note?.trim(),
              ]
                .filter(Boolean)
                .join(" "),
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
            // The audit line says which box was read, or that none was.
            scannedPackage: scanned
              ? (scanned.package?.reference ?? "shipment label")
              : "none — label unreadable",
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
    return fail(t(locale, toActionError(error)));
  }
}
