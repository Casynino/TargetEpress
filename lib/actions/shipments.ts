"use server";

import { revalidatePath } from "next/cache";
import type { Origin, Prisma, ShipmentStatus } from "@prisma/client";

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
  packageReference,
} from "@/lib/ids";
import { assignToLoadingTable } from "@/lib/batching";
import { quote } from "@/lib/pricing";
import { prisma, type TxClient } from "@/lib/prisma";
import { canAmendCargo, cargoCustody } from "@/lib/rbac";
import { translateText, translationColumns } from "@/lib/translate";
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
  tx: TxClient,
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


/**
 * Finds or creates the customer a shipment belongs to.
 *
 * Three routes in, in order of trust:
 *
 *  1. The clerk picked a record from the book. That id wins outright — it is an
 *     explicit human decision and nothing else should override it.
 *  2. A phone number matches an existing customer. Phone numbers are unique, so
 *     this is safe.
 *  3. Nothing matches: a new record is created and enters the book, ready to be
 *     found by name next time.
 *
 * Deliberately does NOT match on name alone when creating. Two different traders
 * called "Daniel" are common, and silently merging their cargo would hand one
 * customer's goods to another.
 */
async function resolveCustomer(
  tx: TxClient,
  input: {
    customerId: string | null;
    customerName: string;
    customerPhone: string | null;
    customerCity?: string;
  },
  actorId: string
) {
  if (input.customerId) {
    const picked = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!picked) throw new Error("That customer no longer exists.");
    return picked;
  }

  const phone = input.customerPhone ? normalisePhone(input.customerPhone) : null;

  if (phone) {
    const existing = await tx.customer.findUnique({ where: { phone } });
    if (existing) {
      if (existing.name !== input.customerName) {
        // Keep the most recent spelling the desk used, but never reassign the
        // number to a different person's shipments.
        await tx.customer.update({
          where: { id: existing.id },
          data: { name: input.customerName },
        });
      }
      return existing;
    }
  }

  return tx.customer.create({
    data: {
      code: await nextCustomerCode(tx),
      name: input.customerName,
      phone,
      city: input.customerCity || null,
      createdById: actorId,
    },
  });
}

export type ShipmentCreated = {
  /* For the mistake caught ten seconds after pressing register: the success
     screen offers delete, and delete addresses the row by id. */
  id: string;
  trackingNumber: string;
  /** The loading table it landed on — the clerk never chose this. */
  batchNumber: string;
  /** Which route's table, for wording the confirmation. */
  origin: Origin;
};

