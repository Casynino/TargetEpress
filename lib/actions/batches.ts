"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma, type DamageSeverity, type ExceptionType } from "@prisma/client";

import {
  DAMAGE_SEVERITY_LABELS,
  EXCEPTION_OPEN_STATUSES,
  EXCEPTION_TYPE_LABELS,
  ORIGIN_LABELS,
  PACKAGE_TYPE_LABELS,
} from "@/lib/constants";
import { autoPriceShipments } from "@/lib/auto-price";
import { recordAudit, withNote } from "@/lib/audit";
import { CLOSEABLE_FROM, batchOwing, buildStatement } from "@/lib/batch-close";
import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { notifyReceivingOutcome } from "@/lib/exception-audience";
import { contributorsTo, notify } from "@/lib/notify";
import {
  RECEIVING_OUTCOME_EXCEPTION,
  RECEIVING_OUTCOME_LABELS,
  isReceivingOutcome,
  type ReceivingOutcome,
} from "@/lib/receiving-outcomes";
import { filesFrom, putImages, type StoredImage } from "@/lib/storage";
import {
  AIRPORT_LABELS,
  CATEGORY_LABELS,
  categoryFitsRoute,
  routeFor,
} from "@/lib/cargo";
import { t } from "@/lib/i18n";
import { nextBatchNumber } from "@/lib/ids";
import type { Locale } from "@/lib/locale";
import { prisma, type TxClient } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { batchSchema, departureSchema, firstError } from "@/lib/validation";

export async function createBatch(
  _prev: ActionResult<{ id: string; batchNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string; batchNumber: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("batch.create");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = batchSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  // The shared schemas are written in English; their messages are rendered
  // here, where we know who is reading them.
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

  try {
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.batch.create({
        data: {
          // The number carries the airport, so these two can never disagree.
          batchNumber: await nextBatchNumber(tx, parsed.data.origin),
          origin: parsed.data.origin,
          notes: parsed.data.notes || null,
          createdById: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "batch.create",
          entity: "Batch",
          entityId: created.id,
          summary: `Opened ${created.batchNumber}`,
        },
        tx
      );

      return created;
    });

    revalidatePath("/app/batches");
    return ok({ id: batch.id, batchNumber: batch.batchNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function setShipmentBatch(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("batch.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  const batchId = String(formData.get("batchId") ?? "");
  if (!shipmentId) return fail(t(locale, "Missing cargo."));

  try {
    await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          status: true,
          trackingNumber: true,
          cargoCategory: true,
          batch: { select: { id: true, status: true, batchNumber: true } },
        },
      });
      if (!shipment) throw new Error(t(locale, "Cargo not found."));
      if (shipment.status !== "READY_TO_DEPART") {
        throw new Error(
          t(locale, "Only cargo still in China can change batch.")
        );
      }
      if (shipment.batch && shipment.batch.status !== "OPEN") {
        throw new Error(
          `${shipment.trackingNumber} ${t(locale, "is already sealed into batch")} ${shipment.batch.batchNumber}.`
        );
      }

      if (batchId) {
        const batch = await tx.batch.findUnique({
          where: { id: batchId },
          select: { id: true, status: true, batchNumber: true, origin: true },
        });
        if (!batch) throw new Error(t(locale, "Batch not found."));
        if (batch.status !== "OPEN") {
          throw new Error(
            t(locale, "That batch is sealed and cannot take more cargo.")
          );
        }

        // Route guard. Electronics and liquids fly Hong Kong; normal goods fly
        // Guangzhou. Mixing them would put cargo on a flight from an airport it
        // is not sitting in, so this is refused rather than warned about.
        if (!categoryFitsRoute(shipment.cargoCategory, batch.origin)) {
          // Composed rather than written out, so the airport names land in a
          // position that reads correctly in both languages.
          throw new Error(
            `${shipment.trackingNumber}: ${CATEGORY_LABELS[shipment.cargoCategory].toLowerCase()}${t(locale, ", which flies from")} ${AIRPORT_LABELS[routeFor(shipment.cargoCategory)]}. ${batch.batchNumber} ${t(locale, "departs from")} ${AIRPORT_LABELS[batch.origin]}.`
          );
        }

        await tx.shipment.update({
          where: { id: shipmentId },
          data: { batchId: batch.id },
        });

        await recordAudit(
          {
            actor: user,
            action: "batch.addShipment",
            entity: "Batch",
            entityId: batch.id,
            summary: `Added ${shipment.trackingNumber} to ${batch.batchNumber}`,
          },
          tx
        );
      } else {
        await tx.shipment.update({
          where: { id: shipmentId },
          data: { batchId: null },
        });

        await recordAudit(
          {
            actor: user,
            action: "batch.removeShipment",
            entity: "Shipment",
            entityId: shipmentId,
            summary: `Removed ${shipment.trackingNumber} from its batch`,
          },
          tx
        );
      }
    });

    revalidatePath("/app/batches");
    revalidatePath("/app/cargo");
    if (batchId) revalidatePath(`/app/batches/${batchId}`);
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function sealBatch(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("batch.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return fail(t(locale, "Missing batch."));

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: {
          id: true,
          status: true,
          batchNumber: true,
          _count: { select: { shipments: { where: { deletedAt: null } } } },
        },
      });
      if (!batch) throw new Error(t(locale, "Batch not found."));
      if (batch.status !== "OPEN") {
        throw new Error(t(locale, "This batch is already sealed."));
      }
      if (batch._count.shipments === 0) {
        throw new Error(t(locale, "Add at least one consignment before sealing."));
      }

      await tx.batch.update({
        where: { id: batchId },
        data: { status: "READY_TO_DEPART" },
      });

      await recordAudit(
        {
          actor: user,
          action: "batch.seal",
          entity: "Batch",
          entityId: batchId,
          summary: `Sealed ${batch.batchNumber} with ${batch._count.shipments} consignment(s)`,
        },
        tx
      );
    });

    revalidatePath(`/app/batches/${batchId}`);
    revalidatePath("/app/batches");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Departure. This is the moment the whole batch — and every shipment inside
 * it — moves to IN_TRANSIT, and the flight details become part of the record.
 */
export async function departBatch(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.depart");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = departureSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  const departureDate = new Date(input.departureDate);
  if (Number.isNaN(departureDate.getTime())) {
    return fail(t(locale, "Departure date is not valid."));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: input.batchId },
        select: {
          id: true,
          status: true,
          batchNumber: true,
          shipments: {
            where: { status: "READY_TO_DEPART", deletedAt: null },
            select: { id: true, origin: true },
          },
        },
      });
      if (!batch) throw new Error(t(locale, "Batch not found."));
      if (batch.status === "IN_TRANSIT" || batch.status === "ARRIVED") {
        throw new Error(t(locale, "This batch has already departed."));
      }
      if (batch.shipments.length === 0) {
        throw new Error(
          t(locale, "There is no cargo in this batch ready to depart.")
        );
      }

      const now = new Date();

      await tx.batch.update({
        where: { id: batch.id },
        data: {
          status: "IN_TRANSIT",
          airline: input.airline,
          flightNumber: input.flightNumber.toUpperCase(),
          waybillNumber: input.waybillNumber,
          departureDate,
          departedAt: now,
        },
      });

      await tx.shipment.updateMany({
        where: { batchId: batch.id, status: "READY_TO_DEPART" },
        data: { status: "IN_TRANSIT", departedAt: departureDate },
      });

      await tx.shipmentStatusHistory.createMany({
        data: batch.shipments.map((shipment) => ({
          shipmentId: shipment.id,
          fromStatus: "READY_TO_DEPART" as const,
          toStatus: "IN_TRANSIT" as const,
          location: "China → Tanzania",
          note: `Departed on ${input.airline} ${input.flightNumber.toUpperCase()} (waybill ${input.waybillNumber}).`,
          actorId: user.id,
        })),
      });

      await recordAudit(
        {
          actor: user,
          action: "batch.depart",
          entity: "Batch",
          entityId: batch.id,
          summary: `${batch.batchNumber} departed on ${input.airline} ${input.flightNumber.toUpperCase()}`,
          metadata: {
            waybill: input.waybillNumber,
            shipments: batch.shipments.length,
          },
        },
        tx
      );
    });

    revalidatePath(`/app/batches/${input.batchId}`);
    revalidatePath("/app/batches");
    revalidatePath("/app/dashboard");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}


/**
 * Built per request: the messages belong to whoever is filling the form in, and
 * a schema evaluated once at import time can only hold one language.
 */
const dispatchSchemaFor = (locale: Locale) =>
  z.object({
    batchId: z.string().trim().min(1, t(locale, "Missing loading table.")),
    /*
      NONE OF THE FLIGHT IS REQUIRED TO SEND THE CARGO.

      All four used to be compulsory, and the real yard does not work that
      way: the boxes go to the airport and then wait — sometimes days — for
      the airline to issue a waybill. A form that insists on the number
      before the cargo may leave makes the clerk invent one, and an invented
      waybill is worse than an empty field, because nothing on screen ever
      says it was a guess.

      So dispatch records what is true at that moment — these boxes have left
      our warehouse — and every flight detail is filled in later, on the
      dispatch itself, as the airline hands it over. See updateFlightDetails.
    */
    waybillNumber: z.string().trim().max(40).optional(),
    airline: z.string().trim().max(80).optional(),
    flightNumber: z.string().trim().max(20).optional(),
    departureDate: z.string().trim().optional(),
    expectedArrival: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional(),
  });

