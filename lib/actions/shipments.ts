"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, ShipmentStatus } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import {
  AIRPORT_LABELS,
  CATEGORY_LABELS,
  categoryFitsRoute,
  routeFor,
} from "@/lib/cargo";
import { normalisePhone } from "@/lib/format";
import {
  generateQrToken,
  nextCustomerCode,
  nextTrackingNumber,
} from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { filesFrom, putImages } from "@/lib/storage";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { exceptionSchema, firstError, shipmentSchema } from "@/lib/validation";

const ORIGIN_PLACE: Record<string, string> = {
  GUANGZHOU: "Guangzhou, China",
  HONG_KONG: "Hong Kong",
};

/**
 * Records a status transition. Always called inside the same transaction as
 * the status change itself, so history can never drift from reality.
 */
async function appendHistory(
  tx: Prisma.TransactionClient,
  args: {
    shipmentId: string;
    fromStatus: ShipmentStatus | null;
    toStatus: ShipmentStatus;
    location?: string;
    note?: string;
    actorId: string;
  }
) {
  await tx.shipmentStatusHistory.create({
    data: {
      shipmentId: args.shipmentId,
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      location: args.location,
      note: args.note,
      actorId: args.actorId,
    },
  });
}

export async function createShipment(
  _prev: ActionResult<{ trackingNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("shipment.create");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = shipmentSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  // Every shipment must carry a visual record from the moment it is received.
  // Enforced here, not only in the form, so it cannot be skipped by posting
  // the action directly.
  const photoFiles = filesFrom(formData, "photos");
  if (photoFiles.length === 0) {
    return fail(
      "At least one photo of the cargo is required before the shipment can be saved."
    );
  }

  let uploaded;
  try {
    // Uploads happen before the transaction: they are slow, and a database
    // transaction must not be held open across network I/O.
    uploaded = await putImages(photoFiles, "receiving");
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const phone = normalisePhone(input.customerPhone);

      // Warehouse staff should never have to look a customer up first —
      // the phone number is the key, and a new one creates the record.
      let customer = await tx.customer.findUnique({ where: { phone } });
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            code: await nextCustomerCode(tx),
            name: input.customerName,
            phone,
            city: input.customerCity || null,
            createdById: user.id,
          },
        });
      } else if (customer.name !== input.customerName) {
        // Keep the most recent spelling the desk used, but never silently
        // reassign the phone number to a different person's shipments.
        await tx.customer.update({
          where: { id: customer.id },
          data: { name: input.customerName },
        });
      }

      // The departure airport is derived from what the cargo is. The warehouse
      // never picks it, so cargo cannot be routed to the wrong hub by mistake.
      const origin = routeFor(input.cargoCategory);

      // A batch can only take cargo while it is open, and only cargo that flies
      // from the same airport.
      let batchId: string | null = null;
      if (input.batchId) {
        const batch = await tx.batch.findUnique({
          where: { id: input.batchId },
          select: { id: true, status: true, origin: true, batchNumber: true },
        });
        if (!batch) throw new Error("That batch no longer exists.");
        if (batch.status !== "OPEN") {
          throw new Error("That batch is already sealed — pick an open batch.");
        }
        if (!categoryFitsRoute(input.cargoCategory, batch.origin)) {
          throw new Error(
            `${CATEGORY_LABELS[input.cargoCategory]} departs ${AIRPORT_LABELS[origin]}, but ${batch.batchNumber} departs ${AIRPORT_LABELS[batch.origin]}.`
          );
        }
        batchId = batch.id;
      }

      const shipment = await tx.shipment.create({
        data: {
          trackingNumber: await nextTrackingNumber(tx),
          qrToken: generateQrToken(),
          customerId: customer.id,
          cargoCategory: input.cargoCategory,
          cargoTypeId: input.cargoTypeId,
          goodsType: input.goodsType,
          description: input.description,
          packages: input.packages,
          weightKg: input.weightKg,
          volumeCbm: input.volumeCbm ?? null,
          origin,
          internalNotes: input.internalNotes || null,
          batchId,
          status: "READY_TO_DEPART",
          createdById: user.id,
        },
      });

      await tx.shipmentPhoto.createMany({
        data: uploaded.map((image, index) => ({
          shipmentId: shipment.id,
          url: image.url,
          kind: "CARGO" as const,
          caption: index === 0 ? "Received at the China warehouse" : null,
          uploadedById: user.id,
        })),
      });

      await appendHistory(tx, {
        shipmentId: shipment.id,
        fromStatus: null,
        toStatus: "READY_TO_DEPART",
        location: ORIGIN_PLACE[origin],
        note: `Cargo received and registered as ${CATEGORY_LABELS[input.cargoCategory].toLowerCase()}, departing ${AIRPORT_LABELS[origin]}.`,
        actorId: user.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "shipment.create",
          entity: "Shipment",
          entityId: shipment.id,
          summary: `Registered ${shipment.trackingNumber} for ${customer.name}`,
          metadata: {
            packages: input.packages,
            weightKg: input.weightKg,
            cargoCategory: input.cargoCategory,
            origin,
            photos: uploaded.length,
          },
        },
        tx
      );

      return shipment;
    });

    revalidatePath("/app/shipments");
    revalidatePath("/app/dashboard");
    if (input.batchId) revalidatePath(`/app/batches/${input.batchId}`);

    return ok({ trackingNumber: result.trackingNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function updateShipment(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("shipment.edit");
  } catch (error) {
    return fail(toActionError(error));
  }

  const id = String(formData.get("shipmentId") ?? "");
  if (!id) return fail("Missing shipment.");

  const parsed = shipmentSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id },
        select: { id: true, status: true, trackingNumber: true },
      });
      if (!shipment) throw new Error("Shipment not found.");
      // Once cargo has left China its recorded weight is what was billed and
      // flown. Correcting it afterwards would rewrite history.
      if (shipment.status !== "READY_TO_DEPART") {
        throw new Error(
          "This shipment has already departed and can no longer be edited."
        );
      }

      await tx.shipment.update({
        where: { id },
        data: {
          cargoCategory: input.cargoCategory,
          cargoTypeId: input.cargoTypeId,
          goodsType: input.goodsType,
          description: input.description,
          packages: input.packages,
          weightKg: input.weightKg,
          volumeCbm: input.volumeCbm ?? null,
          origin: routeFor(input.cargoCategory),
          internalNotes: input.internalNotes || null,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "shipment.update",
          entity: "Shipment",
          entityId: id,
          summary: `Updated ${shipment.trackingNumber} before departure`,
        },
        tx
      );
    });

    revalidatePath(`/app/shipments/${id}`);
    revalidatePath("/app/shipments");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function cancelShipment(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("shipment.cancel");
  } catch (error) {
    return fail(toActionError(error));
  }

  const id = String(formData.get("shipmentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return fail("Missing shipment.");
  if (reason.length < 3) return fail("Give a reason for cancelling.");

  try {
    await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id },
        select: { id: true, status: true, trackingNumber: true },
      });
      if (!shipment) throw new Error("Shipment not found.");
      if (shipment.status === "DELIVERED") {
        throw new Error("Delivered cargo cannot be cancelled.");
      }

      await tx.shipment.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      await appendHistory(tx, {
        shipmentId: id,
        fromStatus: shipment.status,
        toStatus: "CANCELLED",
        note: reason,
        actorId: user.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "shipment.cancel",
          entity: "Shipment",
          entityId: id,
          summary: `Cancelled ${shipment.trackingNumber}: ${reason}`,
        },
        tx
      );
    });

    revalidatePath(`/app/shipments/${id}`);
    revalidatePath("/app/shipments");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function raiseException(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("exception.raise");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = exceptionSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: input.shipmentId },
        select: { id: true, trackingNumber: true, batchId: true },
      });
      if (!shipment) throw new Error("Shipment not found.");

      await tx.shipmentException.create({
        data: {
          shipmentId: shipment.id,
          batchId: shipment.batchId,
          type: input.type,
          description: input.description,
          raisedById: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.raise",
          entity: "Shipment",
          entityId: shipment.id,
          summary: `Exception on ${shipment.trackingNumber}: ${input.type}`,
          metadata: { description: input.description },
        },
        tx
      );
    });

    revalidatePath("/app/exceptions");
    revalidatePath(`/app/shipments/${input.shipmentId}`);
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function resolveException(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("exception.resolve");
  } catch (error) {
    return fail(toActionError(error));
  }

  const id = String(formData.get("exceptionId") ?? "");
  const note = String(formData.get("resolutionNote") ?? "").trim();
  if (!id) return fail("Missing exception.");
  if (note.length < 3) return fail("Explain how it was resolved.");

  try {
    await prisma.$transaction(async (tx) => {
      const exception = await tx.shipmentException.findUnique({
        where: { id },
        select: { id: true, status: true, shipment: { select: { trackingNumber: true } } },
      });
      if (!exception) throw new Error("Exception not found.");
      if (exception.status !== "OPEN") throw new Error("Already closed.");

      await tx.shipmentException.update({
        where: { id },
        data: {
          status: "RESOLVED",
          resolvedById: user.id,
          resolvedAt: new Date(),
          resolutionNote: note,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.resolve",
          entity: "ShipmentException",
          entityId: id,
          summary: `Resolved exception on ${exception.shipment.trackingNumber}`,
          metadata: { note },
        },
        tx
      );
    });

    revalidatePath("/app/exceptions");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
