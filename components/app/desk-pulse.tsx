import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import type { DeskPulse } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Written out in full — Tailwind scans source text, so `text-${tone}` is a
 * class that never exists and the figure would render with no colour at all.
 */
const VALUE: Record<DeskPulse["tone"], string> = {
  brand: "text-brand",
  signal: "text-signal",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
};

const RULE: Record<DeskPulse["tone"], string> = {
  brand: "bg-brand",
  signal: "bg-signal",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
};

/**
 * Every desk in the business, side by side.
 *
 * The one panel that belongs only to the owner. Each department already has a
 * page answering "how am I doing", and not one of them answers "which of my
 * four desks needs me this morning" — four dashboards cannot be compared by
 * opening them one at a time.
 *
 * So each row carries a headline figure, a fact for context, and the problem on
 * that desk. The problem is the reason the row is worth reading: a number tells
 * you a desk is busy, and only the line under it tells you whether busy is
 * fine. A desk with nothing wrong says so in as many words, because "no news"
 * and "I forgot to look" must not render the same.
 */
export function DeskPulsePanel({
  desks,
  locale = "en",
}: {
  desks: DeskPulse[];
  /** Every other string on these cards arrives already translated from
      deskPulse(). This one is written here, so it needs the locale itself. */
  locale?: Locale;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {desks.map((desk) => (
        <Link
          key={desk.key}
          href={desk.href}
          className="focus-ring group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20"
        >
          {/* A rule in the desk's colour, so four cards read as four places
              rather than one grid of numbers. */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-0.5",
              RULE[desk.tone]
            )}
          />

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {desk.desk}
            </p>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>

          <p className="mt-2 flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-display text-[26px] font-bold leading-none tabular-nums",
                VALUE[desk.tone]
              )}
            >
              {desk.headline}
            </span>
            <span className="text-xs text-muted-foreground">
              {desk.headlineLabel}
            </span>
          </p>

          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {desk.detail}
          </p>

          {/* The line that decides whether the number above matters. */}
          <p
            className={cn(
              "mt-2.5 flex items-center gap-1.5 border-t pt-2.5 text-xs font-medium",
              desk.problem ? VALUE[desk.tone] : "text-muted-foreground"
            )}
          >
            {desk.problem ? (
              desk.problem
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-success" />
                {t(locale, "nothing wrong here")}
              </>
            )}
          </p>
        </Link>
      ))}
    </div>
  );
}
