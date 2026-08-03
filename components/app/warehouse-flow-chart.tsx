import { cn } from "@/lib/utils";

export type FlowWeek = { label: string; received: number; released: number };

/**
 * Cargo in against cargo out, one pair of bars per week.
 *
 * Paired bars rather than a line, because these are twelve separate counts and
 * nothing happens "between" two weeks. The reason both series share one chart
 * is the only question the floor actually asks of it: are we releasing as fast
 * as we are receiving, or is the warehouse filling up?
 *
 * Server component — the bars are CSS, the readout is a `title` and a hover
 * label, so a full quarter of history ships no JavaScript.
 */
export function WarehouseFlowChart({
  weeks,
  height = 180,
  className,
}: {
  weeks: FlowWeek[];
  height?: number;
  className?: string;
}) {
  const max = Math.max(...weeks.flatMap((w) => [w.received, w.released]), 1);
  const lastIndex = weeks.length - 1;

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: "hsl(var(--chart-1))" }}
          />
          Checked in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: "hsl(var(--chart-5))" }}
          />
          Released
        </span>
      </div>

      <div
        className="flex items-end gap-1.5 sm:gap-2"
        style={{ height }}
        role="img"
        aria-label={weeks
          .map(
            (w) =>
              `week of ${w.label}: ${w.received} checked in, ${w.released} released`
          )
          .join("; ")}
      >
        {weeks.map((week, i) => (
          <div
            key={week.label}
            className="group flex h-full flex-1 flex-col justify-end"
            title={`Week of ${week.label} — ${week.received} checked in, ${week.released} released`}
          >
            <span className="pointer-events-none mb-1 text-center font-mono text-[10px] tabular text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {week.received}/{week.released}
            </span>
            <div className="flex h-full items-end justify-center gap-[3px]">
              <div
                className="w-1/2 max-w-3 rounded-t-[3px] transition-opacity"
                style={{
                  height: `${Math.max(week.received === 0 ? 0 : 2, (week.received / max) * 100)}%`,
                  background: "hsl(var(--chart-1))",
                  opacity: i === lastIndex ? 1 : 0.75,
                }}
              />
              <div
                className="w-1/2 max-w-3 rounded-t-[3px] transition-opacity"
                style={{
                  height: `${Math.max(week.released === 0 ? 0 : 2, (week.released / max) * 100)}%`,
                  background: "hsl(var(--chart-5))",
                  opacity: i === lastIndex ? 1 : 0.75,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5 sm:gap-2">
        {weeks.map((week, i) => (
          <span
            key={`${week.label}-label`}
            className={cn(
              "flex-1 text-center text-[10px] tabular text-muted-foreground",
              i === lastIndex && "font-semibold text-foreground"
            )}
          >
            {/* Twelve labels do not fit on a phone; every other one does. The
                column keeps its width either way so labels stay under bars. */}
            <span className={cn(i % 2 === 1 && i !== lastIndex && "hidden sm:inline")}>
              {week.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
