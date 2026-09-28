"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit, withNote } from "@/lib/audit";
import { releaseCargoIfSettled } from "@/lib/cargo-hold";
import { runStorageMeter, storageDue } from "@/lib/storage-meter";
import { chargeStorageOn, currentStorage } from "@/lib/storage-charge";
import { toNumber } from "@/lib/format";
import { toLocal } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { invoiceStatusFor } from "@/lib/invoice-status";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * Charging or forgiving the storage fee.
 *
 * The fee itself is never typed: it is the policy applied to two dates — when
 * the cargo landed in Dar and whether it has been collected — so the only
 * decision a human makes here is whether to collect it. That decision is what
 * these two actions record.
 *
 * A WAIVER IS NOT A DELETION. `storageCharge` keeps what the policy produced
 * and `storageWaivedUsd` keeps what the business chose not to collect, so
 * "calculated", "charged" and "waived" are three separate figures that always
 * agree with each other. Zeroing the charge instead would make forgiven
 * storage indistinguishable from storage that never accrued, and a month where
 * the desk waived a million shillings would look identical to a quiet one.
 *
 * The freight price is never touched by either action. Storage is its own line
 * and its own decision.
 *
 * BOTH ACTIONS MOVE `total`, SO BOTH MOVE `totalLocal` WITH IT. That field is
 * the shilling figure the customer was quoted, stored so it can never drift
 * from the bill, and storage was the one path that rewrote the total and left
 * it behind: the PDF and the invoice hero derived shillings live from the new
 * total while the WhatsApp text and the public tracking page printed the stale
 * stored one, so a single message quoted two different shilling amounts for the
 * same dollar total and the customer sent the smaller. It is recomputed at the
 * invoice's OWN frozen rate, never today's published one — the point of
 * freezing a rate is that a quoted figure cannot move under the customer — and
 * an invoice carrying no rate keeps a null `totalLocal` rather than one
 * invented from today's.
 */

const schema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().trim().optional(),
});

/**
 * Put the accrued storage fee onto the bill.
 *
 * Re-derived at the moment of charging rather than read off the invoice: the
 * clock has usually moved since the invoice was raised, and the customer is
 * about to pay the figure on THIS screen.
 */
