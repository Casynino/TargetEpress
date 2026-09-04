"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { nextSubmissionNumber } from "@/lib/ids";
import { methodForKind } from "@/lib/accounts";
import {
  idempotencyKeyFrom,
  isRepeatSubmission,
} from "@/lib/idempotency";
import { prisma, type TxClient } from "@/lib/prisma";
import { filesFrom, putDocument } from "@/lib/storage";
import { authorize, type SessionUser } from "@/lib/session";
import { toNumber } from "@/lib/format";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { customerPaymentSchema, firstError } from "@/lib/validation";

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
  /* Where the customer says it went. Required — see the note on
     PaymentSubmission.accountId. Support can answer it because the proof
     they are looking at names the destination, and Finance still decides it
     for real on the way through. */
  accountId: z.string().trim().min(1, "Say which account the money landed in."),
  // The one thing this desk genuinely has to type: the code off the customer's
  // message. Everything else is already on the invoice.
  /* Expected on screen, optional here: cash across the counter has no code,
     and refusing the record loses the payment rather than the reference. */
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

/**
 * The account a claim names has to be one that could really have received it.
 *
 * Same three checks recordPayment makes before it will touch an account: it
 * exists, it is open, and it holds the currency the money is in. A claim that
 * names a dollar account for a shilling transfer is one Finance would have to
 * refuse anyway, and refusing it here means Support finds out while the
 * customer is still on the phone.
 */
async function claimedAccount(
  tx: TxClient,
  accountId: string,
  currency: string
) {
  const account = await tx.companyAccount.findUnique({
    where: { id: accountId },
    /* kind, because the method column is now read off it rather than asked
       for — see methodForKind. */
    select: { id: true, name: true, kind: true, currency: true, active: true },
  });
  if (!account) throw new Error("That account no longer exists.");
  if (!account.active) throw new Error(`${account.name} has been archived.`);
  if (account.currency !== currency) {
    throw new Error(
      `${account.name} is a ${account.currency} account, so ${currency} could not have landed in it.`
    );
  }
  return account;
}

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

  /* This request's own identity, not part of what a claim IS. See
     lib/idempotency.ts — two tabs submitting the same claim both pass the
     duplicate check, which reads before it writes; the unique index does not. */
  const idempotencyKey = idempotencyKeyFrom(formData);

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
          customerId: true,
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

      const account = await claimedAccount(tx, input.accountId, input.currency);

      const submission = await tx.paymentSubmission.create({
        data: {
          submissionNumber: await nextSubmissionNumber(tx),
          idempotencyKey,
          invoiceId: invoice.id,
          /* Named on both shapes of claim, as the schema says it is. Without
             it a single-bill claim belonged to no customer, so a merge could
             not carry it across and the customer's own page could not find
             what they had been chased for. */
          customerId: invoice.customerId,
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency,
          method: methodForKind(account.kind),
          accountId: account.id,
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
    /* The unique index refusing a repeat, not a fault. See lib/idempotency.ts. */
    if (isRepeatSubmission(error)) {
      return fail(
        "This payment has already been sent to Finance. Reload the page — sending it again would claim the same money twice."
      );
    }
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
  /* Ten, not three. "No" and "ok" cleared the old bar, and so did an
     instruction about what would happen next — which is not a fault anybody
     can act on. Support rings a customer with this sentence. */
  if (!reason || reason.length < 10) {
    return fail(
      "Say what is actually wrong with it — Support rings the customer with this, and fixes it from their own list."
    );
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

      /* Re-stated as a conditional claim: a plain update by id would still
         fire if Support withdrew this same claim, or another verifier
         actioned it, in the moment between the read above and this write —
         the same race verifyPaymentSubmission already guards against on the
         other side of this same decision. */
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: submission.id, status: "PENDING" },
        data: {
          status: "REJECTED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${submission.submissionNumber} was decided a moment ago. Reload before sending it back.`
        );
      }

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
      /* What Support said the customer's proof named. Finance's own choice
         still wins — this is only the answer they start from. */
      accountId: true,
      reference: true,
      note: true,
      proofs: { select: { id: true } },
      invoice: { select: { invoiceNumber: true } },
      customerId: true,
      /* Which bills the claim covers. Empty on a single-bill claim, and then
         invoiceId above is the answer — the shape the backfill gave every
         existing PENDING row, so both read the same here. */
      allocations: { select: { invoiceId: true, amount: true } },
    },
  });
  if (!submission) return fail("That submission no longer exists.");
  if (submission.status !== "PENDING") {
    return fail(`${submission.submissionNumber} has already been dealt with.`);
  }

  /*
    Hand it to the counter action exactly as if Finance had typed it.

    A claim covering more than one bill goes to the COMBINED counter action,
    which is the same code Finance uses by hand: one payment, one receipt, one
    ledger line, one allocation per bill. Verifying it as several separate
    payments would recreate the four-receipts problem the combined screen
    exists to end, on the far side of the verification step.
  */
  const combined = submission.allocations.length > 1;
  const handover = new FormData();
  handover.set("amount", toNumber(submission.amount).toString());
  handover.set("currency", submission.currency);
  /*
    THE ACCOUNT FINANCE NAMES DECIDES HOW IT WAS PAID.

    Support claims what a customer told them and does not know where the money
    landed; the claim carries mobile money because that is what it is here nine
    times in ten. Finance then names the account it actually reached, and that
    account is the answer — the tin is cash, a till is mobile money, a bank is
    a transfer. Reading the method off the named account rather than off what
    was claimed is how a
    payment ends up saying it arrived by a route its own account cannot
    receive, which is a line nobody can reconcile against a statement.
  */
  /* No method travels on this handover any more: recordPayment reads it off
     the accountId below, which is the same account this block used to look up
     purely to restate as a method. */
  if (submission.reference) handover.set("reference", submission.reference);
  if (submission.note) handover.set("note", submission.note);
  if (accountId) handover.set("accountId", accountId);

  if (combined) {
    if (!submission.customerId) {
      return fail(
        `${submission.submissionNumber} covers several bills but names no customer. It cannot be verified — reject it and ask for it to be raised again.`
      );
    }
    handover.set("customerId", submission.customerId);
    handover.set(
      "allocations",
      JSON.stringify(
        submission.allocations.map((allocation) => ({
          invoiceId: allocation.invoiceId,
          amount: toNumber(allocation.amount),
        }))
      )
    );
  } else {
    handover.set("invoiceId", submission.invoiceId);
    // Carry Finance's own rate override through, when they set one. Only for a
    // single bill: a combined payment converts at each bill's own frozen rate,
    // and one override across several would restate them all at a figure that
    // matches none of the quotes the customer was given.
    const rate = String(formData.get("exchangeRate") ?? "");
    if (rate) handover.set("exchangeRate", rate);
  }

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

  const { recordPayment, recordCustomerPayment } = await import(
    "@/lib/actions/finance"
  );
  const recorded = combined
    ? await recordCustomerPayment(undefined, handover)
    : await recordPayment(undefined, handover);
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

