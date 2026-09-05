"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import {
  CREDIT_TERM_MAX,
  CREDIT_TERM_MIN,
  isCreditTerm,
  DEFAULT_CREDIT_TERM,
  canRequestCredit,
  creditCheck,
  creditLine,
  customerCredit,
  dueDateFrom,
} from "@/lib/credit";
import { toNumber } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import {
  COLLECTABLE_SHIPMENT_WHERE,
  isCollectable,
  notPayableMessage,
} from "@/lib/payable";
import { can } from "@/lib/rbac";
import { authorize } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * Granting credit, and refusing it.
 *
 * Three actions and one rule holding them apart: THE DESK THAT ASKS IS NOT THE
 * DESK THAT GRANTS. Support raises a request, Finance decides it, and the
 * decision is refused outright if the same person did both. That is not a
 * formality — releasing cargo without payment is the one act in this system
 * that can lose real money to a person who simply typed the right words, and a
 * single approver with both powers is the whole exposure.
 *
 * Nothing here moves money, because credit is not payment. No ledger entry, no
 * account touched, no cash figure altered. What changes is a promise: the bill
 * gains a due date, the cargo becomes collectable, and the amount stays exactly
 * as owed as it was. When the customer eventually pays, that goes through the
 * ordinary payment path against the same invoice — receivable down, cash up,
 * once.
 */

/* ------------------------------------------------------------------ request */

const requestSchema = z.object({
  invoiceId: z.string().min(1),
  termDays: z.coerce
    .number()
    .int()
    .refine(
      isCreditTerm,
      `Terms are a whole number of days, from ${CREDIT_TERM_MIN} to ${CREDIT_TERM_MAX}.`
    ),
  note: z.string().trim().optional(),
});

/**
 * Support asks for a consignment to be released on credit.
 *
 * The terms are chosen here rather than at approval, so Finance is answering a
 * specific question — "may this customer have 30 days on USD 500" — instead of
 * being handed a blank authority to invent both the amount and the deadline.
 */
