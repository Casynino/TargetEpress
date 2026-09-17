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
    /* Checking what another desk re-priced, which is its own authority.
       Customer Care may sign a price off and may move one; it may not be the
       desk that says its own move was fine. */
    user = await authorize("invoice.priceReview");
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

  /* The row the panel names tells us WHICH BILL; the run is what is ruled on.
     A desk that mistyped and fixed it leaves two rows, and agreeing or undoing
     one of them alone leaves the other standing against nothing. */
  const named = await prisma.invoicePriceChange.findUnique({
    where: { id: changeId },
    select: { invoiceId: true, status: true },
  });
  if (!named) return fail("That price change no longer exists.");
  if (named.status !== "UNSEEN") {
    return fail("Somebody has already looked at this one.");
  }

  const run = await uncheckedRun(named.invoiceId);
  if (run.length === 0) return fail("Somebody has already looked at this one.");
  /* Where the bill stood before the desk started, and where it stands now. */
  const first = run[0];
  const last = run[run.length - 1];
  const ids = run.map((r) => r.id);

  if (decision === "CONFIRM") {
    const seen = await prisma.invoicePriceChange.updateMany({
      where: { id: { in: ids }, status: "UNSEEN" },
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
      entityId: named.invoiceId,
      summary: `Agreed the price on ${last.invoice.shipment?.trackingNumber ?? last.invoice.invoiceNumber}: ${toNumber(first.totalBefore).toFixed(2)} → ${toNumber(last.totalAfter).toFixed(2)}`,
      metadata: {
        changeIds: ids,
        from: toNumber(first.totalBefore),
        to: toNumber(last.totalAfter),
        steps: run.length,
        note: note || null,
      },
    });
    revalidatePath(`/app/finance/invoices/${named.invoiceId}`);
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
  const claimedAt = new Date();
  const claimed = await prisma.invoicePriceChange.updateMany({
    where: { id: { in: ids }, status: "UNSEEN" },
    data: {
      status: "REVERTED",
      reviewedById: user.id,
      reviewedAt: claimedAt,
      reviewNote: note || null,
    },
  });
  if (claimed.count === 0) return fail("Somebody has already looked at this one.");

  /* To where the bill stood before the desk started — `first`, not `last`. */
  const applied = await restoreTo(first, note || "Price put back by Finance");
  if (!applied.ok) {
    /* Nothing moved, so the rows go back to UNSEEN rather than standing as
       reverted against a bill that still carries the new price. */
    await prisma.invoicePriceChange.updateMany({
      where: { id: { in: ids }, status: "REVERTED", reviewedById: user.id },
      data: {
        status: "UNSEEN",
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
      },
    });
    return fail(applied.error);
  }

  /* The restore is itself a price change, and Finance made it — so it writes
     no row of its own. Nothing to clean up here, unlike the desk's undo. */

  await recordAudit({
    actor: user,
    action: "invoice.priceReverted",
    entity: "Invoice",
    entityId: named.invoiceId,
    summary: `Put the price on ${last.invoice.shipment?.trackingNumber ?? last.invoice.invoiceNumber} back to ${first.currency} ${toNumber(first.totalBefore).toFixed(2)}`,
    metadata: {
      changeIds: ids,
      undid: toNumber(last.totalAfter),
      restored: toNumber(first.totalBefore),
      steps: run.length,
      note: note || null,
    },
  });

  revalidatePath(`/app/finance/invoices/${named.invoiceId}`);
  revalidatePath("/app/collections/follow-up");
  revalidatePath("/app/finance");
  return ok({ reverted: true });
}


/**
 * EVERY CHANGE ON THIS BILL NOBODY HAS LOOKED AT, OLDEST FIRST.
 *
 * A desk that gets a figure wrong and fixes it leaves TWO rows: 8,893.75 →
 * 16,364.50, then 16,364.50 → 8,182.25. Read one at a time, "put it back"
 * restores 16,364.50 — the typo, which is the one figure nobody ever wanted,
 * and the bill's real starting price disappears behind it.
 *
 * So a run of unchecked changes is treated as one thing: the reader is shown
 * where the bill started and where it is now, and putting it back means
 * putting it back to before the desk started, not to the step before last.
 */
async function uncheckedRun(invoiceId: string) {
  return prisma.invoicePriceChange.findMany({
    where: { invoiceId, status: "UNSEEN" },
    orderBy: { changedAt: "asc" },
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
      methodBefore: true,
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
    methodBefore: "WEIGHT_BASED" | "FIXED_PER_ITEM" | null;
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
  /* And in the unit it was agreed in. A rate put back in the book's unit is a
     different price: 13.50 a kilo on two documents restored as 13.50 a piece
     bills 27.00. Only sent where there was a rate to restore. */
  if (change.rateBefore !== null && change.methodBefore !== null) {
    form.set("rateMethod", change.methodBefore);
  }
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

  const named = await prisma.invoicePriceChange.findUnique({
    where: { id: changeId },
    select: { invoiceId: true, status: true },
  });
  if (!named) return fail("That price change no longer exists.");
  if (named.status !== "UNSEEN") {
    return fail(
      "Finance has already looked at this one. Change the price again if it is wrong — that goes up as a new change."
    );
  }

  /* The whole run, so a desk that mistyped and corrected itself goes back to
     the price the bill actually started at rather than to its own typo. */
  const run = await uncheckedRun(named.invoiceId);
  if (run.length === 0) return fail("Finance has already looked at this one.");
  const first = run[0];
  const last = run[run.length - 1];
  const ids = run.map((r) => r.id);

  /* Every step of it has to be yours. Taking back a run that somebody else
     started would undo their work under your name. */
  if (run.some((r) => r.changedById !== user.id)) {
    return fail(
      "Somebody else has also changed this price. Ask Finance to put it back."
    );
  }

  const claimedAt = new Date();
  const claimed = await prisma.invoicePriceChange.updateMany({
    where: { id: { in: ids }, status: "UNSEEN", changedById: user.id },
    data: { status: "UNDONE", reviewedAt: claimedAt },
  });
  if (claimed.count === 0) {
    return fail("Finance looked at this a moment ago. Reload to see what they said.");
  }

  /* To where the bill stood before this desk started — `first`, not `last`. */
  const applied = await restoreTo(first, "Undone by the desk that made it");
  if (!applied.ok) {
    await prisma.invoicePriceChange.updateMany({
      where: { id: { in: ids }, status: "UNDONE", changedById: user.id },
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
      invoiceId: named.invoiceId,
      changedById: user.id,
      status: "UNSEEN",
      changedAt: { gte: claimedAt },
    },
  });

  await recordAudit({
    actor: user,
    action: "invoice.priceUndone",
    entity: "Invoice",
    entityId: named.invoiceId,
    summary: `Took back ${run.length === 1 ? "the price change" : `${run.length} price changes`} on ${last.invoice.shipment?.trackingNumber ?? last.invoice.invoiceNumber}: back to ${first.currency} ${toNumber(first.totalBefore).toFixed(2)}`,
    metadata: {
      changeIds: ids,
      undid: toNumber(last.totalAfter),
      restored: toNumber(first.totalBefore),
      steps: run.length,
    },
  });

  revalidatePath(`/app/finance/invoices/${named.invoiceId}`);
  revalidatePath("/app/collections/follow-up");
  return ok({ undone: true });
}
