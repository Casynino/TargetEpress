import type {
  CreditStatus,
  InvoiceStatus,
  Prisma,
  ShipmentStatus,
} from "@prisma/client";
import { isCollectable } from "@/lib/payable";

import { toNumber } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";

/** What every money column in this schema actually arrives as. */
type Money = number | string | Prisma.Decimal | null | undefined;

/**
 * Credit sales: what is owed, by whom, and for how long.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE. Credit is not payment. A credit
 * sale means the cargo went, the revenue is real, and the money has not
 * arrived. So nothing here ever adds to cash, and nothing here is stored as a
 * balance — every figure below is derived from the invoice's own two numbers,
 * `total` and `amountPaid`, exactly like the storage clock is derived from two
 * dates. A stored receivable would be a second answer to a question the invoice
 * already answers, and the two would disagree within a week.
 *
 * The money movement itself needs no new machinery at all. When a credit
 * customer pays, Finance records an ordinary payment against the same invoice:
 * `amountPaid` rises, the outstanding figure here falls, and the ledger credits
 * a real account. Receivable down, cash up, one entry, no double count — which
 * is why collecting a credit must never create a new sale.
 */

/**
 * The terms the desk reaches for, in days.
 *
 * Suggestions now, not the whole list. They were the only three the system
 * would accept, and a customer negotiating 45 days had to be written down as
 * 30 — a due date the company never agreed, which is the one thing the credit
 * engine must never be handed. Any whole number of days inside the bounds
 * below is allowed; these are the three that fill the picker.
 */
export const CREDIT_TERMS = [7, 14, 30] as const;
export type CreditTerm = (typeof CREDIT_TERMS)[number];

/**
 * What a term may be at all.
 *
 * One day at the bottom, because "pay me tomorrow" is a real arrangement. A
 * year at the top, because a term beyond that is not credit on a consignment —
 * it is a debt somebody should be deciding about deliberately, not typing into
 * a box on a call.
 */
export const CREDIT_TERM_MIN = 1;
export const CREDIT_TERM_MAX = 365;

/** Whether a typed term is one the business will stand behind. */
export function isCreditTerm(days: number) {
  return (
    Number.isInteger(days) &&
    days >= CREDIT_TERM_MIN &&
    days <= CREDIT_TERM_MAX
  );
}

export const DEFAULT_CREDIT_TERM: CreditTerm = 14;

/**
 * What a credit line looks like to a human reading the list.
 *
 * Derived in this order deliberately: settled first, then forgiven, then late,
 * then merely open. A bill that has been paid is not overdue no matter what its
 * due date says, and a debt the company wrote off is not a collection problem —
 * it is a decision, and it stops appearing on anybody's call list.
 */
export type CreditState =
  | "PAID"
  | "WAIVED"
  | "OVERDUE"
  | "PARTIALLY_PAID"
  | "ACTIVE";

export const CREDIT_STATE_LABEL: Record<CreditState, string> = {
  PAID: "Paid",
  WAIVED: "Waived",
  OVERDUE: "Overdue",
  PARTIALLY_PAID: "Partially paid",
  ACTIVE: "Active",
};

export type CreditLine = {
  state: CreditState;
  /** Billed on this credit. */
  totalUsd: number;
  paidUsd: number;
  /** Still owed. Never negative — an overpayment is not a negative debt. */
  outstandingUsd: number;
  /** Days since the credit was granted. The age of the debt. */
  daysOutstanding: number;
  /** Days until it falls due. Negative once it is late; null with no due date. */
  daysRemaining: number | null;
  /** Days past due, 0 when not yet late. */
  daysOverdue: number;
  dueDate: Date | null;
  creditDate: Date | null;
};

