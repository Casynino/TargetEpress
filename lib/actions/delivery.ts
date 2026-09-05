"use server";

import { revalidatePath } from "next/cache";

import { recordAudit, withNote } from "@/lib/audit";
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
/**
 * A handover that never happened.
 *
 * Releasing is the one act in this system that says the cargo is no longer
 * ours: the delivery record is written, the pickup note is spent, every box is
 * marked handed over and the storage clock stops. It is also the only one that
 * had no way back — so a release recorded against the wrong consignment, or
 * during a test, was permanent, and the cargo sat "Delivered" while the boxes
 * were still on the shelf.
 *
 * The exact inverse of releaseShipment, and it hides nothing. The delivery
 * record goes and the proof-of-delivery photographs go with it, because a
 * photograph captioned "Released to Ronald Uisso" against a handover that is
 * being retracted is worse than no photograph — but the audit line keeps who
 * was named, when, and why it was taken back. That is the same trade voidInvoice
 * makes: the row goes, the record of the row does not.
 *
 * The pickup note returns to ACTIVE, which is precisely where it stood a second
 * before the release. That is deliberately not the end of the story — if the
 * money has since been taken back too, the note has to be cancelled through its
 * own door, and this says so rather than guessing which the operator meant.
 *
 * Management only. Dar hands cargo over; unwinding a handover is a correction
 * of the record, and the desk that made the mistake is not the desk that
 * should be able to erase it.
 */
export async function undoRelease(
  _prev: ActionResult<{ trackingNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("delivery.undo");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  /* Optional. Taking a handover back is loud enough on its own — the cargo
     goes back on the shelf and the audit line names who did it. */
  const reason = String(formData.get("reason") ?? "").trim();
  if (!shipmentId) return fail(t(locale, "Missing cargo."));

  try {
    const trackingNumber = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          trackingNumber: true,
          status: true,
          deliveredAt: true,
          delivery: {
            select: { id: true, receiverName: true, releasedAt: true },
          },
          pickupNote: { select: { id: true, noteNumber: true, status: true } },
        },
      });
      if (!shipment) throw new Error(t(locale, "That cargo no longer exists."));
      if (shipment.status !== "DELIVERED") {
        throw new Error(t(locale, "This cargo has not been handed over."));
      }

      await tx.deliveryRecord.deleteMany({ where: { shipmentId: shipment.id } });

      /* The proof of a handover that is being retracted. Deleted with the
         record it belongs to, never left behind to be found later by somebody
         reading it as evidence the cargo went out. */
      const photos = await tx.shipmentPhoto.deleteMany({
        where: { shipmentId: shipment.id, kind: "PROOF_OF_DELIVERY" },
      });

      await tx.package.updateMany({
        where: { shipmentId: shipment.id },
        data: { deliveredAt: null },
      });

      /* Back to the state the release moved it out of. The note goes with it:
         it was spent by this handover and nothing else. */
      if (shipment.pickupNote && shipment.pickupNote.status === "USED") {
        await tx.pickupNote.update({
          where: { id: shipment.pickupNote.id },
          data: { status: "ACTIVE", usedAt: null },
        });
      }

      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: "READY_FOR_PICKUP", deliveredAt: null },
      });

      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: "DELIVERED",
          toStatus: "READY_FOR_PICKUP",
          location: "Dar es Salaam warehouse",
          note: reason ? `Handover taken back: ${reason}` : "Handover taken back",
          actorId: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "shipment.releaseUndone",
          entity: "Shipment",
          entityId: shipment.id,
          summary: withNote(`Took back the handover of ${shipment.trackingNumber}`, reason),
          /* Everything the deleted record said, kept here instead. */
          metadata: {
            reason,
            receiverName: shipment.delivery?.receiverName ?? null,
            releasedAt: shipment.delivery?.releasedAt?.toISOString() ?? null,
            pickupNote: shipment.pickupNote?.noteNumber ?? null,
            deliveryPhotosRemoved: photos.count,
          },
        },
        tx
      );

      return shipment.trackingNumber;
    });

    revalidatePath(`/app/cargo/${trackingNumber}`);
    revalidatePath("/app/release");
    revalidatePath("/app/pickup-queue");
    revalidatePath("/app/inventory");
    return ok({ trackingNumber });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

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
  /*
    Found is not the same as proved.

    A tracking number typed by hand resolves to the same consignment a scan
    would, and is how the counter gets past a label it cannot read. It is not
    evidence the carton was on the counter, so everything below that asks "was
    this box in somebody's hand" asks THIS, and the handover photograph carries
    the proof instead — the same footing as the unreadable-label list.
  */
  const provedByScan = scanned !== null && scanned.typed !== true;
  if (input.shipmentQr && !scanned) {
    return fail(t(locale, "That code is not a Target Express label."));
  }
  if (!scanned && !input.pickupNoteId) {
    return fail(t(locale, "Scan the cargo label to confirm."));
  }

  /*
    Evidence is expected, never enforced.

    A photo at this moment is worth more than any note written later, so the
    form asks for one plainly and says why. But the owner's rule is that it
    must not STOP the work: a clerk with a flat battery, a broken camera or a
    customer already walking out of the door still has to be able to record
    what happened. A block here does not produce a photo — it produces a
    consignment that never gets recorded at all, which is strictly worse than
    one recorded without a picture.
  */
  const photoFiles = filesFrom(formData, "photos");

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
        throw new Error(t(locale, "This cargo is not cleared for release."));
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
          `${t(locale, "Only")} ${progress.received}/${progress.total} ${t(locale, "packages have been checked in. Still missing:")} ${missing}${t(locale, ". Do not release a partial consignment.")}`
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
          note: provedByScan
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
            scannedPackage: provedByScan
              ? (scanned!.package?.reference ?? "shipment label")
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