export async function chargeStorageFee(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("invoice.edit");
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    /*
      ONE BILL, OR THE SET TICKED ON A PAYMENT SCREEN.

      Each consignment's clock runs from the day that box landed, so the fees
      differ; they are added in one gesture because that is the one thing the
      desk is deciding, and each still gets its own arithmetic and its own
      audit line. A consignment inside its free days is skipped rather than
      refusing the ones that are not.
    */
    const chargeIds = parsed.data.invoiceId
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (chargeIds.length > 1) {
      let chargedAny = false;
      for (const id of chargeIds) {
        const each = await currentStorage(id);
        if (!each) return fail(t(locale, "That invoice no longer exists."));
        if (each.status.chargeUsd <= 0) continue;
        if (
          toNumber(each.invoice.storageCharge) === each.status.chargeUsd &&
          toNumber(each.invoice.storageWaivedUsd) === 0
        ) {
          continue;
        }
        const data = new FormData();
        data.set("invoiceId", id);
        const one = await chargeStorageFee(undefined, data);
        if (!one.ok) return one;
        chargedAny = true;
      }
      if (!chargedAny) {
        return fail(
          t(locale, "None of those consignments has a storage fee to add.")
        );
      }
      revalidatePath("/app/collections/follow-up");
      return ok();
    }

    const outcome = await chargeStorageOn(
      parsed.data.invoiceId,
      user,
      locale,
      /* A desk pressing this IS the decision to charge after all — see the
         option's own note. The nightly meter is the one that leaves a
         waived bill alone. */
      { respectWaiver: false, neverLower: false }
    );
    if (!outcome.charged) return fail(outcome.reason);

    revalidatePath(`/app/finance/invoices/${parsed.data.invoiceId}`);
    revalidatePath("/app/collections/follow-up");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * Forgive the accrued storage fee, on the record.
 *
 * The reason is required. "Why is there no storage charge on a consignment that
 * sat for twelve days" is the question an auditor asks first, and the only
 * person who can answer it is the one deciding now.
 */
export async function waiveStorageFee(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    /* Its own permission rather than invoice.discount, so the counter can
       forgive late days without also being able to write any figure off any
       bill. See the note beside it in rbac. */
    const user = await authorize("invoice.storage.waive");
    const parsed = z
      .object({
        /* One bill, or the comma-separated set ticked on the merge screen —
           the same shape the discount and the rate take. */
        invoiceId: z.string().min(1),
        /* Optional — warn, confirm, do. The figure waived, the bill and the
           person are all on the audit line without it. */
        reason: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const ids = parsed.data.invoiceId
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    /*
      EACH CONSIGNMENT HAS ITS OWN CLOCK.

      Storage is counted per box from the day that box landed, so three
      consignments ticked together carry three different day counts and three
      different fees. They are forgiven in one gesture because that is the one
      conversation the desk is having, but the arithmetic stays per bill and
      each gets its own audit line.
    */
    let waivedAny = false;
    for (const id of ids) {
      const found = await currentStorage(id);
      if (!found) return fail(t(locale, "That invoice no longer exists."));
      /* A ticked set will usually hold consignments that owe nothing —
         collected inside their free week — and those are not a reason to
         refuse the ones that do. Skipped, not failed. */
      const onBill = toNumber(found.invoice.storageCharge);
      const owing = onBill > 0 ? onBill : found.status.chargeUsd;
      if (owing <= 0) continue;
      const refusal = await waiveOne(found, parsed.data.reason, user, locale);
      if (refusal) return refusal;
      waivedAny = true;
    }
    if (!waivedAny) {
      return fail(
        t(
          locale,
          ids.length > 1
            ? "None of those consignments has a storage fee to remove."
            : "There is no storage fee on this cargo to waive."
        )
      );
    }

    revalidatePath("/app/collections/follow-up");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * One bill's waiver, exactly as it always was.
 *
 * Split out so a merged waiver runs the same guards for every consignment
 * rather than a looser copy of them: the overpayment refusal, the conditional
 * claim on the total and the audit line are each per bill. Returns null when
 * it worked, and the refusal when it did not.
 */
async function waiveOne(
  found: NonNullable<Awaited<ReturnType<typeof currentStorage>>>,
  /** Optional — see the schema. Absent is the ordinary case. */
  reason: string | undefined,
  user: SessionUser,
  locale: Locale
): Promise<ActionResult | null> {
  try {
    const { invoice, status } = found;

    /* Whatever is on the bill, or whatever has accrued if nothing is yet. */
    const onBill = toNumber(invoice.storageCharge);
    const waived = onBill > 0 ? onBill : status.chargeUsd;
    if (waived <= 0) {
      return fail(
        t(locale, "There is no storage fee on this cargo to waive.")
      );
    }

    let total = 0;
    let rate: number | null = null;
    let totalLocal: number | null = null;
    await prisma.$transaction(async (tx) => {
      /* Same discipline as the charge: money fields re-read in-transaction. */
      const fresh = await tx.invoice.findUnique({
        where: { id: invoice.id },
        select: {
          status: true,
          amountPaid: true,
          amountAdjusted: true,
          freightCost: true,
          freightOverride: true,
          otherCharges: true,
          discount: true,
          exchangeRate: true,
          total: true,
          /* The consignment the storage took off the shelf — see below. */
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              status: true,
              pickupNote: { select: { noteNumber: true, status: true } },
            },
          },
        },
      });
      if (!fresh) throw new Error(t(locale, "That invoice no longer exists."));
      if (fresh.status === "VOID" || fresh.status === "WRITTEN_OFF") {
        throw new Error(
          `${invoice.invoiceNumber} ${t(
            locale,
            "is closed, so there is nothing on it to waive."
          )}`
        );
      }

      const freight =
        fresh.freightOverride === null
          ? toNumber(fresh.freightCost)
          : toNumber(fresh.freightOverride);
      /* Storage comes off the total; the freight, the extras and the discount
         are exactly as they were. The waived figure is kept, not subtracted
         twice. */
      total = freight + toNumber(fresh.otherCharges) - toNumber(fresh.discount);
      rate = fresh.exchangeRate === null ? null : toNumber(fresh.exchangeRate);
      totalLocal = rate === null ? null : toLocal(total, rate);

      /*
        A WAIVER MUST NEVER MANUFACTURE A REFUND. If the customer has already
        paid more than the bill would then say, dropping the total would leave
        an overpaid invoice with no refund record — the exact arithmetic
        adjustInvoice refuses for the same reason. This is handled through
        Finance as a correction, not through a waiver.
      */
      const paidSoFar = toNumber(fresh.amountPaid);
      if (paidSoFar > total + 0.001) {
        throw new Error(
          `${invoice.invoiceNumber} ${t(
            locale,
            "has already been paid beyond what the bill would then say. Correct it through Finance instead of waiving."
          )}`
        );
      }

      /* Waiving can legitimately SETTLE a bill the customer had part-paid.
         Derived where every other door derives it — lib/invoice-status.ts. */
      const nextStatus =
        invoiceStatusFor(
          fresh.status,
          paidSoFar,
          total,
          toNumber(fresh.amountAdjusted)
        ) ?? fresh.status;

      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, total: fresh.total },
        data: {
          storageDays: status.chargeableDays,
          storageCharge: new Prisma.Decimal(0),
          storageWaivedUsd: new Prisma.Decimal(waived),
          storageWaivedAt: new Date(),
          storageWaivedById: user.id,
          storageWaiveReason: reason,
          total: new Prisma.Decimal(total),
          totalLocal:
            totalLocal === null ? null : new Prisma.Decimal(totalLocal),
          status: nextStatus,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          t(locale, "This bill changed a moment ago. Reload the page and look again.")
        );
      }

      /*
        FORGIVING THE DEBT HAS TO GIVE THE CARGO BACK.

        The storage that reopened this bill pulled the consignment off the
        shelf; waiving it settled the bill and left the boxes standing there,
        so the counter went on refusing a customer who owed nothing. Paying
        has always put them back — this is the same thing for the other way a
        balance can reach zero.
      */
      const freed = await releaseCargoIfSettled(tx, {
        shipment: fresh.shipment,
        nextStatus,
        actorId: user.id,
        reason: `Storage waived. Pickup note ${fresh.shipment?.pickupNote?.noteNumber ?? ""} stands.`.trim(),
      });

      await recordAudit(
        {
          actor: user,
          action: "storage.waived",
          entity: "Invoice",
          entityId: invoice.id,
          summary: withNote(
            `${invoice.invoiceNumber}: storage fee of USD ${waived.toFixed(2)} waived`,
            reason
          ),
          metadata: {
            tracking: invoice.shipment?.trackingNumber ?? null,
            daysInWarehouse: status.daysInWarehouse,
            chargeableDays: status.chargeableDays,
            waivedUsd: waived,
            reason: reason,
            cargoReleased: freed,
            newTotal: total,
            exchangeRate: rate,
            newTotalLocal: totalLocal,
          },
        },
        tx
      );
    });

    revalidatePath(`/app/finance/invoices/${invoice.id}`);
    return null;
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}


/**
 * BRING EVERY BILL UP TO TODAY, NOW.
 *
 * The meter runs itself nightly and at the counter, so this button is not how
 * storage gets charged — it is how somebody who is looking at the screen
 * stops waiting for the small hours. Same code, same figures, and running it
 * twice changes nothing the second time.
 */
export async function updateStorageNow(): Promise<ActionResult<{ charged: number; usd: number }>> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("invoice.edit");
    const run = await runStorageMeter({ actor: user });
    revalidatePath("/app/finance/storage");
    revalidatePath("/app/collections/follow-up");
    return ok({
      charged: run.charged.length,
      usd: run.charged.reduce((sum, c) => sum + c.usd, 0),
    });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}


