"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";
import { notify } from "@/lib/notify";
import { prisma, type TxClient } from "@/lib/prisma";
import { caseReference, PICKUP_LOCKING_STATUSES } from "@/lib/pickup-lock";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Cargo the system says is here, and the floor cannot find.
 *
 * Two doors into the same room:
 *
 *   "Unable to Locate Cargo"  — the customer is standing at the counter and the
 *                               box is not on the shelf. The pickup stops.
 *   "Report Missing Cargo"    — the same discovery made before anyone arrives,
 *                               from the pickup queue or the cargo record.
 *
 * Both do exactly one thing to the world: they open an investigation. They do
 * NOT touch the shipment's status and they do NOT cancel the pickup note, and
 * that restraint is deliberate. The customer has paid; the note is Finance's to
 * cancel; and the cargo, when it turns up, has to fall straight back into
 * "Ready for Pickup" without anybody remembering to put it there. So the case
 * is the lock — see lib/pickup-lock.ts — and a case that reaches CARGO_FOUND
 * releases the cargo by itself.
 *
 * What is never done here: marking the shipment delivered, writing a status
 * history row (the public timeline would then read "Ready for pickup" in the
 * middle of an investigation), or guessing at a resolution.
 */

/** Minimum useful report. "Not found" helps nobody look for it. */
const MIN_NOTE = 5;

/**
 * Everyone who has to know a box has gone missing.
 *
 * The owner names two desks: Admin, who decides, and Customer Support, who
 * has to phone the customer before the customer phones them. Deactivated and
 * suspended accounts are skipped — a notification nobody can open is not a
 * notification.
 */
