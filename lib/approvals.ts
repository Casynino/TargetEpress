import "server-only";

import type { Role } from "@prisma/client";

import {
  DRAFT_INVOICE,
  EXCEPTION_OPEN_STATUSES,
  PENDING_SUBMISSION,
} from "@/lib/constants";
import { pendingCreditRequests } from "@/lib/credit-queries";
import { roundMoney, toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { BASE_CURRENCY } from "@/lib/money";
import { pendingPayrollApproval } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { statementSummary, submittedStatements } from "@/lib/statements";

/**
 * Everything in the company currently waiting on somebody to decide, and what
 * has lately been decided.
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
 * calls it normal. Six queues side by side, each with the age of its oldest
 * item, is the only view from which "Finance has not verified a payment in five
 * days" is visible at all.
 *
 * The age is the oldest waiting item, not the average. An average of two hours
 * and nine days reads as four days and describes neither.
 */

/**
 * The kinds of ruling this board covers, named once.
 *
 * Everything else in the file points at this table rather than repeating a
 * route or a label: the pending row and the decided row for the same kind of
 * ruling must send the reader to the same screen, and two copies of
 * "/app/finance/credit" in one file is the beginning of them not doing so.
 */
export type QueueKey =
  | "credit"
  | "payments"
  | "drafts"
  | "statements"
  | "payroll"
  | "claims";

export type QueueDef = {
  key: QueueKey;
  label: string;
  /** What deciding it means, in the manager's words, not the schema's. */
  detail: string;
  href: string;
  /** Whether this reader may take the decision, or is only watching it. */
  permission:
    | "credit.approve"
    | "payment.verify"
    | "invoice.manage"
    | "exception.approve"
    | "payroll.approve"
    | "statement.review";
};

const QUEUES: Record<QueueKey, QueueDef> = {
  credit: {
    key: "credit",
    label: "Credit requested",
    detail: "Cargo a customer wants to take now and pay for later.",
    href: "/app/finance/credit",
    permission: "credit.approve",
  },
  payments: {
    key: "payments",
    label: "Payments to verify",
    detail: "Money a desk says arrived, not yet banked. Shillings at today's rate.",
    href: "/app/finance/verify",
    permission: "payment.verify",
  },
  drafts: {
    key: "drafts",
    label: "Prices to confirm",
    detail: "Priced but not billed. Until it is confirmed it cannot be collected.",
    /* Not /app/finance/invoices?status=DRAFT. That route is a bare redirect to
       the finance overview and the status is dropped on the way, so a manager
       pressing a count of unconfirmed prices landed somewhere that could not
       show him one. The collections queue is where a draft is actually acted
       on. */
    href: "/app/collections/follow-up",
    permission: "invoice.manage",
  },
  statements: {
    key: "statements",
    label: "Flight statements to read",
    detail: "Books Finance has shut on a flight. Until they are agreed it is not finished.",
    /* The closed-batches sheet, not the batch page and not the manager's own
       reconciliation list. This row stands for several flights at once, so it
       cannot address one of them, and the accept/send-back control with its
       statement.review guard lives on that sheet — which then opens each
       flight at /app/shipments/{id} for the evidence. */
    href: "/app/finance/income",
    permission: "statement.review",
  },
  payroll: {
    key: "payroll",
    label: "Salaries to agree",
    detail: "A month's pay list, read name by name before it is signed.",
    href: "/app/manager/payroll",
    permission: "payroll.approve",
  },
  claims: {
    key: "claims",
    label: "Claims open",
    /* "Not finished with", not "nobody has ruled on it": this queue counts the
       shared open set, which includes a case whose compensation or replacement
       has been agreed and which is still waiting on somebody to see it through.
       The label may not claim more than the query behind it. */
    detail: "Cargo lost, short or damaged, and nobody has finished with it.",
    href: "/app/exceptions",
    permission: "exception.approve",
  },
};

export type ApprovalQueue = QueueDef & {
  count: number;
  /**
   * Money riding on the queue, in USD.
   *
   * Null where the queue is not about money, and null where a true total
   * cannot be struck — see the payments queue, which needs the published rate
   * to add shillings to dollars. A queue that cannot state its value states
   * none: the count and the age are still true.
   */
  valueUsd: number | null;
  /** Days the oldest item has been waiting. Null when the queue is empty. */
  oldestDays: number | null;
};

/**
 * Payment claims Finance has not ruled on, oldest first.
 *
 * The definition of this figure, in one place. Two other engines count these
 * same rows for their own screens — collectionsOverview() in lib/collections.ts
 * for the Support desk, ownerAttention() in lib/queries.ts for the owner's
 * panel — and each stops at a count. This queue needs the wait and the money as
 * well, so the richer read is the one that should own the figure and the count
 * is taken from its length rather than asked for separately; a `_count` beside
 * a `findMany` of the same rows is two answers to one question.
 */
export function pendingPaymentSubmissions() {
  return prisma.paymentSubmission.findMany({
    where: PENDING_SUBMISSION,
    select: { amount: true, currency: true, submittedAt: true },
    orderBy: { submittedAt: "asc" },
  });
}

/**
 * Prices nobody has signed off, oldest first.
 *
 * A draft is a decision, and one that quietly stalls money if it sits: the
 * cargo is priced, the customer has not been billed, and until somebody
 * confirms it the invoice is not revenue and cannot be collected.
 *
 * Same ownership rule as the submissions above — ownerAttention() counts the
 * identical rows for its "price(s) to confirm" row, and this read carries the
 * age and the value that row has no use for.
 */
export function draftInvoices() {
  return prisma.invoice.findMany({
    where: DRAFT_INVOICE,
    select: { total: true, issuedAt: true },
    orderBy: { issuedAt: "asc" },
  });
}

const DAY = 86_400_000;
const daysSince = (d: Date | null | undefined, now: Date) =>
  d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY)) : null;

