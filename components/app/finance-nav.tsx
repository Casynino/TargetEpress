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
        // Longest-prefix wins, so /app/finance/pricing does not also light up
        // the Overview tab at /app/finance.
        const active =
          pathname === tab.href ||
          (tab.href !== "/app/finance" && pathname.startsWith(`${tab.href}/`));

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