/**
 * Sends a loading table on its way.
 *
 * This is the moment the warehouse's job ends. Everything sitting on the table
 * is swept into one dispatch record — GZ-SHIP-2026-001 — which carries the
 * waybill and the flight, and the table is empty again before the clerk has
 * finished reading the confirmation.
 *
 * The loading table itself is never consumed: it is permanent, and the next
 * customer through the door starts filling it again.
 */
export async function dispatchLoadingTable(
  _prev: ActionResult<{ dispatchNumber: string; cargo: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ dispatchNumber: string; cargo: number }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.depart");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = dispatchSchemaFor(locale).safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  // Left blank means "not known yet", not "today". A guessed departure date
  // reads on every later screen exactly like a real one.
  const departureDate = input.departureDate ? new Date(input.departureDate) : null;
  if (departureDate && Number.isNaN(departureDate.getTime())) {
    return fail(t(locale, "That departure date is not valid."));
  }

  const expectedArrival = input.expectedArrival
    ? new Date(input.expectedArrival)
    : null;
  if (expectedArrival && Number.isNaN(expectedArrival.getTime())) {
    return fail(t(locale, "That expected arrival date is not valid."));
  }
  if (expectedArrival && departureDate && expectedArrival < departureDate) {
    return fail(t(locale, "The cargo cannot arrive before it leaves."));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const table = await tx.batch.findUnique({
        where: { id: input.batchId },
        select: {
          id: true,
          origin: true,
          permanent: true,
          shipments: {
            where: { status: "READY_TO_DEPART", deletedAt: null },
            select: { id: true },
          },
        },
      });

      if (!table) {
        throw new Error(t(locale, "That loading table no longer exists."));
      }
      if (!table.permanent) {
        throw new Error(t(locale, "Only a loading table can be dispatched."));
      }
      if (table.shipments.length === 0) {
        throw new Error(
          t(locale, "There is no cargo on this table to dispatch.")
        );
      }

      const dispatch = await tx.batch.create({
        data: {
          batchNumber: await nextBatchNumber(tx, table.origin),
          origin: table.origin,
          permanent: false,
          status: "IN_TRANSIT",
          waybillNumber: input.waybillNumber || null,
          airline: input.airline || null,
          flightNumber: input.flightNumber?.toUpperCase() || null,
          departureDate,
          expectedArrival,
          departedAt: new Date(),
          notes: input.notes || null,
          createdById: user.id,
        },
        select: { id: true, batchNumber: true },
      });

      // Everything on the table moves across in one statement, so a clerk
      // registering cargo at this exact moment either makes the flight or lands
      // on the now-empty table — never half in, half out.
      const moved = await tx.shipment.updateMany({
        where: { batchId: table.id, status: "READY_TO_DEPART" },
        data: {
          batchId: dispatch.id,
          status: "IN_TRANSIT",
          departedAt: departureDate,
        },
      });

      await tx.shipmentStatusHistory.createMany({
        data: table.shipments.map((cargo) => ({
          shipmentId: cargo.id,
          fromStatus: "READY_TO_DEPART" as const,
          toStatus: "IN_TRANSIT" as const,
          location: "China → Tanzania",
          /* Says only what is known. A flight that left before its waybill
             was issued reads "Dispatched as GZ-0002." and gains the airline
             and the number when somebody fills them in. */
          note:
            `Dispatched as ${dispatch.batchNumber}` +
            (input.airline ? ` on ${input.airline}` : "") +
            (input.flightNumber ? ` ${input.flightNumber.toUpperCase()}` : "") +
            (input.waybillNumber ? ` (waybill ${input.waybillNumber})` : "") +
            ".",
          actorId: user.id,
        })),
      });

      await recordAudit(
        {
          actor: user,
          action: "batch.dispatch",
          entity: "Batch",
          entityId: dispatch.id,
          summary:
            `Dispatched ${dispatch.batchNumber} — ${moved.count} pieces` +
            (input.airline ? ` on ${input.airline}` : ""),
          metadata: {
            waybill: input.waybillNumber,
            airline: input.airline,
            flightNumber: input.flightNumber ?? null,
            cargo: moved.count,
          },
        },
        tx
      );

      // The people to tell are the ones whose work is on the plane — not
      // everyone in the department.
      await notify(
        {
          userIds: await contributorsTo(dispatch.id, tx),
          kind: "batch.dispatched",
          title: `${dispatch.batchNumber} has left China`,
          /* Says only what is known, the same way the history note above does.
             The airline and the waybill are optional on the form — a flight
             can leave before its waybill is issued — and this read
             "87 pieces on undefined, waybill undefined." to everybody whose
             cargo was on it. */
          body:
            `${moved.count} pieces` +
            (input.airline ? ` on ${input.airline}` : "") +
            (input.flightNumber ? ` ${input.flightNumber.toUpperCase()}` : "") +
            (input.waybillNumber ? `, waybill ${input.waybillNumber}` : "") +
            ".",
          href: `/app/shipments/${dispatch.id}`,
        },
        tx
      );

      return { dispatchNumber: dispatch.batchNumber, cargo: moved.count };
    });

    revalidatePath("/app/batches");
    revalidatePath("/app/cargo");
    revalidatePath("/app/dashboard");
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}

/** Dar warehouse confirms the batch has physically landed. */
export async function receiveBatch(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("batch.receive");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return fail(t(locale, "Missing batch."));

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: { id: true, status: true, batchNumber: true },
      });
      if (!batch) throw new Error(t(locale, "Batch not found."));
      if (batch.status !== "IN_TRANSIT") {
        throw new Error(
          t(locale, "Only a batch in transit can be marked as arrived.")
        );
      }

      const now = new Date();
      await tx.batch.update({
        where: { id: batchId },
        data: { status: "ARRIVED", arrivalDate: now, arrivedAt: now },
      });

      await recordAudit(
        {
          actor: user,
          action: "batch.receive",
          entity: "Batch",
          entityId: batchId,
          summary: `${batch.batchNumber} arrived in Dar es Salaam`,
        },
        tx
      );
    });

    revalidatePath(`/app/receive/${batchId}`);
    revalidatePath("/app/receive");
    revalidatePath("/app/dashboard");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Does this kind of problem mean the cargo is standing in the Dar warehouse?
 *
 * A damaged carton is still a carton on the floor. Somebody has to store it,
 * find it again, and answer the customer asking where it is — and none of that
 * is possible if flagging the damage is what keeps it out of the system. The
 * old code refused to receive anything flagged, so a torn box sat on a shelf in
 * Dar while the record said it was in the air: invisible to Warehouse
 * Inventory, invisible to the counter, and invisible on the customer's
 * tracking. That is exactly how a box goes missing while nobody has moved it.
 *
 * So the flag no longer decides whether the cargo enters the warehouse. Only
 * this table does, and it answers one physical question: did anything arrive?
 * MISSING_SHIPMENT is the single case where the answer is no.
 *
 * Written as an exhaustive Record on purpose. Add an ExceptionType to the
 * schema and this file stops compiling until somebody says where that cargo
 * physically is. The answer is not guessable and the cost of guessing it wrong
 * is a lost carton.
 */
const CARGO_PHYSICALLY_HERE: Record<ExceptionType, boolean> = {
  // Nothing came off the plane. There is no cargo to receive.
  MISSING_SHIPMENT: false,
  // All of these arrived. They arrived wrong, which is a different problem.
  DAMAGED_CARGO: true,
  WEIGHT_MISMATCH: true,
  PACKAGE_COUNT_MISMATCH: true,
  WRONG_BATCH: true,
  // The box is on the floor; its contents are not what was booked. Refusing to
  // receive it would leave a real carton the warehouse is holding invisible to
  // Inventory — the exact failure this table was written to stop.
  WRONG_ITEM: true,
  // A quarantine, and you cannot quarantine something you do not have. It is
  // received, and the open case is what keeps it off the pickup counter.
  HOLD_FOR_INVESTIGATION: true,
  OTHER: true,
};

const isExceptionType = (value: string): value is ExceptionType =>
  Object.prototype.hasOwnProperty.call(CARGO_PHYSICALLY_HERE, value);

const isDamageSeverity = (value: string): value is DamageSeverity =>
  Object.prototype.hasOwnProperty.call(DAMAGE_SEVERITY_LABELS, value);

/**
 * Open a case for investigation, or update the one already running.
 *
 * Check-in is re-runnable by design: an operator corrects a miscount, two
 * people tick the same line, a form is submitted twice on a slow connection.
 * Creating a row every time would bury the investigation queue under identical
 * duplicates of the same carton. One live case per shipment per kind of
 * problem; a later run rewrites its description instead of adding another.
 *
 * "Live" is the whole open lifecycle, not literally OPEN. Matching only OPEN
 * would open a second identical case the moment somebody moved the first one to
 * Under Investigation — the queue would show two cartons where there is one.
 * A case that has been closed is a different matter: if the same problem is
 * reported again afterwards, that is genuinely a new case and gets one.
 *
 * The original raiser and raisedAt are kept — that is the person who was
 * standing in front of the cargo. Returns the case id so the caller can hang
 * photographs and timeline entries off it.
 */
