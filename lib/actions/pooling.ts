"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { LOCAL_CURRENCY, toLocal } from "@/lib/fx";
import { invoiceStatusFor } from "@/lib/invoice-status";
import { handSetFreight, poolShareFor } from "@/lib/minimum-pool";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * CHARGE THE ROUTE'S MINIMUM ONCE ON BILLS THAT ALREADY CARRY IT TWICE.
 *
 * Check-in pools the minimum across a customer's cargo on one flight, and it
 * only touches a price that is still a draft. Every bill raised and confirmed
 * before that rule existed still carries the minimum per parcel — Madina's two
 * parcels weigh 0.9 kg together and ask for USD 27.00 — and no amount of
 * re-pricing reaches them, because re-pricing a signed-off bill is deliberately
 * not something this app does on its own.
 *
 * So it is done here, by a person, on one press, with their name on it.
 *
 * NOTHING IS INVENTED. The figure written is the one poolShareFor gives, which
 * is the same figure check-in would have written and the same one confirmation
 * now uses. The correction cannot land anywhere the ordinary path would not.
 */
export async function applyPooledMinimum(
  _prev: ActionResult<{ from: number; to: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ from: number; to: number }>> {
  let user: SessionUser;
  try {
    /* The authority to move what a customer owes — the same one that may set a
       freight figure by hand on the bill's own page. */
    user = await authorize("invoice.discount");
  } catch (error) {
    return fail(toActionError(error));
  }

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return fail("Missing the bill.");
  /* Finance's decision that the shared minimum wins over a price set by hand —
     ticked on the screen, never assumed. */
  const replaceAgreed = String(formData.get("replaceAgreed") ?? "") === "1";

  const anchor = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, shipmentId: true },
  });
  if (!anchor) return fail("That bill no longer exists.");

  const share = await poolShareFor(anchor.shipmentId);
  if (!share) {
    return fail(
      "This cargo does not share a minimum with anything else on its flight, so there is nothing to correct."
    );
  }

  const members = await prisma.invoice.findMany({
    where: { shipment: { is: { trackingNumber: { in: share.memberTrackings } } } },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      currency: true,
      total: true,
      amountPaid: true,
      amountAdjusted: true,
      discount: true,
      otherCharges: true,
      storageCharge: true,
      storageWaivedUsd: true,
      freightCost: true,
      freightOverride: true,
      freightRateOverride: true,
      freightOverrideReason: true,
      exchangeRate: true,
      localCurrency: true,
      shipment: { select: { id: true, trackingNumber: true } },
    },
  });
  if (members.length < 2) {
    return fail("The other cargo on this flight has no bill yet.");
  }

  /*
    THREE REFUSALS, EACH BECAUSE THE ANSWER STOPS BEING OBVIOUS.

    Money already taken: moving freight under a payment changes what that
    payment settled, and handing the difference back is a refund — a different
    decision, made somewhere else.

    A price set by hand: a special rate AND a shared minimum on one bill is a
    judgement about which of the two wins. It is made by a person on the screen,
    with the old price in front of them and a box to tick; without the tick this
    refuses. What was replaced is written to the audit line.

    A bill that is not live: void, written off or cancelled are decisions about
    the bill itself, and no arithmetic is a reason to overturn one.
  */
  const paid = members.find((m) => toNumber(m.amountPaid) > 0.005);
  if (paid) {
    return fail(
      `${paid.invoiceNumber} already has money against it. Correcting it now would change what that payment settled — cancel the payment first, or adjust the bill by hand.`
    );
  }
  const agreedBills = members.filter(handSetFreight);
  if (agreedBills.length > 0 && !replaceAgreed) {
    return fail(
      `${agreedBills[0].invoiceNumber} carries a price set by hand. Tick the box that says the shared minimum replaces it, or set the figures by hand on the bills themselves.`
    );
  }
  const dead = members.find((m) =>
    ["VOID", "WRITTEN_OFF", "CANCELLED"].includes(m.status)
  );
  if (dead) {
    return fail(`${dead.invoiceNumber} is ${dead.status.toLowerCase()}, so it cannot be re-priced.`);
  }

  const before = members.reduce((n, m) => n + toNumber(m.total), 0);

  try {
    const after = await prisma.$transaction(async (tx) => {
      let total = 0;
      for (const m of members) {
        const memberShare = await poolShareFor(m.shipment.id);
        /* Asked per member rather than derived from the anchor's answer: the
           carrier is the same whichever member asks, and reading it from each
           one is what proves that rather than assuming it. */
        if (!memberShare) continue;
        const storage =
          toNumber(m.storageWaivedUsd) > 0 ? 0 : toNumber(m.storageCharge);
        const next =
          memberShare.freight +
          storage +
          toNumber(m.otherCharges) -
          toNumber(m.discount);
        if (next < 0) {
          throw new Error(
            `${m.invoiceNumber} carries a discount larger than the corrected bill.`
          );
        }
        const rate =
          m.exchangeRate === null ? null : toNumber(m.exchangeRate);
        const status = invoiceStatusFor(
          m.status,
          toNumber(m.amountPaid),
          next,
          toNumber(m.amountAdjusted)
        );
        /* Re-stating the balance the guard above tested, so a payment landing
           in between cannot slip under a total this is about to move. */
        const written = await tx.invoice.updateMany({
          where: { id: m.id, amountPaid: m.amountPaid },
          data: {
            freightCost: new Prisma.Decimal(memberShare.freight),
            total: new Prisma.Decimal(next),
            localCurrency: m.localCurrency ?? LOCAL_CURRENCY,
            totalLocal:
              rate === null ? null : new Prisma.Decimal(toLocal(next, rate)),
            ...(status === null ? {} : { status }),
            /* A price that was set by hand stops being one: the shared minimum
               replaced it, and a stale figure left beside the new freight would
               be read as the price again. */
            ...(handSetFreight(m)
              ? {
                  freightOverride: null,
                  freightRateOverride: null,
                  freightRateMethod: null,
                  freightRateQuantity: null,
                  freightOverrideReason: null,
                }
              : {}),
          },
        });
        if (written.count === 0) {
          throw new Error(
            `A payment landed on ${m.invoiceNumber} a moment ago. Reload and check the figures again.`
          );
        }
        /* The consignment's own working follows the figure, so its page and
           its PDF do not print a weight times a rate that misses the total. */
        await tx.shipment.update({
          where: { id: m.shipment.id },
          data: {
            quotedAmount: new Prisma.Decimal(memberShare.freight),
            chargeableKg: new Prisma.Decimal(memberShare.chargeableKg),
          },
        });
        total += next;
      }
      /* The correction only ever lowers what a customer owes. If the arithmetic
         says otherwise — a hand-set price below the pooled figure — nothing is
         written and the desk is told. */
      if (total > before + 0.005) {
        throw new Error(
          "The shared minimum would raise what this customer pays, so nothing was changed. Set the figures by hand on the bills."
        );
      }
      return Math.round(total * 100) / 100;
    });

    await recordAudit({
      actor: user,
      action: "invoice.minimumPooled",
      entity: "Invoice",
      entityId: anchor.id,
      summary: `Charged the route minimum once across ${share.memberTrackings.join(", ")}: ${share.currency} ${before.toFixed(2)} → ${after.toFixed(2)}`,
      metadata: {
        trackings: share.memberTrackings,
        actualKg: share.combinedKg,
        billableKg: share.billableKg,
        rate: share.rate,
        carrier: share.carrierTracking,
        from: Math.round(before * 100) / 100,
        to: after,
        /* What the shared minimum replaced, so it can be put back by hand. */
        replacedHandSetPrices: agreedBills.map((m) => ({
          invoice: m.invoiceNumber,
          freightOverride:
            m.freightOverride === null ? null : toNumber(m.freightOverride),
          freightRateOverride:
            m.freightRateOverride === null ? null : toNumber(m.freightRateOverride),
          reason: m.freightOverrideReason,
        })),
      },
    });

    for (const m of members) {
      revalidatePath(`/app/finance/invoices/${m.id}`);
      revalidatePath(`/app/cargo/${m.shipment.trackingNumber}`);
    }
    revalidatePath("/app/finance/payments/new");
    return ok({ from: Math.round(before * 100) / 100, to: after });
  } catch (error) {
    return fail(toActionError(error));
  }
}
