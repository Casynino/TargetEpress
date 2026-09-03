"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

/** What every money column in this schema actually arrives as. */
type Money = number | string | Prisma.Decimal | null | undefined;
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { postLedgerEntry } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { filesFrom, putDocument } from "@/lib/storage";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * Undoing a payment that should never have been recorded.
 *
 * Mistakes happen at a counter: the wrong customer, the wrong bill, twice by
 * accident, a figure typed with an extra nought, money that turned out never to
 * have cleared. Until now there was no way back — a recorded payment was the one
 * money record in this system with no correction, so the only fix was to invent
 * another one somewhere else, which is how books stop matching reality.
 *
 * A VOID IS NOT A DELETE. One payment touched five records: it created a
 * Payment, printed a Receipt somebody may be holding, moved a company account
 * through the ledger, changed the invoice, and may have issued a pickup note
 * that let cargo out of the building. Deleting the row would leave the other
 * four describing money that no longer exists. So the row stays, marked, and
 * every one of the five is unwound in the open:
 *
 *   the ledger gets a REVERSING line, dated today, never an edited one
 *   the invoice gives back exactly what this payment settled, and its status is
 *     recomputed from the new figure rather than guessed
 *   a pickup note that has not been used is cancelled, because an unsettled bill
 *     must not let cargo go
 *   a pickup note that HAS been used is left alone and said out loud, because the
 *     cargo has already gone and pretending otherwise would be the lie
 *
 * And because a void can itself be a mistake, it can be lifted again.
 */

/** What this payment actually settled on the bill, in the bill's own currency. */
function settledAmount(p: { amount: Money; creditedAmount: Money }) {
  const credited = toNumber(p.creditedAmount);
  return credited > 0 ? credited : toNumber(p.amount);
}

/**
 * The invoice's status, worked out from its numbers rather than assumed.
 *
 * VOID and WRITTEN_OFF are left exactly as they are. Those are decisions
 * somebody made about the bill itself, and un-recording a payment is not a
 * reason to resurrect a bill that was cancelled or given up on.
 */
function statusFor(
  current: string,
  paid: number,
  total: number
): "UNPAID" | "PARTIALLY_PAID" | "PAID" | null {
  if (current === "VOID" || current === "WRITTEN_OFF" || current === "DRAFT") {
    return null;
  }
  if (paid <= 0.005) return "UNPAID";
  if (paid + 0.005 >= total) return "PAID";
  return "PARTIALLY_PAID";
}

const voidSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(3, "Say why the payment is being cancelled."),
});

