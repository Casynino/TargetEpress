import "server-only";

import type { AccountKind } from "@prisma/client";
import type { PaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The company's six real accounts.
 *
 * These are the same six that PAYMENT_ACCOUNTS prints on an invoice, and the
 * duplication is deliberate. That constant is what a customer was TOLD to pay
 * into and has to stay reproducible from the code that generated their copy of
 * a legal document. This list is what the business RECONCILES against — it has
 * to be a table, because a balance is a running total over rows.
 *
 * `code` is the stable identity. Display names, sort order and even account
 * numbers may be corrected; the code is what seeds, backfills and any future
 * import address an account by, and it never changes.
 */
export const ACCOUNT_SEED: {
  code: string;
  name: string;
  kind: AccountKind;
  currency: string;
  institution: string | null;
  accountNumber: string | null;
  accountName: string | null;
  sortOrder: number;
}[] = [
  {
    code: "CRDB_TZS",
    name: "CRDB Bank (TZS)",
    kind: "BANK",
    currency: "TZS",
    institution: "CRDB Bank",
    accountNumber: "0150597916300",
    accountName: "TARGET(GZ) EXPRESS AIR CARGO",
    sortOrder: 10,
  },
  {
    code: "TCB_TZS",
    name: "Tanzania Commercial Bank (TZS)",
    kind: "BANK",
    currency: "TZS",
    institution: "Tanzania Commercial Bank",
    accountNumber: "121400000029",
    accountName: "TARGET EXPRESS AIR CARGO",
    sortOrder: 20,
  },
  {
    code: "TCB_USD",
    name: "Tanzania Commercial Bank (USD)",
    kind: "BANK",
    currency: "USD",
    institution: "Tanzania Commercial Bank",
    accountNumber: "121223000019",
    accountName: "TARGET EXPRESS AIR CARGO",
    sortOrder: 30,
  },
  {
    code: "MIXX",
    name: "Mixx by Yas",
    kind: "MOBILE_MONEY",
    currency: "TZS",
    institution: "Mixx by Yas",
    accountNumber: "7122055",
    accountName: "SCOHU TARGET EXPRESS AIR CARGO",
    sortOrder: 40,
  },
  {
    code: "MPESA",
    name: "Vodacom M-Pesa",
    kind: "MOBILE_MONEY",
    currency: "TZS",
    institution: "Vodacom",
    accountNumber: "5581590",
    accountName: "TARGET EXPRESS AIR CARGO",
    sortOrder: 50,
  },
  {
    code: "CASH_OFFICE",
    name: "Office cash",
    kind: "CASH",
    currency: "TZS",
    institution: null,
    accountNumber: null,
    accountName: null,
    sortOrder: 60,
  },
];

/**
 * Which accounts a payment method could plausibly have landed in.
 *
 * Used to order and filter the picker, never to decide on the clerk's behalf —
 * a wrong account chosen automatically is worse than none at all, because it
 * looks reconciled.
 */
export const METHOD_ACCOUNT_KINDS: Record<PaymentMethod, AccountKind[]> = {
  CASH: ["CASH"],
  MOBILE_MONEY: ["MOBILE_MONEY"],
  // A cheque is deposited into a bank account; it never lands anywhere else.
  CHEQUE: ["BANK"],
  BANK_TRANSFER: ["BANK"],
};

export type AccountOption = {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
  currency: string;
  accountNumber: string | null;
};

/** The accounts a desk may attribute money to, in display order. */
export async function activeAccounts(): Promise<AccountOption[]> {
  return prisma.companyAccount.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      kind: true,
      currency: true,
      accountNumber: true,
    },
  });
}
