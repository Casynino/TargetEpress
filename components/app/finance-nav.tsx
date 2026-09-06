"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

/**
 * The Finance workspace, as one row of tabs.
 *
 * Finance is not a page, it is a department: money coming in, money going out,
 * where it sits, and what it all adds up to. Those are separate screens but one
 * job, and putting them in the left sidebar buries them among warehouse links
 * that the same person never touches.
 *
 * Every tab is a real route, not client state — so a figure can be linked to,
 * bookmarked and reloaded, and the browser's back button behaves.
 *
 * Tabs the viewer cannot reach are not rendered. Support holds pricing.view and
 * invoice.manage but nothing else here, and a row of doors that open onto
 * "no access" teaches people to distrust the whole navigation.
 */
export type FinanceTab = {
  href: string;
  label: string;
  /** Rendered only when the viewer holds this. Resolved on the server. */
  visible: boolean;
};

export function FinanceNav({ tabs }: { tabs: FinanceTab[] }) {
  const pathname = usePathname();
  const t = useT();
  const shown = tabs.filter((tab) => tab.visible);

  if (shown.length < 2) return null;

  return (
    <nav
      aria-label={t("Finance workspace")}
      className="mb-6 flex gap-2 overflow-x-auto pb-1"
    >
      {shown.map((tab) => {
        /*
          LONGEST PREFIX WINS, so /app/finance/pricing does not also light up
          the Overview tab at /app/finance.

          AND EVERY PAGE THAT SHOWS THIS ROW LIGHTS SOMETHING. Seven pages
          rendered the row with nothing lit at all — a bar of tabs and no
          answer to "where am I", which is the same disorientation as a
          changed title. They are pages that live under a tab without being
          one: the whole collections workspace sits under Collections, and
          Payments, Closed batches and Pickup notes are all reached from the
          Ledger. Named here rather than given tabs of their own, because the
          row is already long and none of them is a place this desk starts
          from.
        */
        const belongsTo =
          pathname.startsWith("/app/collections")
            ? "/app/collections/follow-up"
            : pathname.startsWith("/app/finance/payments") ||
                pathname.startsWith("/app/finance/pickup-notes") ||
                pathname.startsWith("/app/finance/receipts")
              ? "/app/finance/transactions"
              : null;

        /*
          CLOSED BATCHES IS NOT THE LEDGER, AND THE TAB SAID IT WAS.

          It was listed above, so opening Closed batches lit General ledger —
          and the owner read the lit tab the way a lit tab is meant to be read:
          "closed batches are inside the general ledger". They are not. One is
          what each flight earned once Finance shut its books; the other is
          every movement of money the company has made. The sidebar agrees with
          me and not with the tab: it files Closed batches under BATCHES.

          A payment, a receipt and a pickup note genuinely are ledger lines
          seen one at a time, so those keep the highlight. This one gets its
          own name in the heading above instead.
        */

        const active =
          pathname === tab.href ||
          (tab.href !== "/app/finance" && pathname.startsWith(`${tab.href}/`)) ||
          belongsTo === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
              active
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}
