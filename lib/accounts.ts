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
 * The payment method a payment must have had, read off the account it went into.
 *
 * Nobody is asked for a method any more. The owner's reasoning, and it is
 * right: the company runs seven real named accounts, two of which are mobile
 * money, so "Mobile money" answered "which one?" with a category. The account
 * is the fact; the method is a restatement of it.
 *
 * The column stays and is still written, because it is NOT NULL and because
 * every historical row has a real value in it that must not be rewritten. This
 * is the one place that value is now decided.
 *
 * A switch with no default on purpose. If AccountKind ever gains a member the
 * build fails here, rather than quietly booking the new kind as a bank
 * transfer and putting a wrong word on a customer's receipt.
 *
 * CHEQUE becomes unreachable for new rows, which is correct — a cheque is
 * deposited into a bank account, and the account is what the money touched.
 * Old CHEQUE rows keep their value and still render, so every label in
 * PAYMENT_METHOD_LABELS has to stay.
 */
export function methodForKind(kind: AccountKind): PaymentMethod {
  switch (kind) {
    case "CASH":
      return "CASH";
    case "MOBILE_MONEY":
      return "MOBILE_MONEY";
    case "BANK":
      return "BANK_TRANSFER";
  }
}

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
