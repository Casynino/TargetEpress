"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { invoiceBalance, isLargeAdjustment } from "@/lib/invoice-balance";
import { invoiceStatusFor } from "@/lib/invoice-status";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * CLEARING A DIFFERENCE THE CUSTOMER IS NEVER GOING TO SEND.
 *
 * A bill comes to 4,424,625 and the transfer says 4,424,000. The 625 is a
 * rounding at the other end, or the bank's fee, or simply what the customer
 * decided to send. It is not coming. Somebody has to be able to say "this bill
 * is settled" without inventing 625 shillings that never arrived.
 *
 * TWO THINGS THIS IS NOT.
 *
 * It is NOT a payment. No money reached an account, so no ledger line is
 * written and no cash, till or bank balance moves — the same rule that keeps a
 * credit sale out of the ledger. Anything that sums money received reads
 * amountPaid and the ledger, and this is neither.
 *
 * It is NOT an approval workflow. The owner was explicit: one button, an
 * amount, an optional note, confirm. There is no pending state, no second
 * signature and NO MAXIMUM — Finance judges whether a difference should be
 * cleared. A large one is flagged so management can find it afterwards, which
 * is a different thing from stopping it happening.
 */

const CLEAR = z.object({
  invoiceId: z.string().min(1, "Say which bill."),
  /* Blank means the whole remaining balance, which is the ordinary case and
     saves the desk retyping a figure the screen has already worked out. */
  amount: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v > 0),
      "The amount to clear has to be a number."
    ),
  reason: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export async function adjustDifference(
  _prev: ActionResult<{ amount: number; large: boolean }> | undefined,
  formData: FormData
): Promise<ActionResult<{ amount: number; large: boolean }>> {
  const locale = await viewerLocale();
  try {
    /* The same authority that corrects a payment or reverses a ledger line.
       Recording money and deciding a difference will never arrive are the same
       kind of decision about the same books. */
    const user = await authorize("ledger.adjust");

    const parsed = CLEAR.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: parsed.data.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          total: true,
          amountPaid: true,
          amountAdjusted: true,
          customer: { select: { name: true } },
          shipment: { select: { id: true, trackingNumber: true } },
        },
      });
      if (!invoice) throw new Error("That bill no longer exists.");
      if (invoice.status === "DRAFT") {
        throw new Error(
          `${invoice.invoiceNumber} is still a draft. Finance has to confirm the price before anything can be cleared on it.`
        );
      }
      if (invoice.status === "VOID" || invoice.status === "WRITTEN_OFF") {
        throw new Error(`${invoice.invoiceNumber} is not a live bill.`);
      }

      const before = invoiceBalance(invoice);
      if (before.balance <= 0.005) {
        throw new Error(`${invoice.invoiceNumber} has nothing left owing on it.`);
      }

      /*
        NO MAXIMUM, BUT NOT MORE THAN IS OWED.

        The owner's rule is that no figure is too large to clear — that is
        Finance's judgement, not a threshold in code. Clearing MORE than the
        bill still owes is a different thing: it would push the balance below
        zero and read as an overpayment nobody made.
      */
      const amount = Math.round((parsed.data.amount ?? before.balance) * 100) / 100;
      if (amount > before.balance + 0.005) {
        throw new Error(
          `${invoice.invoiceNumber} only owes ${invoice.currency} ${before.balance.toLocaleString()}. Clear that or less.`
        );
      }

      const nextAdjusted = Math.round((before.adjusted + amount) * 100) / 100;
      const nextStatus = invoiceStatusFor(
        invoice.status,
        before.paid,
        before.due,
        nextAdjusted
      );

      /*
        The row is the record; the column is the sum the aggregates read.

        Claimed on the figures this transaction actually read, the same way
        every other money write in this app is — a second clearing landing
        between the read and the write must fail rather than overwrite.
      */
      const claimed = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          amountPaid: invoice.amountPaid,
          amountAdjusted: invoice.amountAdjusted,
        },
        data: {
          amountAdjusted: new Prisma.Decimal(nextAdjusted),
          ...(nextStatus ? { status: nextStatus } : {}),
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${invoice.invoiceNumber} moved a moment ago. Reload and check the balance before clearing it.`
        );
      }

      const row = await tx.invoiceAdjustment.create({
        data: {
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(amount),
          currency: invoice.currency,
          reason: parsed.data.reason || null,
          /* The figures as they stood, so the row explains itself later
             without re-deriving a history that has since moved on. */
          totalAtTime: new Prisma.Decimal(before.due),
          amountPaidAtTime: new Prisma.Decimal(before.paid),
          createdById: user.id,
        },
        select: { id: true },
      });

      const large = isLargeAdjustment(amount, before.due, invoice.currency);

      await recordAudit(
        {
          actor: user,
          action: "invoice.adjusted",
          entity: "Invoice",
          entityId: invoice.id,
          summary:
            `${invoice.invoiceNumber}: ${invoice.currency} ${amount.toLocaleString()} cleared for ` +
            `${invoice.customer.name}${large ? " — LARGE ADJUSTMENT" : ""}` +
            (parsed.data.reason ? ` — ${parsed.data.reason}` : ""),
          metadata: {
            adjustmentId: row.id,
            tracking: invoice.shipment?.trackingNumber ?? null,
            currency: invoice.currency,
            amount,
            large,
            /* Rule 9: the whole story on one line, for management reading it
               months later without opening anything. */
            amountDue: before.due,
            actualPaid: before.paid,
            adjustedBefore: before.adjusted,
            adjustedAfter: nextAdjusted,
            balanceAfter: Math.max(0, before.due - before.paid - nextAdjusted),
            reason: parsed.data.reason || null,
          },
        },
        tx
      );

      return { amount, large, shipmentId: invoice.shipment?.id ?? null, invoiceId: invoice.id };
    });

    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/finance/invoices/" + result.invoiceId);
    if (result.shipmentId) revalidatePath("/app/cargo/" + result.shipmentId);
    return ok({ amount: result.amount, large: result.large });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * TAKING ONE BACK.
 *
 * The row is not deleted — a wrong ledger line is answered by a reversing
 * line here, not an edit, and a decision about money is the same. What changes
 * is that the balance returns: the customer stops being cleared and the cargo
 * stops being releasable, which is the whole point of being able to undo it.
 */
export async function reverseAdjustment(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("ledger.adjust");
    const parsed = z
      .object({
        adjustmentId: z.string().min(1),
        reason: z.string().trim().max(500).optional(),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.invoiceAdjustment.findUnique({
        where: { id: parsed.data.adjustmentId },
        select: {
          id: true,
          amount: true,
          currency: true,
          reversedAt: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              total: true,
              amountPaid: true,
              amountAdjusted: true,
              shipment: { select: { id: true, trackingNumber: true } },
            },
          },
        },
      });
      if (!row) throw new Error("That adjustment no longer exists.");
      if (row.reversedAt) throw new Error("That adjustment has already been taken back.");

      const invoice = row.invoice;
      const amount = toNumber(row.amount);
      const before = invoiceBalance(invoice);
      const nextAdjusted = Math.round((before.adjusted - amount) * 100) / 100;

      const nextStatus = invoiceStatusFor(
        invoice.status,
        before.paid,
        before.due,
        Math.max(0, nextAdjusted)
      );

      /* Claimed on the row, not on the invoice: two people taking the same
         adjustment back must not both subtract it. */
      const claimedRow = await tx.invoiceAdjustment.updateMany({
        where: { id: row.id, reversedAt: null },
        data: {
          reversedAt: new Date(),
          reversedById: user.id,
          reversalReason: parsed.data.reason || null,
        },
      });
      if (claimedRow.count === 0) {
        throw new Error("That adjustment has already been taken back.");
      }

      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, amountAdjusted: invoice.amountAdjusted },
        data: {
          amountAdjusted: new Prisma.Decimal(Math.max(0, nextAdjusted)),
          ...(nextStatus ? { status: nextStatus } : {}),
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${invoice.invoiceNumber} moved a moment ago. Reload and try again.`
        );
      }

      await recordAudit(
        {
          actor: user,
          action: "invoice.adjustment.reversed",
          entity: "Invoice",
          entityId: invoice.id,
          summary:
            `${invoice.invoiceNumber}: ${row.currency} ${amount.toLocaleString()} adjustment taken back` +
            (parsed.data.reason ? ` — ${parsed.data.reason}` : ""),
          metadata: {
            adjustmentId: row.id,
            tracking: invoice.shipment?.trackingNumber ?? null,
            amount,
            amountDue: before.due,
            actualPaid: before.paid,
            balanceAfter: Math.max(0, before.due - before.paid - Math.max(0, nextAdjusted)),
            reason: parsed.data.reason || null,
          },
        },
        tx
      );

      return { shipmentId: invoice.shipment?.id ?? null, invoiceId: invoice.id };
    });

    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/finance/invoices/" + result.invoiceId);
    if (result.shipmentId) revalidatePath("/app/cargo/" + result.shipmentId);
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
