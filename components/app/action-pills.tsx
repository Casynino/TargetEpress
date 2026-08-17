import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type ActionPill = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * "primary" and "secondary" are the two things this desk *does* — solid,
   * unmissable. Everything else is a place it looks and gets a soft tint of
   * its own colour instead.
   */
  weight?: "primary" | "secondary" | "quiet";
  /**
   * Which colour it carries.
   *
   * Colour here is a landmark, not decoration: after a week nobody reads this
   * row, they reach for the red one. That only works while each pill keeps its
   * own colour and keeps it everywhere — so the tone belongs to the
   * destination, not to the position in the row.
   *
   * The two solid pills still lead. The rest are tinted rather than filled, so
   * six colours can sit together without any of them shouting.
   */
  tone?: "brand" | "signal" | "success" | "warning" | "info" | "violet";
};

/**
 * Written out in full, never interpolated — Tailwind generates classes by
 * scanning source text, so `bg-${tone}` is a class that never exists.
 */
const SOLID: Record<NonNullable<ActionPill["tone"]>, string> = {
  brand: "bg-brand text-brand-foreground hover:bg-brand/90",
  signal: "bg-signal text-signal-foreground hover:bg-signal/90",
  success: "bg-success text-success-foreground hover:bg-success/90",
  warning: "bg-warning text-warning-foreground hover:bg-warning/90",
  info: "bg-info text-info-foreground hover:bg-info/90",
  violet: "bg-chart-6 text-white hover:bg-chart-6/90",
};

const TINT: Record<NonNullable<ActionPill["tone"]>, string> = {
  brand: "border-brand/30 bg-brand/10 text-brand hover:bg-brand/15",
  signal: "border-signal/30 bg-signal/10 text-signal hover:bg-signal/15",
  success: "border-success/30 bg-success/10 text-success hover:bg-success/15",
  warning: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
  info: "border-info/30 bg-info/10 text-info hover:bg-info/15",
  violet: "border-chart-6/30 bg-chart-6/10 text-chart-6 hover:bg-chart-6/15",
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
      {/*
        Keyed by where it goes, not by what it says.

        The support desk's row and the owner's each carried two pills labelled
        "Batches" — the loading tables and what has already flown — so React saw
        the same key twice, warned, and reconciled the pair as one: a row that
        looked complete with a button nobody could trust. A label is copy that
        gets rewritten and translated; the href is what a pill IS. Same rule the
        Finance tab row already follows.
      */}
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`focus-ring inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
            item.weight === "primary"
              ? `border-transparent ${SOLID[item.tone ?? "brand"]}`
              : item.weight === "secondary"
                ? `border-transparent ${SOLID[item.tone ?? "signal"]}`
                : TINT[item.tone ?? "brand"]
          }`}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