export async function requestCredit(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("credit.request");
    /*
      Finance does not send itself a request.

      The two-step exists to stop the desk that agrees terms with a customer from
      also being the desk that lets the cargo go unpaid. When the person acting
      ALREADY holds the approval authority, there is no second party to wait for
      and the round trip is pure ceremony — Finance was raising a request, then
      walking to another page to approve its own request, which is both slower and
      a worse record than simply saying "released on credit, by me".

      So the authority decides the shape: Support asks, Finance grants. The
      no-self-approval rule still bites exactly where it should — a Support
      request can never be approved by the person who raised it.
    */
    const grantsDirectly = can(user.role, "credit.approve");
    const parsed = requestSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    /*
      ONE CONSIGNMENT, OR EVERY ONE THIS PAYMENT COVERS.

      A customer collecting three boxes on terms is one arrangement, not three
      — the desk agrees it once and the terms are the same for all of them. So
      the id may be a list, and every bill on it is released together inside a
      single transaction: if any one of them cannot be, none of them is.

      Everything below is unchanged per bill. The eligibility test, the
      conditional claim on creditStatus and the audit line are exactly what a
      single release always did, run once for each.
    */
    const ids = parsed.data.invoiceId
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: ids } },
      orderBy: { invoiceNumber: "asc" },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        creditStatus: true,
        total: true,
        amountPaid: true,
        amountAdjusted: true,
        customerId: true,
        shipment: { select: { trackingNumber: true, status: true } },
      },
    });
    if (invoices.length !== ids.length) {
      return fail(t(locale, "That invoice no longer exists."));
    }

    /* Terms belong to a customer, so a single release cannot span two of them.
       The screen that sends several only ever lists one customer's bills; this
       is the action refusing to be told otherwise. */
    if (new Set(invoices.map((i) => i.customerId)).size > 1) {
      return fail(
        t(locale, "Those bills belong to different customers. Credit is agreed with one customer at a time.")
      );
    }

    for (const invoice of invoices) {
      /* Credit is a debt agreed for a particular consignment. Agreeing one on
         cargo the Dar floor has not confirmed commits the customer to a price
         worked out from a packing list — see lib/payable.ts. */
      if (
        !canRequestCredit({
          ...invoice,
          shipmentStatus: invoice.shipment?.status ?? null,
        })
      ) {
        const which = invoices.length > 1 ? `${invoice.invoiceNumber}: ` : "";
        return fail(
          which +
            (invoice.creditStatus === "REQUESTED"
              ? t(locale, "Credit has already been requested on this bill and is with Finance.")
              : invoice.creditStatus === "APPROVED"
                ? t(locale, "This consignment is already approved for credit.")
                : invoice.status === "DRAFT"
                  ? t(locale, "Confirm the price first — credit cannot be granted against a figure nobody has signed off.")
                  : /* Said plainly, or the desk is refused with no idea why:
                       the bill looks perfectly ordinary on screen. */
                    !isCollectable(invoice.shipment?.status ?? null)
                    ? notPayableMessage(invoice.shipment?.trackingNumber ?? invoice.invoiceNumber)
                    : t(locale, "There is nothing outstanding on this bill to defer."))
        );
      }
    }

    const now = new Date();
    const dueDate = grantsDirectly ? dueDateFrom(now, parsed.data.termDays) : null;

    await prisma.$transaction(async (tx) => {
      for (const invoice of invoices) {
      const owing = outstandingOf(invoice);
      /* Claimed on the creditStatus the eligibility check above actually read:
         two clerks pressing the button together, or a request landing on a
         credit Finance just decided, resolve to one winner and one clear
         refusal instead of a silent overwrite. */
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, creditStatus: invoice.creditStatus },
        data: grantsDirectly
          ? {
              creditStatus: "APPROVED",
              paymentType: "CREDIT",
              creditTermDays: parsed.data.termDays,
              creditRequestedAt: now,
              creditRequestedById: user.id,
              creditRequestNote: parsed.data.note || null,
              creditDecidedAt: now,
              creditDecidedById: user.id,
              dueDate,
            }
          : {
              creditStatus: "REQUESTED",
              creditTermDays: parsed.data.termDays,
              creditRequestedAt: now,
              creditRequestedById: user.id,
              creditRequestNote: parsed.data.note || null,
              /* paymentType stays CASH until somebody grants the credit. A
                 request is not a term: if Finance says no, the bill was never
                 anything other than a cash bill and nothing has to be unwound. */
            },
      });
      if (claimed.count === 0) {
        throw new Error(
          t(locale, "The credit on this bill was just decided by somebody else. Reload to see where it stands.")
        );
      }

      await recordAudit(
        {
          actor: user,
          action: grantsDirectly ? "credit.approved" : "credit.requested",
          entity: "Invoice",
          entityId: invoice.id,
          summary: grantsDirectly
            ? `${invoice.invoiceNumber}: released on credit — USD ${owing.toFixed(2)} on ${parsed.data.termDays} day terms, due ${dueDate!.toISOString().slice(0, 10)}`
            : `${invoice.invoiceNumber}: credit requested — ${parsed.data.termDays} day terms on USD ${owing.toFixed(2)}`,
          metadata: {
            tracking: invoice.shipment?.trackingNumber ?? null,
            termDays: parsed.data.termDays,
            outstandingUsd: owing,
            note: parsed.data.note || null,
            /* Says plainly that one person did both halves, and that they were
               entitled to. An auditor asking "who approved this" gets an answer
               rather than a gap. */
            grantedDirectly: grantsDirectly,
            dueDate: dueDate ? dueDate.toISOString() : null,
          },
        },
        tx
      );
      }
    });

    for (const invoice of invoices) {
      revalidatePath(`/app/finance/invoices/${invoice.id}`);
    }
    revalidatePath("/app/finance/credit");
    revalidatePath("/app/credit");
    revalidatePath("/app/collections/follow-up");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/* ------------------------------------------------------------------ approve */

