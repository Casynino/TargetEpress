"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  { href: "/app/collections", label: "Dashboard", exact: true },
  // The follow-up queue IS the call list: it knows each consignment's next
  // action, carries the storage clock and can send the invoice. A second,
  // thinner "awaiting payment" page beside it was two lists of one thing.
  { href: "/app/collections/follow-up", label: "The call list" },
  // The pending submissions appear twice on purpose, because they are not the
  // same thing to the two desks that share this workspace. "With Finance" is
  // Support watching what they handed up and can do nothing about; "Verify
  // payments" is Finance working it. One is a status, the other is a job.
  //
  // Only the desk that can do the job sees the job: Support does not hold
  // payment.verify, and a tab that answers "that area is not yours" is worse
  // than no tab at all.
  { href: "/app/finance/verify", label: "Verify payments", verifierOnly: true },
  { href: "/app/collections/submissions?status=PENDING", label: "With Finance", match: "/app/collections/submissions", collectorOnly: true },
  { href: "/app/collections/submissions?status=VERIFIED", label: "Verified", match: "/app/collections/submissions", query: "VERIFIED" },
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

  return (
    <nav
      aria-label="Collections workspace"
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
            key={tab.label}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
