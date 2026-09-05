"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { STORAGE_POLICY, storageStatus } from "@/lib/constants";
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

/** Recompute from the dates, so the figure can never be stale or typed. */
async function currentStorage(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      amountPaid: true,
      amountAdjusted: true,
      storageCharge: true,
      storageDays: true,
      storageWaivedUsd: true,
      freightCost: true,
      freightOverride: true,
      otherCharges: true,
      discount: true,
      exchangeRate: true,
      shipment: {
        select: {
          trackingNumber: true,
          arrivedAt: true,
          deliveredAt: true,
        },
      },
    },
  });
  if (!invoice) return null;
  const status = storageStatus(
    invoice.shipment?.arrivedAt ?? null,
    invoice.shipment?.deliveredAt ?? null
  );
  return { invoice, status };
}

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

    const found = await currentStorage(parsed.data.invoiceId);
    if (!found) return fail(t(locale, "That invoice no longer exists."));
    const { invoice, status } = found;

    if (status.chargeUsd <= 0) {
      return fail(
        t(locale, "Nothing to charge — this cargo is still inside its free days.")
      );
    }

    const before = toNumber(invoice.storageCharge);
    if (before === status.chargeUsd && toNumber(invoice.storageWaivedUsd) === 0) {
      return fail(t(locale, "That storage fee is already on the bill."));
    }

    let total = 0;
    let rate: number | null = null;
    let totalLocal: number | null = null;
    await prisma.$transaction(async (tx) => {
      /*
        THE MONEY FIELDS ARE RE-READ INSIDE THE TRANSACTION. The first version
        computed the new total from a read taken before the transaction opened,
        so a payment or an adjustment landing in between was silently written
        over. The storage CLOCK (days, charge) may stay from the pre-read —
        it is derived from dates, not from the row's money.
      */
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
          /* The clearance this charge may have to withdraw — see below. */
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              status: true,
              pickupNote: { select: { id: true, noteNumber: true, status: true } },
            },
          },
        },
      });
      if (!fresh) throw new Error(t(locale, "That invoice no longer exists."));

      /* A dead bill cannot grow. VOID and WRITTEN_OFF are final words. */
      if (fresh.status === "VOID" || fresh.status === "WRITTEN_OFF") {
        throw new Error(
          `${invoice.invoiceNumber} ${t(
            locale,
            "is closed, so nothing more can be charged on it."
          )}`
        );
      }

      const freight =
        fresh.freightOverride === null
          ? toNumber(fresh.freightCost)
          : toNumber(fresh.freightOverride);
      total =
        freight +
        status.chargeUsd +
        toNumber(fresh.otherCharges) -
        toNumber(fresh.discount);
      rate = fresh.exchangeRate === null ? null : toNumber(fresh.exchangeRate);
      totalLocal = rate === null ? null : toLocal(total, rate);

      /*
        THE STATUS FOLLOWS THE TOTAL. Charging storage on a settled bill used
        to leave status at PAID while the total rose above amountPaid — and the
        pickup gate reads the status, so the cargo walked out with the storage
        unpaid. The label is re-derived from the same arithmetic every payment
        uses.
      */
      const paidSoFar = toNumber(fresh.amountPaid);
      const nextStatus =
        invoiceStatusFor(fresh.status, paidSoFar, total) ?? fresh.status;

      /* Conditional on the total this transaction read: a concurrent change
         makes this touch nothing, and the person is told to look again. */
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, total: fresh.total },
        data: {
          storageDays: status.chargeableDays,
          storageCharge: new Prisma.Decimal(status.chargeUsd),
          /* Charging replaces any earlier waiver on the same invoice — the
             decision has been reversed, and the audit log carries both. */
          storageWaivedUsd: new Prisma.Decimal(0),
          storageWaivedAt: null,
          storageWaivedById: null,
          storageWaiveReason: null,
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
        THE CLEARANCE GOES WITH THE DEBT.

        A pickup note is the company saying the bill is settled and the cargo
        may go. Charging storage on a bill that was settled reopens it — and the
        note said nothing about storage, so the boxes walked out on a clearance
        that was true when it was printed and false by the time it was used. The
        release path never re-reads the invoice, so nothing downstream would
        have caught it.

        A note already USED is left alone and said out loud in the audit line:
        the cargo has gone, and cancelling the note would only make the record
        disagree with the warehouse. That is a live debt for somebody to chase.
      */
      const cargo = fresh.shipment;
      const note = cargo?.pickupNote ?? null;
      let noteOutcome: "held" | "already-collected" | "none" = "none";
      if (cargo && note && nextStatus !== "PAID" && nextStatus !== "DRAFT") {
        if (note.status === "USED") {
          noteOutcome = "already-collected";
        } else if (note.status === "ACTIVE") {
          /*
            THE CARGO IS HELD, THE NOTE IS NOT DESTROYED.

            Reverting the consignment is enough to stop it: releaseShipment
            refuses anything that is not READY_FOR_PICKUP, so the boxes cannot
            walk on a clearance that storage has just made untrue.

            Cancelling the note would be one-way. PickupNote.shipmentId is
            unique, so a consignment carries one note for its whole life and a
            cancelled one can never be replaced — the customer would pay the
            storage and find their cargo permanently unreleasable, which is a
            worse outcome than the one being prevented. Paying puts it back.
          */
          noteOutcome = "held";
          if (cargo.status === "READY_FOR_PICKUP") {
            await tx.shipment.update({
              where: { id: cargo.id },
              data: { status: "RECEIVED_AT_DAR" },
            });
          }
        }
      }

      await recordAudit(
        {
          actor: user,
          action: "storage.charged",
          entity: "Invoice",
          entityId: invoice.id,
          summary:
            `${invoice.invoiceNumber}: storage fee of USD ${status.chargeUsd.toFixed(2)} charged — ${status.chargeableDays} day(s) beyond the ${STORAGE_POLICY.freeDays} free days` +
            (noteOutcome === "already-collected"
              ? ` — WARNING: pickup note ${note?.noteNumber} was already used, the cargo has been collected and this storage is now a live debt`
              : noteOutcome === "held"
                ? ` — ${cargo?.trackingNumber} held against pickup note ${note?.noteNumber} until the storage is paid`
                : ""),
          metadata: {
            tracking: invoice.shipment?.trackingNumber ?? null,
            pickupNote: note?.noteNumber ?? null,
            pickupNoteOutcome: noteOutcome,
            cargoAlreadyCollected: noteOutcome === "already-collected",
            daysInWarehouse: status.daysInWarehouse,
            freeDays: STORAGE_POLICY.freeDays,
            chargeableDays: status.chargeableDays,
            perDayUsd: STORAGE_POLICY.perDayUsd,
            storageUsd: status.chargeUsd,
            previousStorageUsd: before,
            newTotal: total,
            exchangeRate: rate,
            newTotalLocal: totalLocal,
          },
        },
        tx
      );
    });

    revalidatePath(`/app/finance/invoices/${invoice.id}`);
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
        reason: z.string().trim().min(3, "Say why the fee is being waived."),
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
  reason: string,
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
        invoiceStatusFor(fresh.status, paidSoFar, total) ?? fresh.status;

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

      await recordAudit(
        {
          actor: user,
          action: "storage.waived",
          entity: "Invoice",
          entityId: invoice.id,
          summary: `${invoice.invoiceNumber}: storage fee of USD ${waived.toFixed(2)} waived — ${reason}`,
          metadata: {
            tracking: invoice.shipment?.trackingNumber ?? null,
            daysInWarehouse: status.daysInWarehouse,
            chargeableDays: status.chargeableDays,
            waivedUsd: waived,
            reason: reason,
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
