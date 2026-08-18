import "server-only";

import { creditNotInTheLedger } from "@/lib/credit-queries";
import { toNumber } from "@/lib/format";
import { accountBalances } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";

/**
 * Does what the books say match what the accounts hold.
 *
 * Every figure in this app is derived rather than stored, which removes the
 * classic reconciliation problem — there is no cached balance to drift from its
 * source. What it cannot remove is the other kind: a payment recorded on an
 * invoice but never posted to an account, an invoice whose status and whose
 * arithmetic disagree, an account showing less than nothing. Those are writes
 * that half-happened, and no amount of deriving finds them, because each side
 * is internally consistent and only the pair is wrong.
 *
 * So each check below asks the same question twice, by two different routes,
 * and reports the gap. A clean line is not decoration: "0 differences over 431
 * payments" is the finding, and a page that only listed problems could not tell
 * the reader whether it had looked.
 */
export type Check = {
  key: string;
  label: string;
  /** What agreeing would mean, in words, before the numbers. */
  question: string;
  left: { label: string; value: string };
  right: { label: string; value: string };
  /** Zero when the two sides agree. */
  difference: number;
  ok: boolean;
  /** Present when a gap is expected and correct, rather than a fault. */
  expected?: string;
  href?: string;
};

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

export async function reconciliation() {
  const [payments, posted, postedSum, invoices, balances, accounts, credit] =
    await Promise.all([
      /* Every payment that still counts. A cancelled one was answered by a
         reversing line, so both sides of the check drop it together. */
      prisma.payment.findMany({
        where: { voidedAt: null },
        select: {
          id: true,
          amount: true,
          creditedAmount: true,
          currency: true,
          accountId: true,
        },
      }),
      prisma.ledgerEntry.findMany({
        where: { kind: "CUSTOMER_PAYMENT", paymentId: { not: null } },
        select: { paymentId: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: { kind: "CUSTOMER_PAYMENT" },
        _sum: { amountUsd: true },
      }),
      prisma.invoice.findMany({
        where: { status: { notIn: ["DRAFT", "VOID"] } },
        select: { id: true, status: true, total: true, amountPaid: true },
      }),
      accountBalances(prisma),
      prisma.companyAccount.findMany({
        select: {
          id: true,
          name: true,
          currency: true,
          active: true,
          openingSetAt: true,
        },
      }),
      creditNotInTheLedger(),
    ]);

  /* ---------------------------------------- 1. every payment on the register */
  const postedIds = new Set(posted.map((p) => p.paymentId));
  const unposted = payments.filter((p) => !postedIds.has(p.id));

  /* ---------------------------------------- 2. the same money, both ways */
  const collectedUsd = payments.reduce(
    (n, p) => n + toNumber(p.creditedAmount ?? p.amount),
    0
  );
  /* The register's own total nets its reversing lines, so a cancelled payment
     leaves +100 and −100 behind and contributes nothing — which is why this
     side reads every CUSTOMER_PAYMENT line while the other reads only live
     payments. Filtering both the same way would hide exactly the case where a
     cancellation reversed the bill and not the register. */
  const ledgerUsd = toNumber(postedSum._sum.amountUsd ?? 0);

  /* ---------------------------------------- 3. status against arithmetic */
  const mislabelled = invoices.filter((inv) => {
    const total = toNumber(inv.total);
    const paid = toNumber(inv.amountPaid);
    if (inv.status === "PAID") return paid + 0.005 < total;
    if (inv.status === "UNPAID") return paid > 0.005;
    if (inv.status === "PARTIALLY_PAID") return paid <= 0.005 || paid + 0.005 >= total;
    return false;
  });

  /* ---------------------------------------- 4. accounts below zero

     TWO DIFFERENT FAULTS, AND THE FIRST DRAFT CALLED BOTH OF THEM THE SECOND.

     An account whose opening balance was never recorded starts its life on this
     system at zero, so the first expense paid out of it drives it negative and
     keeps it there for good. The money is fine; what is missing is the sentence
     saying what was in the account on the day it was put on the system. That is
     a setup step nobody did, not a booking error, and telling a manager to go
     hunting through the register for a mistake that is not there wastes the one
     thing this page is supposed to save.

     An account that HAS an opening balance and is still below zero is the real
     finding: more money has left it than ever existed in it, which cannot have
     happened, so something was booked against the wrong account.
  */
  const byId = new Map(balances.map((b) => [b.accountId, b]));
  const below = accounts
    .map((a) => {
      const row = byId.get(a.id);
      const balance = row ? toNumber(row.inflow) - toNumber(row.outflow) : 0;
      return { ...a, balance };
    })
    .filter((a) => a.balance < -0.005);

  const negative = below.filter((a) => a.openingSetAt !== null);
  const neverOpened = below.filter((a) => a.openingSetAt === null);

  const checks: Check[] = [
    {
      key: "posted",
      label: "Payments on the register",
      question: "Every payment recorded against a bill should also be a line on the ledger.",
      left: { label: "Payments taken", value: String(payments.length) },
      right: { label: "Missing a line", value: String(unposted.length) },
      difference: unposted.length,
      ok: unposted.length === 0,
      /* The cause, where the data can name it, rather than a count somebody has
         to go and diagnose. A payment recorded without naming an account has
         nowhere to post to, so the register never hears about it. */
      expected:
        unposted.length > 0 && unposted.every((p) => !p.accountId)
          ? "All of these were recorded without naming an account, so there was nowhere to post them. Attribute them to an account and they join the register."
          : undefined,
      href: "/app/finance/transactions",
    },
    {
      key: "collected",
      label: "Money collected",
      question: "The bills say this much came in. The accounts should say the same.",
      left: { label: "Settled against bills", value: usd(collectedUsd) },
      right: { label: "Received into accounts", value: usd(ledgerUsd) },
      difference: Math.abs(collectedUsd - ledgerUsd),
      ok: near(collectedUsd, ledgerUsd),
      href: "/app/finance/transactions",
    },
    {
      key: "credit",
      label: "Billed on credit",
      question: "Cargo released against a promise. Revenue, but no money in any account.",
      left: { label: "Still owed", value: usd(credit.outstandingUsd) },
      right: { label: "Of which overdue", value: usd(credit.overdueUsd) },
      difference: 0,
      ok: true,
      /* The one gap on this page that is correct by design, said so plainly —
         somebody comparing revenue to the bank will find this difference, and
         they should find the explanation in the same place. */
      expected:
        "This gap is meant to be here. A credit sale posts no ledger line, because nothing reached an account — that is what stops it being counted as cash.",
      href: "/app/finance/credit",
    },
    {
      key: "status",
      label: "Bills labelled correctly",
      question: "A bill marked paid should be paid in full, and one marked unpaid untouched.",
      left: { label: "Live bills", value: String(invoices.length) },
      right: { label: "Label disagrees", value: String(mislabelled.length) },
      difference: mislabelled.length,
      ok: mislabelled.length === 0,
      href: "/app/finance/invoices",
    },
    {
      key: "negative",
      label: "Accounts below zero",
      question: "No account can hold less than nothing. One that does was booked wrong.",
      left: { label: "Accounts", value: String(accounts.filter((a) => a.active).length) },
      right: { label: "Below zero", value: String(negative.length) },
      difference: negative.length,
      ok: negative.length === 0,
      expected:
        neverOpened.length > 0
          ? `${neverOpened.length} more ${neverOpened.length === 1 ? "account reads" : "accounts read"} below zero only because no opening balance was ever recorded for ${neverOpened.length === 1 ? "it" : "them"}: ${neverOpened.map((a) => a.name).join(", ")}. Set the opening balance and the figure becomes real.`
          : undefined,
      href: "/app/finance/accounts",
    },
  ];

  return { checks, unposted: unposted.length, negative, neverOpened, credit };
}
