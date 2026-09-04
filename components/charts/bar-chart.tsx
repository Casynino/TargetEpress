import { cn } from "@/lib/utils";

/**
 * Grouped/simple bar chart, server-rendered.
 *
 * Bars grow in with a staggered CSS transform so a dashboard feels alive on
 * first paint without shipping any JavaScript for it.
 */
export function BarChart({
  data,
  height = 200,
  tone = 2,
  highlightIndex,
  formatValue = (n: number) => n.toLocaleString(),
  className,
}: {
  data: { label: string; value: number }[];
  height?: number;
  tone?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Draws attention to one bar (e.g. the current month). */
  highlightIndex?: number;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex items-end justify-between gap-1.5"
        style={{ height }}
        role="img"
        aria-label={data
          .map((d) => `${d.label}: ${formatValue(d.value)}`)
          .join(", ")}
      >
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          const highlighted = highlightIndex === i;
          return (
            <div
              key={`${d.label}-${i}`}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              {/* Value on hover — keeps the chart clean until asked. */}
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-md border bg-popover px-1.5 py-0.5 font-mono text-xs tabular opacity-0 shadow-soft transition-opacity group-hover:opacity-100">
                {formatValue(d.value)}
              </span>
              <div
                className={cn(
                  "w-full origin-bottom rounded-t-[3px] transition-all duration-500 ease-out-expo",
                  highlighted ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                )}
                style={{
                  height: `${Math.max(2, pct)}%`,
                  background: highlighted
                    ? `hsl(var(--chart-${tone}))`
                    : `linear-gradient(to top, hsl(var(--chart-${tone}) / 0.85), hsl(var(--chart-${tone}) / 0.35))`,
                  animationDelay: `${i * 40}ms`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between gap-1.5 text-xs text-muted-foreground">
        {data.map((d, i) => (
          <span
            key={`${d.label}-label-${i}`}
            className={cn(
              /* min-w-0 because flex-1 leaves min-width:auto, so twelve month
                 labels refuse to shrink below their own text and push the
                 whole page sideways on a phone. flow-bars does the same. */
              "min-w-0 flex-1 truncate text-center tabular",
              highlightIndex === i && "font-semibold text-foreground"
            )}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