const decideSchema = z.object({
  invoiceId: z.string().min(1),
  note: z.string().trim().optional(),
  /** Finance may move the terms it was asked for. It still has to be one we offer. */
  termDays: z.coerce.number().int().optional(),
});

/**
 * Finance grants the credit. The cargo may now be collected unpaid.
 *
 * Two guards, both of which have to hold at the moment of writing rather than at
 * the moment the page was rendered:
 *
 *  - The approver cannot be the requester. Checked here, in the transaction,
 *    against the stored requester — not against anything the form sent.
 *  - The request must still be REQUESTED. The conditional updateMany is the
 *    claim: if a second approval arrives while the first is in flight, the
 *    second updates zero rows and is told so, rather than both succeeding and
 *    writing two decisions over each other.
 */
export async function approveCredit(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("credit.approve");
    const parsed = decideSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: parsed.data.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          creditStatus: true,
          creditTermDays: true,
          creditRequestedById: true,
          total: true,
          amountPaid: true,
          amountAdjusted: true,
          exchangeRate: true,
          customerId: true,
          customer: { select: { name: true, creditLimitUsd: true, creditTermDays: true } },
          shipment: { select: { trackingNumber: true, status: true } },
        },
      });
      if (!invoice) throw new Error("That invoice no longer exists.");

      if (invoice.creditStatus !== "REQUESTED") {
        throw new Error(
          invoice.creditStatus === "APPROVED"
            ? `${invoice.invoiceNumber} is already approved for credit.`
            : `There is no open credit request on ${invoice.invoiceNumber}.`
        );
      }

      /*
        Re-asked at the grant, not only at the request.

        A request raised while the cargo was still coming — or raised before
        this rule existed — is sitting in Finance's queue now, and approving it
        is the moment the company commits to the debt. Finance is told to
        reject it instead, which leaves the audit trail showing a decision
        rather than a request that quietly stopped working.
      */
      if (!isCollectable(invoice.shipment?.status ?? null)) {
        throw new Error(notPayableMessage(invoice.shipment?.trackingNumber ?? invoice.invoiceNumber));
      }

      /*
        Nobody signs off their own request.

        This is the load-bearing line of the whole feature. It is checked against
        the requester stored on the row, inside the transaction, so it cannot be
        sidestepped by a stale page or a hand-made form post.
      */
      if (invoice.creditRequestedById && invoice.creditRequestedById === user.id) {
        throw new Error(
          `You raised the credit request on ${invoice.invoiceNumber}, so somebody else has to approve it. Releasing cargo unpaid is not a decision one person makes alone.`
        );
      }

      const termDays =
        parsed.data.termDays &&
        isCreditTerm(parsed.data.termDays)
          ? parsed.data.termDays
          : (invoice.creditTermDays ?? invoice.customer.creditTermDays ?? DEFAULT_CREDIT_TERM);

      const grantedAt = new Date();
      const dueDate = dueDateFrom(grantedAt, termDays);

      /* The claim. Zero rows means somebody else decided it first. */
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, creditStatus: "REQUESTED" },
        data: {
          creditStatus: "APPROVED",
          paymentType: "CREDIT",
          creditTermDays: termDays,
          creditDecidedAt: grantedAt,
          creditDecidedById: user.id,
          creditDecisionNote: parsed.data.note || null,
          dueDate,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${invoice.invoiceNumber} was decided by someone else a moment ago. Reload before deciding again.`
        );
      }

      /* Recorded for the exposure it created, not just the fact of it: "why was
         this approved when they already owed 4,800 of a 5,000 limit" is the
         question asked later, and only the figures at the moment of the
         decision can answer it. */
      const openLines = await tx.invoice.findMany({
        where: {
          customerId: invoice.customerId,
          creditStatus: "APPROVED",
          id: { not: invoice.id },
          status: { notIn: ["DRAFT", "VOID"] },
        },
        select: {
          total: true,
          amountPaid: true,
          amountAdjusted: true,
          status: true,
          dueDate: true,
          creditDecidedAt: true,
        },
      });
      const credit = customerCredit(
        invoice.customer,
        openLines.map((l) => creditLine(l, grantedAt))
      );
      const owing = outstandingOf(invoice);
      const check = creditCheck(owing, credit);

      await recordAudit(
        {
          actor: user,
          action: "credit.approved",
          entity: "Invoice",
          entityId: invoice.id,
          summary: `${invoice.invoiceNumber}: credit APPROVED — USD ${owing.toFixed(2)} on ${termDays} day terms, due ${dueDate.toISOString().slice(0, 10)}`,
          metadata: {
            tracking: invoice.shipment?.trackingNumber ?? null,
            customer: invoice.customer.name,
            termDays,
            dueDate: dueDate.toISOString(),
            creditUsd: owing,
            requestedById: invoice.creditRequestedById,
            limitUsd: check.limitUsd,
            outstandingBeforeUsd: check.currentOutstandingUsd,
            totalAfterUsd: check.totalAfterUsd,
            exceededLimit: check.exceedsLimit,
            hadOverdue: check.hasOverdue,
          },
        },
        tx
      );

    });

    revalidatePath(`/app/finance/invoices/${parsed.data.invoiceId}`);
    revalidatePath("/app/finance/credit");
    revalidatePath("/app/credit");
    revalidatePath("/app/collections/follow-up");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/* ------------------------------------------------------------------- reject */

/**
 * Finance says no, and says why.
 *
 * The reason is required. A refusal nobody explained gets raised again the same
 * afternoon by the same desk, and the customer hears two different answers.
 */
export async function rejectCredit(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("credit.approve");
    const parsed = z
      .object({
        invoiceId: z.string().min(1),
        note: z.string().trim().min(3, "Say why the credit is being refused."),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: parsed.data.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          creditStatus: true,
          creditRequestedById: true,
          shipment: { select: { trackingNumber: true } },
        },
      });
      if (!invoice) throw new Error("That invoice no longer exists.");
      if (invoice.creditStatus !== "REQUESTED") {
        throw new Error(`There is no open credit request on ${invoice.invoiceNumber}.`);
      }
      if (invoice.creditRequestedById && invoice.creditRequestedById === user.id) {
        throw new Error(
          `You raised the credit request on ${invoice.invoiceNumber}, so somebody else has to decide it.`
        );
      }

      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, creditStatus: "REQUESTED" },
        data: {
          creditStatus: "REJECTED",
          /* Back to cash terms, cleanly. The due date goes with the refusal:
             leaving one behind would put a bill on the overdue list for a credit
             that was never granted. */
          paymentType: "CASH",
          creditTermDays: null,
          dueDate: null,
          creditDecidedAt: new Date(),
          creditDecidedById: user.id,
          creditDecisionNote: parsed.data.note,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${invoice.invoiceNumber} was decided by someone else a moment ago. Reload before deciding again.`
        );
      }

      await recordAudit(
        {
          actor: user,
          action: "credit.rejected",
          entity: "Invoice",
          entityId: invoice.id,
          summary: `${invoice.invoiceNumber}: credit REFUSED — ${parsed.data.note}`,
          metadata: {
            tracking: invoice.shipment?.trackingNumber ?? null,
            reason: parsed.data.note,
            requestedById: invoice.creditRequestedById,
          },
        },
        tx
      );
    });

    revalidatePath(`/app/finance/invoices/${parsed.data.invoiceId}`);
    revalidatePath("/app/finance/credit");
    revalidatePath("/app/credit");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/* ------------------------------------------------------- the facility itself */

