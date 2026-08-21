import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { areaPath, clampPct, ringGeometry, scalePoints, smoothPath } from "@/lib/chart";
import { Ring } from "@/components/charts/ring";
import { cn } from "@/lib/utils";

/**
 * The manager's command centre, as furniture.
 *
 * WHY THIS FILE EXISTS. The manager's screen was a flat grid of identical small
 * tiles — twenty-five numbers at the same size, in the same box, in the same
 * colour, which is a data dump rather than a dashboard. The eye needs a route
 * through a screen, and a route is made of things that are DIFFERENT sizes: one
 * figure that owns the page, a chart beside it, three supporting cells, a rail.
 * That is a bento grid, and these are its pieces.
 *
 * SERVER-ONLY, all of it. Every piece here is a plain function returning markup
 * — no state, no effects, no client boundary — so the whole command centre ships
 * as HTML and the charts are painted before the browser has parsed a line of
 * JavaScript. The one interactive thing on the page (the attention panel's
 * filter pills) is somebody else's component.
 *
 * IT SPEAKS NO ENGLISH. Every string arrives already translated — through
 * `t(locale, …)` at the call site — because a component cannot know which
 * dictionary the reader wants without becoming async, and half of these sit
 * inside a grid where an async leaf would stall the whole row.
 *
 * THE PALETTE IS THE APP'S. brand, signal, success, warning, info, gold and the
 * six chart tokens, and nothing else: a screen that invents its own colours
 * stops being part of the product. Gold is the finish — it appears on the ink
 * panel and as hairlines, never as body text on a light surface, where it does
 * not clear 4.5:1.
 */

// ---------------------------------------------------------------------------
// The grid furniture
// ---------------------------------------------------------------------------

/**
 * The rule above a band of the bento.
 *
 * A gold hairline rather than a heavier heading: this screen is six bands deep,
 * and six full-weight titles would out-shout the figures they introduce. The
 * hairline is decoration and carries no meaning, so its contrast is not load
 * bearing — the words beside it are ordinary muted-foreground, which is.
 */