export async function voidPayment(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    /*
      Gated on ledger.adjust rather than payment.record.

      Recording money and un-recording it are different authorities. Taking a
      payment is the counter's everyday job; reversing one restates a figure the
      ledger has already reported, which is the same act as adjusting the ledger
      — the gate adjustInvoice already uses for correcting a bill money has
      landed against.
    */
    const user = await authorize("ledger.adjust");
    const parsed = voidSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: parsed.data.paymentId },
        select: {
          id: true,
          amount: true,
          creditedAmount: true,
          currency: true,
          voidedAt: true,
          paidAt: true,
          receipt: { select: { receiptNumber: true } },
          ledgerEntry: {
            select: {
              id: true,
              entryNumber: true,
              accountId: true,
              currency: true,
              direction: true,
              kind: true,
              amount: true,
              amountUsd: true,
              exchangeRate: true,
              sourceEntity: true,
              sourceId: true,
              reversedBy: { select: { id: true } },
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              total: true,
              amountPaid: true,
              shipment: {
                select: {
                  id: true,
                  trackingNumber: true,
                  status: true,
                  pickupNote: {
                    select: { id: true, noteNumber: true, status: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!payment) throw new Error("That payment no longer exists.");
      if (payment.voidedAt) {
        throw new Error("That payment has already been cancelled.");
      }

      /*
        A DEPOSIT HAS NO BILL TO HAND ANYTHING BACK TO.

        Money taken before the cargo landed belongs to the customer and settles
        nothing yet, so cancelling it is only the ledger line coming back out of
        the account. Everything below that restores an invoice balance is
        skipped for one — there is no balance to restore, and pretending there
        is would be inventing a bill.
      */
      const invoice = payment.invoice;
      const gave = settledAmount(payment);
      const total = invoice ? toNumber(invoice.total) : 0;
      const newPaid = invoice
        ? Math.max(0, toNumber(invoice.amountPaid) - gave)
        : 0;
      const newStatus = invoice
        ? statusFor(invoice.status, newPaid, total)
        : null;

      /* The claim. If two people press cancel at once, the second finds the row
         already voided and updates nothing, rather than reversing the ledger
         twice and handing the customer back their money on paper. */
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, voidedAt: null },
        data: {
          voidedAt: new Date(),
          voidedById: user.id,
          voidReason: parsed.data.reason,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          "That payment was cancelled by somebody else a moment ago. Reload before trying again."
        );
      }

      /* Conditional on the balance this transaction read — the payment-row
         claim above stops a double VOID, but not a payment landing on the
         same bill between our read and this write. The loser unwinds whole. */
      const invoiceClaim = invoice
        ? await tx.invoice.updateMany({
            where: { id: invoice.id, amountPaid: invoice.amountPaid },
            data: {
              amountPaid: new Prisma.Decimal(newPaid),
              ...(newStatus ? { status: newStatus } : {}),
            },
          })
        : { count: 1 };
      /* The settlement goes with the money.
         A void hands the invoice back exactly what this payment put against it,
         so leaving the allocation behind would have the bill reading as settled
         by a payment that no longer settles anything — and the invariant every
         reconciliation depends on, that a bill's allocations add up to what it
         has been paid, would drift on the first cancellation. */
      await tx.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });

      if (invoiceClaim.count === 0) {
        throw new Error(
          t(locale, "This bill's balance moved a moment ago. Reload and check it before cancelling.")
        );
      }

      /* The money coming back out of the account it went into. Dated today: the
         reversal happens now, and backdating it would rewrite a month somebody
         may already have closed. */
      let reversedEntry: string | null = null;
      /*
        THE LINE TO REVERSE IS THE LIVE ONE, WHICHEVER IT IS.

        Restoring a cancelled payment posts a fresh IN line, but paymentId is
        unique on the ledger so the reinstated line rides on sourceEntity
        "Payment" instead — which meant a second void found only the ORIGINAL
        line, saw it already reversed, and reversed nothing: void → restore →
        void left the account overstated by the whole payment, permanently.
        So the search is for any un-reversed IN line belonging to this payment,
        by either linkage.
      */
      const live = await tx.ledgerEntry.findFirst({
        where: {
          direction: "IN",
          reversedBy: null,
          reversesId: null,
          OR: [
            { paymentId: payment.id },
            { sourceEntity: "Payment", sourceId: payment.id },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          entryNumber: true,
          accountId: true,
          currency: true,
          direction: true,
          kind: true,
          amount: true,
          amountUsd: true,
          exchangeRate: true,
          sourceEntity: true,
          sourceId: true,
        },
      });
      if (live) {
        const e = live;
        await postLedgerEntry(tx, {
          accountId: e.accountId,
          currency: e.currency,
          direction: e.direction === "IN" ? "OUT" : "IN",
          kind: e.kind,
          amount: toNumber(e.amount),
          amountUsd: toNumber(e.amountUsd),
          exchangeRate: e.exchangeRate === null ? null : toNumber(e.exchangeRate),
          occurredAt: new Date(),
          description: `${t(locale, "Cancels")} ${e.entryNumber} — ${
            invoice ? invoice.invoiceNumber : t(locale, "customer deposit")
          }: ${parsed.data.reason}`,
          sourceEntity: e.sourceEntity,
          sourceId: e.sourceId,
          recordedById: user.id,
          reversesId: e.id,
        });
        reversedEntry = e.entryNumber;
      }

      /*
        The cargo. This is the part that can bite.

        A pickup note is the company saying "the bill is settled, the cargo may
        go". If this payment is what settled it, the note has to go with the
        payment — otherwise an unpaid consignment walks out on a note nobody
        withdrew.

        Unless it already walked out. A note marked USED means the boxes have
        left the building, and cancelling it would only make the record disagree
        with the warehouse. The honest outcome there is a live debt and a loud
        line in the audit log, which is exactly what somebody needs to chase.
      */
      /* A deposit has released no cargo, so there is no note to withdraw. */
      const note = invoice?.shipment.pickupNote ?? null;
      let noteOutcome: "cancelled" | "already-collected" | "none" = "none";
      if (invoice && note && newStatus !== "PAID") {
        if (note.status === "USED") {
          noteOutcome = "already-collected";
        } else {
          await tx.pickupNote.update({
            where: { id: note.id },
            data: { status: "CANCELLED" },
          });
          noteOutcome = "cancelled";
          /* And the cargo stops being collectable, back to where it was before
             the payment that is being taken away. */
          if (invoice.shipment.status === "READY_FOR_PICKUP") {
            await tx.shipment.update({
              where: { id: invoice.shipment.id },
              data: { status: "RECEIVED_AT_DAR" },
            });
          }
        }
      }

      await recordAudit(
        {
          actor: user,
          action: "payment.void",
          entity: "Payment",
          entityId: payment.id,
          summary:
            `${
              invoice
                ? `${invoice.invoiceNumber} (${invoice.shipment.trackingNumber})`
                : "Customer deposit"
            }: payment of ` +
            `${payment.currency} ${toNumber(payment.amount).toFixed(2)} cancelled — ${parsed.data.reason}` +
            (noteOutcome === "already-collected"
              ? ` — WARNING: pickup note ${note?.noteNumber} was already used, the cargo has been collected and this debt is now live again`
              : noteOutcome === "cancelled"
                ? ` — pickup note ${note?.noteNumber} cancelled with it`
                : ""),
          metadata: {
            receipt: payment.receipt?.receiptNumber ?? null,
            amount: toNumber(payment.amount),
            currency: payment.currency,
            settledAmount: gave,
            invoicePaidBefore: invoice ? toNumber(invoice.amountPaid) : null,
            invoicePaidAfter: invoice ? newPaid : null,
            invoiceStatusBefore: invoice?.status ?? null,
            invoiceStatusAfter: invoice ? (newStatus ?? invoice.status) : null,
            ledgerReversed: reversedEntry,
            pickupNote: note?.noteNumber ?? null,
            pickupNoteOutcome: noteOutcome,
            cargoAlreadyCollected: noteOutcome === "already-collected",
            reason: parsed.data.reason,
          },
        },
        tx
      );

      return {
        invoiceId: invoice?.id ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        noteOutcome,
      };
    });

    revalidatePath(`/app/finance/invoices/${result.invoiceId}`);
    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/finance/ledger");
    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/finance/credit");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * Lift a void that was itself a mistake.
 *
 * The money is put back the way it came the first time — a NEW ledger line, not
 * an un-deleted one. The register is append-only, so a payment that was taken,
 * reversed and reinstated leaves three lines, and that is the correct number:
 * all three of those things happened.
 *
 * The pickup note is deliberately NOT reinstated. Issuing one is Finance saying
 * the cargo may go, and that sentence gets said again on purpose rather than
 * restored as a side effect of an accounting correction.
 */
export async function restorePayment(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("ledger.adjust");
    const parsed = z
      .object({
        paymentId: z.string().min(1),
        reason: z.string().trim().min(3, "Say why the payment is being reinstated."),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: parsed.data.paymentId },
        select: {
          id: true,
          amount: true,
          creditedAmount: true,
          currency: true,
          accountId: true,
          exchangeRate: true,
          voidedAt: true,
          voidReason: true,
          paidAt: true,
          receipt: { select: { receiptNumber: true } },
          account: { select: { id: true, name: true, currency: true } },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              total: true,
              amountPaid: true,
              exchangeRate: true,
              shipment: { select: { trackingNumber: true } },
            },
          },
        },
      });
      if (!payment) throw new Error("That payment no longer exists.");
      if (!payment.voidedAt) {
        throw new Error("That payment is not cancelled, so there is nothing to reinstate.");
      }

      /* A reinstated deposit puts money back in the account and settles
         nothing, exactly as it did before it was cancelled. */
      const invoice = payment.invoice;
      const gave = settledAmount(payment);
      const total = invoice ? toNumber(invoice.total) : 0;
      const newPaid = invoice ? toNumber(invoice.amountPaid) + gave : 0;
      const newStatus = invoice
        ? statusFor(invoice.status, newPaid, total)
        : null;

      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, voidedAt: { not: null } },
        data: { voidedAt: null, voidedById: null, voidReason: null },
      });
      if (claimed.count === 0) {
        throw new Error("That payment was reinstated by somebody else a moment ago.");
      }

      /* Same discipline as void and recordPayment: the balance write only
         lands if the balance is still what this transaction read. */
      const invoiceClaim = invoice
        ? await tx.invoice.updateMany({
            where: { id: invoice.id, amountPaid: invoice.amountPaid },
            data: {
              amountPaid: new Prisma.Decimal(newPaid),
              ...(newStatus ? { status: newStatus } : {}),
            },
          })
        : { count: 1 };
      if (invoiceClaim.count === 0) {
        throw new Error(
          t(locale, "This bill's balance moved a moment ago. Reload and check it before reinstating.")
        );
      }

      /* The money goes back in. A fresh line, because the account really does
         receive it again today — and because the reversal that took it out
         stays on the record rather than being unwound. */
      if (payment.account) {
        const rate =
          payment.exchangeRate === null ? null : toNumber(payment.exchangeRate);
        const amount = toNumber(payment.amount);
        const invoiceRate =
          !invoice || invoice.exchangeRate === null
            ? null
            : toNumber(invoice.exchangeRate);
        const usd =
          payment.account.currency === "USD"
            ? amount
            : (rate ?? invoiceRate)
              ? amount / (rate ?? invoiceRate)!
              : amount;

        await postLedgerEntry(tx, {
          accountId: payment.account.id,
          currency: payment.account.currency,
          direction: "IN",
          kind: "CUSTOMER_PAYMENT",
          amount,
          amountUsd: usd,
          exchangeRate: rate,
          occurredAt: new Date(),
          description: `${t(locale, "Reinstated")} ${
            payment.receipt?.receiptNumber ??
            invoice?.invoiceNumber ??
            t(locale, "customer deposit")
          } — ${parsed.data.reason}`,
          sourceEntity: "Payment",
          sourceId: payment.id,
          recordedById: user.id,
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "payment.restore",
          entity: "Payment",
          entityId: payment.id,
          summary: `${
            invoice
              ? `${invoice.invoiceNumber} (${invoice.shipment.trackingNumber})`
              : "Customer deposit"
          }: cancelled payment of ${payment.currency} ${toNumber(payment.amount).toFixed(2)} reinstated — ${parsed.data.reason}`,
          metadata: {
            receipt: payment.receipt?.receiptNumber ?? null,
            amount: toNumber(payment.amount),
            settledAmount: gave,
            invoicePaidAfter: invoice ? newPaid : null,
            invoiceStatusAfter: invoice ? (newStatus ?? invoice.status) : null,
            previousVoidReason: payment.voidReason,
            reason: parsed.data.reason,
          },
        },
        tx
      );

      return { invoiceId: invoice?.id ?? null };
    });

    if (result.invoiceId) {
      revalidatePath(`/app/finance/invoices/${result.invoiceId}`);
    }
    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/finance/ledger");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * Fix the details of a payment without touching the money.
 *
 * Reference, note, method and the date it was received — the fields that get
 * mistyped at a counter and that no total depends on. The date does move the
 * ledger's idea of when the money arrived, which is why it is here rather than
 * treated as cosmetic.
 *
 * THE AMOUNT IS DELIBERATELY NOT EDITABLE. A figure that has already settled a
 * bill and moved an account is corrected by cancelling the payment and recording
 * the right one — two honest records instead of one overwritten number. Editing
 * it in place would leave the reversal-shaped hole this whole file exists to
 * avoid: a receipt in somebody's hand for an amount the system no longer says.
 */