/**
 * ONE TRANSFER, SEVERAL BILLS, CLAIMED BY SUPPORT.
 *
 * The desk that hears from the customer is Support, and a customer with four
 * consignments sends one transfer for all four. Until now a claim could name
 * one bill, so Support raised four — and Finance then verified four times,
 * producing four payments, four receipts and four account movements for a
 * deposit the bank statement shows once. That is exactly what the combined
 * payment screen was built to stop, and Support was the desk locked out of it.
 *
 * THE BUSINESS RULE DOES NOT CHANGE. Support still only ever says a customer
 * SAYS they paid; nothing reaches an account until Finance verifies it, and
 * verification hands the whole thing to the same counter action Finance uses
 * by hand. Billing together changes who can claim it in one go, not who is
 * allowed to say money arrived.
 *
 * Deliberately its own action rather than a mode inside the single-bill one.
 * That one is called from a cargo page and from the follow-up queue, and money
 * code that grows a second shape is money code nobody can reason about.
 */
export async function submitCombinedPayment(
  _prev: ActionResult<{ submissionNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ submissionNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("payment.submit");
  } catch (error) {
    return fail(toActionError(error));
  }

  /* This request's own identity, not part of what a claim IS. See
     lib/idempotency.ts — two tabs submitting the same claim both pass the
     duplicate check, which reads before it writes; the unique index does not. */
  const idempotencyKey = idempotencyKeyFrom(formData);

  const parsed = customerPaymentSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;
  const ip = await callerIp();

  if (input.allocations.length === 0) {
    /* A deposit is money that has ARRIVED against no bill. Support cannot say
       money arrived — that is the whole point of the verification step — so
       there is nothing here for them to claim. */
    return fail(
      "Tick the cargo this payment covers. A payment held as credit is recorded by Finance, not claimed here."
    );
  }

  const allocated = input.allocations.reduce((sum, a) => sum + a.amount, 0);
  if (allocated > input.amount + 0.005) {
    return fail(
      `You have put ${input.currency} ${allocated.toLocaleString()} against bills out of a ` +
        `${input.currency} ${input.amount.toLocaleString()} payment. Money cannot be claimed twice over.`
    );
  }

  /* Stored before the transaction, exactly as the single-bill claim does it: a
     file crossing the network must not hold a row lock on an invoice. */
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, name: true },
      });
      if (!customer) throw new Error("That customer no longer exists.");

      const invoices = await tx.invoice.findMany({
        where: { id: { in: input.allocations.map((a) => a.invoiceId) } },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          customerId: true,
          shipment: { select: { trackingNumber: true } },
          submissions: {
            where: { status: "PENDING" },
            select: { submissionNumber: true },
          },
        },
      });
      if (invoices.length !== input.allocations.length) {
        throw new Error("One of those bills no longer exists. Reload and try again.");
      }

      for (const invoice of invoices) {
        if (invoice.customerId !== customer.id) {
          throw new Error(
            `${invoice.invoiceNumber} does not belong to ${customer.name}. One claim covers one customer's bills.`
          );
        }
        // A draft is the system's price, not a bill. Collecting against one asks
        // a customer for a figure this business has not agreed to yet.
        if (invoice.status === "DRAFT") {
          throw new Error(
            `${invoice.invoiceNumber} is still a draft. Finance has to confirm the price before anything can be collected against it.`
          );
        }
        if (invoice.status === "VOID" || invoice.status === "WRITTEN_OFF") {
          throw new Error(`${invoice.invoiceNumber} is not a live bill.`);
        }
        if (invoice.status === "PAID") {
          throw new Error(`${invoice.invoiceNumber} is already settled.`);
        }
        /* One claim at a time per bill. Two pending claims against one invoice
           is two people ringing the same customer and Finance verifying the
           same money twice — the refusal the single-bill claim already makes,
           and it must not be escapable by claiming several at once. */
        if (invoice.submissions.length > 0) {
          throw new Error(
            `${invoice.submissions[0].submissionNumber} is already with Finance for ${invoice.invoiceNumber}. Wait for it to be checked.`
          );
        }
      }

      /* Anchored to one of the bills, because that column is what every
         existing screen reads. Which one is arbitrary — the allocations are
         the truth. */
      const anchor = invoices.find(
        (invoice) => invoice.id === input.allocations[0].invoiceId
      )!;

      const account = await claimedAccount(tx, input.accountId, input.currency);

      const submission = await tx.paymentSubmission.create({
        data: {
          submissionNumber: await nextSubmissionNumber(tx),
          idempotencyKey,
          invoiceId: anchor.id,
          customerId: customer.id,
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency,
          method: methodForKind(account.kind),
          accountId: account.id,
          reference: input.reference || null,
          note: input.note || null,
          submittedById: user.id,
          allocations: {
            create: input.allocations.map((allocation) => ({
              invoiceId: allocation.invoiceId,
              amount: new Prisma.Decimal(allocation.amount),
            })),
          },
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
          summary:
            `${submission.submissionNumber} — ${input.currency} ${input.amount.toLocaleString()} claimed ` +
            `for ${customer.name} across ${input.allocations.length} bill(s)`,
          metadata: {
            ip,
            department: user.role,
            customer: customer.name,
            proofs: proofs.length,
            reference: input.reference || null,
            bills: invoices.map((invoice) => ({
              invoice: invoice.invoiceNumber,
              tracking: invoice.shipment.trackingNumber,
            })),
          },
        },
        tx
      );

      return { submissionNumber: submission.submissionNumber };
    });

    revalidatePath("/app/collections");
    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/finance/payments/new");
    return ok(result);
  } catch (error) {
    /* The unique index refusing a repeat, not a fault. See lib/idempotency.ts. */
    if (isRepeatSubmission(error)) {
      return fail(
        "This payment has already been sent to Finance. Reload the page — sending it again would claim the same money twice."
      );
    }
    return fail(toActionError(error));
  }
}
