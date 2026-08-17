"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { nextSubmissionNumber } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { filesFrom, putDocument } from "@/lib/storage";
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
  /* Expected on screen, optional here: cash across the counter has no code,
     and refusing the record loses the payment rather than the reference. */
  reference: z.string().trim().optional(),
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

  /**
   * The customer's evidence. The whole point of the record.
   *
   * Uploaded before the transaction opens, exactly as recordPayment does it: a
   * file crossing the network must not hold a row lock on an invoice, and a
   * proof that fails to store has to fail the submission loudly rather than
   * leaving Finance a claim with evidence nobody can find.
   */
  let proofs: { url: string; contentType: string; bytes: number; filename: string }[];
  try {
    const files = filesFrom(formData, "proof");
    proofs = await Promise.all(
      files.map(async (file) => {
        const stored = await putDocument(file, "proof");
        return { ...stored, filename: file.name || "proof" };
      })
    );
  } catch (error) {
    return fail(toActionError(error));
  }

  /*
    Evidence is expected, never enforced.

    A submission with nothing attached IS weaker — Finance is agreeing to it on
    somebody's word — and the form says so plainly. But it does not block any
    more: cash handed across the counter has no screenshot and no code, and a
    refusal there does not produce evidence, it produces a payment that never
    gets recorded. The verification step is where a thin submission gets
    challenged, and it still has who submitted it and when.
  */

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
          reference: input.reference || null,
          note: input.note || null,
          submittedById: user.id,
          proofs: {
            create: proofs.map((proof) => ({
              url: proof.url,
              contentType: proof.contentType,
              bytes: proof.bytes,
              filename: proof.filename,
              uploadedById: user.id,
            })),
          },
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
            reference: input.reference || null,
            proofs: proofs.length,
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

  /*
    The row is claimed before a shilling moves.

    The read above is not a gate. Two clerks with the verify queue open — or one
    clerk double-clicking "Confirm and record" on a slow connection — both saw
    PENDING, both went on, and the customer's one USD 150 transfer became two
    Payments, two receipt numbers and two CUSTOMER_PAYMENT lines against the
    named account: cash the business does not have, in a balance that can never
    be reconciled against the bank statement. recordPayment cannot catch it
    either, because its own guard only refuses money beyond what is outstanding,
    and on a part-paid bill the second 150 still fits.

    So the status goes in the WHERE clause and the money happens only for the
    caller that actually moved the row — the same claim a credit decision makes
    (lib/actions/credit.ts:222) and the same one the warehouse makes before
    writing a status history line (lib/actions/batches.ts:992). The loser is told
    it has already been dealt with, and recordPayment is called exactly once.
  */
  const claimed = await prisma.paymentSubmission.updateMany({
    where: { id: submission.id, status: "PENDING" },
    data: { status: "VERIFIED", reviewedById: user.id, reviewedAt: new Date() },
  });
  if (claimed.count === 0) {
    return fail(`${submission.submissionNumber} has already been dealt with.`);
  }

  const { recordPayment } = await import("@/lib/actions/finance");
  const recorded = await recordPayment(undefined, handover);
  if (!recorded.ok) {
    /*
      Refused, so the claim goes back.

      Every refusal recordPayment can answer with is raised before or inside its
      own transaction — no permission, a figure that does not parse, a proof that
      would not store, a bill somebody settled at the counter first — so nothing
      was written and the claim must not outlive the attempt. Most of them are
      fixable, and the submission returns to the queue exactly as Support left it
      rather than being burnt: without this, forgetting to name the receiving
      account would cost the desk the claim and the customer's evidence with it.
      Guarded on paymentId being null so it can never un-verify a claim that has
      already been tied to money.
    */
    await prisma.paymentSubmission.updateMany({
      where: { id: submission.id, status: "VERIFIED", paymentId: null },
      data: { status: "PENDING", reviewedById: null, reviewedAt: null },
    });
    return recorded as ActionResult<{ receiptNumber: string }>;
  }

  /*
    The payment now exists. Tie the submission to it, move the evidence across so
    the customer's screenshot hangs off the money rather than off a claim, and
    close the loop for the desk that submitted it.

    Found by the receipt this call just issued, which belongs to exactly one
    payment. It used to be "the newest payment against this invoice", which is
    not necessarily ours: a part-paid bill being settled at the counter in the
    same minute would hand the customer's screenshot to somebody else's money,
    and paymentId is unique on a submission, so it would eventually collide.
  */
  const receipt = recorded.data?.receiptNumber
    ? await prisma.receipt.findUnique({
        where: { receiptNumber: recorded.data.receiptNumber },
        select: { paymentId: true },
      })
    : null;
  const paymentId = receipt?.paymentId ?? null;

  await prisma.$transaction(async (tx) => {
    // Status and reviewer were written by the claim above; this is what the
    // claim could not know yet.
    await tx.paymentSubmission.update({
      where: { id: submission.id },
      data: { paymentId },
    });
    if (paymentId && submission.proofs.length > 0) {
      await tx.paymentProof.updateMany({
        where: { submissionId: submission.id },
        data: { paymentId },
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