export async function editPayment(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("ledger.adjust");
    const parsed = z
      .object({
        paymentId: z.string().min(1),
        reference: z.string().trim().optional(),
        note: z.string().trim().optional(),
        method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CHEQUE"]).optional(),
        paidAt: z.string().trim().optional(),
        reason: z.string().trim().min(3, "Say what was wrong with the record."),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const payment = await prisma.payment.findUnique({
      where: { id: parsed.data.paymentId },
      select: {
        id: true,
        reference: true,
        note: true,
        method: true,
        paidAt: true,
        voidedAt: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            issuedAt: true,
            shipment: { select: { trackingNumber: true } },
          },
        },
      },
    });
    if (!payment) return fail(t(locale, "That payment no longer exists."));
    if (payment.voidedAt) {
      return fail(
        t(locale, "That payment is cancelled. Reinstate it before editing its details.")
      );
    }

    const paidAt =
      parsed.data.paidAt && parsed.data.paidAt.length > 0
        ? new Date(parsed.data.paidAt)
        : payment.paidAt;
    if (Number.isNaN(paidAt.getTime())) {
      return fail(t(locale, "That is not a valid date."));
    }
    /* The same two rules the record form enforces. A correction door that
       accepted dates the front door refuses would make it the way around
       them. */
    if (paidAt.getTime() > Date.now() + 86_400_000) {
      return fail(t(locale, "A payment cannot be dated in the future."));
    }
    /* A deposit predates every bill by definition — that is what makes it a
       deposit — so the "not older than the invoice" rule has nothing to test. */
    if (payment.invoice?.issuedAt && paidAt < payment.invoice.issuedAt) {
      return fail(
        t(locale, "That date is before the bill was raised. A payment cannot be older than the invoice it settles.")
      );
    }

    const before = {
      reference: payment.reference,
      note: payment.note,
      method: payment.method,
      paidAt: payment.paidAt.toISOString(),
    };
    const after = {
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      method: parsed.data.method ?? payment.method,
      paidAt: paidAt.toISOString(),
    };

    const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
      (k) => before[k] !== after[k]
    );
    if (changed.length === 0) {
      return fail(t(locale, "Nothing was changed."));
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          reference: after.reference,
          note: after.note,
          method: after.method,
          paidAt,
        },
      });

      /* The ledger's date follows the payment's, so a corrected date does not
         leave the register saying the money arrived on a day the receipt
         denies. The amount is untouched, so no balance moves. */
      await tx.ledgerEntry.updateMany({
        where: { paymentId: payment.id },
        data: { occurredAt: paidAt },
      });

      await recordAudit(
        {
          actor: user,
          action: "payment.edit",
          entity: "Payment",
          entityId: payment.id,
          summary: `${
            payment.invoice
              ? `${payment.invoice.invoiceNumber} (${payment.invoice.shipment.trackingNumber})`
              : "Customer deposit"
          }: payment details corrected (${changed.join(", ")}) — ${parsed.data.reason}`,
          metadata: { before, after, changed, reason: parsed.data.reason },
        },
        tx
      );
    });

    if (payment.invoice) {
      revalidatePath(`/app/finance/invoices/${payment.invoice.id}`);
    }
    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/finance/ledger");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * PUT A DIFFERENT FIGURE, OR A DIFFERENT ACCOUNT, ON A PAYMENT ALREADY RECORDED.
 *
 * A clerk types 45,000 for a payment of 54,000 and finds out a week later, or
 * ticks CRDB Bank when the cash actually landed in Office cash. Until now the
 * answer was "cancel it and record it again" — two screens, two acts of
 * remembering what the first one said, and a desk that gives up and leaves the
 * wrong figure standing. The desk means one thing by it, so it is one press,
 * whichever of the two moved.
 *
 * IT IS STILL A CANCEL AND A RE-RECORD, because it has to be. The ledger is
 * append-only: the old line is answered by a reversing line and the new figure
 * is a new line, so the balance still explains itself and the history still
 * shows what was first written and what replaced it. The bill, the cargo status
 * and the pickup note all follow both halves — the cargo goes back to unpaid on
 * the way through and is released again if the new figure clears it — which is
 * exactly the chain either step performs on its own. Composed rather than
 * reimplemented: two correct operations in one transaction beat a third
 * implementation of the same money rules.
 *
 * The receipt number changes, and that is the truthful outcome: the customer's
 * old receipt says a figure — or an account — this business no longer agrees
 * with.
 */
