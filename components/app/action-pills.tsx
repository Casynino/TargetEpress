import { Fragment } from "react";
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
/* The glyph's tint on the phone tile, by the same tone the pill uses. */
const CHIP: Record<NonNullable<ActionPill["tone"]>, string> = {
  brand: "bg-brand/15 text-brand",
  signal: "bg-signal/15 text-signal",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
  violet: "bg-chart-6/15 text-chart-6",
};

export function ActionPills({
  items,
  after,
  afterHref,
  label = "Quick actions",
}: {
  items: ActionPill[];
  /**
   * Something that is an ACTION rather than a destination, sat in the same row.
   *
   * Every pill here navigates. Recording an income does not — it opens a form —
   * so it cannot be an item, and putting it above or below the row made it read
   * as a separate thing when it is the same row of "what do I do from here".
   */
  after?: React.ReactNode;
  /** Which pill it sits beside. Falls to the end of the row if unmatched. */
  afterHref?: string;
  label?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={label}
      /* On a phone, tiles on a four-column grid — one glyph, one word, every
         tile the same size, the way a banking app lays its actions out. As
         pills they wrapped by their own width into a staircase with an orphan
         on the last line. From sm up they are the pills they always were. */
      className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap"
    >
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
        <Fragment key={item.href}>
        <Link
          href={item.href}
          className="focus-ring flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border bg-card px-1 py-2.5 text-center transition-transform active:scale-95 sm:hidden"
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${CHIP[item.tone ?? "brand"]}`}
          >
            <item.icon className="h-[18px] w-[18px]" />
          </span>
          <span className="line-clamp-2 w-full px-0.5 text-[11px] font-medium leading-tight text-foreground/80">
            {item.label}
          </span>
        </Link>
        <Link
          href={item.href}
          className={`focus-ring hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors sm:inline-flex sm:text-sm ${
            item.weight === "primary"
              ? `border-transparent ${SOLID[item.tone ?? "brand"]}`
              : item.weight === "secondary"
                ? `border-transparent ${SOLID[item.tone ?? "signal"]}`
                : TINT[item.tone ?? "brand"]
          }`}
        >
          <item.icon className="h-3.5 w-3.5" />
          {item.label}
        </Link>
        {/* A full row of its own on the phone grid — it is a button with its
            own words, not a tile, and in a quarter-width cell it ran off the
            screen. Inline again from sm up. */}
        {after && afterHref === item.href ? <div className="col-span-4 min-w-0 sm:contents">{after}</div> : null}
        </Fragment>
      ))}
      {/* Unmatched href, or none given: the action still belongs in the row. */}
      {after && !items.some((i) => i.href === afterHref) ? <div className="col-span-4 min-w-0 sm:contents">{after}</div> : null}
    </nav>
  );
}
