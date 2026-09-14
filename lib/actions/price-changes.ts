"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { adjustInvoice } from "@/lib/actions/finance";

/**
 * WHAT FINANCE DOES ABOUT A PRICE SOMEBODY ELSE MOVED.
 *
 * The change has already happened. Customer Care agreed a figure at the
 * counter, typed it, and the bill moved the moment they pressed save — the
 * customer can already have been sent it. Nothing here is an approval, because
 * nothing was waiting.
 *
 * What was waiting is Finance KNOWING. A price that moves quietly is the thing
 * the owner objected to, not a price that moves. So every change this desk did
 * not make itself stands UNSEEN until somebody who signs prices off either says
 * they are happy with it or puts it back.
 *
 * @see lib/actions/finance.ts adjustInvoice — where the row is written, and the
 *      one door every price still goes through.
 */
export async function reviewPriceChange(
  _prev: ActionResult<{ reverted: boolean }> | undefined,
  formData: FormData
): Promise<ActionResult<{ reverted: boolean }>> {
  let user: SessionUser;
  try {
    /* Reviewing what another desk priced is the signing-off authority, not the
       pricing one — Customer Care now holds the second and not the first, so
       they cannot mark their own change as seen. */
    user = await authorize("invoice.priceConfirm");
  } catch (error) {
    return fail(toActionError(error));
  }

  const changeId = String(formData.get("changeId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("reviewNote") ?? "").trim();
  if (!changeId) return fail("Missing the price change.");
  if (decision !== "CONFIRM" && decision !== "REVERT") {
    return fail("Say whether the price stands or goes back.");
  }

  const change = await prisma.invoicePriceChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      status: true,
      currency: true,
      totalBefore: true,
      freightBefore: true,
      rateBefore: true,
      storageBefore: true,
      otherBefore: true,
      discountBefore: true,
      totalAfter: true,
      invoiceId: true,
      invoice: {
        select: {
          invoiceNumber: true,
          total: true,
          notes: true,
          exchangeRate: true,
          shipment: { select: { trackingNumber: true } },
        },
      },
    },
  });
  if (!change) return fail("That price change no longer exists.");
  if (change.status !== "UNSEEN") {
    return fail("Somebody has already looked at this one.");
  }

  if (decision === "CONFIRM") {
    const seen = await prisma.invoicePriceChange.updateMany({
      where: { id: change.id, status: "UNSEEN" },
      data: {
        status: "CONFIRMED",
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: note || null,
      },
    });
    if (seen.count === 0) return fail("Somebody has already looked at this one.");

    await recordAudit({
      actor: user,
      action: "invoice.priceConfirmed",
      entity: "Invoice",
      entityId: change.invoiceId,
      summary: `Agreed the price on ${change.invoice.shipment?.trackingNumber ?? change.invoice.invoiceNumber}`,
      metadata: {
        changeId: change.id,
        from: toNumber(change.totalBefore),
        to: toNumber(change.totalAfter),
        note: note || null,
      },
    });
    revalidatePath(`/app/finance/invoices/${change.invoiceId}`);
    revalidatePath("/app/collections/follow-up");
    return ok({ reverted: false });
  }

  /*
    PUTTING IT BACK — THROUGH THE ORDINARY DOOR.

    Restored by re-submitting the figures the bill carried before through
    adjustInvoice, under the reviewer's own session. Not by writing the columns
    back: the total is derived from the parts, the status follows the total,
    the cargo hold follows the status, and the consignment's own working
    follows the freight. Writing `total` back by hand would move one of those
    five and leave the other four describing the price that was undone.

    Claimed first, so two people cannot both revert and double-apply.
  */
  const claimed = await prisma.invoicePriceChange.updateMany({
    where: { id: change.id, status: "UNSEEN" },
    data: {
      status: "REVERTED",
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: note || null,
    },
  });
  if (claimed.count === 0) return fail("Somebody has already looked at this one.");

  const applied = await restoreTo(change, note || "Price put back by Finance");
  if (!applied.ok) {
    /* Nothing moved, so the row goes back to UNSEEN rather than standing as
       reverted against a bill that still carries the new price. */
    await prisma.invoicePriceChange.updateMany({
      where: { id: change.id, status: "REVERTED", reviewedById: user.id },
      data: {
        status: "UNSEEN",
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
      },
    });
    return fail(applied.error);
  }

  await recordAudit({
    actor: user,
    action: "invoice.priceReverted",
    entity: "Invoice",
    entityId: change.invoiceId,
    summary: `Put the price on ${change.invoice.shipment?.trackingNumber ?? change.invoice.invoiceNumber} back to ${change.currency} ${toNumber(change.totalBefore).toFixed(2)}`,
    metadata: {
      changeId: change.id,
      undid: toNumber(change.totalAfter),
      restored: toNumber(change.totalBefore),
      note: note || null,
    },
  });

  revalidatePath(`/app/finance/invoices/${change.invoiceId}`);
  revalidatePath("/app/collections/follow-up");
  revalidatePath("/app/finance");
  return ok({ reverted: true });
}

/**
 * PUT THE BILL BACK TO THE FIGURES IT CARRIED.
 *
 * Shared by Finance putting a change back and the desk taking its own back,
 * because those two must land on the same bill — a restore that reproduced the
 * total by one route and the freight by another would leave the two disagreeing
 * about what was undone.
 *
 * Through adjustInvoice rather than by writing the columns: the total is
 * derived from the parts, the status follows the total, the cargo hold follows
 * the status, and the consignment's own working follows the freight. Writing
 * `total` back by hand would move one of those five and leave the other four
 * describing the price that was undone.
 */
