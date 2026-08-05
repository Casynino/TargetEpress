"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { DamageSeverity, ExceptionType } from "@prisma/client";

import {
  DAMAGE_SEVERITY_LABELS,
  EXCEPTION_OPEN_STATUSES,
  EXCEPTION_TYPE_LABELS,
  PACKAGE_TYPE_LABELS,
} from "@/lib/constants";
import { autoPriceShipments } from "@/lib/auto-price";
import { recordAudit } from "@/lib/audit";
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
import { nextBatchNumber } from "@/lib/ids";
import { nextDispatchNumber } from "@/lib/ids";
import { prisma, type TxClient } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { batchSchema, departureSchema, firstError } from "@/lib/validation";

export async function createBatch(
  _prev: ActionResult<{ id: string; batchNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string; batchNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("batch.create");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = batchSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));

  try {
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.batch.create({
        data: {
          batchNumber: await nextBatchNumber(tx),
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
  let user: SessionUser;
  try {
    user = await authorize("batch.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  const batchId = String(formData.get("batchId") ?? "");
  if (!shipmentId) return fail("Missing shipment.");

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
      if (!shipment) throw new Error("Shipment not found.");
      if (shipment.status !== "READY_TO_DEPART") {
        throw new Error("Only cargo still in China can change batch.");
      }
      if (shipment.batch && shipment.batch.status !== "OPEN") {
        throw new Error(
          `${shipment.trackingNumber} is already sealed into ${shipment.batch.batchNumber}.`
        );
      }

      if (batchId) {
        const batch = await tx.batch.findUnique({
          where: { id: batchId },
          select: { id: true, status: true, batchNumber: true, origin: true },
        });
        if (!batch) throw new Error("Batch not found.");
        if (batch.status !== "OPEN") {
          throw new Error("That batch is sealed and cannot take more cargo.");
        }

        // Route guard. Electronics and liquids fly Hong Kong; normal goods fly
        // Guangzhou. Mixing them would put cargo on a flight from an airport it
        // is not sitting in, so this is refused rather than warned about.
        if (!categoryFitsRoute(shipment.cargoCategory, batch.origin)) {
          throw new Error(
            `${shipment.trackingNumber} is ${CATEGORY_LABELS[shipment.cargoCategory].toLowerCase()}, which flies from ${AIRPORT_LABELS[routeFor(shipment.cargoCategory)]}. ${batch.batchNumber} departs ${AIRPORT_LABELS[batch.origin]}.`
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
  let user: SessionUser;
  try {
    user = await authorize("batch.manage");
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
          _count: { select: { shipments: true } },
        },
      });
      if (!batch) throw new Error("Batch not found.");
      if (batch.status !== "OPEN") throw new Error("This batch is already sealed.");
      if (batch._count.shipments === 0) {
        throw new Error("Add at least one shipment before sealing.");
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
          summary: `Sealed ${batch.batchNumber} with ${batch._count.shipments} shipment(s)`,
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
  let user: SessionUser;
  try {
    user = await authorize("shipment.depart");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = departureSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  const departureDate = new Date(input.departureDate);
  if (Number.isNaN(departureDate.getTime())) {
    return fail("Departure date is not valid.");
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
            where: { status: "READY_TO_DEPART" },
            select: { id: true, origin: true },
          },
        },
      });
      if (!batch) throw new Error("Batch not found.");
      if (batch.status === "IN_TRANSIT" || batch.status === "ARRIVED") {
        throw new Error("This batch has already departed.");
      }
      if (batch.shipments.length === 0) {
        throw new Error("There is no cargo in this batch ready to depart.");
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


const dispatchSchema = z.object({
  batchId: z.string().trim().min(1, "Missing loading table."),
  waybillNumber: z.string().trim().min(3, "The waybill number is required.").max(40),
  airline: z.string().trim().min(2, "Which airline is carrying it?").max(80),
  flightNumber: z.string().trim().max(20).optional(),
  departureDate: z.string().trim().min(1, "When does it leave?"),
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
  let user: SessionUser;
  try {
    user = await authorize("shipment.depart");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = dispatchSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  const departureDate = new Date(input.departureDate);
  if (Number.isNaN(departureDate.getTime())) {
    return fail("That departure date is not valid.");
  }

  const expectedArrival = input.expectedArrival
    ? new Date(input.expectedArrival)
    : null;
  if (expectedArrival && Number.isNaN(expectedArrival.getTime())) {
    return fail("That expected arrival date is not valid.");
  }
  if (expectedArrival && expectedArrival < departureDate) {
    return fail("The cargo cannot arrive before it leaves.");
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
            where: { status: "READY_TO_DEPART" },
            select: { id: true },
          },
        },
      });

      if (!table) throw new Error("That loading table no longer exists.");
      if (!table.permanent) {
        throw new Error("Only a loading table can be dispatched.");
      }
      if (table.shipments.length === 0) {
        throw new Error("There is no cargo on this table to dispatch.");
      }

      const dispatch = await tx.batch.create({
        data: {
          batchNumber: await nextDispatchNumber(tx, table.origin),
          origin: table.origin,
          permanent: false,
          status: "IN_TRANSIT",
          waybillNumber: input.waybillNumber,
          airline: input.airline,
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
          note:
            `Dispatched as ${dispatch.batchNumber} on ${input.airline}` +
            (input.flightNumber ? ` ${input.flightNumber.toUpperCase()}` : "") +
            ` (waybill ${input.waybillNumber}).`,
          actorId: user.id,
        })),
      });

      await recordAudit(
        {
          actor: user,
          action: "batch.dispatch",
          entity: "Batch",
          entityId: dispatch.id,
          summary: `Dispatched ${dispatch.batchNumber} — ${moved.count} pieces on ${input.airline}`,
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
          body:
            `${moved.count} pieces on ${input.airline}` +
            (input.flightNumber ? ` ${input.flightNumber.toUpperCase()}` : "") +
            `, waybill ${input.waybillNumber}.`,
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
  let user: SessionUser;
  try {
    user = await authorize("batch.receive");
  } catch (error) {
    return fail(toActionError(error));
  }

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return fail("Missing batch.");

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: { id: true, status: true, batchNumber: true },
      });
      if (!batch) throw new Error("Batch not found.");
      if (batch.status !== "IN_TRANSIT") {
        throw new Error("Only a batch in transit can be marked as arrived.");
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

  if (!batchId || !shipmentId) return fail("Missing shipment.");

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
      if (!shipment) throw new Error("Shipment not found.");
      if (shipment.batchId !== batchId) {
        throw new Error("That shipment is not in this batch.");
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
    // lib/auto-price.
    if (landed) await autoPriceShipments([landed], user.id);

    revalidatePath(`/app/receive/${batchId}`);
    revalidatePath("/app/receive");
    revalidatePath("/app/exceptions");
    // Flagged cargo now lands in the warehouse, so the views that count what is
    // standing on the floor have to be told about it too.
    revalidatePath("/app/inventory");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/finance/invoices");
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
          _count: { select: { shipments: true, verifications: true } },
        },
      });
      if (!batch) throw new Error("Batch not found.");
      if (batch.status !== "ARRIVED") {
        throw new Error("This batch is not being checked in.");
      }
      if (batch._count.verifications < batch._count.shipments) {
        throw new Error(
          `${batch._count.shipments - batch._count.verifications} shipment(s) still unchecked.`
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
    // seven extra queries do not belong inside one lock.
    await autoPriceShipments(checkedIn, user.id);

    revalidatePath(`/app/receive/${batchId}`);
    revalidatePath("/app/receive");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/inventory");
    revalidatePath("/app/finance/invoices");

    // ActionResult carries no message channel, and the page re-reads the batch
    // on revalidate, so the new counts are the feedback.
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