async function raiseException(
  tx: TxClient,
  input: {
    shipmentId: string;
    batchId: string;
    type: ExceptionType;
    description: string;
    raisedById: string;
    severity?: DamageSeverity | null;
  }
): Promise<string> {
  const { severity = null, ...core } = input;

  const existing = await tx.shipmentException.findFirst({
    where: {
      shipmentId: core.shipmentId,
      batchId: core.batchId,
      type: core.type,
      status: { in: [...EXCEPTION_OPEN_STATUSES] },
    },
    select: { id: true, description: true, severity: true },
  });

  if (!existing) {
    const created = await tx.shipmentException.create({
      data: { ...core, severity },
      select: { id: true },
    });
    await tx.exceptionEvent.create({
      data: {
        exceptionId: created.id,
        action: "opened",
        note: `Raised at Dar check-in — ${EXCEPTION_TYPE_LABELS[core.type]}: ${core.description}`,
        actorId: core.raisedById,
      },
    });
    return created.id;
  }

  const changed =
    existing.description !== core.description ||
    (severity !== null && existing.severity !== severity);

  if (changed) {
    await tx.shipmentException.update({
      where: { id: existing.id },
      data: {
        description: core.description,
        ...(severity !== null ? { severity } : {}),
      },
    });
    // The timeline is append-only: a correction is another line, never an
    // edit of the one before it.
    await tx.exceptionEvent.create({
      data: {
        exceptionId: existing.id,
        action: "note.added",
        note: `Re-checked at Dar arrival: ${core.description}`,
        actorId: core.raisedById,
      },
    });
  }

  return existing.id;
}

/**
 * Photographs taken on the Dar floor, filed against the cargo and — when there
 * is one — against the case.
 *
 * ARRIVAL rather than CARGO on purpose: CARGO is what Guangzhou registered, and
 * an investigation is settled by comparing the two. Collapsing them would throw
 * away the only distinction that matters. DAMAGE keeps its own kind because
 * that is the one Finance goes looking for.
 *
 * Filed even when nothing is wrong, so a clerk who photographs a suspicious
 * carton and then decides it is fine has still left the picture behind.
 */
async function attachArrivalPhotos(
  tx: TxClient,
  input: {
    shipmentId: string;
    exceptionId: string | null;
    images: StoredImage[];
    damage: boolean;
    caption: string;
    uploadedById: string;
  }
) {
  if (input.images.length === 0) return;

  await tx.shipmentPhoto.createMany({
    data: input.images.map((image) => ({
      shipmentId: input.shipmentId,
      exceptionId: input.exceptionId,
      url: image.url,
      kind: input.damage ? ("DAMAGE" as const) : ("ARRIVAL" as const),
      caption: input.caption,
      uploadedById: input.uploadedById,
    })),
  });

  if (input.exceptionId) {
    await tx.exceptionEvent.create({
      data: {
        exceptionId: input.exceptionId,
        action: "photo.added",
        note: `${input.images.length} photo(s) taken on the Dar floor at check-in.`,
        actorId: input.uploadedById,
      },
    });
  }
}

/**
 * Pricing, walled off from the check-in that triggered it.
 *
 * Both check-in actions ran `autoPriceShipments` outside their transaction but
 * inside their `try`, so a throw in there — a connection reset mid-request, a
 * statement timeout on one of the per-consignment transactions, `nextInvoiceNumber`
 * losing a race — fell through to the outer `catch` and returned `fail(...)`.
 * The clerk was told the check-in had not happened, seconds after it had
 * committed: packages received, shipment at RECEIVED_AT_DAR, history and audit
 * written. That is how a manifest gets scanned in twice or abandoned. The
 * comment above each call already promised pricing could never fail a check-in;
 * this is what makes the promise true, and it keeps `revalidatePath` reachable
 * so the row on screen still ticks over.
 *
 * Reports back rather than swallowing, because the draft will NOT appear by
 * itself later: re-running check-in finds nothing unverified (`verifications:
 * none`) and prices nothing, so an unraised bill would simply never exist and
 * nobody would know to look for it. A rate book with no rate for the cargo is
 * a different and already-handled case — lib/auto-price records that on the
 * shipment and returns normally.
 */
async function priceAfterCheckIn(
  shipmentIds: string[],
  actorId: string
): Promise<boolean> {
  if (shipmentIds.length === 0) return true;
  try {
    await autoPriceShipments(shipmentIds, actorId);
    return true;
  } catch (error) {
    console.error("Auto-pricing failed after a Dar check-in", {
      shipmentIds,
      error,
    });
    return false;
  }
}

/**
 * Ticking one shipment off the printed manifest.
 *
 * The clerk gives one of six answers — Received, Missing, Damaged, Wrong item,
 * Wrong quantity, Hold for investigation (see lib/receiving-outcomes.ts). Only
 * Received leaves the cargo clean; the other five open a case, and the shipment
 * around them is checked in regardless. One torn carton does not put
 * eighty-six good ones back on the plane.
 *
 * Two independent facts come out of this screen and the code keeps them
 * separate, because conflating them is what stranded cargo before:
 *
 *   1. IS IT HERE? — everything that physically arrived is received:
 *      RECEIVED_AT_DAR, arrivedAt stamped, packages ticked, a history line the
 *      customer's tracking reads from. True for a clean check-in and true for
 *      damaged, mis-weighed, short or wrong-batch cargo alike. Only
 *      MISSING_SHIPMENT — nothing came off the plane — leaves the shipment
 *      IN_TRANSIT, because there is nothing in the building to record.
 *
 *   2. IS IT RIGHT? — anything wrong opens a case on /app/exceptions, which is
 *      the one place cargo under investigation is tracked. The release counter
 *      refuses to hand over a shipment whose packages are not all ticked, so an
 *      unresolved shortage cannot walk out of the door.
 *
 * Flagging a problem therefore adds a case. It never withholds the cargo from
 * the warehouse.
 */