async function restoreTo(
  change: {
    invoiceId: string;
    discountBefore: Prisma.Decimal;
    otherBefore: Prisma.Decimal;
    storageBefore: Prisma.Decimal;
    freightBefore: Prisma.Decimal | null;
    rateBefore: Prisma.Decimal | null;
    invoice: { exchangeRate: Prisma.Decimal | null; notes: string | null };
  },
  reason: string
) {
  const form = new FormData();
  form.set("invoiceId", change.invoiceId);
  form.set("discount", String(toNumber(change.discountBefore)));
  form.set("otherCharges", String(toNumber(change.otherBefore)));
  form.set("storageCharge", String(toNumber(change.storageBefore)));
  /* Null meant the bill was on the rate book. An empty string puts it back
     there, rather than pinning it to whatever the book happened to say then. */
  form.set(
    "freightOverride",
    change.freightBefore === null ? "" : String(toNumber(change.freightBefore))
  );
  form.set(
    "freightRateOverride",
    change.rateBefore === null ? "" : String(toNumber(change.rateBefore))
  );
  form.set("freightOverrideReason", reason);
  if (change.invoice.exchangeRate !== null) {
    form.set("exchangeRate", String(toNumber(change.invoice.exchangeRate)));
  }
  if (change.invoice.notes) form.set("notes", change.invoice.notes);
  /* Required by adjustInvoice whenever money has already landed on the bill. */
  form.set("correctionReason", reason);
  return adjustInvoice(undefined, form);
}

/**
 * THE DESK TAKING ITS OWN CHANGE BACK.
 *
 * A figure typed wrong, or a customer who rings again ten minutes later. The
 * bill goes back to exactly the state it was in before — the same restore
 * Finance's "put it back" runs, which is why a null freight override comes back
 * as the rate book rather than as the number the book happened to say.
 *
 * ONLY YOUR OWN, AND ONLY WHILE NOBODY HAS LOOKED. Once Finance has agreed the
 * price, undoing it would quietly reverse a decision somebody made; the desk
 * can still change the price again, and that is a new change with its own row.
 */
export async function undoPriceChange(
  _prev: ActionResult<{ undone: boolean }> | undefined,
  formData: FormData
): Promise<ActionResult<{ undone: boolean }>> {
  let user: SessionUser;
  try {
    /* The pricing authority, not the signing-off one: undoing is changing the
       price back, and whoever may set it may set it back. */
    user = await authorize("invoice.discount");
  } catch (error) {
    return fail(toActionError(error));
  }

  const changeId = String(formData.get("changeId") ?? "");
  if (!changeId) return fail("Missing the price change.");

  const change = await prisma.invoicePriceChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      status: true,
      currency: true,
      changedById: true,
      invoiceId: true,
      totalBefore: true,
      totalAfter: true,
      discountBefore: true,
      otherBefore: true,
      storageBefore: true,
      freightBefore: true,
      rateBefore: true,
      invoice: {
        select: {
          invoiceNumber: true,
          exchangeRate: true,
          notes: true,
          shipment: { select: { trackingNumber: true } },
        },
      },
    },
  });
  if (!change) return fail("That price change no longer exists.");
  if (change.status !== "UNSEEN") {
    return fail(
      "Finance has already looked at this one. Change the price again if it is wrong — that goes up as a new change."
    );
  }
  if (change.changedById !== user.id) {
    return fail("Only the person who made this change can take it back.");
  }

  const claimedAt = new Date();
  const claimed = await prisma.invoicePriceChange.updateMany({
    where: { id: change.id, status: "UNSEEN", changedById: user.id },
    data: { status: "UNDONE", reviewedAt: claimedAt },
  });
  if (claimed.count === 0) {
    return fail("Finance looked at this a moment ago. Reload to see what they said.");
  }

  const applied = await restoreTo(change, "Undone by the desk that made it");
  if (!applied.ok) {
    await prisma.invoicePriceChange.updateMany({
      where: { id: change.id, status: "UNDONE", changedById: user.id },
      data: { status: "UNSEEN", reviewedAt: null },
    });
    return fail(applied.error);
  }

  /*
    AND THE UNDO DOES NOT BECOME ITS OWN QUEUE ITEM.

    Putting the bill back is a price change like any other, so adjustInvoice
    wrote a second UNSEEN row for it — and Finance would have opened a queue
    saying a price moved, to find a bill sitting at exactly the figure they
    already had. This table is the list of things somebody still has to look
    at, not the history; the history is the audit log, which keeps both the
    change and the undo either way.

    Scoped to this user, this bill and this moment, and only ever to rows
    nobody has looked at.
  */
  await prisma.invoicePriceChange.deleteMany({
    where: {
      invoiceId: change.invoiceId,
      changedById: user.id,
      status: "UNSEEN",
      changedAt: { gte: claimedAt },
    },
  });

  await recordAudit({
    actor: user,
    action: "invoice.priceUndone",
    entity: "Invoice",
    entityId: change.invoiceId,
    summary: `Took back the price change on ${change.invoice.shipment?.trackingNumber ?? change.invoice.invoiceNumber}: back to ${change.currency} ${toNumber(change.totalBefore).toFixed(2)}`,
    metadata: {
      changeId: change.id,
      undid: toNumber(change.totalAfter),
      restored: toNumber(change.totalBefore),
    },
  });

  revalidatePath(`/app/finance/invoices/${change.invoiceId}`);
  revalidatePath("/app/collections/follow-up");
  return ok({ undone: true });
}
