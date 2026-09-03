import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Sparkline } from "@/components/charts/sparkline";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

type Tone = "default" | "good" | "warn" | "bad" | "brand";

/** The figure itself. Colour carries meaning, so it is used sparingly. */
const VALUE_TONES: Record<Tone, string> = {
  default: "text-foreground",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
  brand: "text-brand",
};

/**
 * A wash of the tone's own colour across the card.
 *
 * Faint on purpose — it tints the card rather than colouring it, so a row of
 * four still reads as one row and the figures keep their contrast against it.
 */
const WASHES: Record<Tone, string> = {
  default: "from-muted-foreground/[0.07]",
  good: "from-success/[0.12]",
  warn: "from-warning/[0.14]",
  bad: "from-destructive/[0.12]",
  brand: "from-brand/[0.12]",
};

/** Icon chips, matching KpiCard so the two read as one family. */
const ICON_TONES: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  good: "bg-success/10 text-success",
  warn: "bg-warning/10 text-warning",
  bad: "bg-destructive/10 text-destructive",
  brand: "bg-brand/10 text-brand",
};

/**
 * A money figure, in the currency people actually pay in, and the currency the
 * bill is written in.
 *
 * SHILLINGS LEAD. This is a Tanzanian business: customers hand over shillings,
 * the desk counts shillings, and the question "have we got the money" is asked
 * in shillings. The rate book and the invoice are in dollars because that is
 * how freight is priced, so the dollar figure stays — smaller, underneath, for
 * matching against the bill the customer was sent.
 *
 * This is deliberately the reverse of where the component started. Leading in
 * dollars meant everyone reading the page had to convert in their head, at
 * whatever rate they remembered, to answer a question about their own till.
 */
export async function MoneyTile({
  label,
  usd,
  local,
  rate,
  hint,
  icon: Icon,
  tone = "default",
  href,
  count,
  emphasis = false,
  trend,
}: {
  label: string;
  usd: number;
  /**
   * The figure already added up AS SHILLINGS, when the caller has it.
   *
   * `usd * rate` is only honest when the dollar figure is the real one. It is
   * not for money typed in shillings: a cost of TSh 20,000 is stored as USD
   * 7.41 — Decimal(12,2), the eighth of a cent gone — and multiplying that
   * back prints TSh 20,007, a figure nobody typed. The error is per row, so
   * the busiest month is furthest out. Callers that total native shilling
   * rows pass this; the dollar figure stays for the tooltip and for when no
   * rate is published. See lib/money-totals.ts.
   */
  local?: number;
  /** Live USD→TZS rate. Null when none is published — then no conversion shows. */
  rate: number | null;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
  /** e.g. "84 consignments" — what the figure is made of. */
  count?: string;
  /** Ring the card. For the one tile on a row that is a queue, not a fact. */
  emphasis?: boolean;
  /**
   * The shape behind the figure, when there is one.
   *
   * Added so a money figure does not have to give up its trend line to lead in
   * shillings — the revenue tile was a KpiCard purely because this was missing,
   * and it was the one money card on the page still reading in dollars.
   */
  trend?: number[];
}) {
  const locale = await viewerLocale();
  /* Digits, not dollars: the shilling figure is what has to fit. */
  const figure = rate
    ? Math.round(local ?? usd * rate).toLocaleString("en-US")
    : "";
  /*
    Sized against the card it is standing in, not against a breakpoint.

    Stepping the size down by digit count alone fixed the laptop and left the
    phone clipped: this row is five across on a desktop, three on a tablet and
    two on a phone, so the same fourteen characters get 200px in one place and
    139px in another. A rule written in pixels cannot know which.

    100cqi is the width of this card's content box, so the figure divides the
    space it actually has. The divisor is the figure's own width in ems — a
    tabular digit is about 0.6em, and "TSh " with its margin is about 1.8 —
    which makes the result the largest size that still fits, capped at the 30px
    the design asks for when there is room.
  */
  const fitFigure = `min(30px, calc(100cqi / ${(0.6 * figure.length + 1.8).toFixed(2)}))`;

  const body = (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-4 transition-all [container-type:inline-size]",
        emphasis && "ring-1 ring-warning/30",
        href && "hover:border-foreground/20 hover:shadow-lift"
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent",
          WASHES[tone]
        )}
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">
          {t(locale, label)}
        </p>
        {Icon ? (
          <span
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              ICON_TONES[tone]
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>

      {/*
        THE FIGURE IS SIZED BY ITS OWN LENGTH.

        Five of these tiles share a row, so each one is about 200px wide on a
        laptop — and "TSh 38,486,610" at 30px needs more than that. It did not
        wrap, it did not shrink: it ran out through the right-hand edge of the
        card and the last digit was simply gone, which on a receivables figure
        is not a cosmetic fault. The owner caught it in a screenshot.

        Shillings run long by nature — a million-dollar business prints ten
        digits here — so the size steps down as the digits pile up rather than
        being tuned to whatever the balance happens to be today. Measured on the
        narrowest column this row produces, at the widest figure the business
        can currently print.
      */}
      <p
        className={cn(
          "relative mt-3 font-display font-bold leading-none tracking-tight tabular-nums",
          VALUE_TONES[tone]
        )}
        style={rate ? { fontSize: fitFigure } : undefined}
      >
        {rate ? (
          <>
            {/* Half the size of the figure and in its colour, not muted grey.
                This is a Tanzanian business — the unit is not a footnote to the
                number, it is half of what the number means, and at 15px in
                muted grey it read as a label somebody had switched off. */}
            {/* In ems, so the unit rides the figure down instead of having to
                be stepped separately. */}
            <span className="mr-1 text-[0.63em] font-bold opacity-80">TSh</span>
            {figure}
          </>
        ) : (
          formatUsd(usd)
        )}
      </p>

      {/* The dollar figure underneath: what the invoice says, for matching
          against the bill the customer was sent. Present, deliberately
          secondary. */}
      {rate ? (
        <div className="relative mt-2.5 flex items-baseline gap-1.5 rounded-lg bg-background/70 px-2.5 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(locale, "on the invoice")}
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
            {formatUsd(usd)}
          </span>
        </div>
      ) : null}

      {trend && trend.length > 1 ? (
        <div className="relative mt-2.5">
          <Sparkline
            values={trend}
            tone={5}
            label={t(locale, "Trend")}
            className="w-full"
          />
        </div>
      ) : null}

      <div className="relative mt-auto pt-2.5">
        {count ? <p className="text-xs font-semibold">{count}</p> : null}
        {hint ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {t(locale, hint)}
          </p>
        ) : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="focus-ring block h-full rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
