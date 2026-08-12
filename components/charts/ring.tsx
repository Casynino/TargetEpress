import { clampPct, ringGeometry } from "@/lib/chart";
import { cn } from "@/lib/utils";

const TONES = {
  brand: "stroke-brand",
  signal: "stroke-signal",
  success: "stroke-success",
  warning: "stroke-warning",
  info: "stroke-info",
  danger: "stroke-destructive",
  chart1: "stroke-chart-1",
  chart2: "stroke-chart-2",
} as const;

/**
 * Donut progress ring for KPI cards.
 *
 * Server-rendered SVG; the sweep animation is pure CSS, so this costs no
 * JavaScript. `label` is required because a ring on its own is decorative —
 * a screen reader gets the number, not the arc.
 */
export function Ring({
  value,
  size = 52,
  stroke = 5,
  tone = "brand",
  label,
  children,
  className,
}: {
  /** Percentage, 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  tone?: keyof typeof TONES;
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const pct = clampPct(value);
  const { radius, circumference, center } = ringGeometry(size, stroke);
  const offset = circumference * (1 - pct / 100);

  return (
    <div
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${Math.round(pct)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("animate-draw-in", TONES[tone])}
          style={{ ["--dash" as string]: circumference }}
        />
      </svg>
      {children ? (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular">
          {children}
        </span>
      ) : null}
    </div>
  );
}
