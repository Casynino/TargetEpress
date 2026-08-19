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
      /*
        Collections sits with the money screens, between the accounts it fills
        and the register it feeds. What customers owe is a finance figure
        before it is a phone call, and the owner asked for it here.

        Verify payments is NOT a tab here. It lives inside Collections, where
        the job is actually done — in both rows it was the same queue twice,
        and each copy threw the reader into the other's navigation.
      */
      /*
        Straight at the queue, not at the redirect in front of it.

        /app/collections is a redirect to this page, and on production that
        extra hop cost 1.2 seconds of the owner's time on every click —
        measured: 2,873ms through the redirect against 1,702ms direct. The
        redirect stays for bookmarks and old links; nothing that ships new
        should route through it.
      */
      href: "/app/collections/follow-up",
      label: "Collections",
      visible: can(role, "collections.view"),
    },
    {
      href: "/app/finance/transactions",
      // One register. Payments-in and Expenses were two more readings of the
      // same movements, each with its own totals to reconcile by eye.
      label: "General ledger",
      visible: can(role, "ledger.view"),
    },
    {
      /*
        Beside the register it fills.

        This page had no tab at all — reachable only by typing the URL or
        landing on it sideways, which for the page Finance records spending on
        every day is a door with no handle. It sits after the ledger because
        that is the relationship: a cost recorded here becomes a line there.
      */
      href: "/app/finance/expenses",
      label: "Expenses",
      visible: can(role, "expense.view"),
    },
    {
      /*
        Beside Expenses, because that is what it becomes.

        Payroll is the largest regular payment the company makes and it reaches
        the ledger the same way every other cost does — as an expense against a
        named account. What makes it its own screen rather than a line on that
        one is the two steps: this desk BUILDS the run and cannot pay it, and
        the manager agrees it without writing the figures.
      */
      href: "/app/finance/payroll",
      label: "Payroll",
      visible: can(role, "payroll.prepare"),
    },
    /* No Credit tab. The credit book is a standalone page with its own sidebar
       row — the same reasoning as Price Configuration above it. */
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
    /* No Pricing tab. The rate book is a standalone page with its own sidebar
       row now — leaving a tab here would offer a doorway the page itself no
       longer wears, and the tab row would keep highlighting a page that has
       stopped being part of it. */
    /* No Closed batches tab. The owner: "i dont want the closed batch to be
       here". It is read rather than acted on — nothing on it can be done today
       — and it now has a row of its own in every menu that reaches it: under
       Operations for the manager, beside the ledger for Finance and the owner.
       A tab as well would be a second door into a room nobody visits twice. */
    {
      href: "/app/finance/audit",
      label: "Audit",
      visible: can(role, "audit.view"),
    },
  ];
}