export async function createShipment(
  _prev: ActionResult<ShipmentCreated> | undefined,
  formData: FormData
): Promise<ActionResult<ShipmentCreated>> {
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
    // Uploads happen before the transaction: they are slow, and a database
    // transaction must not be held open across network I/O.
    uploaded = await putImages(photoFiles, "receiving");
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await resolveCustomer(tx, input, user.id);

      // The departure airport is derived from what the cargo is. The warehouse
      // never picks it, so cargo cannot be routed to the wrong hub by mistake.
      const origin = routeFor(input.cargoCategory);

      // Which loading table this lands on is decided here, not by the clerk.
      // The category fixes the route, the route fixes the table. See
      // lib/batching.
      const assignment = await assignToLoadingTable(tx, origin);

      // Cargo billed per item is counted in items, not cartons.
      //
      // One number does two jobs on this record: how many things the warehouse
      // must physically account for, and — for a product on a per-item rate —
      // how many units the customer is charged for. When the rate book prices
      // by the item, the label has to say so, or a manifest reads "8 packages"
      // while the invoice charges for 8 cameras and nobody can tell which is
      // meant. Enforced here rather than in the form, because the desk should
      // not have to know which products carry which kind of rate.
      const priced = await quote({
        category: input.cargoCategory,
        cargoTypeId: input.cargoTypeId,
        weightKg: input.weightKg,
        quantity: input.packages,
      });
      const packageType =
        priced.ok && priced.method === "FIXED_PER_ITEM"
          ? "PIECE"
          : input.packageType;

      /*
        Both languages, worked out before the row is written.

        The Guangzhou desk types in whichever language it thinks in; Dar,
        Finance and Support read English. Neither should translate anything by
        hand, and the original is never replaced — these only add columns
        beside it.

        Never fatal: an unknown word, or a translation service that is slow or
        down, leaves the rendering null and every screen falls back to what was
        typed. Registering cargo does not wait on a third party with a customer
        at the counter.
      */
      const describedAs = await translateText(input.description, { learn: true, tx });
      const notedAs = await translateText(input.internalNotes, { tx });

      const shipment = await tx.shipment.create({
        data: {
          trackingNumber: await nextTrackingNumber(tx),
          qrToken: generateQrToken(),
          customerId: customer.id,
          cargoCategory: input.cargoCategory,
          cargoTypeId: input.cargoTypeId,
          goodsType: input.goodsType,
          ...translationColumns("description", describedAs),
          description: input.description,
          packages: input.packages,
          packageType,
          weightKg: input.weightKg,
          volumeCbm: input.volumeCbm ?? null,
          origin,
          ...translationColumns("internalNotes", notedAs),
          internalNotes: input.internalNotes || null,
          batchId: assignment.batchId,
          status: "READY_TO_DEPART",
          createdById: user.id,
        },
      });

      // One row per physical package, each with its own QR. The warehouse
      // handles boxes, not orders, so every box needs its own identity.
      await tx.package.createMany({
        data: Array.from({ length: input.packages }, (_, index) => ({
          shipmentId: shipment.id,
          sequence: index + 1,
          reference: packageReference(shipment.trackingNumber, index + 1),
          qrToken: generateQrToken(),
        })),
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
        note: `Cargo received and registered as ${CATEGORY_LABELS[input.cargoCategory].toLowerCase()}, waiting on the ${AIRPORT_LABELS[origin]} loading table.`,
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
            loadingTable: assignment.batchNumber,
          },
        },
        tx
      );

      return { shipment, assignment };
    });

    revalidatePath("/app/cargo");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/batches");
    revalidatePath(`/app/batches/${result.assignment.batchId}`);

    return ok({
      id: result.shipment.id,
      trackingNumber: result.shipment.trackingNumber,
      batchNumber: result.assignment.batchNumber,
      origin: result.shipment.origin,
    });
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
  if (!id) return fail("Missing cargo.");

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
      if (!shipment) throw new Error("Cargo not found.");
      // Once cargo has left China its recorded weight is what was billed and
      // flown. Correcting it afterwards would rewrite history.
      if (shipment.status !== "READY_TO_DEPART") {
        throw new Error(
          "This cargo has already departed and can no longer be edited."
        );
      }

      // Edited text is re-rendered. A stale translation of a description that
      // has since been corrected is worse than none — it reads as authoritative.
      const editedDescription = await translateText(input.description, { learn: true, tx });
      const editedNotes = await translateText(input.internalNotes, { tx });

      await tx.shipment.update({
        where: { id },
        data: {
          cargoCategory: input.cargoCategory,
          cargoTypeId: input.cargoTypeId,
          goodsType: input.goodsType,
          ...translationColumns("description", editedDescription),
          description: input.description,
          packages: input.packages,
          weightKg: input.weightKg,
          volumeCbm: input.volumeCbm ?? null,
          origin: routeFor(input.cargoCategory),
          ...translationColumns("internalNotes", editedNotes),
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

    revalidatePath(`/app/cargo/${id}`);
    revalidatePath("/app/cargo");
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
      /* Holding shipment.cancel is not the whole question since both warehouses
         hold it — each over its own half of the journey. The Cancel control on
         the cargo page asks the same pair before it renders. */
      if (!canAmendCargo(user.role, shipment.status)) {
        throw new Error(
          cargoCustody(shipment.status) === "LANDED"
            ? "This cargo has landed in Dar. Only the Dar warehouse, a manager or the owner can cancel it now."
            : "This cargo has not landed in Dar yet. Only Guangzhou, a manager or the owner can cancel it now."
        );
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

    revalidatePath(`/app/cargo/${id}`);
    revalidatePath("/app/cargo");
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
    revalidatePath(`/app/cargo/${input.shipmentId}`);
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
    // exception.close, not exception.resolve: this writes a TERMINAL status,
    // and a terminal status lifts the pickup lock (lib/pickup-lock.ts). The Dar
    // floor holds exception.resolve, so gating on it let the desk that reported
    // cargo missing close its own case and release the cargo it could not find.
    user = await authorize("exception.close");
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