/**
 * FORGIVING THE DAYS ON CARGO THAT IS PAID AND CLEARED TO GO.
 *
 * The owner's decision when the meter was switched on, and the reason it
 * exists as a button rather than a one-off script: these are customers who
 * paid in full, were told their cargo was ready, and are on their way to
 * Kariakoo. Putting the standing days onto their bills takes the cargo back
 * off the shelf and turns them away at the counter over money nobody ever
 * mentioned to them. Everybody else — every bill with a balance still on it —
 * is charged normally, because they have not been quoted a final figure yet.
 *
 * It keeps working after that first night, and it should: a consignment that
 * is settled and cleared, with days the meter has not yet reached, is the
 * same situation every time it happens.
 *
 * ONE PRESS, ONE WAIVER EACH. Every bill gets its own arithmetic, its own
 * waiver row and its own audit line — the same ones a desk waiving by hand
 * would produce. A waived bill is then left alone by the meter until somebody
 * presses "Charge it after all"; that is what waiving means here.
 */
export async function forgiveStorageOnCleared(): Promise<
  ActionResult<{ count: number; usd: number }>
> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("invoice.storage.waive");
    const rows = (await storageDue()).filter(
      (row) =>
        row.clearedForPickup &&
        row.waivedUsd <= 0.005 &&
        row.owedUsd - row.onBillUsd > 0.005
    );

    let count = 0;
    let usd = 0;
    for (const row of rows) {
      const found = await currentStorage(row.invoiceId);
      if (!found) continue;
      const refusal = await waiveOne(
        found,
        "Paid and cleared before the storage meter was switched on.",
        user,
        locale
      );
      /* One bill's refusal does not stop the rest: the others are all still
         customers about to be turned away, and the one that refused is named
         on its own audit line. */
      if (refusal) continue;
      count += 1;
      usd += row.owedUsd;
    }

    revalidatePath("/app/finance/storage");
    revalidatePath("/app/collections/follow-up");
    return ok({ count, usd });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
