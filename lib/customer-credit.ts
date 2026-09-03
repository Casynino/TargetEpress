import "server-only";

import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
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

/** In the currency the payments were taken in; this business bills in one. */
export async function availableCredit(
  tx: TxClient,
  customerId: string,
  currency: string
): Promise<number> {
  const payments = await tx.payment.findMany({
    where: { customerId, currency, voidedAt: null },
    select: {
      amount: true,
      creditedAmount: true,
      allocations: { select: { amount: true } },
    },
  });

  return payments.reduce((spare, payment) => {
    /* COALESCE(creditedAmount, amount) — the house rule. Older payments have a
       null credited column and would count as nothing otherwise. */
    const received = toNumber(payment.creditedAmount ?? payment.amount);
    const used = payment.allocations.reduce(
      (sum, a) => sum + toNumber(a.amount),
      0
    );
    return spare + Math.max(0, received - used);
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
    user: SessionUser;
  }
): Promise<number> {
  if (args.outstanding <= 0.005) return 0;

  const payments = await tx.payment.findMany({
    where: { customerId: args.customerId, currency: args.currency, voidedAt: null },
    orderBy: { paidAt: "asc" },
    select: {
      id: true,
      amount: true,
      creditedAmount: true,
      receipt: { select: { receiptNumber: true } },
      allocations: { select: { amount: true } },
    },
  });

  let remaining = args.outstanding;
  let applied = 0;
  const used: { payment: string; amount: number }[] = [];

  for (const payment of payments) {
    if (remaining <= 0.005) break;

    const received = toNumber(payment.creditedAmount ?? payment.amount);
    const spent = payment.allocations.reduce(
      (sum, a) => sum + toNumber(a.amount),
      0
    );
    const spare = received - spent;
    if (spare <= 0.005) continue;

    const take = Math.min(spare, remaining);

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
          note: "Deposit applied when the bill was raised at check-in.",
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
      metadata: { applied, currency: args.currency, payments: used },
    },
    tx
  );

  return applied;
}
