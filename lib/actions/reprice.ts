"use server";

import { revalidatePath } from "next/cache";

import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { repriceForWeight } from "@/lib/reprice-weight";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { viewerLocale } from "@/lib/viewer";

/**
 * PUT A BILL BACK ON THE WEIGHT THE CARGO ACTUALLY IS.
 *
 * From now on a corrected weight re-prices the bill by itself. What that does
 * not do is reach the consignments corrected BEFORE it existed: TX-000526 was
 * booked at 33.5 kg, weighed 94 kg on the Dar floor, and its bill sat at
 * USD 432.15 — the agreed rate times China's figure — because nothing at the
 * time carried the new weight through to the money. Nobody is going to edit
 * those weights again, so the bill would stand wrong forever.
 *
 * One press, on the bill in front of the desk, that runs the same code the
 * edit runs: same rules, same refusals, same record. A bill with money on it
 * is not touched here either — that is Finance's decision, and this says so
 * rather than doing it.
 */
export async function repriceOnCurrentWeight(
  _prev: ActionResult<{ before: number; after: number; currency: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ before: number; after: number; currency: string }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    /* The permission that lets a desk move a price at all. Support holds it
       too, by the owner's instruction — this is the same act as confirming a
       price, done from the other end. */
    user = await authorize("invoice.manage");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!shipmentId) return fail(t(locale, "Missing cargo."));

  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { trackingNumber: true },
    });
    if (!shipment) return fail(t(locale, "That cargo no longer exists."));

    const result = await repriceForWeight([shipmentId], user.id);
    const moved = result.moved[0];

    if (!moved) {
      const held = result.held[0];
      if (held) {
        return fail(
          `${held.invoiceNumber} ${t(locale, "has money against it, so its price cannot be moved here. Cancel the payment first, or settle the difference on the bill.")}`
        );
      }
      const blocked = result.blocked[0];
      if (blocked) return fail(blocked.reason);
      return fail(
        t(locale, "The price is already worked out on the weight this cargo is now.")
      );
    }

    revalidatePath(`/app/cargo/${shipment.trackingNumber}`);
    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/finance");
    return ok(moved);
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