export async function verifyShipment(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("batch.verify");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  const shipmentId = String(formData.get("shipmentId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const outcomeField = String(formData.get("outcome") ?? "").trim();
  const legacyResult = String(formData.get("result") ?? "");
  const exceptionType = String(formData.get("exceptionType") ?? "OTHER");
  const severityField = String(formData.get("severity") ?? "").trim();
  // The arrival screen always states which boxes it checked, even when that is
  // none of them. Without the flag, "nothing ticked" and "not a package-aware
  // form" look identical, and the safe reading of those is the opposite.
  const explicitSelection = formData.get("packageSelection") === "explicit";
  const checkedPackageIds = formData
    .getAll("packageIds")
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (!batchId || !shipmentId) return fail(t(locale, "Missing shipment."));

  // Which of the six the clerk chose, and what kind of case that opens.
  //
  // Validated rather than cast: this value decides whether cargo enters the
  // warehouse and whether a customer is told their box is ready, and an
  // unrecognised string must not reach either decision.
  //
  // The older result/exceptionType pair is still accepted underneath. The
  // check-in screen no longer sends it, but the bulk-accept path and anything
  // else already posting to this action keeps working unchanged.
  let outcome: ReceivingOutcome | null = null;
  let problem: ExceptionType | null;

  if (outcomeField) {
    if (!isReceivingOutcome(outcomeField)) {
      return fail("That is not one of the six check-in outcomes.");
    }
    outcome = outcomeField;
    problem = RECEIVING_OUTCOME_EXCEPTION[outcome];
  } else {
    if (legacyResult !== "VERIFIED" && legacyResult !== "EXCEPTION") {
      return fail("Say what happened to this cargo.");
    }
    if (legacyResult === "EXCEPTION" && !isExceptionType(exceptionType)) {
      return fail("That is not a kind of problem this system records.");
    }
    problem =
      legacyResult === "EXCEPTION" && isExceptionType(exceptionType)
        ? exceptionType
        : null;
  }

  const result: "VERIFIED" | "EXCEPTION" = problem ? "EXCEPTION" : "VERIFIED";

  if (problem && note.length < 3) {
    return fail("Describe the problem before flagging an exception.");
  }

  // Severity is only meaningful on damage, and on damage it is not optional:
  // "minor scuff" and "total loss" are two different conversations with the
  // customer, and the person holding the carton is the only one who can tell
  // them apart.
  const severity: DamageSeverity | null = isDamageSeverity(severityField)
    ? severityField
    : null;
  if (problem === "DAMAGED_CARGO" && !severity) {
    return fail("How bad is the damage? Choose a severity.");
  }

  // Evidence. Uploaded before the transaction opens — a phone photo over a
  // warehouse connection is slow, and holding a database transaction open for
  // it would lock the row while somebody's 4G decides what to do.
  const photoFiles = filesFrom(formData, "photos");
  if (problem === "DAMAGED_CARGO" && photoFiles.length === 0) {
    return fail(
      "Photograph the damage before recording it. This is the only moment the picture can be taken, and without it there is nothing to show the customer or Finance."
    );
  }

  let uploaded: StoredImage[] = [];
  if (photoFiles.length > 0) {
    try {
      uploaded = await putImages(photoFiles, "arrival");
    } catch (error) {
      return fail(toActionError(error));
    }
  }

  try {
    const landed = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          status: true,
          trackingNumber: true,
          batchId: true,
          packageType: true,
          packageList: {
            select: { id: true, sequence: true, receivedAt: true },
            orderBy: { sequence: "asc" },
          },
        },
      });
      if (!shipment) throw new Error("Cargo not found.");
      if (shipment.batchId !== batchId) {
        throw new Error("That cargo is not in this batch.");
      }

      /*
        THE FLIGHT HAS TO HAVE LANDED.

        Checking a box off the manifest is what prices the cargo and moves it to
        RECEIVED_AT_DAR — so doing it before the flight arrives puts cargo on
        the Dar floor that is still in the air, with a bill raised against a
        weight nobody has put on a scale. The screen only offers the button on
        an arrived flight, but the action is reachable without the screen. Both
        siblings check; this one did not.

        VERIFIED counts as landed: cargo moved onto a flight whose check-in is
        already finished still has to be checkable.
      */
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: { status: true },
      });
      if (!batch || (batch.status !== "ARRIVED" && batch.status !== "VERIFIED")) {
        throw new Error(
          "This batch has not landed yet. Mark it arrived before checking it in."
        );
      }

      await tx.batchVerification.upsert({
        where: { batchId_shipmentId: { batchId, shipmentId } },
        create: {
          batchId,
          shipmentId,
          result,
          note: note || null,
          verifiedById: user.id,
        },
        update: {
          result,
          note: note || null,
          verifiedById: user.id,
          verifiedAt: new Date(),
        },
      });

      // ── 1. Is it here? ────────────────────────────────────────────────────
      // A clean check-in means it arrived. A flagged check-in means it arrived
      // too, unless the flag is "nothing came off the plane".
      const arrived = problem === null || CARGO_PHYSICALLY_HERE[problem];

      // Which boxes the operator is stating are on the floor.
      //
      // An explicit selection is always believed — that is the operator naming
      // the boxes in front of them. Without one:
      //   · a clean check-in, or a problem that is not about the count, means
      //     the whole shipment is here (a torn carton is still a carton);
      //   · PACKAGE_COUNT_MISMATCH means the count is wrong but nobody has
      //     said which boxes are short, so nothing is ticked. Ticking all of
      //     them would assert the one thing we have just been told is false,
      //     and it would open the release counter on a short shipment. Left
      //     unticked, the manifest count reads low and release stays shut
      //     until somebody records which boxes actually landed.
      const present = !arrived
        ? []
        : explicitSelection
          ? shipment.packageList.filter((pkg) =>
              checkedPackageIds.includes(pkg.id)
            )
          : problem === "PACKAGE_COUNT_MISMATCH"
            ? []
            : shipment.packageList;

      const now = new Date();

      if (present.length > 0) {
        // receivedAt: null keeps a box already ticked on its original
        // timestamp and its original receiver, so a re-run changes nothing.
        await tx.package.updateMany({
          where: { id: { in: present.map((pkg) => pkg.id) }, receivedAt: null },
          data: { receivedAt: now, receivedById: user.id },
        });
      }

      if (arrived) {
        // updateMany with the status in the WHERE clause rather than a read
        // followed by an update: two operators ticking the same line at the
        // same moment produce one status change and one history line, not two.
        const moved = await tx.shipment.updateMany({
          where: { id: shipmentId, status: "IN_TRANSIT" },
          data: { status: "RECEIVED_AT_DAR", arrivedAt: now },
        });

        if (moved.count > 0) {
          await tx.shipmentStatusHistory.create({
            data: {
              shipmentId,
              fromStatus: "IN_TRANSIT",
              toStatus: "RECEIVED_AT_DAR",
              location: "Dar es Salaam warehouse",
              note: problem
                ? `Checked in with a problem — ${(outcome
                    ? RECEIVING_OUTCOME_LABELS[outcome]
                    : EXCEPTION_TYPE_LABELS[problem]
                  ).toLowerCase()}${
                    problem === "DAMAGED_CARGO" && severity
                      ? ` (${DAMAGE_SEVERITY_LABELS[severity].toLowerCase()})`
                      : ""
                  }: ${note}`
                : note || "Checked in against the batch manifest.",
              actorId: user.id,
            },
          });
        }
      }

      // ── 2. Is it right? ───────────────────────────────────────────────────
      // Which boxes are unaccounted for, worked out before any case is written
      // so the shortage can be named *inside* the case instead of described
      // vaguely beside it. "3 of 5 missing (2, 4, 5)" is something a person can
      // act on a week later; "wrong quantity" on its own is not.
      const short = shipment.packageList.filter(
        (pkg) => !pkg.receivedAt && !present.some((p) => p.id === pkg.id)
      );
      const shortDetail =
        short.length > 0
          ? `Short on arrival: ${short.length} of ${shipment.packageList.length} ${PACKAGE_TYPE_LABELS[shipment.packageType]?.many ?? "packages"} missing (${short.map((pkg) => pkg.sequence).join(", ")}).`
          : null;

      let exceptionId: string | null = null;

      if (problem) {
        exceptionId = await raiseException(tx, {
          shipmentId,
          batchId,
          type: problem,
          description:
            problem === "PACKAGE_COUNT_MISMATCH" && shortDetail
              ? `${note} — ${shortDetail}`
              : note,
          raisedById: user.id,
          // Carried only where it means anything. A severity on a wrong-item
          // case would be a number nobody can explain the origin of.
          severity: problem === "DAMAGED_CARGO" ? severity : null,
        });
      }

      // A partial arrival is still an arrival — the cargo that came is in the
      // warehouse. But it cannot be released, so the shortage is raised the
      // moment it is noticed rather than at the counter. Skipped when the clerk
      // reported the shortage themselves: that case already exists, and says
      // the same thing in their words.
      if (!arrived) {
        // The flight landed; this line did not.
        //
        // Leaving it IN_TRANSIT said the box was still in the air, which is a
        // different and comforting untruth: the aircraft is on the ground and
        // the carton is not on the floor. UNDER_INVESTIGATION is the honest
        // state, and it is what stops the line being counted as cargo the
        // warehouse holds.
        const moved = await tx.shipment.updateMany({
          where: { id: shipmentId, status: "IN_TRANSIT" },
          data: { status: "UNDER_INVESTIGATION" },
        });

        if (moved.count > 0) {
          await tx.shipmentStatusHistory.create({
            data: {
              shipmentId,
              fromStatus: "IN_TRANSIT",
              toStatus: "UNDER_INVESTIGATION",
              location: "Dar es Salaam warehouse",
              note: `Did not arrive with the flight: ${note}`,
              actorId: user.id,
            },
          });
        }
      }

      if (arrived && shortDetail && problem !== "PACKAGE_COUNT_MISMATCH") {
        await raiseException(tx, {
          shipmentId,
          batchId,
          type: "PACKAGE_COUNT_MISMATCH",
          description: shortDetail,
          raisedById: user.id,
        });
      }

      // ── 3. What it looked like ────────────────────────────────────────────
      await attachArrivalPhotos(tx, {
        shipmentId,
        exceptionId,
        images: uploaded,
        damage: problem === "DAMAGED_CARGO",
        caption: outcome
          ? `${RECEIVING_OUTCOME_LABELS[outcome]} at Dar check-in`
          : "Dar check-in",
        uploadedById: user.id,
      });

      // ── 4. Who has to hear about it ───────────────────────────────────────
      // Inside the transaction, so a case that exists and a notification saying
      // so cannot disagree. Nothing is sent for a clean check-in: eighty-seven
      // "cargo arrived normally" messages a flight is how people learn to
      // ignore the ones that matter.
      if (outcome && exceptionId) {
        await notifyReceivingOutcome(
          {
            outcome,
            trackingNumber: shipment.trackingNumber,
            raisedById: user.id,
            headline: `${shipment.trackingNumber} — ${RECEIVING_OUTCOME_LABELS[outcome].toLowerCase()} at Dar check-in`,
            detail:
              problem === "DAMAGED_CARGO" && severity
                ? `${DAMAGE_SEVERITY_LABELS[severity]} damage. ${note}`
                : note,
          },
          tx
        );
      }

      const auditMeta: Record<string, string | number> = {
        ...(outcome ? { outcome } : {}),
        ...(severity && problem === "DAMAGED_CARGO" ? { severity } : {}),
        ...(uploaded.length > 0 ? { photos: uploaded.length } : {}),
        ...(note ? { note } : {}),
      };

      await recordAudit(
        {
          actor: user,
          action:
            result === "VERIFIED"
              ? "batch.verifyShipment"
              : "batch.flagShipment",
          entity: "Shipment",
          entityId: shipmentId,
          // The audit line says where the cargo ended up, not just that a flag
          // was raised — "flagged and left in the air" and "flagged and taken
          // into the warehouse" are the two things this record has to tell
          // apart months later.
          summary: !problem
            ? `Checked in ${shipment.trackingNumber}`
            : arrived
              ? `Checked in ${shipment.trackingNumber} with a problem: ${outcome ? RECEIVING_OUTCOME_LABELS[outcome] : EXCEPTION_TYPE_LABELS[problem]}`
              : `${shipment.trackingNumber} did not arrive: ${outcome ? RECEIVING_OUTCOME_LABELS[outcome] : EXCEPTION_TYPE_LABELS[problem]}`,
          metadata:
            Object.keys(auditMeta).length > 0 ? auditMeta : undefined,
        },
        tx
      );

      // Only cargo that is physically here can be priced. A box reported
      // missing has nothing to bill for yet.
      return arrived ? shipment.id : null;
    });

    // Outside the transaction, and never able to fail the check-in. See
    // lib/auto-price and priceAfterCheckIn.
    const priced = await priceAfterCheckIn(landed ? [landed] : [], user.id);

    revalidatePath(`/app/receive/${batchId}`);
    revalidatePath("/app/receive");
    revalidatePath("/app/exceptions");
    // Flagged cargo now lands in the warehouse, so the views that count what is
    // standing on the floor have to be told about it too.
    revalidatePath("/app/inventory");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/finance/invoices");

    // Two outcomes, and they are not the same one. The cargo is in — the row
    // above has already gone green — so the message leads with that and then
    // says the one thing that did not happen, rather than colouring the whole
    // check-in a failure the clerk will answer by scanning the box again.
    if (!priced) {
      return fail(
        t(
          locale,
          "This cargo is checked in — do not check it in again. Working out its price failed, so no invoice was raised: ask Finance to raise it."
        )
      );
    }
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/** Closes off arrival checking once every shipment has been accounted for. */
export async function completeVerification(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("batch.verify");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return fail("Missing batch.");

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: {
          id: true,
          status: true,
          batchNumber: true,
          _count: { select: { shipments: { where: { deletedAt: null } }, verifications: true } },
        },
      });
      if (!batch) throw new Error("Batch not found.");
      if (batch.status !== "ARRIVED") {
        throw new Error("This batch is not being checked in.");
      }
      if (batch._count.verifications < batch._count.shipments) {
        throw new Error(
          `${batch._count.shipments - batch._count.verifications} consignment(s) still unchecked.`
        );
      }

      await tx.batch.update({
        where: { id: batchId },
        data: { status: "VERIFIED", verifiedAt: new Date() },
      });

      await recordAudit(
        {
          actor: user,
          action: "batch.completeVerification",
          entity: "Batch",
          entityId: batchId,
          summary: `Finished checking in ${batch.batchNumber}`,
        },
        tx
      );
    });

    revalidatePath(`/app/receive/${batchId}`);
    revalidatePath("/app/receive");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Accept a whole manifest at once.
 *
 * Loss and damage are rare. A flight arrives intact almost every time, so the
 * screen that confirms it should cost one action, not eighty-seven. This is
 * that action: everything still unchecked on the batch is marked present and
 * undamaged, every one of its packages is ticked off, and each shipment moves
 * to RECEIVED_AT_DAR with a history line.
 *
 * The rule that makes it safe: **it never touches a shipment that already has
 * a verification.** If somebody has flagged a box short or damaged, pressing
 * "everything is fine" must not quietly overwrite that — the exception is the
 * expensive fact on this page, and the bulk path is not allowed to erase it.
 * Only shipments nobody has ruled on are affected.
 *
 * Idempotent for the same reason: run it twice and the second run finds
 * nothing unverified and writes nothing.
 */
