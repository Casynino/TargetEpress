import { cn } from "@/lib/utils";

/**
 * Small, dependency-free charts for the Developer monitor. Server-rendered SVG/CSS,
 * theme-aware (they use the app's colour tokens), and every bar has a tooltip
 * (hover / long-press) so exact numbers are never hidden.
 */

export type Series = { key: string; label: string; color: string };

export function Legend({
  series,
  className,
}: {
  series: Series[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: s.color }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Day-by-day stacked columns. `labelEvery` thins the x-axis labels so they never collide. */
export function StackedBars({
  data,
  series,
  height = 190,
  labelEvery = 1,
  formatLabel = (l: string) => l,
  emptyText = "Nothing recorded in this period.",
}: {
  data: { label: string; values: Record<string, number> }[];
  series: Series[];
  height?: number;
  labelEvery?: number;
  formatLabel?: (label: string) => string;
  emptyText?: string;
}) {
  const totals = data.map((d) =>
    series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0),
  );
  const rawMax = Math.max(1, ...totals);
  // Whole-number gridlines: step 1 for small counts, otherwise ~4 even steps. Bars scale to the top line.
  const step = rawMax <= 4 ? 1 : Math.ceil(rawMax / 4);
  const ticks = Array.from(
    { length: Math.ceil(rawMax / step) },
    (_, i) => (i + 1) * step,
  );
  const max = ticks[ticks.length - 1];
  const grand = totals.reduce((a, b) => a + b, 0);
  const peak = totals.indexOf(Math.max(...totals));
  if (grand === 0)
    return (
      <div
        className="grid place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  return (
    <div>
      <div className="relative" style={{ height }}>
        {ticks.map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70"
            style={{ bottom: `${(t / max) * 100}%` }}
          >
            <span className="absolute -top-2 left-0 bg-card pr-1 text-[10px] tabular-nums text-muted-foreground">
              {t}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-1 pl-7 sm:gap-1.5">
          {data.map((d, i) => {
            const total = totals[i];
            const tip = `${formatLabel(d.label)} — ${total}${
              series.length > 1
                ? " (" +
                  series
                    .map((s) => `${s.label}: ${d.values[s.key] ?? 0}`)
                    .join(", ") +
                  ")"
                : ""
            }`;
            return (
              <div
                key={d.label}
                className="group relative flex h-full flex-1 flex-col justify-end"
                title={tip}
              >
                <div
                  className={cn(
                    "flex w-full flex-col-reverse overflow-hidden rounded-t transition-opacity group-hover:opacity-80",
                    i === peak && "ring-1 ring-foreground/20",
                  )}
                  style={{
                    height: `${(total / max) * 100}%`,
                    minHeight: total > 0 ? 3 : 0,
                  }}
                >
                  {series.map((s) => {
                    const v = d.values[s.key] ?? 0;
                    return v > 0 ? (
                      <div
                        key={s.key}
                        style={{
                          height: `${(v / total) * 100}%`,
                          background: s.color,
                        }}
                      />
                    ) : null;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1 pl-7 sm:gap-1.5">
        {data.map((d, i) => (
          <div
            key={d.label}
            className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground"
          >
            {(data.length - 1 - i) % labelEvery === 0
              ? formatLabel(d.label)
              : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars: a label, a bar and a value per row. */
export function HBars({
  items,
  color = "hsl(var(--primary))",
  format = (n: number) => String(n),
  emptyText = "Nothing to show yet.",
}: {
  items: { label: string; value: number; sub?: string; color?: string }[];
  color?: string;
  format?: (n: number) => string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{it.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {format(it.value)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((it.value / max) * 100, 2)}%`,
                background: it.color ?? color,
              }}
              title={`${it.label}: ${format(it.value)}`}
            />
          </div>
          {it.sub && (
            <p className="mt-0.5 text-xs text-muted-foreground">{it.sub}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Speed bars: green under 150 ms, amber under 400 ms, red above (or failed). */
export function SpeedBars({
  probes,
}: {
  probes: { label: string; ms: number; ok: boolean }[];
}) {
  const max = Math.max(400, ...probes.map((p) => p.ms));
  return (
    <ul className="space-y-3">
      {probes.map((p) => {
        const tone = !p.ok
          ? "hsl(var(--destructive))"
          : p.ms < 150
            ? "hsl(var(--success))"
            : p.ms < 400
              ? "hsl(var(--warning))"
              : "hsl(var(--destructive))";
        return (
          <li key={p.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{p.label}</span>
              <span
                className="shrink-0 font-medium tabular-nums"
                style={{ color: tone }}
              >
                {p.ok ? `${p.ms} ms` : "failed"}
              </span>
            </div>
            <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((p.ms / max) * 100, 3)}%`,
                  background: tone,
                }}
              />
            </div>
          </li>
        );
      })}
      <li className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-success" /> under 150 ms is
          fast
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-warning" /> 150–400 ms is okay
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-destructive" /> over 400 ms is
          slow
        </span>
      </li>
    </ul>
  );
}

/** A ring showing a 0–100 score. */
export function ScoreRing({
  score,
  size = 132,
}: {
  score: number;
  size?: number;
}) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const tone =
    score >= 85
      ? "hsl(var(--success))"
      : score >= 60
        ? "hsl(var(--warning))"
        : "hsl(var(--destructive))";
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Health score ${score} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={10}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-3xl font-bold tabular-nums leading-none">
            {score}
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            out of 100
          </p>
        </div>
      </div>
    </div>
  );
}

/** A tiny trend line with a soft fill. Server-drawn, no library; stretches to the width it is given. */
export function Sparkline({
  id,
  values,
  color = "#ffffff",
  width = 240,
  height = 32,
  className,
}: {
  /** Unique per page — names the fill gradient. */
  id: string;
  values: number[];
  color?: string;
  /** Drawing width; the picture stretches to fill whatever space it is given. */
  width?: number;
  height?: number;
  className?: string;
}) {
  const pad = 3;
  const n = values.length;
  const max = Math.max(...values, 1);
  const x = (i: number) =>
    n <= 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const pts = values.map((v, i) => [x(i), y(v)] as const);
  const line = pts
    .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1] ?? [0, height];
  const flat = values.every((v) => v === 0);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      {flat ? (
        <line
          x1={pad}
          x2={width - pad}
          y1={height - pad}
          y2={height - pad}
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={1.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={`${line} L${last[0]} ${height} L${pts[0][0]} ${height} Z`}
            fill={`url(#${id})`}
          />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

/** A handful of small bars, one per value (used for the database timings). */
export function MiniBars({
  values,
  colors,
  floor = 1,
  width = 240,
  height = 32,
  className,
}: {
  values: number[];
  colors: string[];
  /** The scale never goes below this, so a set of tiny values reads as small, not as full bars. */
  floor?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  const n = Math.max(values.length, 1);
  const gap = 12;
  const bw = (width - gap * (n - 1)) / n;
  const max = Math.max(...values, floor);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * (height - 2));
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={height - h}
            width={bw}
            height={h}
            rx={2}
            fill={colors[i] ?? colors[0]}
          />
        );
      })}
    </svg>
  );
}