async function investigationAudience(tx: TxClient): Promise<string[]> {
  const rows = await tx.user.findMany({
    where: {
      role: { in: ["ADMIN", "CUSTOMER_CARE"] },
      active: true,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

type LossOrigin = "counter" | "queue";

type CargoRef = {
  id: string;
  trackingNumber: string;
  batchId: string | null;
  customerName: string;
};

/**
 * Open the case, or add to the one already open.
 *
 * Re-reporting is normal: two people look for the same box on the same
 * morning, or the counter tries again an hour later. A second row would split
 * one investigation into two half-answered ones, so an existing live case
 * absorbs the new report as another line on its timeline instead. The original
 * raiser stays the original raiser — that is the person who first could not
 * find it.
 */
async function openOrAppendLossCase(
  tx: TxClient,
  input: {
    cargo: CargoRef;
    user: SessionUser;
    note: string;
    origin: LossOrigin;
  }
): Promise<{ exceptionId: string; created: boolean }> {
  const { cargo, user, note, origin } = input;

  const where =
    origin === "counter"
      ? "at the pickup counter, with the customer present"
      : "on the warehouse floor before collection";
  const description = `Cargo could not be found ${where}. ${note}`;

  const existing = await tx.shipmentException.findFirst({
    where: {
      shipmentId: cargo.id,
      type: "MISSING_SHIPMENT",
      status: { in: PICKUP_LOCKING_STATUSES },
    },
    select: { id: true },
    orderBy: { raisedAt: "asc" },
  });

  if (existing) {
    await tx.exceptionEvent.create({
      data: {
        exceptionId: existing.id,
        action: "note.added",
        note: `Searched again and still not found — ${description}`,
        actorId: user.id,
      },
    });
    return { exceptionId: existing.id, created: false };
  }

  const created = await tx.shipmentException.create({
    data: {
      shipmentId: cargo.id,
      batchId: cargo.batchId,
      // The cargo is not where the records say it is. That is a missing
      // shipment however far down the chain it went astray, and it is the type
      // the pickup-note guard in Finance already refuses to issue against.
      type: "MISSING_SHIPMENT",
      status: "OPEN",
      description,
      raisedById: user.id,
      events: {
        create: {
          action: "opened",
          note: description,
          actorId: user.id,
        },
      },
    },
    select: { id: true },
  });

  // The record must stop claiming the cargo is here.
  //
  // Opening the case used to be the whole of it, which left a shipment reading
  // "Received at Dar warehouse", its boxes ticked, sitting in Inventory — while
  // its own case said "Missing shipment". The warehouse was asserting both that
  // it had the cargo and that it did not.
  //
  // So the shipment moves to UNDER_INVESTIGATION and its packages are un-ticked:
  // receivedAt records "this box is on the floor", and it is not. Only a
  // shipment that has not already been handed over is touched — a delivered or
  // cancelled shipment reported missing is a different problem, and rewinding
  // its status would erase a handover that really happened.
  const moved = await tx.shipment.updateMany({
    where: {
      id: cargo.id,
      status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] },
    },
    data: { status: "UNDER_INVESTIGATION" },
  });

  if (moved.count > 0) {
    await tx.package.updateMany({
      where: { shipmentId: cargo.id },
      data: { receivedAt: null, receivedById: null },
    });
    await tx.shipmentStatusHistory.create({
      data: {
        shipmentId: cargo.id,
        fromStatus: "RECEIVED_AT_DAR",
        toStatus: "UNDER_INVESTIGATION",
        location: "Dar es Salaam warehouse",
        note: description,
        actorId: user.id,
      },
    });
  }

  return { exceptionId: created.id, created: true };
}

/** Both entry points end the same way, so they say it the same way. */
async function announceLoss(
  tx: TxClient,
  input: {
    cargo: CargoRef;
    user: SessionUser;
    exceptionId: string;
    created: boolean;
    note: string;
    origin: LossOrigin;
  }
) {
  const { cargo, user, exceptionId, created, note, origin } = input;
  const ref = caseReference(exceptionId);

  await notify(
    {
      userIds: await investigationAudience(tx),
      kind: created ? "exception.cargoMissing" : "exception.cargoStillMissing",
      title: created
        ? `${cargo.trackingNumber} cannot be found`
        : `${cargo.trackingNumber} still not found`,
      body:
        `${cargo.customerName} — ` +
        (origin === "counter"
          ? "the customer was at the counter and the cargo was not on the shelf. Pickup stopped and the cargo is locked. "
          : "reported missing from the warehouse floor. The cargo is locked and cannot be released. ") +
        `${user.name}: ${note} (case ${ref})`,
      // The hub, filtered to this one consignment. There is no per-case route —
      // a case is read expanded inside the queue — so linking to a case id was
      // a notification that opened a 404.
      href: `/app/exceptions?tracking=${cargo.trackingNumber}`,
    },
    tx
  );

  await recordAudit(
    {
      actor: user,
      action:
        origin === "counter"
          ? "shipment.unableToLocate"
          : "shipment.reportMissing",
      entity: "Shipment",
      entityId: cargo.id,
      summary: created
        ? `${cargo.trackingNumber} could not be found — investigation ${ref} opened`
        : `${cargo.trackingNumber} searched again and still not found — added to ${ref}`,
      metadata: { exceptionId, note, origin },
    },
    tx
  );
}

function revalidateAfterLoss(trackingNumber: string) {
  revalidatePath("/app/release");
  revalidatePath("/app/pickup-queue");
  revalidatePath("/app/exceptions");
  revalidatePath("/app/inventory");
  revalidatePath("/app/dashboard");
  revalidatePath(`/app/cargo/${trackingNumber}`);
}

const CARGO_SELECT = {
  id: true,
  trackingNumber: true,
  batchId: true,
  customer: { select: { name: true } },
} as const;

type LossResult = { trackingNumber: string; caseRef: string };

/**
 * "Unable to Locate Cargo" — the counter's alternative to marking delivered.
 *
 * Gated on `shipment.release`, because this is the release decision: it is the
 * button the operator presses *instead of* handing the box over, and the only
 * people who should be able to stop a handover are the people who could have
 * completed one.
 */
export async function reportUnableToLocate(
  _prev: ActionResult<LossResult> | undefined,
  formData: FormData
): Promise<ActionResult<LossResult>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.release");
  } catch (error) {
    return fail(toActionError(error));
  }

  const pickupNoteId = String(formData.get("pickupNoteId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!pickupNoteId) return fail(t(locale, "Missing pickup note."));
  if (note.length < MIN_NOTE) {
    return fail(
      t(locale, "Say where you looked. This is what the search starts from.")
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const pickupNote = await tx.pickupNote.findUnique({
        where: { id: pickupNoteId },
        select: {
          id: true,
          noteNumber: true,
          status: true,
          shipment: { select: CARGO_SELECT },
        },
      });
      if (!pickupNote) throw new Error(t(locale, "Pickup note not found."));
      if (pickupNote.status === "USED") {
        throw new Error(
          `${pickupNote.noteNumber} ${t(locale, "has already been used — this cargo was collected. If it left with the wrong person, raise that in Issues & Claims.")}`
        );
      }
      if (pickupNote.status === "CANCELLED") {
        throw new Error(
          `${pickupNote.noteNumber} ${t(locale, "was cancelled by Finance.")}`
        );
      }

      const cargo: CargoRef = {
        id: pickupNote.shipment.id,
        trackingNumber: pickupNote.shipment.trackingNumber,
        batchId: pickupNote.shipment.batchId,
        customerName: pickupNote.shipment.customer.name,
      };

      const { exceptionId, created } = await openOrAppendLossCase(tx, {
        cargo,
        user,
        note: `${note} (pickup note ${pickupNote.noteNumber})`,
        origin: "counter",
      });

      await announceLoss(tx, {
        cargo,
        user,
        exceptionId,
        created,
        note,
        origin: "counter",
      });

      return {
        trackingNumber: cargo.trackingNumber,
        caseRef: caseReference(exceptionId),
      };
    });

    revalidateAfterLoss(result.trackingNumber);
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * "Report Missing Cargo" — the same discovery, made before the customer comes.
 *
 * Takes either a pickup note (the pickup queue's rows are notes) or a shipment
 * directly (the cargo record, the inventory list), so the same button can sit
 * on any screen that shows cargo without that screen having to reshape its
 * data.
 *
 * Gated on `exception.raise`, which the Dar floor, Support, Finance and the CEO
 * all hold: anyone who finds a hole on a shelf should be able to say so.
 */
export async function reportMissingCargo(
  _prev: ActionResult<LossResult> | undefined,
  formData: FormData
): Promise<ActionResult<LossResult>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("exception.raise");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "").trim();
  const pickupNoteId = String(formData.get("pickupNoteId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!shipmentId && !pickupNoteId) return fail(t(locale, "Missing cargo."));
  if (note.length < MIN_NOTE) {
    return fail(
      t(locale, "Say where you looked. This is what the search starts from.")
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const shipment = shipmentId
        ? await tx.shipment.findUnique({
            where: { id: shipmentId },
            select: CARGO_SELECT,
          })
        : (
            await tx.pickupNote.findUnique({
              where: { id: pickupNoteId },
              select: { shipment: { select: CARGO_SELECT } },
            })
          )?.shipment ?? null;
      if (!shipment) throw new Error(t(locale, "Cargo not found."));

      const cargo: CargoRef = {
        id: shipment.id,
        trackingNumber: shipment.trackingNumber,
        batchId: shipment.batchId,
        customerName: shipment.customer.name,
      };

      const { exceptionId, created } = await openOrAppendLossCase(tx, {
        cargo,
        user,
        note,
        origin: "queue",
      });

      await announceLoss(tx, {
        cargo,
        user,
        exceptionId,
        created,
        note,
        origin: "queue",
      });

      return {
        trackingNumber: cargo.trackingNumber,
        caseRef: caseReference(exceptionId),
      };
    });

    revalidateAfterLoss(result.trackingNumber);
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}