export async function verifyBatchAll(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("batch.verify");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return fail("Missing batch.");

  try {
    const checkedIn = await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: { id: true, status: true },
      });
      if (!batch) throw new Error("Batch not found.");
      if (batch.status !== "ARRIVED") {
        throw new Error(
          "This batch has not landed yet. Mark it arrived before checking it in."
        );
      }

      // Only the lines nobody has ruled on. `verifications: none` is what
      // protects an already-raised exception from being overwritten.
      const pending = await tx.shipment.findMany({
        where: { batchId, verifications: { none: {} } },
        select: {
          id: true,
          status: true,
          packageList: { select: { id: true } },
        },
      });
      if (pending.length === 0) return [] as string[];

      const now = new Date();

      await tx.batchVerification.createMany({
        data: pending.map((shipment) => ({
          batchId,
          shipmentId: shipment.id,
          result: "VERIFIED" as const,
          note: "Checked in with the rest of the manifest.",
          verifiedById: user.id,
        })),
        skipDuplicates: true,
      });

      // Every package on those shipments is on the floor. Guarded on
      // receivedAt: null so a box already ticked keeps its original timestamp
      // and the person who first saw it.
      await tx.package.updateMany({
        where: {
          id: { in: pending.flatMap((s) => s.packageList.map((p) => p.id)) },
          receivedAt: null,
        },
        data: { receivedAt: now, receivedById: user.id },
      });

      const arriving = pending.filter((s) => s.status === "IN_TRANSIT");
      if (arriving.length > 0) {
        await tx.shipment.updateMany({
          where: { id: { in: arriving.map((s) => s.id) }, status: "IN_TRANSIT" },
          data: { status: "RECEIVED_AT_DAR", arrivedAt: now },
        });
        await tx.shipmentStatusHistory.createMany({
          data: arriving.map((shipment) => ({
            shipmentId: shipment.id,
            fromStatus: "IN_TRANSIT" as const,
            toStatus: "RECEIVED_AT_DAR" as const,
            location: "Dar es Salaam warehouse",
            note: "Checked in with the rest of the manifest.",
            actorId: user.id,
          })),
        });
      }

      return pending.map((shipment) => shipment.id);
    });

    // Priced AFTER the transaction commits, never inside it. See lib/auto-price:
    // a rate book gap must not be able to stop a physical check-in, and eighty
    // seven extra queries do not belong inside one lock. And never inside this
    // `try` either — see priceAfterCheckIn: one throw in here used to make an
    // eighty-seven-line manifest that HAD been checked in report as though it
    // had done nothing at all.
    const priced = await priceAfterCheckIn(checkedIn, user.id);

    revalidatePath(`/app/receive/${batchId}`);
    revalidatePath("/app/receive");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/inventory");
    revalidatePath("/app/finance/invoices");

    // ActionResult carries no message channel, and the page re-reads the batch
    // on revalidate, so the new counts are the feedback. The exception is a
    // pricing failure, which the counts cannot show: the manifest is in either
    // way, so the message says that first and then names what is missing.
    if (!priced) {
      return fail(
        "The manifest is checked in — do not check it in again. Working out the prices failed, so some invoices were not raised: ask Finance to raise them."
      );
    }
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/*
  ---------------------------------------------------------------------------
  Closing a flight
  ---------------------------------------------------------------------------

  The owner's problem, in his words: we cannot always have the batches open.
  Income and costs pile onto a flight forever, nobody draws a line, and after a
  year of a weekly schedule nothing on the board reads as finished.

  Almost every flight closes itself — settleBatchIfClear runs when a payment
  settles the last bill, and nobody decides anything. What is below is for the
  flights that do not: somebody has not paid and is not going to, or has not
  paid and is still being chased. Those two are different facts about money and
  the close has to record which one, per consignment, because a real flight has
  both — one big debt worth a phone call and three small ones that are gone.
*/

/** What the close did, so the screen can say it rather than just reload. */
type CloseOutcome = {
  kind: string;
  writtenOff: number;
  kept: number;
  carried: number;
};

