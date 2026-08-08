import { cn } from "@/lib/utils";

/**
 * Money in against money out, month by month, around a shared baseline.
 *
 * "Collections by month" answered "are we billing" and could never answer "are
 * we keeping any of it" — a month where 30m came in and 29m went straight back
 * out drew exactly like a good one. Those are the two months a business most
 * needs to tell apart, so both series are here and they grow away from a common
 * line: takings up, costs down.
 *
 * Both halves share one scale. Drawing each against its own maximum would make
 * a 200,000 cost stand as tall as a 25m month, which is the specific lie this
 * shape exists to avoid.
 *
 * The net figure is not drawn as a third bar. It is the difference between two
 * bars already on the screen, and a third mark for a quantity the eye can
 * already see is clutter — it appears on the month you are standing in, in
 * words, above the chart.
 *
 * Server-rendered divs: no SVG, no charting library, no JavaScript.
 */
export function FlowBars({
  labels,
  valuesIn,
  valuesOut,
  currentIndex,
  format,
  legendIn = "Money in",
  legendOut = "Money out",
  className,
}: {
  labels: string[];
  /** Grows up from the baseline. */
  valuesIn: number[];
  /** Grows down from it. */
  valuesOut: number[];
  /** Which column is the period we are in, so it can be marked. */
  currentIndex: number;
  /** How a value reads in a tooltip. Money on the ledger, boxes on the floor. */
  format: (value: number) => string;
  legendIn?: string;
  legendOut?: string;
  className?: string;
}) {
  // One scale for both directions, or the halves lie about each other.
  const peak = Math.max(...valuesIn, ...valuesOut, 1);

  return (
    <div className={className}>
      <div className="flex items-stretch gap-1.5">
        {labels.map((label, i) => {
          const current = i === currentIndex;
          const inPct = (valuesIn[i] / peak) * 100;
          const outPct = (valuesOut[i] / peak) * 100;

          return (
            <div key={label} className="flex min-w-0 flex-1 flex-col">
              {/* Takings, growing up from the line. */}
              <div className="flex h-20 items-end">
                <div
                  className={cn(
                    "w-full rounded-t-sm transition-[height]",
                    current ? "bg-success" : "bg-success/45"
                  )}
                  style={{ height: `${Math.max(inPct, valuesIn[i] > 0 ? 2 : 0)}%` }}
                  title={`${label} — ${format(valuesIn[i])} in`}
                />
              </div>

              <div className="h-px w-full bg-border" aria-hidden />

              {/* Costs, growing down from the same line. */}
              <div className="flex h-12 items-start">
                <div
                  className={cn(
                    "w-full rounded-b-sm transition-[height]",
                    current ? "bg-signal" : "bg-signal/45"
                  )}
                  style={{
                    height: `${Math.max(outPct, valuesOut[i] > 0 ? 2 : 0)}%`,
                  }}
                  title={`${label} — ${format(valuesOut[i])} out`}
                />
              </div>

              <span
                className={cn(
                  "mt-1.5 truncate text-center text-[10px] uppercase tracking-wide",
                  current
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
          {legendIn}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-signal" aria-hidden />
          {legendOut}
        </span>
        <span className="ml-auto">Both sides share one scale</span>
      </div>
    </div>
  );
}
