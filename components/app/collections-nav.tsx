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
const TABS = [
  { href: "/app/collections", label: "Dashboard", exact: true },
  { href: "/app/collections/pending", label: "Awaiting payment" },
  { href: "/app/collections/submissions?status=PENDING", label: "With Finance", match: "/app/collections/submissions" },
  { href: "/app/collections/submissions?status=VERIFIED", label: "Verified", match: "/app/collections/submissions", query: "VERIFIED" },
  { href: "/app/finance/pickup-notes", label: "Pickup notes" },
  { href: "/app/customers", label: "Customer accounts" },
];

export function CollectionsNav({ status }: { status?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Collections workspace"
      className="mb-6 flex gap-2 overflow-x-auto pb-1"
    >
      {TABS.map((tab) => {
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