export async function closeBatch(
  _prev: ActionResult<CloseOutcome> | undefined,
  formData: FormData
): Promise<ActionResult<CloseOutcome>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("batch.close");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return fail(t(locale, "Missing batch."));

  const note = String(formData.get("note") ?? "").trim();
  /* Which of the unpaid consignments are being given up on. Everything not
     ticked stays a live debt: silence must never mean "write it off". */
  const writeOff = new Set(
    formData.getAll("writeOff").map((value) => String(value))
  );
  /* Cargo moving to a flight whose books are still open, so the chase can
     carry on somewhere it is allowed to. */
  const carry = new Set(formData.getAll("carry").map((value) => String(value)));
  const carryTo = String(formData.get("carryTo") ?? "");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: {
          id: true,
          batchNumber: true,
          status: true,
          permanent: true,
          closedAt: true,
        },
      });
      if (!batch) throw new Error(t(locale, "Batch not found."));
      if (batch.permanent) {
        throw new Error(t(locale, "A loading table never closes."));
      }
      if (batch.closedAt) {
        throw new Error(t(locale, "This batch is already closed."));
      }
      if (!CLOSEABLE_FROM.includes(batch.status as "VERIFIED")) {
        throw new Error(
          t(
            locale,
            "Check every piece off the manifest before closing the books on this batch."
          )
        );
      }

      // Read inside the transaction: what is owed has to be the state being
      // closed over, not what the screen was showing a minute ago.
      const owing = await batchOwing(batchId, tx);

      if (owing.drafts > 0 || owing.unbilled > 0) {
        throw new Error(
          t(
            locale,
            "Confirm the price on every piece first — closing now would give up money nobody has been asked for."
          )
        );
      }

      const moving = owing.unpaid.filter((row) => carry.has(row.invoiceId));
      const chosen = owing.unpaid.filter(
        (row) => writeOff.has(row.invoiceId) && !carry.has(row.invoiceId)
      );
      const kept = owing.unpaid.filter(
        (row) => !writeOff.has(row.invoiceId) && !carry.has(row.invoiceId)
      );

      /*
        Move the cargo, and say where it came from.

        The piece keeps its identity, its bill and its debt — nothing about the
        customer's side changes. What changes is which flight is carrying it,
        and the receiving batch is told this piece did not fly in with it, so
        its weight, its count and its revenue are not quietly credited to a
        flight that never carried it.
      */
      let target: {
        id: string;
        batchNumber: string;
        closedAt: Date | null;
        permanent: boolean;
      } | null = null;
      if (moving.length > 0) {
        if (!carryTo) {
          throw new Error(t(locale, "Choose the batch this cargo is moving to."));
        }
        if (carryTo === batchId) {
          throw new Error(
            t(locale, "Cargo cannot be carried onto the batch it is already on.")
          );
        }
        target = await tx.batch.findUnique({
          where: { id: carryTo },
          select: { id: true, batchNumber: true, closedAt: true, permanent: true },
        });
        if (!target) throw new Error(t(locale, "That batch no longer exists."));
        if (target.closedAt) {
          throw new Error(
            t(locale, "That batch is closed too. Carry the cargo somewhere still open.")
          );
        }

        await tx.shipment.updateMany({
          where: { id: { in: moving.map((row) => row.shipmentId) } },
          data: {
            batchId: target.id,
            carriedFromBatchId: batch.id,
            carriedAt: new Date(),
          },
        });
      }

      if (chosen.length > 0) {
        /* Only bills still genuinely owed. A payment landing between the
           owing read and this write used to be overwritten to WRITTEN_OFF —
           money collected and then formally abandoned in the same minute.
           A bill that settled in the meantime simply is not written off, and
           the count says so. */
        const struck = await tx.invoice.updateMany({
          where: {
            id: { in: chosen.map((row) => row.invoiceId) },
            status: { in: ["UNPAID", "PARTIALLY_PAID"] },
          },
          data: {
            status: "WRITTEN_OFF",
            writtenOffAt: new Date(),
            writtenOffById: user.id,
          },
        });
        if (struck.count !== chosen.length) {
          throw new Error(
            t(
              locale,
              "A bill on this flight was paid while you were closing it. Reload and close again with the fresh figures."
            )
          );
        }
      }

      /*
        How it ended, as a fact rather than a guess later.

        A written-off bill leaves revenue, so the flight's profit drops to what
        it really made. A kept debt does not: it is still owed, still chaseable,
        and still counted — closing the flight is not forgiving it.
      */
      const decisions = [chosen.length > 0, kept.length > 0, moving.length > 0]
        .filter(Boolean).length;
      const kind =
        owing.unpaid.length === 0
          ? "SETTLED"
          : decisions > 1
            ? "MIXED"
            : moving.length > 0
              ? "CARRIED_OVER"
              : chosen.length > 0
                ? "WRITTEN_OFF"
                : "DEBT_KEPT";

      /* The close itself is a claim: two people shutting the same flight at
         once used to both succeed, the second silently rewriting the first's
         statement inputs. */
      const shut = await tx.batch.updateMany({
        where: { id: batchId, closedAt: null },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedById: user.id,
          closeKind: kind,
          closeNote: note || null,
        },
      });
      if (shut.count === 0) {
        throw new Error(
          t(locale, "Somebody closed this flight a moment ago. Reload to see their close.")
        );
      }

      /*
        The statement, written now and never again.

        After the moves and the write-offs, so it counts the flight as it
        actually ends up, and inside the same transaction, so a statement
        cannot exist for a close that failed to save.
      */
      const statement = await buildStatement(
        tx,
        batchId,
        moving.map((row) => ({ shipmentId: row.shipmentId, owedUsd: row.owedUsd })),
        chosen.map((row) => row.invoiceId),
        await currentRateValue()
      );
      /* Overwrites a statement the boss sent back — see the note in
         lib/batch-close. Re-closing is the fix for a return, so it has to be
         allowed to replace what is there rather than collide with it. */
      await tx.batchStatement.upsert({
        where: { batchId },
        create: { batchId, ...statement, note: note || null, submittedById: user.id },
        update: {
          ...statement,
          note: note || null,
          status: "SUBMITTED",
          submittedById: user.id,
          submittedAt: new Date(),
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
        },
      });

      const writtenOffUsd = chosen.reduce((sum, row) => sum + row.owedUsd, 0);
      const keptUsd = kept.reduce((sum, row) => sum + row.owedUsd, 0);

      await recordAudit(
        {
          actor: user,
          action: "batch.closed",
          entity: "Batch",
          entityId: batch.id,
          summary: `Closed ${batch.batchNumber}${
            chosen.length
              ? ` — wrote off USD ${writtenOffUsd.toFixed(2)} on ${chosen.length} consignment(s)`
              : ""
          }${kept.length ? ` — USD ${keptUsd.toFixed(2)} still being chased` : ""}${
            moving.length && target
              ? ` — carried ${moving.length} consignment(s) to ${target.batchNumber}`
              : ""
          }`,
          metadata: {
            kind,
            note: note || null,
            writtenOff: chosen.map((row) => ({
              trackingNumber: row.trackingNumber,
              owedUsd: row.owedUsd,
            })),
            stillChasing: kept.map((row) => ({
              trackingNumber: row.trackingNumber,
              owedUsd: row.owedUsd,
            })),
            carriedTo: target?.batchNumber ?? null,
            carried: moving.map((row) => ({
              trackingNumber: row.trackingNumber,
              owedUsd: row.owedUsd,
            })),
          },
        },
        tx
      );

      return {
        kind,
        writtenOff: chosen.length,
        kept: kept.length,
        carried: moving.length,
      };
    });

    revalidatePath(`/app/shipments/${batchId}`);
    revalidatePath("/app/shipments");
    if (carryTo) revalidatePath(`/app/shipments/${carryTo}`);
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * The flight had not landed. Put it back in the air.
 *
 * Dar marks a batch arrived and then ticks its cargo off the manifest, and
 * those two acts together are what tells the whole system the boxes are on the
 * floor: each consignment is stamped RECEIVED_AT_DAR, its packages are
 * receipted, it is priced, and — the one that costs money quietly — its
 * storage clock starts. A flight marked in by mistake therefore does not just
 * read wrong; seven days later it starts charging customers USD 2 a day for a
 * shelf their cargo has never stood on.
 *
 * So this is the exact inverse of receiveBatch and verifyShipment, and nothing
 * more. It refuses every case where undoing would be a lie about money rather
 * than a correction of a mistake:
 *
 *   · cargo already collected — it left the building; it landed
 *   · a pickup note still standing — Finance has told a customer to come
 *   · an invoice past DRAFT — somebody has been billed, and a bill is answered
 *     by voidInvoice, which keeps the audit, not by deleting the flight it sat on
 *   · a closed flight — reopen it first, deliberately, exactly as a cost would
 *
 * Draft invoices ARE deleted. A draft is the system's own working figure and
 * nobody owes it, and "nothing is billed before it lands" is the rule the
 * pricing engine was built around — leaving priced drafts against cargo that is
 * still in the air is precisely the state this whole door exists to clear. The
 * real check-in prices them again from the real weights.
 *
 * Management only. Dar can mark a flight in; taking seventy consignments back
 * off the floor is a different size of act.
 */
export async function undoBatchArrival(
  _prev: ActionResult<Record<string, never>> | undefined,
  formData: FormData
): Promise<ActionResult<Record<string, never>>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("batch.undoArrival");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!batchId) return fail(t(locale, "Missing batch."));
  /* No question asked — warn, confirm, do. The audit line names the flight,
     the person and the moment either way. */

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: {
          id: true,
          batchNumber: true,
          status: true,
          closedAt: true,
          shipments: {
            where: { deletedAt: null },
            select: {
              id: true,
              trackingNumber: true,
              status: true,
              invoice: {
                select: {
                  id: true,
                  status: true,
                  invoiceNumber: true,
                  amountPaid: true,
                  amountAdjusted: true,
                  total: true,
                },
              },
              pickupNote: { select: { status: true, noteNumber: true } },
            },
          },
        },
      });
      if (!batch) throw new Error(t(locale, "Batch not found."));
      if (batch.closedAt) {
        throw new Error(
          t(locale, "This flight's books are closed. Reopen it first.")
        );
      }
      if (batch.status !== "ARRIVED" && batch.status !== "VERIFIED") {
        throw new Error(t(locale, "This flight is not marked as arrived."));
      }

      const delivered = batch.shipments.find((s) => s.status === "DELIVERED");
      if (delivered) {
        throw new Error(
          `${delivered.trackingNumber} ${t(locale, "has already been collected, so this flight did land.")}`
        );
      }

      const noted = batch.shipments.find(
        (s) => s.pickupNote && s.pickupNote.status === "ACTIVE"
      );
      if (noted) {
        throw new Error(
          `${noted.pickupNote!.noteNumber} ${t(locale, "is still standing. Cancel the pickup note first.")}`
        );
      }

      /*
        MONEY, not paperwork, is what stops this.

        The first version refused any bill past DRAFT and named one at a time,
        which on a seventy-consignment flight meant voiding seventy invoices by
        hand before the flight could be corrected — the owner's word for it was
        "forever", and he was right. It was also the wrong test. A bill raised
        against cargo that never landed is not a debt anybody owes; it is the
        same mistake as the arrival, and generateInvoice would refuse to write
        it today. What matters is whether money actually moved.

        So: anything with a shilling against it stops the flight and is answered
        through its own door, and everything else goes with the arrival that
        created it. Written-off bills stop it too — writing one off is a
        decision about a customer, not a by-product of a check-in.
      */
      const paid = batch.shipments.find(
        (s) => s.invoice && toNumber(s.invoice.amountPaid) > 0.005
      );
      if (paid) {
        throw new Error(
          `${paid.invoice!.invoiceNumber} ${t(locale, "has money against it. Cancel the payment first.")}`
        );
      }

      const writtenOff = batch.shipments.find(
        (s) => s.invoice && s.invoice.status === "WRITTEN_OFF"
      );
      if (writtenOff) {
        throw new Error(
          `${writtenOff.invoice!.invoiceNumber} ${t(locale, "was written off, which is a decision about a customer. Answer it on the bill first.")}`
        );
      }

      const shipmentIds = batch.shipments.map((s) => s.id);

      /* Every bill on the flight, not only the drafts. None of them has money
         against it — that was refused above — and a price worked out from a
         check-in that did not happen is not a price. The numbers and figures
         are written into the audit below, so nothing disappears unrecorded. */
      const removedInvoices = batch.shipments
        .filter((s) => s.invoice)
        .map((s) => ({
          invoiceNumber: s.invoice!.invoiceNumber,
          status: s.invoice!.status,
          total: toNumber(s.invoice!.total),
          trackingNumber: s.trackingNumber,
        }));
      await tx.invoice.deleteMany({
        where: { shipmentId: { in: shipmentIds } },
      });

      /* Un-receipt the boxes. The manifest count falls back to zero, which is
         what the warehouse will fill in when the plane actually lands. */
      await tx.package.updateMany({
        where: { shipmentId: { in: shipmentIds } },
        data: { receivedAt: null, receivedById: null },
      });

      await tx.batchVerification.deleteMany({ where: { batchId } });

      /* Only the ones this arrival moved. A consignment sitting UNDER
         INVESTIGATION is a case somebody is working, and quietly closing it by
         putting the box back on a plane would erase that.

         READY_FOR_PICKUP counts as moved too: a flight that never landed
         cannot have cargo waiting at a counter for it. In practice one only
         reaches here with its note already cancelled, because a standing note
         is refused above. */
      const returned = await tx.shipment.updateMany({
        where: {
          id: { in: shipmentIds },
          status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] },
        },
        data: { status: "IN_TRANSIT", arrivedAt: null, readyForPickup: null },
      });

      await tx.batch.update({
        where: { id: batchId },
        data: { status: "IN_TRANSIT", arrivalDate: null, arrivedAt: null },
      });

      await recordAudit(
        {
          actor: user,
          action: "batch.arrivalUndone",
          entity: "Batch",
          entityId: batch.id,
          summary: withNote(`${batch.batchNumber} put back in the air`, reason),
          metadata: {
            reason,
            consignments: batch.shipments.length,
            returnedToTransit: returned.count,
            invoicesRemoved: removedInvoices.length,
            invoices: removedInvoices,
          },
        },
        tx
      );
    });

    revalidatePath(`/app/shipments/${batchId}`);
    revalidatePath("/app/shipments");
    revalidatePath("/app/receive");
    revalidatePath("/app/inventory");
    return ok({});
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Open a closed flight's books again.
 *
 * Needed because closing is a judgement and judgements are wrong sometimes — a
 * customer pays two months later, a customs receipt turns up in somebody's
 * bag. The reason is required and kept: a set of books that can be reopened
 * silently is not a set of books.
 *
 * Write-offs are NOT undone here. Reopening restores the flight; deciding a
 * written-off bill is collectable again is a separate decision about a
 * customer, and folding it into this one would quietly resurrect debts nobody
 * meant to revive.
 */
