"use client";

import { useId, useState } from "react";

import { areaPath, scalePoints, smoothPath } from "@/lib/chart";
import { cn } from "@/lib/utils";

export type Series = {
  name: string;
  values: number[];
  /** chart-N token index. */
  tone: 1 | 2 | 3 | 4 | 5 | 6;
};

/**
 * Two-series area chart with a hover readout.
 *
 * Client-side only for the hover crosshair — the chart itself is plain SVG, so
 * the first paint is the finished picture and hovering only moves a line.
 */
export function AreaChart({
  series,
  labels,
  height = 220,
  formatValue = (n: number) => n.toLocaleString(),
  className,
}: {
  series: Series[];
  labels: string[];
  height?: number;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const W = 800;
  const H = height;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 1);
  // Round the ceiling up so gridlines land on readable numbers.
  const ceiling = Math.ceil(max / 50) * 50 || 50;
  const gridLines = 4;

  const scaled = series.map((s) => ({
    ...s,
    points: scalePoints(s.values, W, H, { min: 0, max: ceiling, padding: 6 }),
  }));

  const columnWidth = labels.length > 1 ? W / (labels.length - 1) : W;

  return (
    <div className={cn("w-full", className)}>
      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span
            key={s.name}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: `hsl(var(--chart-${s.tone}))` }}
            />
            {s.name}
          </span>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full overflow-visible"
          style={{ height }}
          preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - box.left) / box.width;
            const index = Math.round(ratio * (labels.length - 1));
            setHover(Math.min(labels.length - 1, Math.max(0, index)));
          }}
        >
          <defs>
            {scaled.map((s) => (
              <linearGradient
                key={s.name}
                id={`${uid}-${s.tone}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={`hsl(var(--chart-${s.tone}))`}
                  stopOpacity="0.28"
                />
                <stop
                  offset="100%"
                  stopColor={`hsl(var(--chart-${s.tone}))`}
                  stopOpacity="0"
                />
              </linearGradient>
            ))}
          </defs>

          {/* Gridlines */}
          {Array.from({ length: gridLines + 1 }).map((_, i) => {
            const y = (H / gridLines) * i;
            return (
              <line
                key={i}
                x1="0"
                y1={y}
                x2={W}
                y2={y}
                className="stroke-border"
                strokeWidth="1"
                strokeDasharray="4 6"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Series — fill first so lines sit on top of both fills */}
          {scaled.map((s) => (
            <path
              key={`fill-${s.name}`}
              d={areaPath(s.points, H)}
              fill={`url(#${uid}-${s.tone})`}
            />
          ))}
          {scaled.map((s) => (
            <path
              key={`line-${s.name}`}
              d={smoothPath(s.points)}
              fill="none"
              stroke={`hsl(var(--chart-${s.tone}))`}
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Crosshair */}
          {hover !== null ? (
            <>
              <line
                x1={hover * columnWidth}
                y1="0"
                x2={hover * columnWidth}
                y2={H}
                className="stroke-foreground/30"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {scaled.map((s) => {
                const p = s.points[hover];
                if (!p) return null;
                return (
                  <circle
                    key={`dot-${s.name}`}
                    cx={p.x}
                    cy={p.y}
                    r="4"
                    fill={`hsl(var(--chart-${s.tone}))`}
                    className="stroke-background"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </>
          ) : null}
        </svg>

        {/* Readout, positioned over the chart rather than inside the SVG so the
            text is not stretched by preserveAspectRatio="none". */}
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[130px] -translate-x-1/2 rounded-lg border bg-popover p-2.5 shadow-lift"
            style={{
              left: `${(hover / Math.max(1, labels.length - 1)) * 100}%`,
            }}
          >
            <p className="text-[11px] font-medium text-muted-foreground">
              {labels[hover]}
            </p>
            <ul className="mt-1 space-y-0.5">
              {series.map((s) => (
                <li
                  key={s.name}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: `hsl(var(--chart-${s.tone}))` }}
                    />
                    {s.name}
                  </span>
                  <span className="font-mono font-medium tabular">
                    {formatValue(s.values[hover] ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* X axis */}
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        {labels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className={cn(
              "tabular",
              hover === i && "font-semibold text-foreground"
            )}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
