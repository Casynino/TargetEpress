"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

/**
 * The collections workspace, as one row of tabs.
 *
 * Same shape as the Finance row, deliberately: one department, several screens,
 * one job. Every tab is a real route so a queue can be linked to, bookmarked
 * and reloaded, and the back button behaves.
 */
type Tab = {
  href: string;
  label: string;
  exact?: boolean;
  match?: string;
  query?: string;
  /** Shown only to the desk that can act on it — see `canVerify`. */
  verifierOnly?: boolean;
  /**
   * Hidden from the desk that can verify. Not a permission — Finance may read
   * these rows — but for them this tab and "Verify payments" are one list, and
   * this is the copy with the buttons taken off.
   */
  collectorOnly?: boolean;
};

const TABS: Tab[] = [
  // No dashboard tab. The call list IS the workspace: it knows each
  // consignment's next action, carries the storage clock, can send the
  // invoice, and now shows the department's figures along its top. A tab that
  // summarised it was a page you read before the page you work.
  { href: "/app/collections/follow-up", label: "The call list" },
  // The pending submissions appear twice on purpose, because they are not the
  // same thing to the two desks that share this workspace. "With Finance" is
  // Support watching what they handed up and can do nothing about; "Verify
  // payments" is Finance working it. One is a status, the other is a job.
  //
  // Only the desk that can do the job sees the job: Support does not hold
  // payment.verify, and a tab that answers "that area is not yours" is worse
  // than no tab at all.
  { href: "/app/collections/verify", label: "Verify payments", verifierOnly: true },
  { href: "/app/collections/submissions?status=PENDING", label: "With Finance", match: "/app/collections/submissions", collectorOnly: true },
  { href: "/app/collections/submissions?status=VERIFIED", label: "Verified", match: "/app/collections/submissions", query: "VERIFIED" },
  /* Credit belongs in the collections workspace: an overdue credit and an unpaid
     bill are the same afternoon's chasing, and having to leave this row to see
     one half of the debt was how the two got looked at separately. */
  { href: "/app/finance/credit", label: "Credit" },
  { href: "/app/finance/pickup-notes", label: "Pickup notes" },
  { href: "/app/customers", label: "Customer accounts" },
];

export function CollectionsNav({
  status,
  canVerify = false,
}: {
  status?: string;
  /** payment.verify — Finance and the CEO. Support collects and hands up. */
  canVerify?: boolean;
}) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      aria-label={t("Collections workspace")}
      className="mb-6 flex gap-2 overflow-x-auto pb-1"
    >
      {TABS.filter((tab) =>
        canVerify ? !tab.collectorOnly : !tab.verifierOnly
      ).map((tab) => {
        const base = tab.match ?? tab.href;
        // Two tabs share one route and are told apart by the filter on it, so
        // the query has to take part in deciding which is lit.
        const onRoute = tab.exact
          ? pathname === base
          : pathname === base || pathname.startsWith(`${base}/`);
        const active = tab.match
          ? onRoute && (status ?? "PENDING") === (tab.query ?? "PENDING")
          : onRoute;

        return (
          <Link
            // The route, not the label. Two of these tabs are the same
            // submissions page under different filters, and the label is the
            // one part of a tab that gets rewritten and translated — keying on
            // it means any pair of tabs that ever reads the same collapses into
            // one.
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