export async function changePaymentAmount(
  _prev: ActionResult<{ receiptNumber?: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ receiptNumber?: string }>> {
  const locale = await viewerLocale();
  try {
    /* The same authority cancelling needs. Restating a figure the ledger has
       already reported is not the counter's everyday job. */
    await authorize("ledger.adjust");
    const parsed = z
      .object({
        paymentId: z.string().min(1),
        /* Optional: a desk correcting only which account the money landed in
           has not mistyped the figure, and should not have to retype it. */
        amount: z
          .string()
          .trim()
          .optional()
          .transform((v) => (v && v.length > 0 ? Number(v) : null))
          .refine(
            (v) => v === null || (Number.isFinite(v) && v > 0),
            "Enter the amount that actually arrived."
          ),
        accountId: z.string().trim().optional(),
        /* Carried through from the same form rather than re-read from the
           database, so a desk correcting the figure and the reference in one
           sitting does not have the reference silently revert. */
        reference: z.string().trim().optional(),
        note: z.string().trim().optional(),
        method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CHEQUE"]).optional(),
        reason: z
          .string()
          .trim()
          .min(3, "Say what was wrong with the record."),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const payment = await prisma.payment.findUnique({
      where: { id: parsed.data.paymentId },
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        reference: true,
        note: true,
        paidAt: true,
        accountId: true,
        account: { select: { name: true } },
        voidedAt: true,
        invoiceId: true,
        invoice: { select: { invoiceNumber: true, exchangeRate: true } },
        receipt: { select: { receiptNumber: true } },
      },
    });
    if (!payment) return fail(t(locale, "That payment no longer exists."));
    if (payment.voidedAt) {
      return fail(t(locale, "That payment has already been cancelled."));
    }
    if (!payment.invoiceId || !payment.invoice) {
      /* A combined payment answers several bills at once, and moving either
         its figure or its account means deciding which bill loses what. That
         is the allocation screen's question, not this dialog's. */
      return fail(
        t(
          locale,
          "This payment settles more than one bill. Cancel it and record it again against the bills it should cover."
        )
      );
    }

    const newAmount = parsed.data.amount ?? toNumber(payment.amount);
    const newAccountId = parsed.data.accountId || payment.accountId;
    const amountChanged = Math.abs(toNumber(payment.amount) - newAmount) >= 0.005;
    const accountChanged = newAccountId !== payment.accountId;
    if (!amountChanged && !accountChanged) {
      return fail(t(locale, "Nothing was changed."));
    }

    let newAccount: { id: string; name: string; currency: string } | null = null;
    if (accountChanged && newAccountId) {
      newAccount = await prisma.companyAccount.findUnique({
        where: { id: newAccountId },
        select: { id: true, name: true, currency: true },
      });
      if (!newAccount) return fail(t(locale, "That account no longer exists."));
      if (newAccount.currency !== payment.currency) {
        return fail(
          `${newAccount.name} ${t(locale, "is a")} ${newAccount.currency} ${t(locale, "account, so a")} ${payment.currency} ${t(locale, "payment cannot have landed in it.")}`
        );
      }
    }

    /* Cancel first. Everything it did is undone — the money comes off the bill,
       the cargo goes back to unpaid, the pickup note is withdrawn — so the
       re-record below starts from the state the counter would have been in. */
    const changeDescription = [
      amountChanged
        ? `${t(locale, "corrected to")} ${payment.currency} ${newAmount.toLocaleString()}`
        : null,
      accountChanged
        ? `${t(locale, "moved to")} ${newAccount?.name ?? t(locale, "no account")}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");
    const undo = new FormData();
    undo.set("paymentId", payment.id);
    undo.set("reason", `${parsed.data.reason} — ${changeDescription}`);
    const cancelled = await voidPayment(undefined, undo);
    if (!cancelled.ok) return cancelled as ActionResult<{ receiptNumber?: string }>;

    /* And record it the way it actually happened. Whatever else was typed on
       the same form travels with it — reference, note, method — so correcting
       the figure and a typo together does not silently drop the typo fix. */
    const newMethod = parsed.data.method ?? payment.method;
    const newReference = parsed.data.reference ?? payment.reference ?? "";
    const again = new FormData();
    again.set("invoiceId", payment.invoiceId);
    again.set("amount", String(newAmount));
    again.set("currency", payment.currency);
    again.set("method", newMethod);
    if (newReference) again.set("reference", newReference);
    again.set(
      "note",
      [
        parsed.data.note ?? payment.note,
        amountChanged
          ? `Corrected from ${payment.currency} ${toNumber(payment.amount).toLocaleString()}`
          : null,
        accountChanged
          ? `Moved from ${payment.account?.name ?? "no account"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
    if (newAccountId) again.set("accountId", newAccountId);
    again.set("paidAt", payment.paidAt.toISOString().slice(0, 10));
    if (payment.invoice.exchangeRate) {
      again.set("exchangeRate", toNumber(payment.invoice.exchangeRate).toString());
    }

    const { recordPayment } = await import("@/lib/actions/finance");
    const redone = await recordPayment(undefined, again);
    if (!redone.ok) {
      /*
        The cancel stands and the re-record did not.

        Deliberately not rolled back: the reversal is a real ledger line that has
        already been written, and un-writing it would be the very edit this
        system refuses. The bill is back to what it was before the wrong figure,
        which is a correct state — and the desk is told exactly what happened so
        it can record the right figure at the counter.
      */
      return fail(
        `${t(locale, "The old record was cancelled, but the new one was refused:")} ${redone.error} ${t(locale, "Record the payment again from the bill.")}`
      );
    }

    revalidatePath("/app/finance/transactions");
    revalidatePath("/app/finance");
    revalidatePath(`/app/finance/invoices/${payment.invoice.invoiceNumber}`);
    return ok({ receiptNumber: redone.data?.receiptNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/* --------------------------------------------------------------- evidence */

/**
 * Attach a document to a payment that was recorded without one, or with the
 * wrong one.
 *
 * A typed amount is a claim; the M-Pesa screenshot or bank slip is what
 * settles an argument about it months later. The counter form asks for this
 * once, at the moment of recording — this door exists for the receipt that
 * arrived by WhatsApp an hour afterwards, or the wrong screenshot that needs
 * replacing with the right one.
 */
export async function addPaymentProof(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("ledger.adjust");
    const paymentId = String(formData.get("paymentId") ?? "");
    if (!paymentId) return fail(t(locale, "Missing payment."));

    const files = filesFrom(formData, "file");
    if (files.length === 0) return fail(t(locale, "Choose a file first."));

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, voidedAt: true, receipt: { select: { receiptNumber: true } } },
    });
    if (!payment) return fail(t(locale, "That payment no longer exists."));
    if (payment.voidedAt) {
      return fail(t(locale, "That payment is cancelled. Reinstate it before attaching anything."));
    }

    const stored = await putDocument(files[0], "proof");
    await prisma.$transaction(async (tx) => {
      await tx.paymentProof.create({
        data: {
          paymentId,
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
          action: "payment.proof.add",
          entity: "Payment",
          entityId: paymentId,
          summary: `${t(locale, "Attachment added to")} ${payment.receipt?.receiptNumber ?? paymentId}: ${files[0].name || t(locale, "file")}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/transactions");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * Take a wrongly attached document off a payment.
 *
 * The proof is evidence about the payment, not the payment itself — removing
 * one that was attached by mistake (the wrong customer's screenshot, a photo
 * that never opened) does not touch the ledger, the bill or the money it
 * settled. Nothing about the figure changes; only what backs it up.
 */
export async function removePaymentProof(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("ledger.adjust");
    const proofId = String(formData.get("proofId") ?? "");
    if (!proofId) return fail(t(locale, "Missing attachment."));

    const proof = await prisma.paymentProof.findUnique({
      where: { id: proofId },
      select: {
        id: true,
        filename: true,
        paymentId: true,
        payment: {
          select: { voidedAt: true, receipt: { select: { receiptNumber: true } } },
        },
      },
    });
    if (!proof || !proof.paymentId) {
      return fail(t(locale, "That attachment no longer exists."));
    }
    if (proof.payment?.voidedAt) {
      return fail(t(locale, "That payment is cancelled. Reinstate it before removing anything."));
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentProof.delete({ where: { id: proofId } });
      await recordAudit(
        {
          actor: user,
          action: "payment.proof.remove",
          entity: "Payment",
          entityId: proof.paymentId!,
          summary: `${t(locale, "Attachment removed from")} ${proof.payment?.receipt?.receiptNumber ?? proof.paymentId}: ${proof.filename ?? t(locale, "file")}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/transactions");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
