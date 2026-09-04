"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

/** What every money column in this schema actually arrives as. */
type Money = number | string | Prisma.Decimal | null | undefined;
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { invoiceStatusFor } from "@/lib/invoice-status";
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

/**
 * WHAT THIS PAYMENT SETTLED, BILL BY BILL.
 *
 * One transfer can answer four invoices — that is the whole point of a merged
 * payment — and the allocation rows are the only record of how much of it went
 * against each one. They are written in the BILL's currency, already converted
 * at the rate frozen onto that bill, which is exactly the figure a bill's
 * amountPaid moves by.
 *
 * This used to read `creditedAmount` off the payment instead, which is one
 * number for the whole transfer. Cancelling a merged payment then handed the
 * entire sum back to the first bill and left the others reading as settled by a
 * payment that no longer existed; and a shilling deposit later spent against a
 * dollar bill handed back two and a half million against a bill of twelve
 * hundred. The allocations cannot say either of those things.
 *
 * The fallback is for rows written before allocations existed: no allocation at
 * all, but an anchor invoice in the same currency the customer paid in, so the
 * figure needs no conversion to be trusted. Anything else settles nothing —
 * a deposit has answered no bill yet, and inventing one is how a balance drifts.
 */
type Settlement = {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  /** In the bill's own currency. */
  amount: number;
  total: number;
  amountPaid: Prisma.Decimal;
  shipment: {
    id: string;
    trackingNumber: string;
    status: string;
    pickupNote: { id: string; noteNumber: string; status: string } | null;
  } | null;
};

function settlementsOf(payment: {
  amount: Money;
  creditedAmount: Money;
  currency: string;
  allocations: {
    amount: Prisma.Decimal;
    invoice: {
      id: string;
      invoiceNumber: string;
      status: string;
      total: Prisma.Decimal;
      amountPaid: Prisma.Decimal;
      currency: string;
      shipment: Settlement["shipment"];
    };
  }[];
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    total: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    currency: string;
    shipment: Settlement["shipment"];
  } | null;
}): Settlement[] {
  if (payment.allocations.length > 0) {
    return payment.allocations.map((a) => ({
      invoiceId: a.invoice.id,
      invoiceNumber: a.invoice.invoiceNumber,
      status: a.invoice.status,
      amount: toNumber(a.amount),
      total: toNumber(a.invoice.total),
      amountPaid: a.invoice.amountPaid,
      shipment: a.invoice.shipment,
    }));
  }

  const invoice = payment.invoice;
  if (!invoice) return [];

  /*
    THE CREDITED FIGURE IS ALREADY IN THE BILL'S CURRENCY.

    recordPayment writes it that way — a shilling payment against a dollar bill
    stores what the DOLLAR bill received — so it needs no conversion and no
    currency test. Refusing on the currencies alone abandoned exactly the
    commonest payment this business takes: cancelling one reversed the cash out
    of the account and left the bill reading paid, with its pickup note still
    live and the boxes still collectable.

    The guard belongs only where there is NO credited figure to trust: a
    deposit taken in shillings, later pointed at a dollar bill by the credit
    engine, whose stored amount is the shillings that were handed over.
    Subtracting those from a dollar bill is the thing that must never happen.
  */
  const credited = toNumber(payment.creditedAmount);
  if (invoice.currency !== payment.currency && !(credited > 0)) return [];

  return [
    {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      amount: credited > 0 ? credited : toNumber(payment.amount),
      total: toNumber(invoice.total),
      amountPaid: invoice.amountPaid,
      shipment: invoice.shipment,
    },
  ];
}

