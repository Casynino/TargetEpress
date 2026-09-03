import "server-only";

import { PENDING_SUBMISSION } from "@/lib/constants";
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

  const [owing, awaiting, pending, verifiedToday, rejected, notesReady, todaysValue] =
    await Promise.all([
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
    ]);

  const submitted = await prisma.paymentSubmission.count();
  const verified = await prisma.paymentSubmission.count({ where: { status: "VERIFIED" } });

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

/** One queue, filtered by where a claim has got to. */
export async function submissionQueue(
  status: "PENDING" | "VERIFIED" | "REJECTED" | "WITHDRAWN" | null,
  take = 60
) {
  return prisma.paymentSubmission.findMany({
    where: status ? { status } : {},
    orderBy: [{ submittedAt: "desc" }],
    take,
    select: {
      id: true,
      submissionNumber: true,
      amount: true,
      currency: true,
      method: true,
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
      submittedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      proofs: { select: { id: true, url: true, filename: true, contentType: true } },
      payment: { select: { receipt: { select: { receiptNumber: true } } } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          currency: true,
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
