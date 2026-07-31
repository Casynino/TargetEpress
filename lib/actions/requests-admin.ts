"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

const ALLOWED = [
  "PENDING",
  "CONTACTED",
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
] as const;

/**
 * Moving a website request along.
 *
 * Records who touched it and when, because "did anyone ring this person back"
 * is the only question anyone asks about a queue like this.
 */
export async function setRequestStatus(
  kind: "booking" | "pickup",
  id: string,
  status: string
): Promise<ActionResult> {
  try {
    const user = await authorize("shipment.create");

    if (!ALLOWED.includes(status as (typeof ALLOWED)[number])) {
      return fail("Unknown status.");
    }
    const next = status as (typeof ALLOWED)[number];
    const handled = { handledById: user.id, handledAt: new Date() };

    const record =
      kind === "booking"
        ? await prisma.bookingRequest.update({
            where: { id },
            data: { status: next, ...handled },
            select: { reference: true, customerName: true },
          })
        : await prisma.pickupRequest.update({
            where: { id },
            data: { status: next, ...handled },
            select: { reference: true, customerName: true },
          });

    await recordAudit({
      actor: user,
      action: kind === "booking" ? "booking.update" : "pickup.update",
      entity: kind === "booking" ? "BookingRequest" : "PickupRequest",
      entityId: id,
      summary: `${record.reference} (${record.customerName}) marked ${next.toLowerCase()}`,
    });

    revalidatePath("/app/requests");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
