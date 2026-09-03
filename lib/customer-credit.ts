import "server-only";

import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { LOCAL_CURRENCY } from "@/lib/money-totals";
import type { TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * MONEY A CUSTOMER HAS HANDED OVER THAT NO BILL HAS CLAIMED YET.
 *
 * Cargo cannot be priced until Dar weighs it, so a customer who pays while
 * their boxes are still in China is paying against nothing. That money is real
 * — it is in a company account — it simply has no invoice to sit against. It is
 * their credit until one exists.
 *
 * Derived, never stored, like every other figure here: what they have paid,
 * minus what those payments have been put against. A stored balance is a second
 * account of the same facts, and the day the two disagree nobody can say which
 * is right.
 */

/**
 * What a payment still has left, IN THE MONEY IT ARRIVED IN.
 *
 * A deposit is taken in shillings and the bill it will answer is written in
 * dollars, so the two sides of "received minus spent" are in different
 * currencies unless one of them is moved. This moves the spent side: each
 * allocation is stated in its own invoice's currency, and comes back at that
 * invoice's FROZEN rate — the rate the customer was quoted on that bill, which
 * is the only rate either party ever agreed to.
 *
 * The payment's own `amount` is the received side, exact and untouched. Never
 * the dollar snapshot: a shilling deposit that goes out to dollars and back
 * loses a fraction of a cent per allocation, and this figure decides whether a
 * customer's cargo is released.
 *
 * Null when a conversion is needed and no rate exists to do it with. That
 * payment is not spare money we can reason about, so it is left alone rather
 * than guessed at.
 */
function spareOf(payment: {
  amount: Prisma.Decimal;
  currency: string;
  allocations: {
    amount: Prisma.Decimal;
    invoice: { currency: string; exchangeRate: Prisma.Decimal | null };
  }[];
}): number | null {
  let spent = 0;
  for (const allocation of payment.allocations) {
    const settled = toNumber(allocation.amount);
    if (allocation.invoice.currency === payment.currency) {
      spent += settled;
      continue;
    }
    const frozen = toNumber(allocation.invoice.exchangeRate);
    if (!frozen) return null;
    /* Back into what the customer handed over: a dollar bill settled from a
       shilling payment consumed `settled x rate` of it. */
    spent +=
      payment.currency === LOCAL_CURRENCY ? settled * frozen : settled / frozen;
  }
  return Math.max(0, toNumber(payment.amount) - spent);
}

const CREDIT_SELECT = {
  id: true,
  amount: true,
  currency: true,
  receipt: { select: { receiptNumber: true } },
  allocations: {
    select: {
      amount: true,
      invoice: { select: { currency: true, exchangeRate: true } },
    },
  },
} as const;

/**
 * Money this customer has handed over that no bill has claimed, in `currency`.
 *
 * Payments in any currency are counted, each converted at the rate frozen onto
 * the bill being asked about — a shilling deposit is real money against a
 * dollar bill, and refusing to see it is how a customer who paid in March gets
 * asked again in August.
 */
export async function availableCredit(
  tx: TxClient,
  customerId: string,
  currency: string,
  /** The rate frozen onto the bill asking. Required to see other currencies. */
  invoiceRate: number | null = null
): Promise<number> {
  const payments = await tx.payment.findMany({
    where: { customerId, voidedAt: null },
    select: CREDIT_SELECT,
  });

  return payments.reduce((total, payment) => {
    const spare = spareOf(payment);
    if (spare === null || spare <= 0.005) return total;
    if (payment.currency === currency) return total + spare;
    if (!invoiceRate) return total;
    return (
      total +
      (payment.currency === LOCAL_CURRENCY
        ? spare / invoiceRate
        : spare * invoiceRate)
    );
  }, 0);
}

/**
 * Put a customer's spare money against a bill the moment one exists.
 *
 * Called where an invoice is raised — which is Dar check-in and nowhere else.
 * The customer paid weeks ago and should not be asked again, and Finance should
 * not have to remember that a deposit is sitting there: the bill arrives
 * already settled, or partly so, and says who paid it and when.
 *
 * Oldest payment first, because a deposit taken in March should be spent before
 * one taken in August — it is the older obligation and the one a customer will
 * ask about.
 *
 * Returns what it managed to apply, so the caller can decide whether the cargo
 * is now clear to collect.
 */
export async function applyCreditToInvoice(
  tx: TxClient,
  args: {
    invoiceId: string;
    customerId: string;
    currency: string;
    outstanding: number;
    /** The rate frozen onto this bill. Without it, only same-currency money. */
    invoiceRate?: number | null;
    user: SessionUser;
  }
): Promise<number> {
  if (args.outstanding <= 0.005) return 0;

  const payments = await tx.payment.findMany({
    where: { customerId: args.customerId, voidedAt: null },
    orderBy: { paidAt: "asc" },
    select: CREDIT_SELECT,
  });

  const rate = args.invoiceRate ?? null;
  let remaining = args.outstanding;
  let applied = 0;
  const used: { payment: string; amount: number; tendered?: string }[] = [];

  for (const payment of payments) {
    if (remaining <= 0.005) break;

    const spare = spareOf(payment);
    if (spare === null || spare <= 0.005) continue;

    /*
      The deposit restated against THIS bill.

      A shilling deposit answering a dollar bill converts at the bill's own
      frozen rate — the figure the customer was quoted — never at today's, or a
      deposit taken in March would settle a different amount depending on the
      day the cargo happened to land.
    */
    const cross = payment.currency !== args.currency;
    if (cross && !rate) continue;
    const worth = !cross
      ? spare
      : payment.currency === LOCAL_CURRENCY
        ? spare / rate!
        : spare * rate!;

    let take = Math.min(worth, remaining);
    /* Rounded to the cent the bill is written in, then snapped when it lands
       within one of clearing it: a bill left a cent short never reads as paid,
       and its cargo sits in the warehouse over a rounding error. */
    take = Math.round(take * 100) / 100;
    if (Math.abs(take - remaining) <= 0.01) take = remaining;
    if (take <= 0.005) continue;

    /* One allocation per payment per bill — the unique index says so, and it is
       what keeps "how much did this payment put against that invoice" a
       question with one answer. A payment already partly against this bill has
       its line raised rather than a second one written. */
    const existing = await tx.paymentAllocation.findUnique({
      where: {
        paymentId_invoiceId: {
          paymentId: payment.id,
          invoiceId: args.invoiceId,
        },
      },
      select: { id: true, amount: true },
    });

    const note = cross
      ? `${payment.currency} deposit applied at ${rate!.toLocaleString()}`
      : "Deposit applied when the bill was raised at check-in.";

    if (existing) {
      await tx.paymentAllocation.update({
        where: { id: existing.id },
        data: { amount: new Prisma.Decimal(toNumber(existing.amount) + take) },
      });
    } else {
      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: args.invoiceId,
          amount: new Prisma.Decimal(take),
          createdById: args.user.id,
          note,
        },
      });
    }

    /* The payment now names the bill it answered. Only when it had none — a
       payment already raised against another invoice keeps pointing at it. */
    await tx.payment.updateMany({
      where: { id: payment.id, invoiceId: null },
      data: { invoiceId: args.invoiceId },
    });

    used.push({
      payment: payment.receipt?.receiptNumber ?? payment.id,
      amount: take,
      ...(cross ? { tendered: payment.currency } : {}),
    });
    applied += take;
    remaining -= take;
  }

  if (applied <= 0.005) return 0;

  await recordAudit(
    {
      actor: args.user,
      action: "payment.record",
      entity: "Invoice",
      entityId: args.invoiceId,
      summary:
        `${args.currency} ${applied.toFixed(2)} of the customer's deposit settled this bill ` +
        `the moment it was raised (${used.map((u) => u.payment).join(", ")})`,
      metadata: {
        applied,
        currency: args.currency,
        exchangeRate: rate,
        payments: used,
      },
    },
    tx
  );

  return applied;
}
