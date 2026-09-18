import "server-only";

import type { AccountKind } from "@prisma/client";
import type { PaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The company's real accounts.
 *
 * Not the list printed on an invoice, and the difference is deliberate. That
 * list (PAYMENT_METHODS) is what a customer was TOLD to pay into and has to stay
 * reproducible from the code that generated their copy of a legal document —
 * it still names M-Pesa and Mixx by Yas separately. This list is what the
 * business RECONCILES against, where the two tills are one account, Lipa — it
 * has to be a table, because a balance is a running total over rows.
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
  /*
    M-Pesa and Mixx by Yas are one account at the office: "Lipa". Customers
    are still told both numbers separately — that list is PAYMENT_METHODS in
    lib/constants.ts, not this one. On production the old MIXX and MPESA
    rows were merged into LIPA record by record and deleted
    (scripts/neon-merge-into-lipa.sql); the codes are not reused.
  */
  {
    code: "LIPA",
    name: "Lipa",
    kind: "MOBILE_MONEY",
    currency: "TZS",
    institution: "M-Pesa & Mixx by Yas",
    accountNumber: "5581590 / 7122055",
    accountName: "TARGET EXPRESS AIR CARGO",
    sortOrder: 40,
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
    /* Borrowed money is not somewhere a customer pays, and no receipt may
       name it. Every door that takes a customer's money refuses a loan account
       before it gets here; this is the backstop. */
    case "LOAN":
      throw new Error(
        "A loan account never receives a customer's money. Choose the company account it landed in."
      );
  }
}

/**
 * THE KINDS THAT ARE THE COMPANY'S OWN MONEY.
 *
 * A list of what counts rather than of what does not, so any kind added later
 * stays out of every "cash held" figure until somebody decides otherwise. A
 * loan account is money the company OWES — its balance runs below zero by
 * exactly the debt — and adding it into cash would quietly shrink the cash
 * position by what Husnater lent.
 */
export const COMPANY_MONEY_KINDS = ["BANK", "MOBILE_MONEY", "CASH"] as const satisfies readonly AccountKind[];

export function isCompanyMoney(kind: AccountKind | string): boolean {
  return (COMPANY_MONEY_KINDS as readonly string[]).includes(kind);
}

export function isLoan(kind: AccountKind | string | null | undefined): boolean {
  return kind === "LOAN";
}

export type AccountOption = {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
  currency: string;
  accountNumber: string | null;
  accountName: string | null;
};

const OPTION_SELECT = {
  id: true,
  code: true,
  name: true,
  kind: true,
  currency: true,
  accountNumber: true,
  /* On a loan account, the lender's name — "Husnater" beside "Loan — Husnater"
     — so a form can say whose money it is without a second lookup. */
  accountName: true,
} as const;

/**
 * The accounts a desk may attribute money to, in display order.
 *
 * The company's own accounts only. A loan account is left out here, where
 * about twenty screens ask — customer payments, "landed in", transfers, cash
 * totals — because a customer's money landing in "Loan — Husnater" would be
 * money nobody can find, and a loan's balance added into cash would hide a
 * debt inside the bank position. The one place borrowed money may be named is
 * "paid from" on a cost, which asks spendingAccounts() instead.
 */
export async function activeAccounts(): Promise<AccountOption[]> {
  return prisma.companyAccount.findMany({
    where: { active: true, kind: { in: [...COMPANY_MONEY_KINDS] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: OPTION_SELECT,
  });
}

/**
 * What a cost may be PAID FROM: the company's accounts, and any loan a lender
 * paid it with. Loans last, so a form that opens on the first account opens
 * on company money.
 */
export async function spendingAccounts(): Promise<AccountOption[]> {
  const rows = await prisma.companyAccount.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: OPTION_SELECT,
  });
  return [...rows.filter((a) => !isLoan(a.kind)), ...rows.filter((a) => isLoan(a.kind))];
}

/** Every loan account, open or closed, with the lender's name. */
/**
 * Every company account a statement of the money has to show: the open ones,
 * and a closed one only while it still holds something.
 *
 * Closing an account empties it, but a cancelled old payment reverses on the
 * account it came in on — so a closed M-Pesa can hold money again until
 * somebody moves it. Leaving it out of one screen and not another is how the
 * owner's dashboard and the Accounts page came to disagree; every list of
 * where the money is asks this.
 */
export async function moneyAccounts() {
  return prisma.companyAccount.findMany({
    where: { kind: { in: [...COMPANY_MONEY_KINDS] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { ...OPTION_SELECT, active: true },
  });
}

/** Whether an account belongs in a statement of where the money is. */
export function isHeld(account: { active: boolean }, native: number) {
  return account.active || Math.abs(native) >= 0.005;
}

export async function loanAccounts() {
  return prisma.companyAccount.findMany({
    where: { kind: "LOAN" },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { ...OPTION_SELECT, accountName: true, active: true },
  });
}