/**
 * Set or change a customer's credit limit.
 *
 * Separate authority from approving one sale: granting somebody a standing
 * facility is a bigger decision than letting one consignment go, and the owner
 * keeps it. Setting the limit to nothing withdraws the facility — it does not
 * touch what they already owe, which stays collectable.
 */
export async function setCreditLimit(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("credit.limit");
    const parsed = z
      .object({
        customerId: z.string().min(1),
        limitUsd: z
          .string()
          .trim()
          .transform((v) => (v.length > 0 ? Number(v) : null))
          .refine(
            (v) => v === null || (Number.isFinite(v) && v >= 0),
            "That credit limit is not a valid amount."
          ),
        termDays: z.coerce.number().int().optional(),
        note: z.string().trim().optional(),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.customerId },
      select: { id: true, name: true, code: true, creditLimitUsd: true },
    });
    if (!customer) return fail(t(locale, "That customer no longer exists."));

    const before =
      customer.creditLimitUsd === null ? null : toNumber(customer.creditLimitUsd);
    const after = parsed.data.limitUsd;
    const termDays =
      parsed.data.termDays &&
      isCreditTerm(parsed.data.termDays)
        ? parsed.data.termDays
        : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          creditLimitUsd: after === null ? null : new Prisma.Decimal(after),
          ...(termDays ? { creditTermDays: termDays } : {}),
          creditNote: parsed.data.note || null,
          creditApprovedAt: after === null ? null : new Date(),
          creditApprovedById: after === null ? null : user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: after === null ? "credit.facility.withdrawn" : "credit.facility.set",
          entity: "Customer",
          entityId: customer.id,
          summary:
            after === null
              ? `${customer.name} (${customer.code}): credit facility withdrawn${before !== null ? ` — was USD ${before.toFixed(2)}` : ""}`
              : `${customer.name} (${customer.code}): credit limit set to USD ${after.toFixed(2)}${before !== null ? ` (was USD ${before.toFixed(2)})` : ""}`,
          metadata: {
            beforeUsd: before,
            afterUsd: after,
            termDays: termDays ?? null,
            note: parsed.data.note || null,
          },
        },
        tx
      );
    });

    revalidatePath(`/app/customers/${customer.id}`);
    revalidatePath("/app/finance/credit");
    revalidatePath("/app/credit");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/* ------------------------------------------------------- moving the deadline */

