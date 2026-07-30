"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import {
  AIRPORT_LABELS,
  CATEGORY_LABELS,
  categoryFitsRoute,
  routeFor,
} from "@/lib/cargo";
import { nextBatchNumber } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
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
    revalidatePath("/app/shipments");
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
 * Ticking one shipment off the printed manifest.
 *
 * VERIFIED moves the shipment to RECEIVED_AT_DAR — the only path into that
 * status. EXCEPTION leaves the shipment where it is and opens a case, because
 * cargo that is missing or damaged has not truly "arrived".
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
  const result = String(formData.get("result") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const exceptionType = String(formData.get("exceptionType") ?? "OTHER");

  if (!batchId || !shipmentId) return fail("Missing shipment.");
  if (result !== "VERIFIED" && result !== "EXCEPTION") {
    return fail("Choose verified or exception.");
  }
  if (result === "EXCEPTION" && note.length < 3) {
    return fail("Describe the problem before flagging an exception.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          status: true,
          trackingNumber: true,
          batchId: true,
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

      if (result === "VERIFIED") {
        if (shipment.status === "IN_TRANSIT") {
          const now = new Date();
          await tx.shipment.update({
            where: { id: shipmentId },
            data: { status: "RECEIVED_AT_DAR", arrivedAt: now },
          });
          await tx.shipmentStatusHistory.create({
            data: {
              shipmentId,
              fromStatus: "IN_TRANSIT",
              toStatus: "RECEIVED_AT_DAR",
              location: "Dar es Salaam warehouse",
              note: note || "Checked in against the batch manifest.",
              actorId: user.id,
            },
          });
        }
      } else {
        await tx.shipmentException.create({
          data: {
            shipmentId,
            batchId,
            type: exceptionType as never,
            description: note,
            raisedById: user.id,
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action:
            result === "VERIFIED"
              ? "batch.verifyShipment"
              : "batch.flagShipment",
          entity: "Shipment",
          entityId: shipmentId,
          summary:
            result === "VERIFIED"
              ? `Checked in ${shipment.trackingNumber}`
              : `Flagged ${shipment.trackingNumber}: ${exceptionType}`,
          metadata: note ? { note } : undefined,
        },
        tx
      );
    });

    revalidatePath(`/app/receive/${batchId}`);
    revalidatePath("/app/exceptions");
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
