import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { formatShillings } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * How the business is doing, in one panel, with one figure leading.
 *
 * THE BOTTOM LINE IS THE ONLY LARGE THING HERE. Revenue, collected, outstanding
 * and costs are what it is made of, and they sit beneath it at a quarter the
 * size — because a manager opening this screen is asking one question and the
 * other four are the working. A row of five equal figures makes the reader do
 * the arithmetic to find out which matters, and most readers do not.
 *
 * NO PERCENTAGE ON THE BOTTOM LINE. Profit can be negative, and a loss deepening
 * from one million to two comes out of a percentage as "down 100%", which reads
 * as improvement. The direction is carried by the words and by the colour, and
 * the previous period is restated as what it actually was.
 *
 * These five figures appear NOWHERE else on the page. That is the rule the old
 * dashboard broke five times over.
 */
export function ManagerHero({
  locale,
  rate,
  periodLabel,
  revenueUsd,
  collectedUsd,
  expensesUsd,
  profitUsd,
  marginPct,
}: {
  locale: Locale;
  rate: number | null;
  periodLabel: string;
  revenueUsd: number;
  collectedUsd: number;
  expensesUsd: number;
  profitUsd: number;
  marginPct: number | null;
}) {
  const money = (usd: number) => formatShillings(usd, rate);
  const profitable = profitUsd >= 0;
  const nothingYet = revenueUsd === 0 && expensesUsd === 0;

  /*
    THREE SUPPORTING FIGURES, NOT FOUR, and the one that went is the interesting
    story.

    "Outstanding" was here and is now only in the money band, for two reasons.
    It is a BALANCE — every unpaid bill the company has ever raised — sitting in
    a panel whose every other figure is scoped to one month, so the four did not
    add up to the one above them. And the money band already prints it as
    Receivables, which made it the same figure twice on one screen: the precise
    thing this redesign exists to stop.

    On the current data the two also happened to be numerically identical, which
    is what made it visible. That was a coincidence of a young dataset, not a
    relationship — but a reader cannot tell those apart, and would have been
    right to distrust the panel.
  */
  const supporting = [
    { label: "Revenue", value: money(revenueUsd), hint: "billed and confirmed", href: "/app/finance/reports" },
    { label: "Collected", value: money(collectedUsd), hint: "actually in the account", href: "/app/collections/follow-up" },
    { label: "Expenses", value: money(expensesUsd), hint: "operating costs", href: "/app/finance/expenses" },
  ];

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border bg-card">
      <div className="grid gap-px bg-border sm:grid-cols-4">
        {/* The bottom line, on its own ground, taking two of five columns. */}
        <div className="relative bg-card p-5">
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent",
              nothingYet
                ? "from-muted-foreground/[0.06]"
                : profitable
                  ? "from-success/[0.14]"
                  : "from-destructive/[0.14]"
            )}
          />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {periodLabel}
            </p>
            {nothingYet ? (
              <>
                <p className="mt-2 font-display text-[22px] font-bold leading-none sm:text-[28px]">
                  {t(locale, "No data available")}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(locale, "Nothing has been billed or spent in this period yet.")}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                  {profitable ? (
                    <TrendingUp className="h-4 w-4 text-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
                  {t(locale, profitable ? "Net profit" : "Net loss")}
                </p>
                <p
                  className={cn(
                    /* Responsive, because a nine-figure shilling total at 38px runs off a
                     390px phone — measured, it overflowed the viewport. The
                     figure still dominates its panel at 26px; dominance is
                     relative to what is around it, not an absolute size. */
                  "mt-1 font-display text-[26px] font-bold leading-none tracking-tight tabular-nums sm:text-[34px]",
                    profitable ? "text-success" : "text-destructive"
                  )}
                >
                  {money(Math.abs(profitUsd))}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {marginPct === null
                    ? t(locale, "Nothing billed yet, so there is no margin to state.")
                    : profitable
                      ? `${Math.round(marginPct)}% ${t(locale, "of everything billed survives its costs")}`
                      : t(locale, "Costs came in above everything billed.")}
                </p>
              </>
            )}
          </div>
        </div>

        {/* The four it is made of — same size as each other, a quarter of it. */}
        {supporting.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="focus-ring group bg-card p-4 transition-colors hover:bg-accent/40"
          >
            <p className="text-[11px] font-medium text-muted-foreground">
              {t(locale, s.label)}
            </p>
            <p
              className="mt-1 font-display text-[17px] font-bold leading-tight tabular-nums"
            >
              {s.value}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              {t(locale, s.hint)}
              <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
