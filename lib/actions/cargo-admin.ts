"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
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
    // Deliberately shipment.cancel, which only the CEO holds. A warehouse
    // operator correcting their own typo should edit it, not delete it.
    user = await authorize("shipment.cancel");
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
