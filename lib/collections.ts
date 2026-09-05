import "server-only";

import { PENDING_SUBMISSION } from "@/lib/constants";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/format";

/**
 * The collections desk's numbers.
 *
 * Customer Support chases money; it never holds it. So everything here is about
 * a CUSTOMER's obligation — what they owe, what they say they have sent, what
 * Finance has agreed — and nothing is about the company's own accounts. That
 * separation is the whole reason this workspace exists rather than a corner of
 * the ledger.
 */
export async function collectionsOverview() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    owing,
    awaiting,
    pending,
    verifiedToday,
    rejected,
    notesReady,
    todaysValue,
    byStatus,
  ] = await Promise.all([
      // Everything a customer still owes on a bill that has actually been raised.
      prisma.invoice.aggregate({
        where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
        _count: true,
        _sum: { total: true, amountPaid: true },
      }),
      // Bills sent, money not in. The chase list.
      prisma.invoice.count({
        where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] }, sentAt: { not: null } },
      }),
      // Count only. Submissions are stored in the currency the customer sent,
      // so a SUM across them would add shillings to dollars.
      // The clause is shared — see PENDING_SUBMISSION in lib/constants.ts.
      prisma.paymentSubmission.count({ where: PENDING_SUBMISSION }),
      prisma.paymentSubmission.count({
        where: { status: "VERIFIED", reviewedAt: { gte: startOfToday } },
      }),
      prisma.paymentSubmission.count({ where: { status: "REJECTED" } }),
      // Cleared and released, still on our floor. Support rings these people.
      prisma.pickupNote.count({ where: { status: "ACTIVE" } }),
      prisma.paymentSubmission.aggregate({
        where: { status: "VERIFIED", reviewedAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      /* Every claim, bucketed once, for the two lifetime counts below. */
      prisma.paymentSubmission.groupBy({ by: ["status"], _count: true }),
    ]);

  /* Both counts out of one grouped read, and inside the Promise.all above —
     they used to run one after the other after everything else had finished,
     so the page waited for two whole round trips it need not have waited for
     at all. */
  const submitted = byStatus.reduce((n, row) => n + row._count, 0);
  const verified =
    byStatus.find((row) => row.status === "VERIFIED")?._count ?? 0;

  return {
    outstandingUsd: toNumber(owing._sum.total) - toNumber(owing._sum.amountPaid),
    owingCount: owing._count,
    awaitingPayment: awaiting,
    pendingCount: pending,
    verifiedToday,
    todaysValue: toNumber(todaysValue._sum.amount),
    rejected,
    notesReady,
    /**
     * Of everything this desk has ever handed up, how much Finance agreed with.
     * A collections desk is judged on whether its submissions stand up, not on
     * how many it filed — so a rejected claim counts against it here.
     */
    successRate: submitted > 0 ? Math.round((verified / submitted) * 100) : null,
    submitted,
  };
}

/**
 * A claim Finance sent back that still needs somebody to do something.
 *
 * "Sent back" is not the same as "outstanding". Finance refuses a claim, the
 * desk is meant to ring the customer and raise a fresh one — but the bill very
 * often gets settled another way in the meantime: paid at the counter, taken
 * against a batch, cleared by Finance directly. The claim stays REJECTED
 * forever because the ledger is append-only and a decision is not unmade, and
 * the desk was left staring at twenty-six rows of work that no longer existed.
 *
 * So the test is not the claim's status, it is the BILL's: if the invoice still
 * owes something, somebody has to ring. If it does not, the job is done, however
 * it got done. Drafts and written-off bills are excluded by the same clause —
 * neither is money anybody should be chasing.
 *
 * Exported because three places count this and they must not drift: the support
 * desk's attention list, the executive dashboard's, and the Sent back tab.
 */
export const REJECTED_NEEDING_A_CALL: Prisma.PaymentSubmissionWhereInput = {
  status: "REJECTED",
  invoice: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
  /* And nobody has already answered it. Sending a corrected claim back up
     raises a NEW record pointing at this one — see resubmitSubmission — and
     from that moment this row has been dealt with. Leaving it on the list
     would have the desk ring a customer whose claim is already with Finance. */
  replacedBy: { is: null },
};

