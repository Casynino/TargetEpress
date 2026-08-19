import { cn } from "@/lib/utils";

export type BarPoint = { label: string; value: number };

/**
 * A bar per item, and it has to read at three bars as well as at fourteen.
 *
 * IT DID NOT. The component was written for a fortnight of daily work — the
 * comment said "one bar a day" — so every bar took an equal share of the width
 * with flex-1. That is right for fourteen and grotesque for three: the batch
 * chart rendered as three flat slabs the width of a hand, with the tallest
 * jammed against the ceiling and no way to tell what any of them was.
 *
 * So the width of a bar is now capped rather than divided. Three bars sit at a
 * readable width with air around them; fourteen still fill the row because the
 * cap never binds. The same component, two honest shapes.
 *
 * FEW BARS GET THEIR NAMES AND THEIR FIGURES. With a handful of items every
 * label fits under its own bar and the value fits above it, which is the whole
 * chart — a reader should not have to hover a batch to learn what it carried.
 * Past about eight the labels collide, so only the ends are named and the
 * figures go back into the tooltip.
 *
 * Hand-drawn rather than pulled from a charting library: this is a dozen
 * rectangles, and the library that draws them costs more to ship than the page.
 */
export function ActivityBars({
  points,
  unit,
  className,
  /** How a value is written above its bar. Defaults to the plain number. */
  format,
}: {
  points: BarPoint[];
  /** Appended to the tooltip figure: "18 shipments". */
  unit: string;
  className?: string;
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  /* Few enough to name every one. Eight is where two-word batch codes start to
     touch on a laptop. */
  const sparse = points.length <= 8;
  const show = format ?? ((v: number) => v.toLocaleString("en-US"));

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "flex h-36 items-end gap-2",
          /* Left-aligned when there are few, so three bars do not float in the
             middle of a wide card pretending to be a distribution. */
          sparse ? "justify-start" : "justify-between"
        )}
      >
        {points.map((point, index) => {
          const height = (point.value / max) * 100;
          return (
            <div
              key={`${point.label}-${index}`}
              className={cn(
                "group relative flex h-full flex-1 flex-col justify-end",
                /* THE CAP. Without it three bars are a third of the card each. */
                sparse && "max-w-[5.5rem]"
              )}
              title={`${point.label}: ${show(point.value)} ${unit}`}
            >
              {sparse && point.value > 0 ? (
                <span className="mb-1 text-center text-[11px] font-semibold tabular-nums">
                  {show(point.value)}
                </span>
              ) : null}
              <div
                className={cn(
                  "w-full rounded-t-md transition-colors",
                  point.value > 0
                    ? "bg-brand/70 group-hover:bg-brand"
                    : "bg-muted"
                )}
                /* An empty item still gets a sliver, so the row reads as a row
                   of items rather than a row of gaps. */
                style={{
                  height:
                    point.value > 0 ? `${Math.max(height, 6)}%` : "3px",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* A baseline, so the bars stand on something rather than float. */}
      <div className="mt-px h-px w-full bg-border" />

      <div
        className={cn(
          "mt-2 flex text-[11px] text-muted-foreground",
          sparse ? "gap-2" : "justify-between"
        )}
      >
        {sparse ? (
          points.map((point, index) => (
            <span
              key={`${point.label}-label-${index}`}
              className="max-w-[5.5rem] flex-1 truncate text-center font-mono"
            >
              {point.label}
            </span>
          ))
        ) : (
          <>
            <span className="font-mono">{points[0]?.label}</span>
            <span className="font-mono">{points[points.length - 1]?.label}</span>
          </>
        )}
      </div>
    </div>
  );
}
