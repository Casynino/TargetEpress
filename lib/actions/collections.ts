"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { nextSubmissionNumber } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { toNumber } from "@/lib/format";
import { fail, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * Collections: what Customer Support does, and what Finance does after them.
 *
 * The desk that rings customers is not the desk that keeps the books. Support
 * collects the customer's evidence — the M-Pesa screenshot, the bank slip — and
 * hands it up. Nothing they do moves a shilling: a submission is a claim, and
 * a claim is not money.
 *
 * Finance then agrees or does not. Agreeing calls recordPayment, the same path
 * Finance has always used at the counter, which is why the workflow the owner
 * asked us never to touch is untouched here. This module is a step in front of
 * it, never a replacement: everything about how a payment is recorded, how a
 * receipt is numbered, how the ledger is posted and when a pickup note is minted
 * still lives in lib/actions/finance.ts and is reached, not reimplemented.
 */

/**
 * The caller's address, for the audit trail.
 *
 * Behind a proxy the socket address is the proxy's, so the forwarded header is
 * the only honest answer — and it is a list, oldest client first. Treated as
 * advisory: a header can be forged, so it is recorded as evidence of what the
 * request claimed, never used to decide anything.
 */
async function callerIp() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return list.get("x-real-ip") ?? null;
}

const submissionSchema = z.object({
  invoiceId: z.string().min(1, "Say which bill this settles."),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, "Enter what the customer sent."),
  currency: z.enum(["TZS", "USD"]),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CHEQUE"]),
  // The one thing this desk genuinely has to type: the code off the customer's
  // message. Everything else is already on the invoice.
  reference: z.string().trim().min(1, "Put in the reference the customer sent."),
  note: z.string().trim().optional(),
});

/**
 * Support hands a customer's payment up to Finance.
 *
 * Writes nothing to the invoice, the ledger or any balance. The customer says
 * they paid; this records that they said so, with their evidence attached, and
 * puts it in front of the desk that can check.
 */
export async function submitPaymentForVerification(
  _prev: ActionResult<{ submissionNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ submissionNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("payment.submit");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = submissionSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;
  const ip = await callerIp();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          total: true,
          amountPaid: true,
          shipment: { select: { trackingNumber: true } },
          customer: { select: { name: true } },
        },
      });
      if (!invoice) throw new Error("That bill no longer exists.");

      // A draft is the system's price, not a bill. Collecting against one asks
      // a customer for a figure this business has not agreed to yet.
      if (invoice.status === "DRAFT") {
        throw new Error(
          `${invoice.invoiceNumber} is still a draft. Finance has to confirm the price before anything can be collected against it.`
        );
      }
      if (invoice.status === "PAID") {
        throw new Error(`${invoice.invoiceNumber} is already settled.`);
      }

      // One claim at a time per bill. Two pending submissions against one
      // invoice is two people ringing the same customer and Finance verifying
      // the same money twice.
      const pending = await tx.paymentSubmission.findFirst({
        where: { invoiceId: invoice.id, status: "PENDING" },
        select: { submissionNumber: true },
      });
      if (pending) {
        throw new Error(
          `${pending.submissionNumber} is already with Finance for this bill. Wait for it to be checked.`
        );
      }

      const submission = await tx.paymentSubmission.create({
        data: {
          submissionNumber: await nextSubmissionNumber(tx),
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency,
          method: input.method,
          reference: input.reference,
          note: input.note || null,
          submittedById: user.id,
        },
        select: { id: true, submissionNumber: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "payment.submitted",
          entity: "PaymentSubmission",
          entityId: submission.id,
          summary: `${submission.submissionNumber} — ${input.currency} ${input.amount.toLocaleString()} claimed against ${invoice.invoiceNumber} for ${invoice.customer.name}`,
          metadata: {
            ip,
            department: user.role,
            invoiceNumber: invoice.invoiceNumber,
            trackingNumber: invoice.shipment.trackingNumber,
            reference: input.reference,
          },
        },
        tx
      );

      return submission;
    });

    revalidatePath("/app/support");
    revalidatePath("/app/collections");
    revalidatePath("/app/finance/payments");
    return { ok: true, data: { submissionNumber: result.submissionNumber } };
  } catch (error) {
    return fail(toActionError(error));
  }
}

const decisionSchema = z.object({
  submissionId: z.string().min(1),
  reason: z.string().trim().optional(),
});

/**
 * Finance says no.
 *
 * The reason is required, because "rejected" on its own is a message Support
 * cannot act on and a customer nobody can answer. Nothing is deleted — the
 * claim and the refusal both stay on the record.
 */
