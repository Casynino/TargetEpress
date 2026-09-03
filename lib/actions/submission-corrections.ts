"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { filesFrom, putDocument } from "@/lib/storage";
import { can } from "@/lib/rbac";
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
      accountId: true,
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
        /* Correcting the account is the whole point of letting Finance touch
           a claim before deciding it — a customer naming the wrong bank is
           the commonest thing wrong with one. */
        accountId: z.string().trim().optional(),
        reason: z.string().trim().min(3, "Say what was wrong with it."),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const sub = await pendingOnly(parsed.data.submissionId);
    if (!sub) return fail(t(locale, "That submission no longer exists."));
    if (sub.status !== "PENDING") {
      return fail(t(locale, closedMessage(sub.status, sub.submissionNumber)));
    }
    /* "Your own typo" is the whole licence — for the desk that raised it. A
       colleague's claim is theirs to fix, not yours.
       Finance is the exception, and has to be: they are the desk about to
       decide this claim, and finding a wrong figure or the wrong account at
       that moment should not mean bouncing it back and waiting for somebody
       else to retype it. Whatever they change is recorded against their name
       like any other correction. */
    if (sub.submittedById !== user.id && !can(user.role, "payment.verify")) {
      return fail(
        t(locale, "Only the person who submitted this can correct it. Ask them to, or let Finance decide it as it stands.")
      );
    }

    const before = {
      amount: toNumber(sub.amount),
      reference: sub.reference,
      note: sub.note,
      accountId: sub.accountId,
    };
    const after = {
      amount: parsed.data.amount ?? before.amount,
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      accountId: parsed.data.accountId || before.accountId,
    };

    /* Same three questions the submit action asks of an account, asked again
       here — a correction that could name an archived or wrong-currency
       account would walk straight past the rule the submit form enforces. */
    if (after.accountId && after.accountId !== before.accountId) {
      const account = await prisma.companyAccount.findUnique({
        where: { id: after.accountId },
        select: { name: true, currency: true, active: true },
      });
      if (!account) return fail(t(locale, "That account no longer exists."));
      if (!account.active) {
        return fail(`${account.name} has been archived.`);
      }
      if (account.currency !== sub.currency) {
        return fail(
          `${account.name} is a ${account.currency} account, so ${sub.currency} could not have landed in it.`
        );
      }
    }
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
          accountId: after.accountId,
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
    if (sub.submittedById !== user.id) {
      return fail(
        t(locale, "Only the person who submitted this can correct it. Ask them to, or let Finance decide it as it stands.")
      );
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

/**
 * The customer's evidence, added to a claim that is still only a claim.
 *
 * Support could attach a screenshot at the moment of raising a submission and
 * never again. A customer who sends their proof an hour later — which is most
 * of them — left the desk with a claim marked "nothing attached" and no way to
 * answer it, so Finance was asked to agree to money on somebody's word.
 *
 * Deliberately NOT addPaymentProof. That action takes a paymentId, and a
 * pending submission has no Payment until Finance verifies it; it also demands
 * ledger.adjust, which is Finance's permission and not this desk's. Same job,
 * different object, different authority.
 */
export async function addSubmissionProof(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("payment.submit");
    const submissionId = String(formData.get("submissionId") ?? "");
    if (!submissionId) return fail(t(locale, "That submission no longer exists."));

    const files = filesFrom(formData, "file");
    if (files.length === 0) return fail(t(locale, "Choose a file first."));

    const sub = await pendingOnly(submissionId);
    if (!sub) return fail(t(locale, "That submission no longer exists."));
    /* Once Finance verifies, verifyPaymentSubmission re-points these rows at
       the Payment it created. From that moment the evidence belongs to the
       money, and this desk must not be able to add to it or pull it off. */
    if (sub.status !== "PENDING") {
      return fail(t(locale, closedMessage(sub.status, sub.submissionNumber)));
    }
    if (sub.submittedById !== user.id && !can(user.role, "payment.verify")) {
      return fail(
        t(locale, "Only the person who submitted this can correct it. Ask them to, or let Finance decide it as it stands.")
      );
    }

    /* Stored before the transaction opens, as every other upload here does: a
       file crossing the network must not hold a row lock. */
    const stored = await putDocument(files[0], "proof");
    await prisma.$transaction(async (tx) => {
      await tx.paymentProof.create({
        data: {
          submissionId: sub.id,
          url: stored.url,
          contentType: stored.contentType,
          bytes: stored.bytes,
          filename: files[0].name || null,
          uploadedById: user.id,
        },
      });
      await recordAudit(
        {
          actor: user,
          action: "submission.proof.add",
          entity: "PaymentSubmission",
          entityId: sub.id,
          summary: `${sub.submissionNumber} (${sub.invoice.invoiceNumber}): evidence attached — ${files[0].name || t(locale, "file")}`,
        },
        tx
      );
    });

    revalidatePath("/app/collections/submissions");
    revalidatePath("/app/collections/verify");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/** Take a wrongly attached file off a claim, while it is still only a claim. */
export async function removeSubmissionProof(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("payment.submit");
    const proofId = String(formData.get("proofId") ?? "");
    if (!proofId) return fail(t(locale, "That attachment no longer exists."));

    const proof = await prisma.paymentProof.findUnique({
      where: { id: proofId },
      select: {
        id: true,
        filename: true,
        submissionId: true,
        submission: {
          select: {
            id: true,
            submissionNumber: true,
            status: true,
            submittedById: true,
            invoice: { select: { invoiceNumber: true } },
          },
        },
      },
    });
    /* A proof whose submissionId is null belongs to a Payment — Finance's to
       remove, through their own action, under their own permission. */
    if (!proof?.submissionId || !proof.submission) {
      return fail(t(locale, "That attachment no longer exists."));
    }
    if (proof.submission.status !== "PENDING") {
      return fail(
        t(locale, closedMessage(proof.submission.status, proof.submission.submissionNumber))
      );
    }
    if (
      proof.submission.submittedById !== user.id &&
      !can(user.role, "payment.verify")
    ) {
      return fail(
        t(locale, "Only the person who submitted this can correct it. Ask them to, or let Finance decide it as it stands.")
      );
    }

    await prisma.$transaction(async (tx) => {
      /* Claimed rather than deleted outright: two people with the dialog open
         would otherwise have the second one delete a row that is already gone
         and be told nothing. */
      const claimed = await tx.paymentProof.deleteMany({
        where: { id: proof.id, submissionId: proof.submissionId },
      });
      if (claimed.count === 0) {
        throw new Error("That attachment has already been removed.");
      }
      await recordAudit(
        {
          actor: user,
          action: "submission.proof.remove",
          entity: "PaymentSubmission",
          entityId: proof.submission!.id,
          summary: `${proof.submission!.submissionNumber} (${proof.submission!.invoice.invoiceNumber}): evidence removed — ${proof.filename ?? t(locale, "file")}`,
        },
        tx
      );
    });

    revalidatePath("/app/collections/submissions");
    revalidatePath("/app/collections/verify");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