export async function reopenBatch(
  _prev: ActionResult<Record<string, never>> | undefined,
  formData: FormData
): Promise<ActionResult<Record<string, never>>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("batch.close");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!batchId) return fail(t(locale, "Missing batch."));
  /* See above: the note is offered, never demanded. */

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: { id: true, batchNumber: true, closedAt: true },
      });
      if (!batch) throw new Error(t(locale, "Batch not found."));
      if (!batch.closedAt) throw new Error(t(locale, "This batch is open."));

      await tx.batch.update({
        where: { id: batchId },
        data: {
          status: "VERIFIED",
          closedAt: null,
          closedById: null,
          closeKind: null,
          closeNote: null,
        },
      });

      /* The statement goes with it. A flight being worked on again has not
         made anything final, and leaving a confirmed statement attached to an
         open flight is how the boss ends up reading a figure that has since
         moved. Closing it again writes a fresh one. */
      await tx.batchStatement.deleteMany({ where: { batchId } });

      await recordAudit(
        {
          actor: user,
          action: "batch.reopened",
          entity: "Batch",
          entityId: batch.id,
          summary: withNote(`Reopened ${batch.batchNumber}`, reason),
          metadata: { reason, closedAt: batch.closedAt.toISOString() },
        },
        tx
      );
    });

    revalidatePath(`/app/shipments/${batchId}`);
    revalidatePath("/app/shipments");
    return ok({});
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * The boss reads the flight's statement and says yes, or sends it back.
 *
 * The owner's rule: a batch closes when Finance shuts it, and it is FINISHED
 * when the boss has reviewed and confirmed it. Two different facts, and the
 * gap between them is the whole point — somebody senior looks at what each
 * flight made before it becomes the record.
 *
 * Sending it back reopens the flight, because a statement the boss does not
 * accept is a flight that is not finished: Finance can add the cost that was
 * missing, chase the customer again, and close it afresh.
 */
