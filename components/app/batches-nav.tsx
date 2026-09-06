"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

/**
 * THE FOUR BATCH SCREENS, AS ONE ROW.
 *
 * Two of them — Closed batches and Batch finances — live under /app/finance
 * because that is where the figures are computed, and they were wearing the
 * Finance tab row to prove it: a page about flights, sitting under Overview,
 * Accounts, Collections, General ledger. The owner read that the only way it
 * can be read, which is that closed batches are part of the ledger. They are
 * not; they are what a flight earned.
 *
 * So the batch screens carry their own row. Nothing about the routes or the
 * figures moves — a tab row is a statement about where you are, and this one
 * finally makes the true statement.
 *
 * IN THE ORDER A FLIGHT LIVES. It is loaded in Guangzhou, it lands in Dar, it
 * is signed off, and then somebody reads what it made. A menu that runs in the
 * order the work runs needs no explaining.
 */
export type BatchTab = {
  href: string;
  label: string;
  /** Rendered only when the viewer holds the permission. Resolved server-side. */
  visible: boolean;
};

export function BatchesNav({ tabs }: { tabs: BatchTab[] }) {
  const pathname = usePathname();
  const t = useT();
  const shown = tabs.filter((tab) => tab.visible);

  if (shown.length < 2) return null;

  return (
    <nav
      aria-label={t("Batches")}
      className="mb-6 flex gap-2 overflow-x-auto pb-1"
    >
      {shown.map((tab) => {
        /* Longest prefix wins, so /app/batches does not also light up while
           the reader is on a batch's own page. */
        const active =
          pathname === tab.href ||
          (tab.href !== "/app/batches" && pathname.startsWith(`${tab.href}/`));

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
