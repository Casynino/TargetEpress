import { cn } from "@/lib/utils";

export type AgeingSegment = {
  key: string;
  label: string;
  /** How many things are in this bucket. */
  count: number;
  /** What the bar is proportioned by — money owed, boxes, kilos. */
  value: number;
};

/**
 * Written out in full, never interpolated — Tailwind generates classes by
 * scanning source text, so `bg-${tone}` is a class that never exists.
 *
 * Fresh to ancient, in that order. The ramp is the point: a debt does not
 * become bad on a particular day, it goes off gradually, and a colour that
 * warms as the bar runs right says that better than four labels do.
 */
const FILL = [
  "bg-success",
  "bg-info",
  "bg-warning",
  "bg-signal",
] as const;

const DOT = [
  "bg-success",
  "bg-info",
  "bg-warning",
  "bg-signal",
] as const;

const TEXT = [
  "text-success",
  "text-info",
  "text-warning",
  "text-signal",
] as const;

/**
 * What is owed, arranged by how long it has been owed.
 *
 * A single total answers "how much"; it never answers "how bad", and those are
 * different questions with different actions behind them. Money owed since
 * Tuesday is a queue. The same money owed since March is a debt going bad, and
 * the only way to see which you have is to lay it out by age.
 *
 * One bar rather than four: the eye should read the proportion before it reads
 * a single figure, and four separate bars make you compare heights to work out
 * something a stacked bar simply shows. The rows underneath carry the numbers
 * for whoever needs them.
 *
 * Server-rendered divs — no SVG, no charting library, no JavaScript. A bar is
 * a rectangle of a given width; anything more is machinery for its own sake.
 */
export function AgeingBar({
  segments,
  format,
  empty,
  unit = "bill",
  className,
}: {
  segments: AgeingSegment[];
  /** How a bucket's value reads. Money on the finance desk, boxes on the floor. */
  format: (value: number) => string;
  /** What to say when there is nothing to age. */
  empty: string;
  /** Singular noun for the count beside each row. */
  unit?: string;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>{empty}</p>
    );
  }

  return (
    <div className={className}>
      {/* The proportion, before any number. */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((segment, i) =>
          segment.value > 0 ? (
            <div
              key={segment.key}
              className={FILL[i] ?? FILL[FILL.length - 1]}
              style={{ width: `${(segment.value / total) * 100}%` }}
              title={`${segment.label}: ${segment.count} ${unit}${segment.count === 1 ? "" : "s"}`}
            />
          ) : null
        )}
      </div>

      <ul className="mt-3 space-y-1.5">
        {segments.map((segment, i) => {
          const share = (segment.value / total) * 100;
          const empty = segment.count === 0;
          return (
            <li
              key={segment.key}
              className={cn(
                "flex items-center gap-2 text-xs",
                empty && "opacity-40"
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  DOT[i] ?? DOT[DOT.length - 1]
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{segment.label}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {segment.count} {unit}
                {segment.count === 1 ? "" : "s"}
              </span>
              <span
                className={cn(
                  // Wide enough for "TSh 25,458,300" on one line. At w-20 it wrapped, and a
                // figure split across two lines is read as two figures.
                "w-28 shrink-0 whitespace-nowrap text-right font-mono text-[11px] tabular-nums",
                  empty ? "" : TEXT[i] ?? TEXT[TEXT.length - 1]
                )}
              >
                {format(segment.value)}
              </span>
              <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {share >= 0.5 ? `${Math.round(share)}%` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