export async function rejectPaymentSubmission(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("payment.verify");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = decisionSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const reason = parsed.data.reason;
  if (!reason || reason.length < 3) {
    return fail("Say why it is being sent back — Support has to tell the customer something.");
  }
  const ip = await callerIp();

  try {
    await prisma.$transaction(async (tx) => {
      const submission = await tx.paymentSubmission.findUnique({
        where: { id: parsed.data.submissionId },
        select: {
          id: true,
          submissionNumber: true,
          status: true,
          invoice: { select: { invoiceNumber: true } },
        },
      });
      if (!submission) throw new Error("That submission no longer exists.");
      if (submission.status !== "PENDING") {
        throw new Error(
          `${submission.submissionNumber} has already been dealt with.`
        );
      }

      await tx.paymentSubmission.update({
        where: { id: submission.id },
        data: {
          status: "REJECTED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "payment.rejected",
          entity: "PaymentSubmission",
          entityId: submission.id,
          summary: `${submission.submissionNumber} sent back on ${submission.invoice.invoiceNumber} — ${reason}`,
          metadata: { ip, department: user.role },
        },
        tx
      );
    });

    revalidatePath("/app/collections");
    revalidatePath("/app/finance/payments");
    return { ok: true };
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Finance agrees, and the money becomes real.
 *
 * Deliberately does NOT write a Payment itself. It builds the form Finance
 * would have filled in at the counter and hands it to recordPayment — the same
 * action, the same transaction, the same receipt numbering, the same ledger
 * posting, the same rule about when a pickup note is minted. Every one of those
 * behaviours is load-bearing and none of them is reimplemented here, which is
 * the whole reason this feature could be added without touching the workflow
 * the owner asked us to leave alone.
 *
 * Finance names the account at this moment rather than Support at submission,
 * because Support does not know and must not guess where money landed.
 */
export async function verifyPaymentSubmission(
  _prev: ActionResult<{ receiptNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ receiptNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("payment.verify");
  } catch (error) {
    return fail(toActionError(error));
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) return fail("Missing submission.");
  const accountId = String(formData.get("accountId") ?? "");
  const ip = await callerIp();

  const submission = await prisma.paymentSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      submissionNumber: true,
      status: true,
      invoiceId: true,
      amount: true,
      currency: true,
      method: true,
      reference: true,
      note: true,
      proofs: { select: { id: true } },
      invoice: { select: { invoiceNumber: true } },
    },
  });
  if (!submission) return fail("That submission no longer exists.");
  if (submission.status !== "PENDING") {
    return fail(`${submission.submissionNumber} has already been dealt with.`);
  }

  // Hand it to the counter action exactly as if Finance had typed it.
  const handover = new FormData();
  handover.set("invoiceId", submission.invoiceId);
  handover.set("amount", toNumber(submission.amount).toString());
  handover.set("currency", submission.currency);
  handover.set("method", submission.method);
  if (submission.reference) handover.set("reference", submission.reference);
  if (submission.note) handover.set("note", submission.note);
  if (accountId) handover.set("accountId", accountId);
  // Carry Finance's own rate override through, when they set one.
  const rate = String(formData.get("exchangeRate") ?? "");
  if (rate) handover.set("exchangeRate", rate);

  const { recordPayment } = await import("@/lib/actions/finance");
  const recorded = await recordPayment(undefined, handover);
  if (!recorded.ok) return recorded as ActionResult<{ receiptNumber: string }>;

  // The payment now exists. Tie the submission to it, move the evidence across
  // so the customer's screenshot hangs off the money rather than off a claim,
  // and close the loop for the desk that submitted it.
  const payment = await prisma.payment.findFirst({
    where: { invoiceId: submission.invoiceId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.paymentSubmission.update({
      where: { id: submission.id },
      data: {
        status: "VERIFIED",
        reviewedById: user.id,
        reviewedAt: new Date(),
        paymentId: payment?.id ?? null,
      },
    });
    if (payment && submission.proofs.length > 0) {
      await tx.paymentProof.updateMany({
        where: { submissionId: submission.id },
        data: { paymentId: payment.id },
      });
    }
    await recordAudit(
      {
        actor: user,
        action: "payment.verified",
        entity: "PaymentSubmission",
        entityId: submission.id,
        summary: `${submission.submissionNumber} verified against ${submission.invoice.invoiceNumber} — receipt ${recorded.data?.receiptNumber ?? "issued"}`,
        metadata: { ip, department: user.role, receipt: recorded.data?.receiptNumber },
      },
      tx
    );
  });

  revalidatePath("/app/collections");
  revalidatePath("/app/finance/payments");
  revalidatePath("/app/support");
  return { ok: true, data: { receiptNumber: recorded.data?.receiptNumber ?? "" } };
}