export async function approvalQueues(now = new Date()): Promise<ApprovalQueue[]> {
  const [credit, payments, drafts, claims, payroll, statements, rate] = await Promise.all([
    pendingCreditRequests(now),

    pendingPaymentSubmissions(),

    draftInvoices(),

    /* Raised, not yet ruled on, on the shared list rather than a shorter one
       written here. EXCEPTION_OPEN_STATUSES is what the exceptions queue, the
       dashboards and the public tracking page all mean by "open", and this row
       used to name only OPEN and UNDER_INVESTIGATION — so a case waiting on a
       customer, or with compensation or a replacement approved and nobody yet
       having closed it, was open everywhere in the company except on the board
       whose job is to notice things sitting. */
    prisma.shipmentException.findMany({
      where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } },
      select: { raisedAt: true },
      orderBy: { raisedAt: "asc" },
    }),

    /* Both of these come from the module that owns them rather than from a
       query written here. Payroll already knows what "waiting" means for a run
       (PENDING_APPROVAL, aged from submittedAt with a fallback to preparedAt)
       and statements already know that RETURNED is not waiting on this desk.
       Asking them is the only way this board and their own screens can agree. */
    pendingPayrollApproval(now),
    submittedStatements(now),

    /* The published rate, for the one queue whose rows are not all in the same
       currency. Read here rather than taken as an argument so that every screen
       calling this function is shown the same total. */
    currentRateValue(),
  ]);

  /* Summed by the statements module, not re-summed here, for the same reason:
     one adder, one answer. It takes the rows we already fetched, so the queue
     count and the money on it cannot come from two different reads. */
  const flights = await statementSummary(statements, now);

  /* Submissions are keyed in the currency the customer paid in — TZS or USD,
     the only two the claim form offers (lib/actions/collections.ts) — and
     shillings are what most of them arrive in. Summing the dollar ones alone
     left this row understating the money waiting to be verified, in exactly the
     currency it mostly waits in, on a page read in shillings.

     Converted at TODAY'S published rate, and the row says so. Nothing is frozen
     yet: a claim has no rate until Finance verifies it and books the payment,
     so today's rate is the only rate this total could be struck at. That also
     makes it the same rate every other figure on this board is printed at.

     Null rather than a partial sum when a shilling claim is waiting and no rate
     has ever been published. A blank where a total belongs reads as a question;
     a total that has quietly dropped most of its rows reads as an answer. */
  let paymentsTotal = 0;
  let paymentsConvertible = true;
  for (const submission of payments) {
    const amount = toNumber(submission.amount);
    if (submission.currency === BASE_CURRENCY) {
      paymentsTotal += amount;
      continue;
    }
    if (rate === null) {
      paymentsConvertible = false;
      break;
    }
    paymentsTotal += amount / rate;
  }
  // Rounded once, at the end: dividing shillings by a rate leaves fractions of
  // a cent that a money column has no way to print honestly.
  const paymentsUsd = paymentsConvertible ? roundMoney(paymentsTotal) : null;

  return [
    {
      ...QUEUES.credit,
      count: credit.length,
      valueUsd: credit.reduce((n, r) => n + r.outstandingUsd, 0),
      oldestDays: daysSince(credit[0]?.requestedAt, now),
    },
    {
      ...QUEUES.payments,
      count: payments.length,
      valueUsd: paymentsUsd,
      oldestDays: daysSince(payments[0]?.submittedAt, now),
    },
    {
      ...QUEUES.drafts,
      count: drafts.length,
      valueUsd: drafts.reduce((n, d) => n + toNumber(d.total), 0),
      oldestDays: daysSince(drafts[0]?.issuedAt, now),
    },
    {
      ...QUEUES.statements,
      count: flights.waiting,
      /* Dollars, converted by the page at today's rate like every other row
         here. Each statement also froze the rate it was closed at, and that
         frozen rate is what its OWN row prints on the reconciliation sheet —
         but a total struck across several statements at several frozen rates
         is a figure no rate ever produced, so the sum stays in the currency
         the figures are stored in and is converted once, at the top. */
      valueUsd: flights.revenueUsd,
      oldestDays: flights.oldestDays,
    },
    {
      ...QUEUES.payroll,
      count: payroll.length,
      /* Net, not gross: this column asks what is riding on the queue, and what
         rides on an unsigned salary run is the money that will leave the
         account, not the figure before deductions. */
      valueUsd: payroll.reduce((n, run) => n + run.totals.net, 0),
      // Ordered oldest-first by the module, so the first row is the wait.
      oldestDays: payroll.length > 0 ? payroll[0].waitingDays : null,
    },
    {
      ...QUEUES.claims,
      count: claims.length,
      valueUsd: null,
      oldestDays: daysSince(claims[0]?.raisedAt, now),
    },
  ];
}

