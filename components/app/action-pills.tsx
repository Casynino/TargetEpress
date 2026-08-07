import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type ActionPill = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * "primary" and "secondary" are the two things this desk *does*; everything
   * else is a place it looks. At most two coloured pills per row — colour that
   * appears on six of six pills has stopped pointing at anything.
   */
  weight?: "primary" | "secondary" | "quiet";
};

/**
 * The handful of things a desk starts many times a day.
 *
 * A toolbar under the banner, not a second sidebar. The sidebar is where you go
 * to find a page; this is where you go to start a job, and the difference is
 * the count — six buttons pressed all shift, not the fourteen links that exist.
 * Anything reached once a week belongs in the menu and nowhere else, or the row
 * becomes wallpaper and people go back to hunting through the sidebar.
 *
 * Pills rather than cards: this sits between a banner and a wall of figures,
 * and a row of bordered cards there reads as a third grid of numbers.
 */
export function ActionPills({
  items,
  label = "Quick actions",
}: {
  items: ActionPill[];
  label?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`focus-ring inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            item.weight === "primary"
              ? "bg-brand text-brand-foreground hover:bg-brand/90"
              : item.weight === "secondary"
                ? "bg-signal text-signal-foreground hover:bg-signal/90"
                : "border bg-card text-foreground hover:border-brand/40 hover:bg-accent/40"
          }`}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