/** One queue, filtered by where a claim has got to. */
export async function submissionQueue(
  status:
    | "PENDING"
    | "VERIFIED"
    | "REJECTED"
    | "WITHDRAWN"
    /** Everything this desk still has a say in — a verified claim is a payment
        and is looked up in the ledger, not here. */
    | "UNVERIFIED"
    | null,
  take = 60
) {
  return prisma.paymentSubmission.findMany({
    /* The Sent back tab shows work, not history. A claim whose bill has since
       been settled has nothing left to do about it, so it drops out here and
       is still there under Everything, where the record lives. */
    where:
      status === "REJECTED"
        ? REJECTED_NEEDING_A_CALL
        : status === "UNVERIFIED"
          ? { status: { not: "VERIFIED" } }
          : status
            ? { status }
            : {},
    orderBy: [{ submittedAt: "desc" }],
    take,
    select: {
      id: true,
      submissionNumber: true,
      amount: true,
      currency: true,
      reference: true,
      note: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      rejectionReason: true,
      /* The account the desk says it landed in. Carried on the row because
         both queues that read this have to show it — Finance is deciding
         whether that is where it really went, and the desk that raised it is
         checking their own work. */
      accountId: true,
      account: { select: { id: true, name: true, currency: true } },
      /* The delivery half of the claim. Without it the queue compares the
         whole transfer against the bill and flags a correct claim as not
         matching the balance — which is the exact confusion the split was
         added to end. */
      transportAmount: true,
      transportSourceId: true,
      transportSource: { select: { id: true, name: true } },
      /* What answered this one, and what it answered. Both directions, so a
         refused claim can say it has been re-raised and the fresh one can say
         what it replaces. */
      replacedBy: { select: { submissionNumber: true, status: true } },
      replaces: { select: { submissionNumber: true } },
      submittedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { name: true } },
      /* bytes, because the correction dialog manages these files now and the
         shared AttachmentManager prints a size beside each one. */
      proofs: {
        select: {
          id: true,
          url: true,
          filename: true,
          contentType: true,
          bytes: true,
        },
      },
      /*
        Where the money actually ended up.

        A claim carries the account the DESK said it went into, and claims
        raised before naming one was compulsory carry none at all — so a
        verified row read "no account named" while the receipt it produced
        plainly said CRDB Bank. Once Finance has decided, the payment's own
        account is the answer: it is the one a statement can be reconciled
        against, and it is what the ledger shows.
      */
      payment: {
        select: {
          receipt: { select: { receiptNumber: true } },
          account: { select: { id: true, name: true } },
        },
      },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          currency: true,
          /* The rate frozen onto the bill when it was raised. Switching a
             claim between shillings and dollars restates the same money at
             this rate — never at today's, which would land the claim a few
             hundred shillings off the balance it is meant to settle. */
          exchangeRate: true,
          customer: { select: { id: true, name: true, phone: true } },
          shipment: { select: { trackingNumber: true, description: true } },
        },
      },
    },
  });
}

/**
 * Bills a customer still owes on, oldest first.
 *
 * Drafts are excluded: a price Finance has not signed off is not something to
 * ring a customer about, and this desk cannot confirm one.
 */
export async function invoicesAwaitingPayment(take = 60) {
  const rows = await prisma.invoice.findMany({
    where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
    orderBy: [{ issuedAt: "asc" }],
    take,
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      amountPaid: true,
      currency: true,
      status: true,
      sentAt: true,
      issuedAt: true,
      customer: { select: { id: true, name: true, phone: true } },
      shipment: { select: { trackingNumber: true, description: true, status: true } },
      submissions: {
        where: { status: "PENDING" },
        select: { submissionNumber: true },
        take: 1,
      },
    },
  });

  return rows.map((row) => ({
    ...row,
    outstanding: toNumber(row.total) - toNumber(row.amountPaid),
    /** A claim already with Finance. Ringing this customer again is a nuisance. */
    pendingSubmission: row.submissions[0]?.submissionNumber ?? null,
  }));
}