/* ------------------------------------------------------------ what was ruled */

export type DecisionOutcome = "approved" | "rejected";

type DecisionDef = {
  outcome: DecisionOutcome;
  /** The queue this ruling clears, when it is one of the six counted above. */
  queue: QueueKey | null;
  /** For a ruling with no pending queue here: the screen it was made on. */
  desk?: string;
  /** The record itself, where its entity has a page of its own. */
  record?: (entityId: string) => string;
};

/**
 * The audit actions that ARE decisions, and which way each one went.
 *
 * Read off the log rather than recorded again. Every one of these rulings
 * already writes its audit row inside the transaction that made it, so the log
 * is the only account of a decision that cannot disagree with the decision —
 * a `decidedAt` column maintained beside it would be a second record of the
 * same fact, and the two would part company the first time a ruling was made
 * by a path that forgot to update it.
 *
 * DELIBERATELY NOT HERE: `invoice.confirm` and `payment.verified`, which are
 * the affirmative halves of two queues counted above. They are clerical
 * throughput at dozens a day, and a decision list they were in would be a
 * decision list nobody could find a credit ruling in. The page says so in a
 * line under the rows and points at the full log, which has them.
 */
const DECISIONS: Record<string, DecisionDef> = {
  "credit.approved": {
    outcome: "approved",
    queue: "credit",
    record: (id) => `/app/finance/invoices/${id}`,
  },
  "credit.rejected": {
    outcome: "rejected",
    queue: "credit",
    record: (id) => `/app/finance/invoices/${id}`,
  },

  /* A run is agreed, then paid, and both are logged. Paying is filed under
     approved because the question this filter asks is whether a thing went
     through or was sent back, and a run that was paid plainly went through —
     the sentence on the row still says which of the two happened. */
  "payroll.approve": { outcome: "approved", queue: "payroll" },
  "payroll.reject": { outcome: "rejected", queue: "payroll" },
  "payroll.pay": { outcome: "approved", queue: "payroll" },

  /* Logged against the Batch, so the row opens the flight itself — its cargo,
     its costs, the note it was closed with. */
  "statement.confirmed": {
    outcome: "approved",
    queue: "statements",
    record: (id) => `/app/shipments/${id}`,
  },
  "statement.returned": {
    outcome: "rejected",
    queue: "statements",
    record: (id) => `/app/shipments/${id}`,
  },

  "exception.approveCompensation": { outcome: "approved", queue: "claims" },
  "exception.resolve": { outcome: "approved", queue: "claims" },

  /* Approving a bill is a ruling this desk makes, but there is no pending
     expenses queue on this board, so it names its own screen. */
  "expense.approve": { outcome: "approved", queue: null, desk: "/app/finance/expenses" },
};