/** Whole days between two dates, floored, using calendar days rather than ms. */
function daysBetween(from: Date, to: Date) {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

/**
 * The state of one credit, worked out from the invoice rather than looked up.
 *
 * `now` is a parameter so a list of two hundred rows is measured against one
 * instant. Rendering a table where each row read its own clock produced rows
 * that disagreed about what day it was.
 */
export function creditLine(
  invoice: {
    total: Money;
    amountPaid: Money;
    status: InvoiceStatus;
    dueDate: Date | null;
    creditDecidedAt: Date | null;
  },
  now: Date
): CreditLine {
  const totalUsd = toNumber(invoice.total);
  const paidUsd = toNumber(invoice.amountPaid);
  const outstandingUsd = Math.max(0, totalUsd - paidUsd);

  const creditDate = invoice.creditDecidedAt;
  const dueDate = invoice.dueDate;

  const daysOutstanding = creditDate ? Math.max(0, daysBetween(creditDate, now)) : 0;
  const daysRemaining = dueDate ? daysBetween(now, dueDate) : null;
  const daysOverdue =
    daysRemaining !== null && daysRemaining < 0 ? -daysRemaining : 0;

  /* A written-off credit is money the company gave up on. It keeps its own
     state rather than being dropped, because a month where the desk forgave
     four million shillings must not read like a month where nothing happened —
     the same reason a waived storage fee is kept rather than zeroed. */
  const state: CreditState =
    invoice.status === "WRITTEN_OFF"
      ? "WAIVED"
      : outstandingUsd <= 0.005
        ? "PAID"
        : daysOverdue > 0
          ? "OVERDUE"
          : paidUsd > 0.005
            ? "PARTIALLY_PAID"
            : "ACTIVE";

  return {
    state,
    totalUsd,
    paidUsd,
    outstandingUsd,
    daysOutstanding,
    daysRemaining,
    daysOverdue,
    dueDate,
    creditDate,
  };
}

/** How a due date reads to somebody who has to act on it. */
export function dueLabel(line: CreditLine): string {
  if (line.state === "PAID") return "Settled";
  if (line.state === "WAIVED") return "Written off";
  if (line.daysRemaining === null) return "No due date";
  if (line.daysOverdue > 0) {
    return line.daysOverdue === 1 ? "1 day overdue" : `${line.daysOverdue} days overdue`;
  }
  if (line.daysRemaining === 0) return "Due today";
  return line.daysRemaining === 1 ? "Due tomorrow" : `Due in ${line.daysRemaining} days`;
}

/**
 * Aging buckets, oldest debt to the right.
 *
 * The point of an aging analysis is that debt does not age gracefully: money
 * sixty days late is a different problem from money four days late, and a single
 * "outstanding" total hides which one you have. `Current` is everything not yet
 * due — it is not a problem at all, and it belongs on the chart so the problem
 * buckets can be read against it.
 */
export const AGING_BUCKETS = [
  { key: "current", label: "Current", from: 0, to: 0 },
  { key: "d1_7", label: "1–7 days", from: 1, to: 7 },
  { key: "d8_14", label: "8–14 days", from: 8, to: 14 },
  { key: "d15_30", label: "15–30 days", from: 15, to: 30 },
  { key: "d31_60", label: "31–60 days", from: 31, to: 60 },
  { key: "d60_plus", label: "60+ days", from: 61, to: Infinity },
] as const;

export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

export function agingBucket(daysOverdue: number): AgingKey {
  if (daysOverdue <= 0) return "current";
  for (const b of AGING_BUCKETS) {
    if (daysOverdue >= b.from && daysOverdue <= b.to) return b.key;
  }
  return "d60_plus";
}

/**
 * A customer's credit facility and how much of it is spoken for.
 *
 * `available` is the figure that decides whether a new request can be granted,
 * and it is limit minus EXPOSURE, not limit minus this one sale. A customer with
 * a USD 5,000 limit who already owes 4,800 can take another 200 of cargo, not
 * another 5,000 — that distinction is the entire purpose of a limit.
 */
export type CustomerCredit = {
  hasFacility: boolean;
  limitUsd: number | null;
  termDays: number;
  outstandingUsd: number;
  availableUsd: number | null;
  /** Everything ever released on credit to this customer. */
  soldUsd: number;
  paidUsd: number;
  overdueUsd: number;
  /** Share of credit billed that has come back, 0–100. Null with no history. */
  collectionRate: number | null;
  openCount: number;
  overdueCount: number;
};

export function customerCredit(
  customer: { creditLimitUsd: Money; creditTermDays: number | null },
  lines: CreditLine[]
): CustomerCredit {
  const limitUsd =
    customer.creditLimitUsd === null || customer.creditLimitUsd === undefined
      ? null
      : toNumber(customer.creditLimitUsd);

  const soldUsd = lines.reduce((n, l) => n + l.totalUsd, 0);
  const paidUsd = lines.reduce((n, l) => n + l.paidUsd, 0);
  /* Written-off credit is not exposure: the company already stopped expecting
     it, so holding it against the customer's limit would punish them twice and
     freeze a facility over a debt nobody intends to collect. */
  const live = lines.filter((l) => l.state !== "WAIVED");
  const outstandingUsd = live.reduce((n, l) => n + l.outstandingUsd, 0);
  const overdueUsd = live
    .filter((l) => l.state === "OVERDUE")
    .reduce((n, l) => n + l.outstandingUsd, 0);

  return {
    hasFacility: limitUsd !== null && limitUsd > 0,
    limitUsd,
    termDays: customer.creditTermDays ?? DEFAULT_CREDIT_TERM,
    outstandingUsd,
    availableUsd: limitUsd === null ? null : limitUsd - outstandingUsd,
    soldUsd,
    paidUsd,
    overdueUsd,
    collectionRate: soldUsd > 0 ? (paidUsd / soldUsd) * 100 : null,
    openCount: live.filter((l) => l.outstandingUsd > 0.005).length,
    overdueCount: live.filter((l) => l.state === "OVERDUE").length,
  };
}

/**
 * What Finance is told before it approves — including when to hesitate.
 *
 * The answer is never a refusal. The owner grants credit, not this function: a
 * request over the limit is approved with both eyes open or not at all, and
 * pretending the software decided is how a real decision stops being recorded.
 * So this returns a warning and the arithmetic behind it, and the person
 * approving carries the judgement.
 */
export type CreditCheck = {
  requestUsd: number;
  currentOutstandingUsd: number;
  totalAfterUsd: number;
  limitUsd: number | null;
  availableAfterUsd: number | null;
  /** No facility at all — approving means granting one implicitly. */
  noFacility: boolean;
  /** Would push them past their limit. */
  exceedsLimit: boolean;
  /** Inside the limit, but leaves under a tenth of it free. */
  nearLimit: boolean;
  /** They are already late on something else. The loudest signal here. */
  hasOverdue: boolean;
  overdueUsd: number;
};

export function creditCheck(
  requestUsd: number,
  credit: CustomerCredit
): CreditCheck {
  const totalAfterUsd = credit.outstandingUsd + requestUsd;
  const availableAfterUsd =
    credit.limitUsd === null ? null : credit.limitUsd - totalAfterUsd;

  return {
    requestUsd,
    currentOutstandingUsd: credit.outstandingUsd,
    totalAfterUsd,
    limitUsd: credit.limitUsd,
    availableAfterUsd,
    noFacility: !credit.hasFacility,
    exceedsLimit: availableAfterUsd !== null && availableAfterUsd < 0,
    nearLimit:
      availableAfterUsd !== null &&
      credit.limitUsd !== null &&
      credit.limitUsd > 0 &&
      availableAfterUsd >= 0 &&
      availableAfterUsd < credit.limitUsd * 0.1,
    hasOverdue: credit.overdueUsd > 0.005,
    overdueUsd: credit.overdueUsd,
  };
}

/** A due date from terms, counted from the day credit was granted. */
export function dueDateFrom(grantedAt: Date, termDays: number): Date {
  const due = new Date(grantedAt);
  due.setUTCDate(due.getUTCDate() + termDays);
  return due;
}

/**
 * The invoice states a credit request may be raised against.
 *
 * A DRAFT is excluded because nobody has signed the figure off, and granting
 * credit against a number Finance has not looked at commits the company to an
 * amount that can still change. A PAID bill is excluded because there is
 * nothing to defer.
 */
export function canRequestCredit(invoice: {
  status: InvoiceStatus;
  creditStatus: CreditStatus;
  total: Money;
  amountPaid: Money;
  /* The third figure. Without it a bill whose last shillings were written off
     still reads as chaseable, and the customer keeps being rung for money the
     company has already decided is not coming. */
  amountAdjusted: Money;
  /*
    Where the cargo is.

    Releasing on credit is agreeing a debt for a particular consignment, and
    it was being offered on cargo still in Guangzhou — a debt agreed against a
    price that is still an estimate, for goods the company has not yet
    weighed. Optional so the older callers that ask only about the invoice
    still compile; every one of them that decides money now passes it.
  */
  shipmentStatus?: ShipmentStatus | null;
}): boolean {
  if (invoice.status === "DRAFT" || invoice.status === "VOID") return false;
  if (invoice.status === "PAID" || invoice.status === "WRITTEN_OFF") return false;
  if (
    invoice.shipmentStatus !== undefined &&
    !isCollectable(invoice.shipmentStatus)
  ) {
    return false;
  }
  if (invoice.creditStatus === "REQUESTED" || invoice.creditStatus === "APPROVED") {
    return false;
  }
  return outstandingOf(invoice) > 0.005;
}

/** The Prisma filter for "released on credit and still owing". */
export const OPEN_CREDIT_WHERE = {
  creditStatus: "APPROVED" as const,
  status: { notIn: ["DRAFT", "VOID", "PAID"] as InvoiceStatus[] },
};
