import { Fragment } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type ActionPill = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * "primary" and "secondary" are the two things this desk *does*. They lead
   * the row; since 8 Nov 2026 they are drawn like every other pill (the owner
   * asked for one clean style), so this now only records the intent.
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
   * It colours the glyph only — never a filled block — so six colours sit
   * together without any of them shouting.
   */
  tone?: "brand" | "signal" | "success" | "warning" | "info" | "violet";
  /**
   * One word for the phone tile, as an app's icons are named (owner, 8 Nov
   * 2026: "The Ledger" is "Ledger", "Issues & Claims" is "Claims"). The full
   * label stays on a computer and is what a screen reader hears.
   */
  short?: string;
};

/**
 * The pill on a computer: one calm style for every shortcut — a light surface,
 * a fine neutral edge, the glyph in its own colour and plain text (owner, 8 Nov
 * 2026: the solid red and blue blocks and the coloured outlines looked forced;
 * the computer row should be as clean as the phone's icons). Colour lives in
 * the glyph only, so it still marks the place without shouting.
 */
export const PILL =
  "focus-ring items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-sm font-medium text-foreground/85 shadow-sm transition-colors hover:border-border hover:bg-accent hover:text-foreground";


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
/*
  On the phone every icon sits in ONE line, each an equal share of the width
  (owner, 8 Nov 2026) — small enough that a desk's six or seven fit across.
*/
function phoneColumns(count: number) {
  return Math.max(1, count);
}

/* The phone icon: a plain line drawing in the pill's own colour and nothing
   behind it — no square, no glow (owner, 8 Nov 2026, from Swift's phone). */
export const GLYPH: Record<NonNullable<ActionPill["tone"]>, string> = {
  brand: "text-brand",
  signal: "text-signal",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  violet: "text-chart-6",
};

/** The phone tile's frame. Shared with the actions that sit in the same row:
    each takes an equal share of the row (`--cols`, set on the row). */
export const PHONE_TILE =
  "focus-ring flex min-w-0 basis-[calc(100%/var(--cols))] flex-col items-center gap-1.5 rounded-xl px-0.5 py-1.5 text-center transition-transform active:scale-95 active:bg-foreground/5 sm:hidden";

/** The inside of a phone tile: the line icon and one word under it. */
export function PhoneTileFace({
  icon: Icon,
  label,
  tone = "brand",
}: {
  icon: LucideIcon;
  label: string;
  tone?: NonNullable<ActionPill["tone"]>;
}) {
  return (
    <>
      <Icon className={`h-6 w-6 ${GLYPH[tone]}`} strokeWidth={1.6} />
      <span className="w-full truncate text-[11px] leading-tight text-foreground/80">
        {label}
      </span>
    </>
  );
}

export function ActionPills({
  items,
  after,
  afterHref,
  afterTiles = 0,
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
  /** How many tiles `after` draws on a phone, so the rows can be counted. */
  afterTiles?: number;
  label?: string;
}) {
  if (items.length === 0) return null;
  const tiles = items.length + (after ? afterTiles : 0);

  return (
    <nav
      aria-label={label}
      /* On a phone, one line of icons in equal shares of the row — one glyph,
         one word, every tile the same width. As pills they wrapped by their
         own width into a staircase with an orphan on the last line. From sm
         up they are the pills they always were. */
      className="flex flex-nowrap justify-center sm:flex-wrap sm:justify-start sm:gap-2"
      style={{ "--cols": phoneColumns(tiles) } as React.CSSProperties}
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
        <Link href={item.href} aria-label={item.label} title={item.label} className={PHONE_TILE}>
          <PhoneTileFace icon={item.icon} label={item.short ?? item.label} tone={item.tone ?? "brand"} />
        </Link>
        <Link
          href={item.href}
          className={`hidden sm:inline-flex ${PILL}`}
        >
          <item.icon className={`h-4 w-4 ${GLYPH[item.tone ?? "brand"]}`} strokeWidth={1.75} />
          {item.label}
        </Link>
        {/* The actions draw their own phone tile (their `phoneTile` prop), so
            they sit in the grid like any other icon; inline pills from sm up. */}
        {after && afterHref === item.href ? <div className="contents">{after}</div> : null}
        </Fragment>
      ))}
      {/* Unmatched href, or none given: the action still belongs in the row. */}
      {after && !items.some((i) => i.href === afterHref) ? <div className="contents">{after}</div> : null}
    </nav>
  );
}
