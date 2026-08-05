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
      visible: can(role, "finance.view"),
    },
    {
      href: "/app/finance/payments",
      label: "Payments",
      visible: can(role, "payment.record"),
    },
    {
      href: "/app/finance/accounts",
      label: "Accounts",
      visible: can(role, "account.view"),
    },
    {
      href: "/app/finance/transactions",
      label: "Transactions",
      visible: can(role, "ledger.view"),
    },
    {
      href: "/app/finance/expenses",
      label: "Expenses",
      visible: can(role, "expense.view"),
    },
    // NOTE: no Pickup notes tab. It sits in the sidebar beside Search Cargo,
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
    // The operational report — volumes, speed, what we carry. It lives under
    // /app/admin for historical reasons and is reached from here, because the
    // question "how did the business do" is asked in one place or it is asked
    // nowhere.
    {
      href: "/app/admin/reports",
      label: "Reports",
      visible: can(role, "report.view"),
    },
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
