import "server-only";

import { pendingCreditRequests } from "@/lib/credit-queries";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Everything in the company currently waiting on somebody to decide.
 *
 * ONE LIST, GATHERED, NOT A NEW PLACE TO DECIDE. Every queue below already has
 * a screen where the ruling is actually made, with its own guard, its own
 * evidence and its own audit row, and each entry here links straight into it.
 * A second surface that also approved things would mean two code paths reaching
 * the same decision, which is how one of them ends up missing the check the
 * other one has.
 *
 * What this page is FOR is the question none of those screens can answer: is
 * anything sitting. A desk that opens its own queue sees its own backlog and
 * calls it normal. Four queues side by side, each with the age of its oldest
 * item, is the only view from which "Finance has not verified a payment in five
 * days" is visible at all.
 *
 * The age is the oldest waiting item, not the average. An average of two hours
 * and nine days reads as four days and describes neither.
 */
export type ApprovalQueue = {
  key: string;
  label: string;
  /** What deciding it means, in the manager's words, not the schema's. */
  detail: string;
  count: number;
  /** Money riding on the queue, in USD. Null where the queue is not about money. */
  valueUsd: number | null;
  /** Days the oldest item has been waiting. Null when the queue is empty. */
  oldestDays: number | null;
  href: string;
  /** Whether this reader may take the decision, or is only watching it. */
  permission: "credit.approve" | "payment.verify" | "invoice.manage" | "exception.approve";
};

const DAY = 86_400_000;
const daysSince = (d: Date | null | undefined, now: Date) =>
  d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY)) : null;

export async function approvalQueues(now = new Date()): Promise<ApprovalQueue[]> {
  const [credit, payments, drafts, claims] = await Promise.all([
    pendingCreditRequests(now),

    prisma.paymentSubmission.findMany({
      where: { status: "PENDING" },
      select: { amount: true, currency: true, submittedAt: true },
      orderBy: { submittedAt: "asc" },
    }),

    /* A draft is a price nobody has signed off. The cargo is priced, the
       customer has not been billed, and until somebody confirms it the invoice
       is not revenue and cannot be collected — so it is a decision, and one
       that quietly stalls money if it sits. */
    prisma.invoice.findMany({
      where: { status: "DRAFT" },
      select: { total: true, issuedAt: true },
      orderBy: { issuedAt: "asc" },
    }),

    /* Raised, not yet ruled on. A claim that has been closed, or where the box
       turned up, is not waiting on anybody. */
    prisma.shipmentException.findMany({
      where: { status: { in: ["OPEN", "UNDER_INVESTIGATION"] } },
      select: { raisedAt: true },
      orderBy: { raisedAt: "asc" },
    }),
  ]);

  /* Submissions are keyed in the currency the customer paid in. Only the dollar
     ones are summed: converting a shilling claim at today's rate would put a
     figure on this page that no invoice agrees with, and this queue's job is to
     say how much is waiting, not to restate it. */
  const paymentsUsd = payments
    .filter((p) => p.currency === "USD")
    .reduce((n, p) => n + toNumber(p.amount), 0);

  return [
    {
      key: "credit",
      label: "Credit requested",
      detail: "Cargo a customer wants to take now and pay for later.",
      count: credit.length,
      valueUsd: credit.reduce((n, r) => n + r.outstandingUsd, 0),
      oldestDays: daysSince(credit[0]?.requestedAt, now),
      href: "/app/finance/credit",
      permission: "credit.approve",
    },
    {
      key: "payments",
      label: "Payments to verify",
      detail: "Money a desk says arrived, not yet banked on the ledger.",
      count: payments.length,
      valueUsd: paymentsUsd,
      oldestDays: daysSince(payments[0]?.submittedAt, now),
      href: "/app/finance/verify",
      permission: "payment.verify",
    },
    {
      key: "drafts",
      label: "Prices to confirm",
      detail: "Priced but not billed. Until it is confirmed it cannot be collected.",
      count: drafts.length,
      valueUsd: drafts.reduce((n, d) => n + toNumber(d.total), 0),
      oldestDays: daysSince(drafts[0]?.issuedAt, now),
      href: "/app/finance/invoices?status=DRAFT",
      permission: "invoice.manage",
    },
    {
      key: "claims",
      label: "Claims open",
      detail: "Cargo lost, short or damaged, with nobody's ruling on it yet.",
      count: claims.length,
      valueUsd: null,
      oldestDays: daysSince(claims[0]?.raisedAt, now),
      href: "/app/exceptions",
      permission: "exception.approve",
    },
  ];
}
