"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Deleting and restoring cargo.
 *
 * Nothing is ever destroyed. A delete sets a timestamp, a person and a reason;
 * the row, its photos and its whole status history stay exactly where they were.
 * That is deliberate: the most common reason to delete is a duplicate entry, and
 * the second most common is a mistake — neither should be able to take the
 * evidence with it.
 *
 * A restore is the same operation backwards, and is equally audited.
 */

const deleteSchema = z.object({
  shipmentId: z.string().trim().min(1, "Missing cargo."),
  reason: z
    .string()
    .trim()
    .min(4, "Say why this is being deleted — it is kept on the record.")
    .max(500),
});

export async function deleteCargo(
  _prev: ActionResult<{ trackingNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string }>> {
  let user: SessionUser;
  try {
    // The warehouse deletes its own mistakes — a duplicate registration is
    // theirs to undo, and making them ask the CEO means the duplicate stays on
    // the manifest all week. Nothing is destroyed by this; see below.
    user = await authorize("shipment.delete");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = deleteSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the details.");
  }
  const input = parsed.data;

  try {
    const cargo = await prisma.shipment.findUnique({
      where: { id: input.shipmentId },
      select: {
        id: true,
        trackingNumber: true,
        deletedAt: true,
        status: true,
        description: true,
        weightKg: true,
        customer: { select: { name: true } },
        invoice: { select: { invoiceNumber: true, amountPaid: true } },
        _count: { select: { photos: true } },
      },
    });
    if (!cargo) return fail("That cargo no longer exists.");
    if (cargo.deletedAt) return fail("That cargo is already deleted.");

    // Once cargo has flown it is on a printed manifest and in a customs file.
    // Management can still remove it; a warehouse cannot.
    if (cargo.status !== "READY_TO_DEPART" && !can(user.role, "shipment.purge")) {
      return fail(
        "This cargo has already left China. Ask management to remove it."
      );
    }

    // Money already taken against it makes this an accounting event, not a
    // typo. Refusing here is safer than leaving a paid invoice pointing at a
    // record that has vanished from every screen.
    if (cargo.invoice && Number(cargo.invoice.amountPaid) > 0) {
      return fail(
        `${cargo.invoice.invoiceNumber} has money against it. Void the invoice through Finance first.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: cargo.id },
        data: {
          deletedAt: new Date(),
          deletedById: user.id,
          deleteReason: input.reason,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "cargo.delete",
          entity: "Shipment",
          entityId: cargo.id,
          summary: `Deleted ${cargo.trackingNumber} — ${input.reason}`,
          // The state at the moment of deletion, so the record can be read
          // without reconstructing it from a dozen other tables.
          metadata: {
            trackingNumber: cargo.trackingNumber,
            customer: cargo.customer.name,
            description: cargo.description,
            weightKg: cargo.weightKg.toString(),
            status: cargo.status,
            photosPreserved: cargo._count.photos,
            reason: input.reason,
          },
        },
        tx
      );
    });

    revalidatePath("/app/batches");
    revalidatePath("/app/cargo");
    revalidatePath("/app/admin/deleted");
    return ok({ trackingNumber: cargo.trackingNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function restoreCargo(
  shipmentId: string
): Promise<ActionResult<{ trackingNumber: string }>> {
  let user: SessionUser;
  try {
    // Restoring is management's call, not the warehouse's — putting a record
    // back onto a batch that has since flown is how a manifest stops matching.
    user = await authorize("shipment.cancel");
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    const cargo = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, trackingNumber: true, deletedAt: true },
    });
    if (!cargo) return fail("That cargo no longer exists.");
    if (!cargo.deletedAt) return fail("That cargo is not deleted.");

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: cargo.id },
        data: { deletedAt: null, deletedById: null, deleteReason: null },
      });

      await recordAudit(
        {
          actor: user,
          action: "cargo.restore",
          entity: "Shipment",
          entityId: cargo.id,
          summary: `Restored ${cargo.trackingNumber}`,
        },
        tx
      );
    });

    revalidatePath("/app/batches");
    revalidatePath("/app/admin/deleted");
    return ok({ trackingNumber: cargo.trackingNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}


/**
 * Erasing a record for good.
 *
 * The only operation in the system that destroys anything, and it exists
 * because occasionally a record must genuinely go — a test entry, a duplicate
 * created by a bad import, a customer exercising a right to be forgotten.
 *
 * It is CEO-only, it refuses anything that has money or a flight attached to
 * it, and it demands the tracking number typed out in full. That last one is
 * not ceremony: it is the difference between deleting the record you are
 * looking at and the one you meant.
 */
export async function purgeCargo(
  _prev: ActionResult<{ trackingNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("shipment.purge");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  const typed = String(formData.get("confirm") ?? "").trim().toUpperCase();
  if (!shipmentId) return fail("Missing cargo.");

  try {
    const cargo = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        trackingNumber: true,
        deletedAt: true,
        batch: { select: { permanent: true } },
        invoice: { select: { invoiceNumber: true, amountPaid: true } },
        _count: { select: { photos: true, packageList: true } },
      },
    });
    if (!cargo) return fail("That cargo no longer exists.");

    if (!cargo.deletedAt) {
      return fail(
        "Delete it first. Permanent removal only applies to records already in Deleted records."
      );
    }
    if (typed !== cargo.trackingNumber) {
      return fail(
        `Type ${cargo.trackingNumber} exactly to confirm. Nothing has been removed.`
      );
    }
    if (cargo.invoice) {
      return fail(
        `${cargo.invoice.invoiceNumber} is raised against this cargo. Void the invoice through Finance first.`
      );
    }
    if (cargo.batch && !cargo.batch.permanent) {
      return fail(
        "This cargo is on a dispatched flight. It has to stay on the record for that manifest."
      );
    }

    await prisma.$transaction(async (tx) => {
      // The audit entry is written before the row disappears, and deliberately
      // carries everything worth knowing — after this there is nothing left to
      // look the record up from.
      await recordAudit(
        {
          actor: user,
          action: "cargo.purge",
          entity: "Shipment",
          entityId: cargo.id,
          summary: `Permanently removed ${cargo.trackingNumber}`,
          metadata: {
            trackingNumber: cargo.trackingNumber,
            photosDestroyed: cargo._count.photos,
            packagesDestroyed: cargo._count.packageList,
          },
        },
        tx
      );

      await tx.shipment.delete({ where: { id: cargo.id } });
    });

    revalidatePath("/app/admin/deleted");
    return ok({ trackingNumber: cargo.trackingNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}
