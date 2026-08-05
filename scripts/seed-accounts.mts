/**
 * Puts the company's six real accounts on the system, and gives the payments
 * already recorded their ledger lines.
 *
 * Safe to run more than once: accounts are upserted by `code`, and a payment
 * that already has a ledger entry is skipped (LedgerEntry.paymentId is unique,
 * so a double-write would be a database error rather than a duplicate line —
 * this check only makes the message friendlier).
 *
 *   npx tsx --conditions=react-server ./scripts/seed-accounts.mts
 */
import { Prisma } from "@prisma/client";

import { ACCOUNT_SEED } from "../lib/accounts";
import { prisma } from "../lib/prisma";

const pad = (n: number, width = 6) => String(n).padStart(width, "0");

async function main() {
  // ---------------------------------------------------------------- accounts
  for (const account of ACCOUNT_SEED) {
    await prisma.companyAccount.upsert({
      where: { code: account.code },
      create: account,
      // Never touches `currency` on an existing account: restating the unit of
      // an account would restate every historical balance on it.
      update: {
        name: account.name,
        kind: account.kind,
        institution: account.institution,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        sortOrder: account.sortOrder,
      },
    });
  }
  const accounts = await prisma.companyAccount.findMany({
    orderBy: { sortOrder: "asc" },
  });
  console.log(`accounts: ${accounts.length}`);
  for (const a of accounts) {
    console.log(`  ${a.code.padEnd(12)} ${a.currency}  ${a.name}`);
  }

  const byCode = new Map(accounts.map((a) => [a.code, a]));

  // ------------------------------------------------------- payment backfill
  //
  // Attribution is only guessed where the guess cannot be wrong. A cash
  // payment in shillings went into the cash tin; there is nowhere else for it
  // to have gone. A cash payment in DOLLARS did not go into the shilling cash
  // tin, and no other account fits it either — so it is left unattributed
  // rather than filed somewhere plausible. An honest gap is worth more than a
  // confident invention, and the Accounts view is built to show it as a gap.
  const payments = await prisma.payment.findMany({
    where: { ledgerEntry: { is: null } },
    orderBy: { paidAt: "asc" },
    include: {
      receipt: { select: { receiptNumber: true } },
      invoice: {
        select: {
          invoiceNumber: true,
          currency: true,
          shipment: { select: { trackingNumber: true } },
        },
      },
    },
  });

  console.log(`\npayments without a ledger line: ${payments.length}`);

  let written = 0;
  let skipped = 0;

  for (const payment of payments) {
    const accountId =
      payment.accountId ??
      (payment.method === "CASH" && payment.currency === "TZS"
        ? byCode.get("CASH_OFFICE")?.id
        : undefined);

    if (!accountId) {
      console.log(
        `  SKIP  ${payment.receipt?.receiptNumber ?? payment.id} — ${payment.currency} ${payment.amount.toString()} by ${payment.method}: no account can be inferred, left unattributed`
      );
      skipped += 1;
      continue;
    }

    const account = accounts.find((a) => a.id === accountId)!;
    if (account.currency !== payment.currency) {
      console.log(
        `  SKIP  ${payment.receipt?.receiptNumber ?? payment.id} — ${payment.currency} into a ${account.currency} account is not possible`
      );
      skipped += 1;
      continue;
    }

    // The USD value of the money, which for these is exactly what settled the
    // bill: creditedAmount is the payment restated in the invoice's currency,
    // and every invoice in this system is denominated in USD.
    const usd =
      payment.invoice.currency === "USD"
        ? Number(payment.creditedAmount ?? payment.amount)
        : Number(payment.amount);

    await prisma.$transaction(async (tx) => {
      if (payment.accountId !== accountId) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { accountId },
        });
      }

      const year = payment.paidAt.getFullYear();
      const counter = await tx.counter.upsert({
        where: { key: `ledger:${year}` },
        create: { key: `ledger:${year}`, value: 1 },
        update: { value: { increment: 1 } },
      });

      await tx.ledgerEntry.create({
        data: {
          entryNumber: `GL-${year}-${pad(counter.value)}`,
          accountId,
          direction: "IN",
          kind: "CUSTOMER_PAYMENT",
          amount: payment.amount,
          currency: payment.currency,
          amountUsd: new Prisma.Decimal(usd),
          exchangeRate: payment.exchangeRate,
          occurredAt: payment.paidAt,
          description: `${payment.receipt?.receiptNumber ?? "Payment"} — ${payment.invoice.invoiceNumber} for ${payment.invoice.shipment.trackingNumber}`,
          sourceEntity: "Payment",
          sourceId: payment.id,
          paymentId: payment.id,
          recordedById: payment.receivedById,
        },
      });
    });

    console.log(
      `  WROTE ${payment.receipt?.receiptNumber ?? payment.id} → ${account.code}: ${payment.currency} ${payment.amount.toString()} (USD ${usd})`
    );
    written += 1;
  }

  console.log(`\nledger lines written: ${written}, left unattributed: ${skipped}`);

  // ------------------------------------------------------------ drift probe
  //
  // This must always be zero. A payment with no ledger line means somewhere a
  // writer moved money without saying so, and the whole point of a real ledger
  // table rather than a view assembled at read time is that this question has
  // an answer you can run.
  const drift = await prisma.payment.count({
    where: { ledgerEntry: { is: null }, accountId: { not: null } },
  });
  console.log(`drift (attributed payments with no ledger line): ${drift}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