export async function reviewStatement(
  _prev: ActionResult<{ status: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ status: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("statement.review");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();

  if (decision !== "CONFIRMED" && decision !== "RETURNED") {
    return fail(t(locale, "Confirm it or send it back."));
  }
  /* Sending a statement back asks for nothing. What was returned, by whom
     and when is on the record either way, and the note is offered above it. */

  try {
    await prisma.$transaction(async (tx) => {
      const statement = await tx.batchStatement.findUnique({
        where: { batchId },
        select: {
          id: true,
          status: true,
          batch: { select: { batchNumber: true, closedAt: true } },
        },
      });
      if (!statement) throw new Error(t(locale, "There is no statement to review."));
      if (statement.status === "CONFIRMED") {
        throw new Error(t(locale, "This one has already been confirmed."));
      }
      /*
        A statement can only be signed while its flight is actually shut.

        Sending one back reopens the flight, and the statement stays on it so
        Finance can read the note. Confirming that stale copy would sign off
        figures for a flight that is trading again — costs landing on it,
        payments arriving — and make them the record.
      */
      if (decision === "CONFIRMED" && !statement.batch.closedAt) {
        throw new Error(
          t(
            locale,
            "This batch was reopened after you sent it back. Finance has to close it again before it can be confirmed."
          )
        );
      }

      await tx.batchStatement.update({
        where: { id: statement.id },
        data: {
          status: decision,
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNote: reviewNote || null,
        },
      });

      if (decision === "RETURNED") {
        await tx.batch.update({
          where: { id: batchId },
          data: {
            status: "VERIFIED",
            closedAt: null,
            closedById: null,
            closeKind: null,
            /* The note explained a close that has been undone. Leaving it on
               an open flight makes the next close inherit somebody else's
               explanation. */
            closeNote: null,
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: decision === "CONFIRMED" ? "statement.confirmed" : "statement.returned",
          entity: "Batch",
          entityId: batchId,
          summary:
            decision === "CONFIRMED"
              ? `Confirmed the closing statement for ${statement.batch.batchNumber}`
              : `Sent ${statement.batch.batchNumber} back — ${reviewNote}`,
          metadata: { reviewNote: reviewNote || null },
        },
        tx
      );
    });

    revalidatePath("/app/finance/income");
    revalidatePath(`/app/shipments/${batchId}`);
    return ok({ status: decision });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Send a carried piece back to the flight it came from.
 *
 * Carrying cargo forward is a decision made under pressure at a close, and
 * decisions made at closes get reversed — the boss declines the statement, or
 * somebody realises the wrong consignment was moved. Without this the only way
 * back was to edit the database.
 *
 * It refuses if the old flight is closed. Putting unpaid cargo back onto shut
 * books would make a statement the boss has already read wrong, and silently
 * reopening his flight to accept it would be worse. Reopen it deliberately —
 * which is exactly what declining the statement already does — and then send
 * the cargo home.
 */
export async function returnCarriedCargo(
  _prev: ActionResult<Record<string, never>> | undefined,
  formData: FormData
): Promise<ActionResult<Record<string, never>>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("batch.close");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!shipmentId) return fail(t(locale, "Missing cargo."));

  try {
    const back = await prisma.$transaction(async (tx) => {
      const piece = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          trackingNumber: true,
          batch: { select: { batchNumber: true } },
          carriedFromBatch: {
            select: { id: true, batchNumber: true, closedAt: true },
          },
        },
      });
      if (!piece) throw new Error(t(locale, "That cargo no longer exists."));
      if (!piece.carriedFromBatch) {
        throw new Error(t(locale, "This cargo was not carried from anywhere."));
      }
      if (piece.carriedFromBatch.closedAt) {
        throw new Error(
          `${piece.carriedFromBatch.batchNumber} ${t(locale, "is closed. Reopen it before sending this cargo back.")}`
        );
      }

      await tx.shipment.update({
        where: { id: piece.id },
        data: {
          batchId: piece.carriedFromBatch.id,
          carriedFromBatchId: null,
          carriedAt: null,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "shipment.carryUndone",
          entity: "Shipment",
          entityId: piece.id,
          summary: `Sent ${piece.trackingNumber} back to ${piece.carriedFromBatch.batchNumber} from ${piece.batch?.batchNumber ?? "—"}`,
          metadata: {
            from: piece.batch?.batchNumber ?? null,
            to: piece.carriedFromBatch.batchNumber,
          },
        },
        tx
      );

      return { toBatchId: piece.carriedFromBatch.id };
    });

    revalidatePath("/app/shipments");
    revalidatePath(`/app/shipments/${back.toBatchId}`);
    return ok({});
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Move one consignment onto a different flight.
 *
 * Cargo gets put on the wrong batch — a box scanned into the wrong pile in
 * Guangzhou, a consignment recorded against the flight before it. Until now
 * the only fix was batch.manage, which also seals and dispatches, so the desks
 * that actually notice the mistake could not correct it.
 *
 * The maths needs no help. Every batch figure — weight, revenue, collected,
 * outstanding — is computed live from the cargo currently on the batch, so
 * moving a piece moves its money with it in the same breath. What must not
 * happen is a move touching a flight whose books are shut: that would change a
 * statement the boss has already read, and the fix for a mistake found after a
 * close is to reopen it deliberately.
 */
export async function moveShipmentToBatch(
  _prev: ActionResult<{ to: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ to: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.move");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  const toBatchId = String(formData.get("toBatchId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!shipmentId || !toBatchId) return fail(t(locale, "Missing cargo or batch."));
  /* The audit line already names both flights and the cargo that moved
     between them, which is the fact anybody checking is looking for. */

  try {
    const moved = await prisma.$transaction(async (tx) => {
      const piece = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          trackingNumber: true,
          batchId: true,
          origin: true,
          cargoCategory: true,
          batch: { select: { batchNumber: true, closedAt: true } },
        },
      });
      if (!piece) throw new Error(t(locale, "That cargo no longer exists."));
      if (piece.batchId === toBatchId) {
        throw new Error(t(locale, "It is already on that batch."));
      }
      if (piece.batch?.closedAt) {
        throw new Error(
          `${piece.batch.batchNumber} ${t(locale, "is closed. Reopen it before moving cargo off it.")}`
        );
      }

      const target = await tx.batch.findUnique({
        where: { id: toBatchId },
        select: { id: true, batchNumber: true, closedAt: true, origin: true },
      });
      if (!target) throw new Error(t(locale, "That batch no longer exists."));
      if (target.closedAt) {
        throw new Error(
          `${target.batchNumber} ${t(locale, "is closed. Cargo cannot be moved onto shut books.")}`
        );
      }

      /*
        The airport travels with the box.

        A consignment's origin is where it physically flew from, and the schema
        says it must match the batch it is on. Moving a piece onto a Hong Kong
        flight while leaving it stamped Guangzhou is how a manifest, a label and
        an invoice end up naming a city the cargo never saw. Nothing about the
        money moves with it: the rate book is keyed on what the goods ARE, not
        where they left from, so the price is the price either way.
      */
      const originMoves = piece.origin !== target.origin;

      await tx.shipment.update({
        where: { id: piece.id },
        data: { batchId: target.id, origin: target.origin },
      });

      /* Field-level history as well as the audit line: "which batch" is a
         property of the consignment, and the cargo's own record should show
         it changed without anybody going to the audit log to find out. */
      await tx.fieldChange.create({
        data: {
          entity: "Shipment",
          entityId: piece.id,
          field: "Batch",
          before: piece.batch?.batchNumber ?? null,
          after: target.batchNumber,
          actorId: user.id,
          actorName: user.name ?? user.email ?? null,
        },
      });

      if (originMoves) {
        await tx.fieldChange.create({
          data: {
            entity: "Shipment",
            entityId: piece.id,
            field: "Origin",
            before: ORIGIN_LABELS[piece.origin],
            after: ORIGIN_LABELS[target.origin],
            actorId: user.id,
            actorName: user.name ?? user.email ?? null,
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "shipment.moved",
          entity: "Shipment",
          entityId: piece.id,
          summary:
            withNote(
              `Moved ${piece.trackingNumber} from ${piece.batch?.batchNumber ?? "—"} to ${target.batchNumber}`,
              reason
            ) +
            (originMoves
              ? `. Origin now ${ORIGIN_LABELS[target.origin]}` +
                (categoryFitsRoute(piece.cargoCategory, target.origin)
                  ? ""
                  : `, and this cargo normally flies from ${ORIGIN_LABELS[routeFor(piece.cargoCategory)]}`)
              : ""),
          metadata: {
            from: piece.batch?.batchNumber ?? null,
            to: target.batchNumber,
            reason,
            originFrom: piece.origin,
            originTo: target.origin,
          },
        },
        tx
      );

      return { from: piece.batchId, to: target.id, batchNumber: target.batchNumber };
    });

    revalidatePath("/app/shipments");
    if (moved.from) revalidatePath(`/app/shipments/${moved.from}`);
    revalidatePath(`/app/shipments/${moved.to}`);
    return ok({ to: moved.batchNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Filling the flight in after the cargo has already gone.
 *
 * The yard sends the boxes to the airport and then waits — sometimes days —
 * for the airline to issue a waybill, and the real flight and its date are
 * only settled at the same moment. Dispatch therefore records what is true
 * when the lorry leaves, and this is where the rest arrives: waybill, airline,
 * flight number, the day it actually left, the day it is expected, and the
 * note. Editable as many times as it takes, because "we were told 23rd, then
 * they moved it to the 25th" is the ordinary case, not an exception.
 *
 * WHAT IT WILL NOT TOUCH: the day it actually landed. Arrival is written by
 * the Dar floor pressing "Mark as arrived", and the storage clock starts from
 * it — a date typed here could put a customer a week into storage charges, or
 * take a week off them, without anybody handling the cargo.
 *
 * Closed flights are refused. The statement is frozen and its dates are part
 * of what was signed off; reopen it first, exactly as a cost would have to be.
 */
export async function updateFlightDetails(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.depart");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = z
    .object({
      batchId: z.string().trim().min(1, t(locale, "Missing flight.")),
      waybillNumber: z.string().trim().max(40).optional(),
      airline: z.string().trim().max(80).optional(),
      departureDate: z.string().trim().optional(),
      expectedArrival: z.string().trim().optional(),
      notes: z.string().trim().max(1000).optional(),
      reason: z.string().trim().max(300).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  const departureDate = input.departureDate ? new Date(input.departureDate) : null;
  if (departureDate && Number.isNaN(departureDate.getTime())) {
    return fail(t(locale, "That departure date is not valid."));
  }
  const expectedArrival = input.expectedArrival
    ? new Date(input.expectedArrival)
    : null;
  if (expectedArrival && Number.isNaN(expectedArrival.getTime())) {
    return fail(t(locale, "That expected arrival date is not valid."));
  }
  if (expectedArrival && departureDate && expectedArrival < departureDate) {
    return fail(t(locale, "The cargo cannot arrive before it leaves."));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: input.batchId },
        select: {
          id: true,
          batchNumber: true,
          permanent: true,
          closedAt: true,
          waybillNumber: true,
          airline: true,
          flightNumber: true,
          departureDate: true,
          expectedArrival: true,
          notes: true,
        },
      });
      if (!batch) throw new Error(t(locale, "That flight no longer exists."));
      if (batch.permanent) {
        throw new Error(
          t(locale, "A loading table has no flight details until it is dispatched.")
        );
      }
      if (batch.closedAt) {
        throw new Error(
          `${batch.batchNumber} ${t(locale, "is closed and its statement is frozen. Reopen it before changing the flight.")}`
        );
      }

      /* No flightNumber. The owner took the field off every form — the
         waybill is what the airline is chased on and what the manifest is
         filed under, and a second number nobody uses was one more box to
         leave blank. It is not listed here either, so a save cannot quietly
         null out what an older dispatch already carries. */
      const next = {
        waybillNumber: input.waybillNumber || null,
        airline: input.airline || null,
        departureDate,
        expectedArrival,
        notes: input.notes || null,
      };

      /* What actually moved, in words, so the log reads as a story rather
         than a diff nobody can interpret two months later. */
      const asText = (v: unknown) =>
        v instanceof Date ? v.toISOString().slice(0, 10) : ((v as string | null) ?? "—");
      const changed = (
        Object.keys(next) as (keyof typeof next)[]
      ).filter((key) => asText(batch[key]) !== asText(next[key]));
      if (changed.length === 0) {
        throw new Error(t(locale, "Nothing was changed."));
      }

      /* The departure date is also stamped on every consignment on the
         flight — the cargo's own record of when it left — so the two cannot
         be allowed to drift apart. Deleted cargo is left alone: it is not on
         this flight any more in any view that matters. */
      const moved = await tx.batch.updateMany({
        where: { id: batch.id, closedAt: null },
        data: next,
      });
      if (moved.count === 0) {
        throw new Error(
          t(locale, "This flight was closed a moment ago. Reload before changing it.")
        );
      }
      if (asText(batch.departureDate) !== asText(departureDate)) {
        await tx.shipment.updateMany({
          where: { batchId: batch.id, deletedAt: null },
          data: { departedAt: departureDate },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "batch.flightDetails",
          entity: "Batch",
          entityId: batch.id,
          summary:
            `Updated ${changed.join(", ")} on ${batch.batchNumber}` +
            (input.reason ? ` — ${input.reason}` : ""),
          metadata: {
            batch: batch.batchNumber,
            reason: input.reason ?? null,
            changes: Object.fromEntries(
              changed.map((key) => [
                key,
                { from: asText(batch[key]), to: asText(next[key]) },
              ])
            ),
          },
        },
        tx
      );
    });

    revalidatePath("/app/shipments");
    revalidatePath(`/app/shipments/${input.batchId}`);
    revalidatePath("/app/batches");
    revalidatePath(`/app/batches/${input.batchId}`);
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
