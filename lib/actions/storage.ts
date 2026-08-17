"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { STORAGE_POLICY, storageStatus } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { toLocal } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
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

    /* The freight side is untouched; only the storage line and the total move. */
    const freight =
      invoice.freightOverride === null
        ? toNumber(invoice.freightCost)
        : toNumber(invoice.freightOverride);
    const total =
      freight +
      status.chargeUsd +
      toNumber(invoice.otherCharges) -
      toNumber(invoice.discount);
    /* This invoice's own rate — see the note at the top of the file. */
    const rate =
      invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate);
    const totalLocal = rate === null ? null : toLocal(total, rate);

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
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
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "storage.charged",
          entity: "Invoice",
          entityId: invoice.id,
          summary: `${invoice.invoiceNumber}: storage fee of USD ${status.chargeUsd.toFixed(2)} charged — ${status.chargeableDays} day(s) beyond the ${STORAGE_POLICY.freeDays} free days`,
          metadata: {
            tracking: invoice.shipment?.trackingNumber ?? null,
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
    const user = await authorize("invoice.discount");
    const parsed = z
      .object({
        invoiceId: z.string().min(1),
        reason: z.string().trim().min(3, "Say why the fee is being waived."),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const found = await currentStorage(parsed.data.invoiceId);
    if (!found) return fail(t(locale, "That invoice no longer exists."));
    const { invoice, status } = found;

    /* Whatever is on the bill, or whatever has accrued if nothing is yet. */
    const onBill = toNumber(invoice.storageCharge);
    const waived = onBill > 0 ? onBill : status.chargeUsd;
    if (waived <= 0) {
      return fail(
        t(locale, "There is no storage fee on this cargo to waive.")
      );
    }

    const freight =
      invoice.freightOverride === null
        ? toNumber(invoice.freightCost)
        : toNumber(invoice.freightOverride);
    /* Storage comes off the total; the freight, the extras and the discount are
       exactly as they were. The waived figure is kept, not subtracted twice. */
    const total =
      freight + toNumber(invoice.otherCharges) - toNumber(invoice.discount);
    /* This invoice's own rate — see the note at the top of the file. */
    const rate =
      invoice.exchangeRate === null ? null : toNumber(invoice.exchangeRate);
    const totalLocal = rate === null ? null : toLocal(total, rate);

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          storageDays: status.chargeableDays,
          storageCharge: new Prisma.Decimal(0),
          storageWaivedUsd: new Prisma.Decimal(waived),
          storageWaivedAt: new Date(),
          storageWaivedById: user.id,
          storageWaiveReason: parsed.data.reason,
          total: new Prisma.Decimal(total),
          totalLocal:
            totalLocal === null ? null : new Prisma.Decimal(totalLocal),
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "storage.waived",
          entity: "Invoice",
          entityId: invoice.id,
          summary: `${invoice.invoiceNumber}: storage fee of USD ${waived.toFixed(2)} waived — ${parsed.data.reason}`,
          metadata: {
            tracking: invoice.shipment?.trackingNumber ?? null,
            daysInWarehouse: status.daysInWarehouse,
            chargeableDays: status.chargeableDays,
            waivedUsd: waived,
            reason: parsed.data.reason,
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
