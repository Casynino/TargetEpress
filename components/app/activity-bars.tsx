import { cn } from "@/lib/utils";

export type BarPoint = { label: string; value: number };

/**
 * A fortnight of work, one bar a day.
 *
 * Hand-drawn in SVG rather than pulled from a charting library: this is a
 * dozen rectangles, and the library that draws them costs more to ship than
 * the whole page. It also means the empty days render as empty days instead of
 * disappearing, which is the point — a run of blanks is what a quiet week
 * actually looks like.
 */
export function ActivityBars({
  points,
  unit,
  className,
}: {
  points: BarPoint[];
  /** Appended to the tooltip figure: "18 shipments". */
  unit: string;
  className?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));

  return (
    <div className={cn("flex w-full flex-col", className)}>
      {/* min-h rather than a fixed h: on its own the chart is 128px tall, and
          inside a card that has been given more room it grows to fill it, so
          the bars beside a taller donut do not stop a third of the way up. */}
      <div className="flex min-h-32 flex-1 items-end gap-1">
        {points.map((point, index) => {
          const height = (point.value / max) * 100;
          return (
            <div
              key={`${point.label}-${index}`}
              className="group relative flex h-full flex-1 items-end"
              title={`${point.label}: ${point.value} ${unit}`}
            >
              <div
                className={cn(
                  "w-full rounded-t transition-all",
                  point.value > 0
                    ? "bg-brand/70 group-hover:bg-brand"
                    : "bg-muted"
                )}
                // A day with nothing still gets a sliver, so the axis reads as
                // a row of days rather than a row of gaps.
                style={{ height: point.value > 0 ? `${Math.max(height, 6)}%` : "3px" }}
              />
            </div>
          );
        })}
      </div>

      {/* Only the ends are labelled. Fourteen rotated dates is noise. */}
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
