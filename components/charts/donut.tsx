import { ringGeometry } from "@/lib/chart";
import { cn } from "@/lib/utils";

export type DonutSlice = {
  label: string;
  value: number;
  tone: 1 | 2 | 3 | 4 | 5 | 6;
};

const STROKES: Record<DonutSlice["tone"], string> = {
  1: "stroke-chart-1",
  2: "stroke-chart-2",
  3: "stroke-chart-3",
  4: "stroke-chart-4",
  5: "stroke-chart-5",
  6: "stroke-chart-6",
};

/**
 * A whole, split into its parts.
 *
 * The one shape the dashboards did not have. Ring answers "how far through
 * one thing are we"; this answers "what is this pile made of", which is the
 * question a queue asks — 92 consignments is a number, and 92 consignments of
 * which 84 are stuck behind one desk is an instruction.
 *
 * Server-rendered SVG on stroke-dasharray, so it costs no JavaScript and no
 * charting library. Drawn from twelve o'clock clockwise, in the order given:
 * the caller sorts, because the order is editorial — the biggest problem
 * should be the first thing the eye lands on, and only the caller knows which
 * of its slices is the problem.
 *
 * Slices of zero are skipped rather than drawn at nought length, which would
 * otherwise stack invisible segments and shift every colour after them.
 */
export function Donut({
  slices,
  size = 168,
  stroke = 26,
  label,
  caption,
  className,
}: {
  slices: DonutSlice[];
  size?: number;
  stroke?: number;
  /** The figure in the middle. Usually the total. */
  label: string;
  /** Small text under it. */
  caption?: string;
  className?: string;
}) {
  const { radius, circumference, center } = ringGeometry(size, stroke);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  let offset = 0;
  const drawn = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const fraction = total > 0 ? slice.value / total : 0;
      const length = fraction * circumference;
      // A hairline gap so neighbouring slices read as two, not one long arc.
      const gap = drawnGap(fraction, circumference);
      const segment = {
        ...slice,
        dash: `${Math.max(0, length - gap)} ${circumference - Math.max(0, length - gap)}`,
        offset,
      };
      offset += length;
      return segment;
    });

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}. ${slices
          .filter((s) => s.value > 0)
          .map((s) => `${s.label}: ${s.value}`)
          .join(", ")}`}
      >
        {/* The track, so a nearly-empty donut still reads as a ring. */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <g transform={`rotate(-90 ${center} ${center})`}>
          {drawn.map((slice) => (
            <circle
              key={slice.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={slice.dash}
              strokeDashoffset={-slice.offset}
              className={STROKES[slice.tone]}
            />
          ))}
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-2xl font-bold leading-none tabular">
          {label}
        </span>
        {caption ? (
          <span className="mt-1 max-w-[70%] text-[10px] leading-tight text-muted-foreground">
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * No gap on a slice too small to survive one.
 *
 * A fixed gap eats a thin slice entirely, so a queue with one consignment in
 * it would vanish from the picture — the exact case somebody is looking for.
 */
function drawnGap(fraction: number, circumference: number) {
  const length = fraction * circumference;
  return length > 10 ? 3 : 0;
}
