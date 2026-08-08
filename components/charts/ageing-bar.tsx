import { cn } from "@/lib/utils";

export type AgeingSegment = {
  key: string;
  label: string;
  count: number;
  usd: number;
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
  rate,
  className,
}: {
  segments: AgeingSegment[];
  /** USD → TSh. Shillings lead everywhere in this app; USD is the reference. */
  rate: number | null;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.usd, 0);

  if (total <= 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Nothing is owed on a bill that has been sent. Every customer who has
        been asked has paid.
      </p>
    );
  }

  const tsh = (usd: number) =>
    rate === null
      ? null
      : `TSh ${Math.round(usd * rate).toLocaleString("en-US")}`;

  return (
    <div className={className}>
      {/* The proportion, before any number. */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((segment, i) =>
          segment.usd > 0 ? (
            <div
              key={segment.key}
              className={FILL[i] ?? FILL[FILL.length - 1]}
              style={{ width: `${(segment.usd / total) * 100}%` }}
              title={`${segment.label}: ${segment.count} bill${segment.count === 1 ? "" : "s"}`}
            />
          ) : null
        )}
      </div>

      <ul className="mt-4 space-y-2.5">
        {segments.map((segment, i) => {
          const share = (segment.usd / total) * 100;
          const empty = segment.count === 0;
          return (
            <li
              key={segment.key}
              className={cn(
                "flex items-center gap-3 text-sm",
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
              <span className="shrink-0 text-xs text-muted-foreground">
                {segment.count} bill{segment.count === 1 ? "" : "s"}
              </span>
              <span
                className={cn(
                  "w-32 shrink-0 text-right font-mono text-xs tabular-nums",
                  empty ? "" : TEXT[i] ?? TEXT[TEXT.length - 1]
                )}
              >
                {tsh(segment.usd) ?? `USD ${segment.usd.toFixed(2)}`}
              </span>
              <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                {share >= 0.5 ? `${Math.round(share)}%` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