export function BandHeading({
  title,
  hint,
  action,
}: {
  title: string;
  /** One line saying what the band is for. Optional. */
  hint?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <span
          aria-hidden
          className="mb-2 block h-[2px] w-10 rounded-full bg-gradient-to-r from-gold to-transparent"
        />
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h2>
        {hint ? (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-xs font-semibold text-brand hover:underline"
        >
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Three surfaces, and no fourth.
 *
 * `ink` is the deep navy the public site's heroes sit on — the same colour in
 * both themes, like a printed cover — and it is what makes one cell in a band
 * read as the headline instead of as another card. It is used ONCE per screen.
 * Use it twice and there is no headline again.
 */
const CARD_TONES = {
  card: "border bg-card",
  quiet: "border bg-muted/30",
  ink: "border-white/10 bg-[hsl(var(--ink))] text-white",
} as const;

/**
 * A CARD THAT WEARS THE COLOUR OF WHAT IT SAYS.
 *
 * The owner: "i wat you to color this cards and make them look more fancy and
 * cooler". A flat card with one coloured number on it was doing the whole job
 * with a freckle. Each accent lays a wash from the top corner the icon sits in,
 * tints the hairline border to match, and lights that edge when the card is
 * hovered — so weight on the floor reads blue, money not collected reads amber,
 * and the eye sorts them before it reads a word.
 *
 * Written out in full because Tailwind scans source text: `from-${tone}/10` is
 * a class that never exists. The wash is deliberately shallow (10–12%): the
 * figure on top of it still has to be the brightest thing on the card.
 */
const CARD_ACCENTS = {
  brand:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-brand/60 before:to-transparent before:content-[''] border border-brand/25 bg-gradient-to-br from-brand/[0.13] via-card to-card hover:border-brand/45 hover:shadow-[0_18px_44px_-26px_hsl(var(--brand)/0.65)]",
  good:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-success/60 before:to-transparent before:content-[''] border border-success/25 bg-gradient-to-br from-success/[0.13] via-card to-card hover:border-success/45 hover:shadow-[0_18px_44px_-26px_hsl(var(--success)/0.65)]",
  warn:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-warning/60 before:to-transparent before:content-[''] border border-warning/25 bg-gradient-to-br from-warning/[0.13] via-card to-card hover:border-warning/45 hover:shadow-[0_18px_44px_-26px_hsl(var(--warning)/0.65)]",
  bad:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-destructive/60 before:to-transparent before:content-[''] border border-destructive/25 bg-gradient-to-br from-destructive/[0.13] via-card to-card hover:border-destructive/45 hover:shadow-[0_18px_44px_-26px_hsl(var(--destructive)/0.65)]",
  info:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-info/60 before:to-transparent before:content-[''] border border-info/25 bg-gradient-to-br from-info/[0.13] via-card to-card hover:border-info/45 hover:shadow-[0_18px_44px_-26px_hsl(var(--info)/0.65)]",
} as const;

export type CardAccent = keyof typeof CARD_ACCENTS;

/**
 * One cell of the bento.
 *
 * The span classes are the caller's business — a cell does not know whether it
 * is the 2×2 hero or a 1×1 in the corner — so they arrive through `className`
 * and land on the outer element, which is the grid item whether or not the cell
 * is a link.
 *
 * Motion: a link cell lifts about 1.5% under the cursor with the shadow opening
 * behind it, over 200ms. Cells that go nowhere do not move, because a thing that
 * animates under the pointer and then does nothing when pressed is a lie about
 * what it is. Anyone who has asked their system for stillness gets none of it.
 */
export function BentoCard({
  href,
  tone = "card",
  /** Dress the card in the colour of the figure it carries. */
  accent,
  className,
  children,
}: {
  href?: string;
  tone?: keyof typeof CARD_TONES;
  accent?: CardAccent;
  className?: string;
  children: React.ReactNode;
}) {
  const shell = cn(
    "group relative flex flex-col overflow-hidden rounded-xl p-3 shadow-soft transition-[transform,box-shadow,border-color] duration-200 ease-out-expo",
    accent ? CARD_ACCENTS[accent] : CARD_TONES[tone],
    href &&
      "hover:scale-[1.015] hover:shadow-lift motion-reduce:hover:scale-100",
    className
  );

  return href ? (
    <Link href={href} className={cn("focus-ring", shell)}>
      {children}
    </Link>
  ) : (
    <div className={shell}>{children}</div>
  );
}

/** The figure itself. Colour carries meaning here, so it is spent carefully. */
const FIGURE_TONES = {
  plain: "text-foreground",
  brand: "text-brand",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
  info: "text-info",
} as const;

const CHIP_TONES = {
  plain: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  brand: "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30",
  good: "bg-success/15 text-success ring-1 ring-inset ring-success/30",
  warn: "bg-warning/15 text-warning ring-1 ring-inset ring-warning/30",
  bad: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30",
  info: "bg-info/15 text-info ring-1 ring-inset ring-info/30",
} as const;

/** The same colours as a background wash, for a cell inside a card. */
const STAGE_TINTS = {
  plain: "border-border bg-muted/25",
  brand: "border-brand/25 bg-brand/[0.07]",
  good: "border-success/25 bg-success/[0.07]",
  warn: "border-warning/25 bg-warning/[0.07]",
  bad: "border-destructive/25 bg-destructive/[0.07]",
  info: "border-info/25 bg-info/[0.07]",
} as const;

export type FigureTone = keyof typeof FIGURE_TONES;

/**
 * A labelled number inside a cell.
 *
 * Deliberately larger than the tile this page used to be built from. A figure
 * set at 15px in a grid of forty others is a table cell; a manager reads a
 * dashboard by picking the big things out of it first, and nothing on the old
 * screen was big.
 */
export function Figure({
  label,
  value,
  hint,
  icon: Icon,
  tone = "plain",
  size = "md",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: FigureTone;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    /* No height of its own. A cell that wants the hint pinned to its foot passes
       `flex-1`; a cell that stacks something underneath the figure does not, and
       a hard-coded h-full here would have pushed that something off the card. */
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              CHIP_TONES[tone]
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-3 font-display font-bold leading-none tracking-tight tabular-nums",
          size === "lg" ? "text-[34px]" : "text-[26px]",
          FIGURE_TONES[tone]
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-auto pt-2.5 text-xs leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The ink panel — margin ring and the revenue/cost split
// ---------------------------------------------------------------------------

/**
 * The month's margin, drawn in gold on the ink panel.
 *
 * Its own ring rather than the shared <Ring>: that one draws its track with
 * `stroke-muted`, which is a near-black in the dark theme and disappears
 * entirely against this panel. The colours here are fixed to the panel, because
 * the panel is fixed in both themes.
 *
 * A ring only when there IS a margin. A month that has billed nothing has no
 * margin, and a month whose costs came in above its revenue has a negative one —
 * neither is an arc, and drawing a 0% ring for either would state something
 * false in the one place on the page nobody double-checks.
 */
export function MarginRing({
  pct,
  label,
  caption,
}: {
  pct: number;
  label: string;
  caption: string;
}) {
  const size = 74;
  const stroke = 7;
  const { radius, circumference, center } = ringGeometry(size, stroke);
  const value = clampPct(pct);
  const offset = circumference * (1 - value / 100);

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${label}: ${Math.round(value)}%`}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            stroke="hsl(0 0% 100% / 0.14)"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke="hsl(var(--gold))"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="animate-draw-in"
            style={{ ["--dash" as string]: circumference }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-base font-bold tabular-nums text-white">
          {Math.round(value)}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-white">{label}</p>
        <p className="mt-0.5 text-xs leading-snug text-white/65">{caption}</p>
      </div>
    </div>
  );
}

/** One real company account, as the rail draws it. */
export type AccountRow = {
  key: string;
  name: string;
  /** Translated: "Bank", "Mobile money", "Cash". */
  kind: string;
  /** The dot and the bar, when the balance is positive. */
  colour: string;
  /** Formatted in the account's OWN currency — never restated in shillings. */
  display: string;
  /** Signed, for the bar's length and for which way it points. */
  value: number;
  /** "checked 3 days ago", "never checked". */
  meta: string;
  /** Short shout on the row: overdrawn, or checked before it last moved. */
  flag?: string;
  href?: string;
};

/**
 * Every company account by name, by size, and by whether anyone has looked.
 *
 * WHAT IT REPLACED, AND WHY. This band used to be three rows — bank, mobile
 * money, cash — over a share bar, and the owner's verdict was "we have too much
 * info for you to be this basic". He was right twice over. The business runs
 * six accounts; grouping them into three kinds threw away which bank, and the
 * one question this card exists to raise is "which account is wrong", not "how
 * much is in banks generally".
 *
 * THE BARS ARE MAGNITUDE, NOT SHARE. The old bar divided a total, so a negative
 * balance had to be clamped to zero to keep the sum honest — which printed the
 * bank at TSh -9,505,180 as "0%" and TSh 20,000 of mobile money as "100%" of
 * the company's money, above a total of minus ten million. A share is a portion
 * of something that exists and a debt is the other direction, so nothing here
 * is a percentage: each bar is that account against the largest one on the
 * list, and red means it is below zero. It reads the same whether the business
 * is flush or overdrawn.
 *
 * THE SECOND LINE IS THE MANAGER'S ACTUAL JOB. A balance nobody has reconciled
 * is a claim the system makes about itself; when it was last checked against a
 * statement is what tells you whether to believe it.
 */
export function AccountRail({
  rows,
  empty,
  className,
}: {
  rows: AccountRow[];
  /** Said when there are no accounts at all. */
  empty: string;
  className?: string;
}) {
  /* Against the biggest balance either way, so an overdraft is drawn at the
     size it actually is rather than squashed against the credits. */
  const widest = Math.max(1, ...rows.map((row) => Math.abs(row.value)));

  if (rows.length === 0) {
    return (
      <p className={cn("text-xs leading-snug text-muted-foreground", className)}>
        {empty}
      </p>
    );
  }

  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((row) => {
        const negative = row.value < 0;
        /* An empty account draws nothing. The floor exists so a real but tiny
           balance is still visible beside a large one; applying it to zero drew
           a stub on six accounts holding nothing, which reads as "a little". */
        const width =
          row.value === 0
            ? "0%"
            : `${Math.max(2, (Math.abs(row.value) / widest) * 100)}%`;
        const body = (
          <>
            <div className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 translate-y-[1px] rounded-full"
                style={{ background: negative ? "hsl(var(--destructive))" : row.colour }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {row.name}
              </span>
              {row.flag ? (
                <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                  {row.flag}
                </span>
              ) : null}
              <span
                className={cn(
                  "shrink-0 font-mono text-xs font-semibold tabular-nums",
                  negative ? "text-destructive" : "text-foreground"
                )}
              >
                {row.display}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 pl-4">
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  aria-hidden
                  className="block h-full rounded-full"
                  style={{
                    width,
                    background: negative ? "hsl(var(--destructive))" : row.colour,
                  }}
                />
              </span>
              <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                {row.kind} · {row.meta}
              </span>
            </div>
          </>
        );

        return (
          <li key={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className="focus-ring block rounded-lg px-1.5 py-1 -mx-1.5 transition-colors hover:bg-muted/40"
              >
                {body}
              </Link>
            ) : (
              <div className="px-1.5 py-1 -mx-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One figure in a rail beside something bigger.
 *
 * Flat on purpose — it sits INSIDE a card, and a bordered box within a bordered
 * box is the "cards inside cards" look the owner has thrown out twice. The rule
 * it keeps is the one the ring cards already follow: if a ring draws the
 * percentage, the headline says what the percentage MEANS and never repeats it.
 */
export function RailStat({
  label,
  headline,
  hint,
  ringPct,
  ringLabel,
  tone = "brand",
  icon: Icon,
  href,
}: {
  label: string;
  headline: string;
  hint?: string;
  ringPct?: number;
  ringLabel?: string;
  tone?: "brand" | "info" | "success" | "warning";
  icon?: LucideIcon;
  href?: string;
}) {
  const HEADLINE: Record<string, string> = {
    brand: "text-foreground",
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
  };
  const CHIP: Record<string, string> = {
    brand: "bg-brand/10 text-brand",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  };

  const body = (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                CHIP[tone]
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
        <p
          className={cn(
            "mt-1.5 font-display text-[20px] font-bold leading-none tracking-tight tabular-nums",
            HEADLINE[tone]
          )}
        >
          {headline}
        </p>
        {hint ? (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      {ringPct !== undefined ? (
        <Ring value={ringPct} tone={tone} label={ringLabel ?? label} size={44} stroke={4}>
          {Math.round(ringPct)}%
        </Ring>
      ) : null}
    </div>
  );

  return href ? (
    <Link
      href={href}
      className="focus-ring block rounded-lg p-1.5 -m-1.5 transition-colors hover:bg-muted/40"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

// ---------------------------------------------------------------------------
// Where the cargo is
// ---------------------------------------------------------------------------

export type CorridorSegment = {
  key: string;
  label: string;
  count: number;
  /** chart-N token index. */
  tone: 1 | 2 | 3 | 4 | 5 | 6;
};

/**
 * Everything the business is carrying, as one bar from Guangzhou to the counter.
 *
 * SHARES, NOT COUNTS, and that is a decision rather than an omission. Three of
 * these five segments are the very same query the desk panel further down the
 * page prints as its headline — Guangzhou standing, the Dar floor, cleared and
 * waiting — and one number under two labels on one screen reads as a bug in the
 * number, not as emphasis. So this panel answers the question the desk cards
 * cannot ("what proportion of the business is sitting where") and leaves them
 * the counts, which is the reading each is actually good at.
 *
 * The total is printed once, here, because nothing else on the page states how
 * much cargo the company is carrying at all.
 */
export function CorridorBar({
  segments,
  total,
  totalLabel,
  caption,
  empty,
}: {
  segments: CorridorSegment[];
  total: number;
  totalLabel: string;
  caption: string;
  empty: string;
}) {
  if (total <= 0) {
    return (
      <p className="mt-4 text-sm leading-snug text-muted-foreground">{empty}</p>
    );
  }

  const shares = segments.map((segment) => (segment.count / total) * 100);

  return (
    <div className="mt-3 flex flex-1 flex-col">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[40px] font-bold leading-none tracking-tight tabular-nums">
          {total.toLocaleString("en-US")}
        </span>
        <span className="text-sm text-muted-foreground">{totalLabel}</span>
      </div>

      <div
        className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={segments
          .map((segment, index) => `${segment.label} ${Math.round(shares[index])}%`)
          .join(", ")}
      >
        {segments.map((segment, index) => (
          <span
            key={segment.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${shares[index]}%`,
              background: `hsl(var(--chart-${segment.tone}))`,
            }}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2.5">
        {segments.map((segment, index) => (
          <li key={segment.key} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: `hsl(var(--chart-${segment.tone}))` }}
            />
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {segment.label}
            </span>
            {/* A rail as well as a figure: five percentages in a column are
                compared by reading, and five bars are compared by looking. */}
            <span
              aria-hidden
              className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block"
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(shares[index], segment.count > 0 ? 3 : 0)}%`,
                  background: `hsl(var(--chart-${segment.tone}))`,
                }}
              />
            </span>
            <span className="w-9 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">
              {Math.round(shares[index])}%
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-auto pt-4 text-xs leading-snug text-muted-foreground">
        {caption}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money in and out
// ---------------------------------------------------------------------------

/**
 * What arrived against what it cost, month by month, drawn on the server.
 *
 * Hand-rolled from lib/chart rather than the dashboard's <AreaChart>, for a
 * reason that is not taste: that one is a client component with a hover readout,
 * and the readout formats its figures through a function prop — which a server
 * component cannot hand across the boundary. Passing raw dollars instead would
 * put unlabelled numbers in a tooltip on a screen where every other figure
 * leads in shillings. This draws the shape and states the two year totals in
 * words underneath, which is the reading anyway.
 *
 * Two series, never one. A month where everything that came in went straight
 * back out looks exactly like a quiet month on a single line, and those are the
 * two months a business most needs to tell apart.
 */
export function MoneyFlowChart({
  labels,
  moneyIn,
  moneyOut,
  currentIndex,
  title,
}: {
  labels: string[];
  moneyIn: number[];
  moneyOut: number[];
  /** Index of the month in progress, marked so it is not read as a fall. */
  currentIndex: number;
  /** Announced to a screen reader in place of the picture. */
  title: string;
}) {
  const W = 640;
  /* Taller than it was, because this is the band's hero cell now rather than a
     strip under one. A year of two series needs vertical room to separate them;
     at 150 the two lines sat almost on top of each other for the flat months. */
  /* 200, not 250. This chart sets the height of the card beside it, and at 250
     the profit panel had to stretch to match — opening a band of nothing under
     its margin ring. The shape of a year reads perfectly well at 200. */
  /* 170. This chart and the profit panel beside it set the tallest row on the
     page at 342px; the shape of a year is perfectly legible smaller, and the
     twenty pixels come off both cards at once. */
  const H = 170;
  const ceiling = Math.max(...moneyIn, ...moneyOut, 1);

  const inPoints = scalePoints(moneyIn, W, H, { min: 0, max: ceiling, padding: 8 });
  const outPoints = scalePoints(moneyOut, W, H, { min: 0, max: ceiling, padding: 8 });
  const step = labels.length > 1 ? W / (labels.length - 1) : W;

  return (
    <div className="mt-3 w-full flex-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[170px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={title}
      >
        <defs>
          <linearGradient id="mgr-flow-in" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-5))" stopOpacity="0.30" />
            <stop offset="100%" stopColor="hsl(var(--chart-5))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="mgr-flow-out" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            x1="0"
            y1={(H / 3) * line}
            x2={W}
            y2={(H / 3) * line}
            className="stroke-border"
            strokeWidth="1"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={areaPath(outPoints, H)} fill="url(#mgr-flow-out)" />
        <path d={areaPath(inPoints, H)} fill="url(#mgr-flow-in)" />
        <path
          d={smoothPath(outPoints)}
          fill="none"
          stroke="hsl(var(--chart-3))"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={smoothPath(inPoints)}
          fill="none"
          stroke="hsl(var(--chart-5))"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* The month in progress, marked. Without it the last point reads as a
            collapse rather than as a month that is only part way through. */}
        {currentIndex >= 0 && currentIndex < labels.length ? (
          <line
            x1={currentIndex * step}
            y1="0"
            x2={currentIndex * step}
            y2={H}
            className="stroke-foreground/25"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`} className="tabular-nums">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The corridor's flights
// ---------------------------------------------------------------------------

export type Stage = {
  key: string;
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  href: string;
  tone: FigureTone;
};

/**
 * Guangzhou, the air, the ground — the three states a flight is in, in order.
 *
 * Drawn as a run rather than as three cards, because the order is the
 * information: cargo moves left to right through exactly these stages, and a
 * pile-up at one of them is the thing worth noticing. Three equal tiles say
 * nothing about which way the business flows.
 */
export function PipelineStrip({ stages }: { stages: Stage[] }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        return (
          <Link
            key={stage.key}
            href={stage.href}
            className={cn(
              "focus-ring relative flex flex-col justify-center rounded-lg border p-3 transition-colors",
              STAGE_TINTS[stage.tone],
              // The chevron between stages, on the wider layouts only. Sized to
              // sit inside the 8px gap (`gap-2`) rather than over the next card.
              index < stages.length - 1 &&
                "sm:after:absolute sm:after:-right-2 sm:after:top-1/2 sm:after:z-10 sm:after:h-2 sm:after:w-2 sm:after:-translate-y-1/2 sm:after:rotate-45 sm:after:border-r sm:after:border-t sm:after:border-border sm:after:bg-card sm:after:content-['']"
            )}
          >
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md",
                CHIP_TONES[stage.tone]
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <p
              className={cn(
                "mt-2 font-display text-[22px] font-bold leading-none tabular-nums",
                FIGURE_TONES[stage.tone]
              )}
            >
              {stage.value}
            </p>
            <p className="mt-1 text-[13px] font-medium leading-tight">
              {stage.label}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {stage.hint}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The decision queues
// ---------------------------------------------------------------------------

export type QueueLine = {
  key: string;
  label: string;
  /** The count, already written out. */
  value: string;
  /** The age, or what the empty queue means. Never a bare zero. */
  note: string;
  href: string;
  tone: FigureTone;
  icon: LucideIcon;
};

/**
 * What is standing still until this desk decides something.
 *
 * The AGE beside the count, always. Any one of these queues looks like a to-do
 * list on its own screen; it is only next to the age of its oldest item that
 * "eleven payments" becomes "eleven payments, the oldest nine days", and nine
 * days is the finding.
 */
export function QueueList({ lines }: { lines: QueueLine[] }) {
  /*
    Tighter rows: gap-1.5 and py-2, not gap-2 and py-2.5.

    Three bordered boxes at the old spacing made this card 56px taller than the
    two stat cards beside it — the one uneven row left on the page. They still
    read as pressable; they just stop being three separate panels inside a panel.
  */
  return (
    <ul className="mt-2.5 flex flex-1 flex-col gap-1.5">
      {lines.map((line) => {
        const Icon = line.icon;
        return (
          <li key={line.key}>
            <Link
              href={line.href}
              className="focus-ring flex items-center gap-3 rounded-lg border bg-background/60 px-3 py-2 transition-colors hover:bg-muted/60"
            >
              <span
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  CHIP_TONES[line.tone]
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {line.label}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {line.note}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 font-display text-[22px] font-bold leading-none tabular-nums",
                  FIGURE_TONES[line.tone]
                )}
              >
                {line.value}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Small facts stacked inside a cell — the staff roster, the customer book.
 *
 * A row, not a tile: these are the supporting detail under a cell's own headline
 * figure, and giving each of them a card of its own is exactly how this screen
 * became a wall of equal numbers in the first place.
 */
export function StatRows({
  rows,
}: {
  rows: {
    key: string;
    label: string;
    value: string;
    tone?: FigureTone;
    href?: string;
  }[];
}) {
  return (
    <ul className="mt-3 divide-y">
      {rows.map((row) => {
        const body = (
          <span className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {row.label}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-sm font-semibold tabular-nums",
                FIGURE_TONES[row.tone ?? "plain"]
              )}
            >
              {row.value}
            </span>
          </span>
        );
        return (
          <li key={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className="focus-ring block rounded px-0.5 transition-colors hover:bg-muted/50"
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