/** The bill and cargo columns every correction below needs off an invoice. */
const SETTLED_INVOICE = {
  id: true,
  invoiceNumber: true,
  status: true,
  total: true,
  amountPaid: true,
  currency: true,
  shipment: {
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      pickupNote: { select: { id: true, noteNumber: true, status: true } },
    },
  },
} as const;

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
          invoice: { select: SETTLED_INVOICE },
          /* Every bill this payment answered, not just the first one it was
             anchored to. See settlementsOf. */
          allocations: {
            select: { amount: true, invoice: { select: SETTLED_INVOICE } },
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
      const settlements = settlementsOf(payment);
      const gave = settlements.reduce((sum, s) => sum + s.amount, 0);

      /* Worked out before anything is written, so the audit line and the
         pickup-note decision below read the same figures the bills got. */
      const unwound = settlements.map((s) => {
        const paid = Math.max(0, toNumber(s.amountPaid) - s.amount);
        return { ...s, newPaid: paid, newStatus: invoiceStatusFor(s.status, paid, s.total) };
      });

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

      /*
        EVERY BILL IT ANSWERED, NOT JUST THE FIRST.

        Each claim is conditional on the balance this transaction read — the
        payment-row claim above stops a double VOID, but not a payment landing
        on one of these bills between our read and this write. The loser
        unwinds whole, which is why the throw is inside the loop.
      */
      for (const s of unwound) {
        const claim = await tx.invoice.updateMany({
          where: { id: s.invoiceId, amountPaid: s.amountPaid },
          data: {
            amountPaid: new Prisma.Decimal(s.newPaid),
            ...(s.newStatus ? { status: s.newStatus } : {}),
          },
        });
        if (claim.count === 0) {
          throw new Error(
            t(locale, "This bill's balance moved a moment ago. Reload and check it before cancelling.")
          );
        }
      }

      /*
        THE ALLOCATIONS STAY.

        They are the only record of how this payment was split, and deleting
        them made reinstating it impossible to get right: the money went back
        onto the bills but the split was gone, so the credit engine read the
        whole payment as unspent and put it against a second bill as well —
        one payment settling twice what it was worth.

        Nothing counts them as live money: every credit read filters
        `voidedAt: null`, so a cancelled payment's allocations are as inert as
        the payment itself, and they are here to be picked up again if it is.
      */

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
            unwound.length > 0
              ? unwound.map((s) => s.invoiceNumber).join(", ")
              : t(locale, "customer deposit")
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
      /* A deposit has released no cargo, so there is no note to withdraw —
         and a merged payment may have released four consignments, every one of
         which has to be stopped. */
      const notes: {
        invoiceNumber: string;
        noteNumber: string;
        outcome: "cancelled" | "already-collected";
      }[] = [];
      for (const s of unwound) {
        const note = s.shipment?.pickupNote ?? null;
        if (!note || s.newStatus === "PAID") continue;
        if (note.status === "USED") {
          notes.push({
            invoiceNumber: s.invoiceNumber,
            noteNumber: note.noteNumber,
            outcome: "already-collected",
          });
          continue;
        }
        if (note.status === "CANCELLED") continue;
        await tx.pickupNote.update({
          where: { id: note.id },
          data: { status: "CANCELLED" },
        });
        notes.push({
          invoiceNumber: s.invoiceNumber,
          noteNumber: note.noteNumber,
          outcome: "cancelled",
        });
        /* And the cargo stops being collectable, back to where it was before
           the payment that is being taken away. */
        if (s.shipment && s.shipment.status === "READY_FOR_PICKUP") {
          await tx.shipment.update({
            where: { id: s.shipment.id },
            data: { status: "RECEIVED_AT_DAR" },
          });
        }
      }
      const collected = notes.filter((n) => n.outcome === "already-collected");
      const noteOutcome: "cancelled" | "already-collected" | "none" =
        collected.length > 0
          ? "already-collected"
          : notes.length > 0
            ? "cancelled"
            : "none";

      await recordAudit(
        {
          actor: user,
          action: "payment.void",
          entity: "Payment",
          entityId: payment.id,
          summary:
            `${
              unwound.length > 0
                ? unwound
                    .map(
                      (s) =>
                        `${s.invoiceNumber}${
                          s.shipment ? ` (${s.shipment.trackingNumber})` : ""
                        }`
                    )
                    .join(", ")
                : "Customer deposit"
            }: payment of ` +
            `${payment.currency} ${toNumber(payment.amount).toFixed(2)} cancelled — ${parsed.data.reason}` +
            (collected.length > 0
              ? ` — WARNING: pickup note${collected.length > 1 ? "s" : ""} ${collected
                  .map((n) => n.noteNumber)
                  .join(", ")} already used, that cargo has been collected and the debt is now live again`
              : notes.length > 0
                ? ` — pickup note${notes.length > 1 ? "s" : ""} ${notes
                    .map((n) => n.noteNumber)
                    .join(", ")} cancelled with it`
                : ""),
          metadata: {
            receipt: payment.receipt?.receiptNumber ?? null,
            amount: toNumber(payment.amount),
            currency: payment.currency,
            settledAmount: gave,
            /* One row per bill, because a merged payment moved more than one
               and an audit line that named only the first was how this was
               missed for as long as it was. */
            bills: unwound.map((s) => ({
              invoice: s.invoiceNumber,
              gaveBack: s.amount,
              paidBefore: toNumber(s.amountPaid),
              paidAfter: s.newPaid,
              statusBefore: s.status,
              statusAfter: s.newStatus ?? s.status,
            })),
            ledgerReversed: reversedEntry,
            pickupNotes: notes,
            pickupNoteOutcome: noteOutcome,
            cargoAlreadyCollected: collected.length > 0,
            reason: parsed.data.reason,
          },
        },
        tx
      );

      return {
        invoiceIds: unwound.map((s) => s.invoiceId),
        invoiceNumber: unwound[0]?.invoiceNumber ?? null,
        noteOutcome,
      };
    });

    for (const id of result.invoiceIds) {
      revalidatePath(`/app/finance/invoices/${id}`);
    }
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
          invoice: { select: { ...SETTLED_INVOICE, exchangeRate: true } },
          /* The split the void left behind, put back exactly as it was. */
          allocations: {
            select: { amount: true, invoice: { select: SETTLED_INVOICE } },
          },
        },
      });
      if (!payment) throw new Error("That payment no longer exists.");
      if (!payment.voidedAt) {
        throw new Error("That payment is not cancelled, so there is nothing to reinstate.");
      }

      /* A reinstated deposit puts money back in the account and settles
         nothing, exactly as it did before it was cancelled. A reinstated
         merged payment puts back the same split it took away — read off the
         allocations the void deliberately left in place. */
      const invoice = payment.invoice;
      const settlements = settlementsOf(payment);
      const gave = settlements.reduce((sum, s) => sum + s.amount, 0);
      const redone = settlements.map((s) => {
        const paid = toNumber(s.amountPaid) + s.amount;
        return { ...s, newPaid: paid, newStatus: invoiceStatusFor(s.status, paid, s.total) };
      });

      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, voidedAt: { not: null } },
        data: { voidedAt: null, voidedById: null, voidReason: null },
      });
      if (claimed.count === 0) {
        throw new Error("That payment was reinstated by somebody else a moment ago.");
      }

      /* Same discipline as void and recordPayment, once per bill: the balance
         write only lands if the balance is still what this transaction read. */
      for (const s of redone) {
        const claim = await tx.invoice.updateMany({
          where: { id: s.invoiceId, amountPaid: s.amountPaid },
          data: {
            amountPaid: new Prisma.Decimal(s.newPaid),
            ...(s.newStatus ? { status: s.newStatus } : {}),
          },
        });
        if (claim.count === 0) {
          throw new Error(
            t(locale, "This bill's balance moved a moment ago. Reload and check it before reinstating.")
          );
        }
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
            redone.length > 0
              ? redone
                  .map(
                    (s) =>
                      `${s.invoiceNumber}${
                        s.shipment ? ` (${s.shipment.trackingNumber})` : ""
                      }`
                  )
                  .join(", ")
              : "Customer deposit"
          }: cancelled payment of ${payment.currency} ${toNumber(payment.amount).toFixed(2)} reinstated — ${parsed.data.reason}`,
          metadata: {
            receipt: payment.receipt?.receiptNumber ?? null,
            amount: toNumber(payment.amount),
            settledAmount: gave,
            bills: redone.map((s) => ({
              invoice: s.invoiceNumber,
              gaveBack: s.amount,
              paidAfter: s.newPaid,
              statusAfter: s.newStatus ?? s.status,
            })),
            previousVoidReason: payment.voidReason,
            reason: parsed.data.reason,
          },
        },
        tx
      );

      return { invoiceIds: redone.map((s) => s.invoiceId) };
    });

    for (const id of result.invoiceIds) {
      revalidatePath(`/app/finance/invoices/${id}`);
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
 * Reference, note and the date it was received — the fields that get
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
      paidAt: payment.paidAt.toISOString(),
    };
    const after = {
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
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
        reference: true,
        note: true,
        paidAt: true,
        accountId: true,
        account: { select: { name: true } },
        voidedAt: true,
        invoiceId: true,
        invoice: { select: { invoiceNumber: true, exchangeRate: true } },
        receipt: { select: { receiptNumber: true } },
        /* How many bills this answered. The anchor invoiceId is set on ANY
           allocated payment, one bill or four, so it cannot be the test. */
        _count: { select: { allocations: true } },
      },
    });
    if (!payment) return fail(t(locale, "That payment no longer exists."));
    if (payment.voidedAt) {
      return fail(t(locale, "That payment has already been cancelled."));
    }
    if (payment._count.allocations > 1) {
      /* A combined payment answers several bills at once, and moving either
         its figure or its account means deciding which bill loses what. That
         is the allocation screen's question, not this dialog's.

         Counted, not inferred from invoiceId: a merged payment carries an
         anchor invoiceId like any other, so the old test let a four-bill
         payment straight through and re-recorded the whole sum against the
         first bill. */
      return fail(
        t(
          locale,
          "This payment settles more than one bill. Cancel it and record it again against the bills it should cover."
        )
      );
    }
    if (!payment.invoiceId || !payment.invoice) {
      /* A deposit answers no bill yet, so there is no bill to re-record it
         against; it is corrected by cancelling and taking it again. */
      return fail(
        t(
          locale,
          "This payment is not against a bill. Cancel it and record it again."
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
       the same form travels with it — reference, note — so correcting
       the figure and a typo together does not silently drop the typo fix. */
    const newReference = parsed.data.reference ?? payment.reference ?? "";
    const again = new FormData();
    again.set("invoiceId", payment.invoiceId);
    again.set("amount", String(newAmount));
    again.set("currency", payment.currency);
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
