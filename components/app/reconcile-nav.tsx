"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, Landmark, PlaneTakeoff, Scale, type LucideIcon } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

/**
 * The reconciliation workspace, as one row of tabs.
 *
 * The owner, on a single page carrying all four jobs at once: "the arragement
 * is not nice and big cnfusing... if you want to add more deetis or stuff to
 * recnsily yu can add as side pages like the way i see on overview". So it is
 * built the way the finance overview is — a tab per job, each a real route that
 * can be linked, bookmarked and reloaded, and the back button behaving.
 *
 * Four jobs, and they are genuinely different work: agreeing the day's records
 * one by one, proving an account against a statement, signing off a flight's
 * figures, and reading the arithmetic the books do on themselves. Stacked on
 * one screen they were four screens' worth of scrolling; side by side they are
 * four doors.
 */
const TABS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/app/manager/reconciliation", label: "Records", icon: BadgeCheck, exact: true },
  { href: "/app/manager/reconciliation/accounts", label: "Accounts", icon: Landmark },
  { href: "/app/manager/reconciliation/batches", label: "Flights", icon: PlaneTakeoff },
  { href: "/app/manager/reconciliation/checks", label: "The books' own checks", icon: Scale },
];

export function ReconcileNav({ counts }: { counts?: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav aria-label={t("Reconciliation")} className="mb-5 flex gap-2 overflow-x-auto pb-1">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;
        const count = counts?.[tab.href];
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
              active
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {t(tab.label)}
            {/* The number is the reason to press it: how much is waiting on
                that desk, not how many rows it happens to hold. */}
            {count !== undefined && count > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  active ? "bg-white/20" : "bg-warning/15 text-warning"
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
