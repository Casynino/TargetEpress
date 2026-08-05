import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * The handful of things this desk does many times a day.
 *
 * Not a second sidebar. The sidebar is where you go to find a page; this is
 * where you go to start a job, and the difference is the count — five buttons
 * that get pressed all shift, not the nine links that exist. Anything used once
 * a week belongs in the menu and nowhere else, or this row becomes wallpaper
 * and the floor goes back to hunting through the sidebar.
 *
 * Deliberately flat markup and no panel around it: it reads as a toolbar under
 * the banner rather than a card competing with the numbers below it.
 */
export type QuickActionItem = {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

export function QuickActions({ items }: { items: QuickActionItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Quick actions" className="mb-6">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="focus-ring group flex h-full items-center gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:border-brand/40 hover:bg-accent/40"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand/15">
                <item.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium group-hover:text-brand">
                  {item.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.hint}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