export type Decision = {
  id: string;
  outcome: DecisionOutcome;
  /**
   * The stored action code and summary, handed over untouched.
   *
   * Not re-worded here. lib/audit-humanise.ts already turns a row into a
   * sentence in the reader's language and is the only thing that may — a
   * second wording of the same event would be a second version of what
   * happened, on a page whose whole claim is that it reports and does not
   * decide. The reason a ruling was given travels inside that sentence,
   * because every send-back in this system writes it there ("Sent PR-2026-08
   * back — bank details wrong"); lifting it out of the metadata as well would
   * print the same words twice.
   */
  action: string;
  summary: string;
  /** Name, else the email the log kept, else null for something the system did. */
  actor: string | null;
  role: Role | null;
  at: Date;
  href: string;
};

function decisionHref(def: DecisionDef, entityId: string | null): string {
  if (entityId && def.record) return def.record(entityId);
  return def.queue ? QUEUES[def.queue].href : def.desk ?? "/app/finance/audit";
}

const actionsFor = (outcome: DecisionOutcome) =>
  Object.keys(DECISIONS).filter((action) => DECISIONS[action].outcome === outcome);

/**
 * The last rulings, newest first.
 *
 * Bounded by count and not by date on purpose. This sits under a board whose
 * point is that it fits on one screen, and a month bound would make its height
 * depend on how busy the month was — quiet in January, a wall in December. The
 * full history is the audit log, and the page links to it.
 *
 * A window PER OUTCOME rather than one shared between them. Approvals outnumber
 * refusals many times over — most things put up are agreed — so a single window
 * of thirty would be thirty approvals in a busy week and the one salary run
 * that was sent back would have fallen off the end of it. The refusal is the
 * row somebody came to this page to find.
 */
export async function decisionHistory(take = 30): Promise<Decision[]> {
  const select = {
    id: true,
    action: true,
    summary: true,
    entityId: true,
    actorEmail: true,
    actorRole: true,
    createdAt: true,
    // Denormalised email is the fallback: the log outlives the staff record.
    actor: { select: { name: true } },
  } as const;

  const [approved, rejected] = await Promise.all(
    (["approved", "rejected"] as const).map((outcome) =>
      prisma.auditLog.findMany({
        where: { action: { in: actionsFor(outcome) } },
        orderBy: { createdAt: "desc" },
        take,
        select,
      })
    )
  );

  return [...approved, ...rejected]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((row) => {
      const def = DECISIONS[row.action];
      return {
        id: row.id,
        outcome: def.outcome,
        action: row.action,
        summary: row.summary,
        actor: row.actor?.name ?? row.actorEmail ?? null,
        role: row.actorRole,
        at: row.createdAt,
        href: decisionHref(def, row.entityId),
      };
    });
}
