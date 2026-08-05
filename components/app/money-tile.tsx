import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { formatUsd } from "@/lib/fx";
import { cn } from "@/lib/utils";

type Tone = "default" | "good" | "warn" | "bad" | "brand";

/** The figure itself. Colour carries meaning, so it is used sparingly. */
const VALUE_TONES: Record<Tone, string> = {
  default: "text-foreground",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
  brand: "text-brand",
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
 * A money figure, in the currency it is priced in AND the currency it is paid in.
 *
 * This business quotes in dollars because the rate book is in dollars, and is
 * paid in shillings because that is what customers have. Both belong on screen:
 * showing one alone means somebody at the counter converts in their head, at
 * whatever rate they remember, while a customer waits.
 *
 * The shilling line is given real weight — its own inset strip, foreground
 * colour, tabular figures at readable size. It began life as small grey text
 * under the dollar figure and was, in the owner's words, not visible. Grey on
 * dark is where a number goes to be ignored, and this is the number the person
 * actually handing money over is thinking in.
 *
 * The dollar figure still leads, because it is what settles the bill. The
 * shilling figure is explicitly marked as a conversion, because it moves when
 * the rate moves and must never be mistaken for the amount owed.
 */
export function MoneyTile({
  label,
  usd,
  rate,
  hint,
  icon: Icon,
  tone = "default",
  href,
  count,
  emphasis = false,
}: {
  label: string;
  usd: number;
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
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card p-4 transition-all",
        emphasis && "ring-1 ring-warning/30",
        href && "hover:border-foreground/20 hover:shadow-lift"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
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

      <p
        className={cn(
          "mt-3 font-display text-[26px] font-bold leading-none tracking-tight tabular-nums",
          VALUE_TONES[tone]
        )}
      >
        {formatUsd(usd)}
      </p>

      {/* The same money, said in the currency it will be handed over in.
          Its own strip so it reads as a companion figure rather than a caption,
          and at full foreground contrast so it survives a dark screen. */}
      {rate ? (
        <div className="mt-2.5 flex items-baseline gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            TZS
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {Math.round(usd * rate).toLocaleString("en-US")}
          </span>
        </div>
      ) : null}

      <div className="mt-auto pt-2.5">
        {count ? <p className="text-xs font-semibold">{count}</p> : null}
        {hint ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {hint}
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
