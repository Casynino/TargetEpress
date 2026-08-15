import "server-only";

import type { Role } from "@prisma/client";

import { can } from "@/lib/rbac";
import type { FinanceTab } from "@/components/app/finance-nav";

/**
 * The Finance workspace's tabs, for one viewer.
 *
 * One list, built on the server from the same permissions the routes are gated
 * on — so the row can never offer a door that opens onto "no access", and a
 * permission change moves the navigation without anybody remembering to.
 *
 * NOTE ON SCOPE: this is navigation around the finance work, not a change to
 * it. Receiving cargo, auto-pricing at check-in, confirming a price and
 * recording a payment are untouched by anything here and stay where they are —
 * on the cargo and on the dispatch, where the person doing the job already is.
 */
export function financeTabs(role: Role): FinanceTab[] {
  return [
    {
      href: "/app/finance",
      label: "Overview",
      visible: can(role, "accounting.view"),
    },
    {
      href: "/app/finance/accounts",
      label: "Accounts",
      visible: can(role, "account.view"),
    },
    {
      href: "/app/finance/verify",
      // Money somebody says arrived and nobody has agreed to yet. It comes
      // before Collections because a payment sitting unverified makes the
      // collections list wrong: the customer has paid and is still on it.
      label: "Verify payments",
      visible: can(role, "payment.verify"),
    },
    {
      href: "/app/collections",
      // Beside Verify payments because they are one pipeline read end to end:
      // what customers owe, what has been collected against it, and what is
      // waiting to be agreed. Support reaches the same workspace from their own
      // sidebar — this is Finance's door to it, not a second copy.
      label: "Collections",
      visible: can(role, "collections.view"),
    },
    {
      /*
        With the records, not with the daily work.

        It was second, on the argument that it is the sheet the department is
        run on. It is — but only for flights that have already closed, and
        nothing on it can be done today. The tabs ahead of it are the ones
        somebody opens to act: where the money is, what is waiting to be
        agreed, who has not paid. This one is read.
      */
      href: "/app/finance/income",
      label: "Closed batches",
      visible: can(role, "accounting.view"),
    },
    {
      href: "/app/finance/transactions",
      // One register. Payments-in and Expenses were two more readings of the
      // same movements, each with its own totals to reconcile by eye.
      label: "General ledger",
      visible: can(role, "ledger.view"),
    },
    // NOTE: no Pickup notes tab. It sits in the sidebar beside Search,
    // because a pickup note is an operational document rather than a financial
    // one — Finance issues it, but the people reaching for it all day are at
    // the counter with a customer in front of them. Two doors into one room is
    // what this navigation avoids everywhere else, so it is not also a tab.
    {
      href: "/app/finance/reports",
      label: "Profit & loss",
      // The owner's figure, not the money desk's. See profit.view in rbac.ts.
      visible: can(role, "profit.view"),
    },
    // NOTE: no Reports tab. It showed revenue, collected and outstanding —
    // the same figures as the Overview — over a cargo-position panel and a
    // cargo-mix panel that the CEO dashboard already renders. Three copies of
    // one answer is worse than one, so the position moved onto the Overview
    // and the page itself now redirects there.
    {
      href: "/app/finance/pricing",
      label: "Pricing & configuration",
      visible: can(role, "pricing.view"),
    },
    {
      href: "/app/finance/audit",
      label: "Audit",
      visible: can(role, "audit.view"),
    },
  ];
}