/**
 * Change or extend the date a credit falls due.
 *
 * A deadline is not a typo to be corrected quietly — it is a promise the customer
 * was given, and the whole system reads it: the settlements page, the call list,
 * the overdue colours on the cargo row, the note in their hand. So moving it is
 * its own recorded act, with a reason, and it is Finance's to make. Support may
 * ask for credit; it may not quietly buy a customer another fortnight.
 *
 * THIRTY DAYS IS THE CEILING, counted from today rather than from the original
 * grant. Extending is meant to be possible — a customer who needs another two
 * weeks is ordinary business — but "later" has to stop somewhere, or a debt gets
 * pushed out a month at a time and never ages on any report. Thirty days is the
 * longest term the business offers, so it is also the furthest a single decision
 * may push one.
 */
export async function adjustCredit(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    /*
      Support may move a date too — the owner's call, and a sound one.

      This first required credit.approve on the reasoning that a later deadline
      is more credit. True, but it treated the wrong risk as the big one: Support
      is the desk actually ON THE PHONE when a customer says "I can pay you on
      the 26th", and making them queue that behind Finance means the date in the
      system stays wrong until somebody else gets round to it. A stale deadline
      is not safer than a moved one — it puts a customer on the overdue list, and
      on somebody's call sheet, for a date they already renegotiated.

      What keeps it safe is not the permission: it is the thirty-day ceiling, the
      required reason, and the audit row with a name on it. GRANTING credit is
      still Finance's alone — that is the decision that lets cargo leave the
      building unpaid, and it has not moved.
    */
    const user = await authorize("credit.request");
    const parsed = z
      .object({
        invoiceId: z.string().min(1),
        /** An exact date off the calendar, or blank when a term was chosen. */
        dueDate: z.string().trim().optional(),
        /** 7, 14 or 30 — counted from today, not from the original grant. */
        termDays: z.coerce.number().int().optional(),
        reason: z.string().trim().min(3, "Say why the due date is moving."),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const invoice = await prisma.invoice.findUnique({
      where: { id: parsed.data.invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        creditStatus: true,
        creditTermDays: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        amountAdjusted: true,
        customer: { select: { name: true } },
        shipment: { select: { trackingNumber: true } },
      },
    });
    if (!invoice) return fail(t(locale, "That invoice no longer exists."));
    if (invoice.creditStatus !== "APPROVED") {
      return fail(
        t(locale, "There is no granted credit on this bill to move.")
      );
    }

    /* Midnight today, so "due today" is not already in the past by lunchtime. */
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const ceiling = dueDateFrom(today, 30);

    let nextDue: Date;
    let termDays: number | null = null;
    if (parsed.data.dueDate && parsed.data.dueDate.length > 0) {
      nextDue = new Date(`${parsed.data.dueDate}T00:00:00.000Z`);
      if (Number.isNaN(nextDue.getTime())) {
        return fail(t(locale, "That is not a valid date."));
      }
    } else if (
      parsed.data.termDays &&
      isCreditTerm(parsed.data.termDays)
    ) {
      termDays = parsed.data.termDays;
      nextDue = dueDateFrom(today, termDays);
    } else {
      return fail(t(locale, "Choose a date, or one of the terms."));
    }

    if (nextDue < today) {
      return fail(
        t(locale, "That date has already passed. To mark a credit late, leave the date where it is.")
      );
    }
    if (nextDue > ceiling) {
      return fail(
        t(
          locale,
          "Thirty days is the furthest a credit can be pushed in one decision — that is the longest term the business offers. Move it again nearer the time if it genuinely needs longer."
        )
      );
    }

    const before = invoice.dueDate;
    if (before && before.getTime() === nextDue.getTime()) {
      return fail(t(locale, "That is the date it is already due."));
    }

    await prisma.$transaction(async (tx) => {
      /* The write re-states the condition the check above read outside the
         transaction. rejectCredit deliberately clears the due date so a
         refused credit never sits on the overdue list — a move committing
         after that rejection would put it right back. */
      const moved = await tx.invoice.updateMany({
        where: { id: invoice.id, creditStatus: "APPROVED" },
        data: {
          dueDate: nextDue,
          /* Terms only when a term was chosen. A hand-picked date has no term
             behind it, and inventing one would put a number on the invoice that
             does not match the date beside it. */
          ...(termDays ? { creditTermDays: termDays } : {}),
        },
      });
      if (moved.count === 0) {
        throw new Error(
          t(locale, "The credit on this bill was just decided by somebody else. Reload to see where it stands.")
        );
      }

      const owing = outstandingOf(invoice);
      const extending = before ? nextDue > before : true;
      await recordAudit(
        {
          actor: user,
          action: extending ? "credit.extended" : "credit.shortened",
          entity: "Invoice",
          entityId: invoice.id,
          summary:
            `${invoice.invoiceNumber} (${invoice.customer.name}): credit due date ` +
            `${before ? before.toISOString().slice(0, 10) : "unset"} → ${nextDue.toISOString().slice(0, 10)}` +
            ` on USD ${owing.toFixed(2)} — ${parsed.data.reason}`,
          metadata: {
            tracking: invoice.shipment?.trackingNumber ?? null,
            fromDueDate: before ? before.toISOString() : null,
            toDueDate: nextDue.toISOString(),
            termDays,
            outstandingUsd: owing,
            extending,
            reason: parsed.data.reason,
          },
        },
        tx
      );
    });

    revalidatePath(`/app/finance/invoices/${invoice.id}`);
    revalidatePath("/app/finance/credit");
    revalidatePath("/app/collections/follow-up");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/** One bill that could be released on credit, with everything the ask needs. */
export type CreditCandidate = {
  invoiceId: string;
  invoiceNumber: string;
  trackingNumber: string | null;
  customerId: string;
  customerName: string;
  goods: string;
  currency: string;
  outstanding: number;
  /** The rate frozen on the bill, so the figure can lead in shillings. */
  rate: number | null;
  /** This customer's agreed terms, and where they already stand against them. */
  termDays: number;
  limitUsd: number | null;
  alreadyOwesUsd: number;
};

/**
 * Who could be let take their cargo now and pay later.
 *
 * The same shape as the Record Payment panel, and for the same reason: asking
 * for credit began at a bill somebody had to already know how to find. The
 * question in the room is "this customer on the phone wants time" — so the
 * panel opens holding the list, and the search box narrows it.
 *
 * Only bills where the question is live: still owed, price confirmed, and no
 * credit already asked for or granted. A draft is not something to grant terms
 * on — until Finance confirms the price, nobody knows what is being lent.
 */
export async function creditCandidates(
  query?: string
): Promise<CreditCandidate[]> {
  try {
    /* Anybody who may ask may look. Asking commits nothing — the cargo does
       not move and the bill does not change until Finance answers. */
    await authorize("credit.request");
  } catch {
    return [];
  }

  const locale = await viewerLocale();
  const q = query?.trim() ?? "";

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
      creditStatus: "NONE",
      /* Only cargo Dar has confirmed. This list is what every "Ask for
         credit" and "Release on credit" panel offers, and it was offering to
         agree terms on consignments still in Guangzhou. */
      shipment: COLLECTABLE_SHIPMENT_WHERE,
      ...(q.length >= 2
        ? {
            OR: [
              { invoiceNumber: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { customer: { phone: { contains: q } } },
              {
                shipment: {
                  trackingNumber: { contains: q, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    },
    /* Oldest first: the bill that has been owed longest is the one a customer
       is most likely to be ringing about. */
    orderBy: [{ issuedAt: "asc" }],
    take: 40,
    select: {
      id: true,
      invoiceNumber: true,
      currency: true,
      total: true,
      amountPaid: true,
      amountAdjusted: true,
      exchangeRate: true,
      customer: {
        select: {
          id: true,
          name: true,
          creditTermDays: true,
          creditLimitUsd: true,
        },
      },
      shipment: {
        select: { trackingNumber: true, status: true, ...selectText("description") },
      },
    },
  });

  /* What each of these customers already owes on credit, in one query rather
     than one per row. A request made without it is a request Finance has to
     research before it can answer. */
  const customerIds = [...new Set(invoices.map((inv) => inv.customer.id))];
  const standing = await prisma.invoice.groupBy({
    by: ["customerId"],
    where: {
      customerId: { in: customerIds },
      creditStatus: "APPROVED",
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
    },
    _sum: { total: true, amountPaid: true },
  });
  const owedByCustomer = new Map(
    standing.map((row) => [
      row.customerId,
      Math.max(
        0,
        toNumber(row._sum.total ?? 0) - toNumber(row._sum.amountPaid ?? 0)
      ),
    ])
  );

  return invoices
    .map((inv) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      trackingNumber: inv.shipment?.trackingNumber ?? null,
      customerId: inv.customer.id,
      customerName: inv.customer.name,
      goods: inv.shipment ? cargoText(locale, inv.shipment, "description") : "",
      currency: inv.currency,
      outstanding: Math.max(
        0,
        outstandingOf(inv)
      ),
      rate: inv.exchangeRate === null ? null : toNumber(inv.exchangeRate),
      termDays: inv.customer.creditTermDays ?? 14,
      limitUsd:
        inv.customer.creditLimitUsd === null
          ? null
          : toNumber(inv.customer.creditLimitUsd),
      alreadyOwesUsd: owedByCustomer.get(inv.customer.id) ?? 0,
    }))
    /* A bill with nothing left on it is not something to grant terms on. */
    .filter((row) => row.outstanding > 0.005);
}

/**
 * The credit context for one bill, fetched when the desk actually asks for it.
 *
 * The row icon on the call list used to be a link to the invoice, where you
 * pressed "Ask for credit" a second time — a step that existed only because two
 * screens met. Pressing it now opens the ask itself, and this is what fills it
 * in: the customer's agreed terms, their limit, and where they already stand.
 *
 * One query on open rather than three more joins on every one of a hundred and
 * thirty-four rows, almost none of which will be pressed.
 */
export async function creditContextFor(
  /* One id, or the comma-separated set the merge screen has ticked. */
  invoiceId: string
): Promise<CreditCandidate | null> {
  try {
    await authorize("credit.request");
  } catch {
    return null;
  }

  const locale = await viewerLocale();
  const ids = invoiceId
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (ids.length === 0) return null;

  const inv = await prisma.invoice.findUnique({
    where: { id: ids[0] },
    select: {
      id: true,
      invoiceNumber: true,
      currency: true,
      total: true,
      amountPaid: true,
      amountAdjusted: true,
      exchangeRate: true,
      status: true,
      creditStatus: true,
      customer: {
        select: {
          id: true,
          name: true,
          creditTermDays: true,
          creditLimitUsd: true,
        },
      },
      shipment: {
        select: { trackingNumber: true, status: true, ...selectText("description") },
      },
    },
  });
  /* The same three conditions the list applies, re-asked here: the icon was
     rendered from a row that may have been fetched minutes ago, and terms must
     not be granted on a bill that has since been paid or already has credit. */
  if (
    !inv ||
    inv.creditStatus !== "NONE" ||
    (inv.status !== "UNPAID" && inv.status !== "PARTIALLY_PAID") ||
    /* Nothing Dar has not confirmed may be released on credit, so the button
       does not render for it. The action refuses too — this only spares the
       desk pressing something that was always going to be refused. */
    !isCollectable(inv.shipment?.status ?? null)
  ) {
    return null;
  }

  const standing = await prisma.invoice.aggregate({
    where: {
      customerId: inv.customer.id,
      creditStatus: "APPROVED",
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
    },
    _sum: { total: true, amountPaid: true },
  });

  /*
    WHAT THE RELEASE ACTUALLY COVERS.

    Releasing three ticked bills is one arrangement over all three, and the
    dialog was headed with the first one's figure — so the desk read USD 25
    while agreeing to USD 40. Terms belong to the customer and are taken from
    the bill above; only the amount has to be counted across the set. Derived
    here rather than added up in the browser, because outstanding is a
    subtraction this codebase does in one place.
  */
  let outstanding = 0;
  if (ids.length === 1) {
    outstanding = outstandingOf(inv);
  } else {
    const rest = await prisma.invoice.findMany({
      where: { id: { in: ids } },
      select: {
        total: true,
        amountPaid: true,
        amountAdjusted: true,
        currency: true,
        customerId: true,
        status: true,
        creditStatus: true,
        shipment: { select: { status: true } },
      },
    });
    /* Every one of them has to be releasable, of one customer and in one
       currency — otherwise the sum in the heading is not a number anybody
       could agree to. The button disappears and the desk ticks again. */
    if (
      rest.length !== ids.length ||
      rest.some(
        (r) =>
          r.customerId !== inv.customer.id ||
          r.currency !== inv.currency ||
          r.creditStatus !== "NONE" ||
          (r.status !== "UNPAID" && r.status !== "PARTIALLY_PAID") ||
          !isCollectable(r.shipment?.status ?? null)
      )
    ) {
      return null;
    }
    outstanding = rest.reduce(
      (sum, r) => sum + outstandingOf(r),
      0
    );
  }
  if (outstanding <= 0.005) return null;

  return {
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    trackingNumber: inv.shipment?.trackingNumber ?? null,
    customerId: inv.customer.id,
    customerName: inv.customer.name,
    goods: inv.shipment ? cargoText(locale, inv.shipment, "description") : "",
    currency: inv.currency,
    outstanding,
    rate: inv.exchangeRate === null ? null : toNumber(inv.exchangeRate),
    termDays: inv.customer.creditTermDays ?? 14,
    limitUsd:
      inv.customer.creditLimitUsd === null
        ? null
        : toNumber(inv.customer.creditLimitUsd),
    alreadyOwesUsd: Math.max(
      0,
      toNumber(standing._sum.total ?? 0) - toNumber(standing._sum.amountPaid ?? 0)
    ),
  };
}
