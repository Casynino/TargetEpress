"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * Correcting what this desk sent up to Finance.
 *
 * A submission is a claim, not money: "the customer says they paid this much,
 * here is their screenshot". Until Finance rules on it, nothing has moved — no
 * ledger line, no receipt, no change to the bill. Which makes it the one money
 * record in the system that CAN be edited in place, and the reason the rules here
 * are different from the ones on a payment.
 *
 * Two things a desk needs and did not have:
 *
 *   EDIT, while it is still pending. A mistyped M-Pesa code or an amount with an
 *   extra nought was previously fixed by asking Finance to reject it and sending
 *   a second one, which leaves a customer with a rejection on their record for
 *   our typing error.
 *
 *   WITHDRAW, also while pending. Sent up against the wrong invoice, or twice.
 *   Recorded as WITHDRAWN rather than REJECTED, because "Finance said no" and "we
 *   sent this by mistake" are different facts about a customer, and a queue that
 *   conflates them tells the next person to ring somebody about nothing.
 *
 * Once Finance has VERIFIED it, this file is finished: a real payment exists and
 * has moved an account, and unwinding that is voidPayment's job, not an edit.
 */

/** Only a pending claim may be touched. After that, money exists. */
async function pendingOnly(id: string) {
  const sub = await prisma.paymentSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      submissionNumber: true,
      status: true,
      amount: true,
      currency: true,
      reference: true,
      note: true,
      submittedById: true,
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          shipment: { select: { trackingNumber: true } },
        },
      },
    },
  });
  return sub;
}

/** The message for a claim that is no longer open to change. */
function closedMessage(status: string, number: string) {
  if (status === "VERIFIED") {
    return `${number} has already been verified by Finance, so a real payment exists against it. Cancel that payment instead of editing this claim.`;
  }
  if (status === "REJECTED") {
    return `${number} was sent back by Finance. Raise a new claim rather than editing a closed one.`;
  }
  return `${number} was already withdrawn.`;
}

export async function editSubmission(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    /* The same permission that raised it. Fixing your own typo before anybody
       has acted on it is part of recording it, not a separate authority. */
    const user = await authorize("payment.submit");
    const parsed = z
      .object({
        submissionId: z.string().min(1),
        amount: z.coerce
          .number()
          .positive("That amount is not valid.")
          .optional(),
        reference: z.string().trim().optional(),
        note: z.string().trim().optional(),
        reason: z.string().trim().min(3, "Say what was wrong with it."),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const sub = await pendingOnly(parsed.data.submissionId);
    if (!sub) return fail(t(locale, "That submission no longer exists."));
    if (sub.status !== "PENDING") {
      return fail(t(locale, closedMessage(sub.status, sub.submissionNumber)));
    }

    const before = {
      amount: toNumber(sub.amount),
      reference: sub.reference,
      note: sub.note,
    };
    const after = {
      amount: parsed.data.amount ?? before.amount,
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
    };
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
      (k) => before[k] !== after[k]
    );
    if (changed.length === 0) return fail(t(locale, "Nothing was changed."));

    await prisma.$transaction(async (tx) => {
      /* Still pending at the moment of writing. Finance may have verified it
         while this form sat open, and editing the claim behind a payment that
         already exists would leave the two describing different money. */
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: sub.id, status: "PENDING" },
        data: {
          amount: new Prisma.Decimal(after.amount),
          reference: after.reference,
          note: after.note,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${sub.submissionNumber} was decided by Finance a moment ago. Reload before editing it.`
        );
      }

      await recordAudit(
        {
          actor: user,
          action: "submission.edit",
          entity: "PaymentSubmission",
          entityId: sub.id,
          summary: `${sub.submissionNumber} (${sub.invoice.invoiceNumber}): claim corrected (${changed.join(", ")}) — ${parsed.data.reason}`,
          metadata: {
            tracking: sub.invoice.shipment?.trackingNumber ?? null,
            before,
            after,
            changed,
            reason: parsed.data.reason,
          },
        },
        tx
      );
    });

    revalidatePath("/app/collections/submissions");
    revalidatePath(`/app/finance/invoices/${sub.invoice.id}`);
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

export async function withdrawSubmission(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("payment.submit");
    const parsed = z
      .object({
        submissionId: z.string().min(1),
        reason: z.string().trim().min(3, "Say why it is being withdrawn."),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const sub = await pendingOnly(parsed.data.submissionId);
    if (!sub) return fail(t(locale, "That submission no longer exists."));
    if (sub.status !== "PENDING") {
      return fail(t(locale, closedMessage(sub.status, sub.submissionNumber)));
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: sub.id, status: "PENDING" },
        data: {
          status: "WITHDRAWN",
          reviewedById: user.id,
          reviewedAt: new Date(),
          /* The reason lands in rejectionReason because that column already
             means "why this claim went nowhere", and a second nullable reason
             column would leave two places to look for one answer. The status
             says who decided it — Finance refused, or we took it back. */
          rejectionReason: parsed.data.reason,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${sub.submissionNumber} was decided by Finance a moment ago, so it can no longer be withdrawn.`
        );
      }

      await recordAudit(
        {
          actor: user,
          action: "submission.withdrawn",
          entity: "PaymentSubmission",
          entityId: sub.id,
          summary: `${sub.submissionNumber} (${sub.invoice.invoiceNumber}): claim of ${sub.currency} ${toNumber(sub.amount).toFixed(2)} withdrawn — ${parsed.data.reason}`,
          metadata: {
            tracking: sub.invoice.shipment?.trackingNumber ?? null,
            amount: toNumber(sub.amount),
            currency: sub.currency,
            reason: parsed.data.reason,
            raisedBy: sub.submittedById,
          },
        },
        tx
      );
    });

    revalidatePath("/app/collections/submissions");
    revalidatePath("/app/collections/follow-up");
    revalidatePath(`/app/finance/invoices/${sub.invoice.id}`);
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
