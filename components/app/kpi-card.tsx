import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { CountUp } from "@/components/app/count-up";
import { Ring } from "@/components/charts/ring";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/utils";

type Tone = "brand" | "signal" | "success" | "warning" | "info" | "danger";

const ICON_TONES: Record<Tone, string> = {
  brand: "bg-brand/10 text-brand",
  signal: "bg-signal/10 text-signal",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  danger: "bg-destructive/10 text-destructive",
};

const SPARK_TONE: Record<Tone, 1 | 2 | 3 | 4 | 5 | 6> = {
  brand: 1,
  signal: 3,
  success: 5,
  warning: 4,
  info: 2,
  danger: 3,
};

/**
 * The dashboard's headline metric card.
 *
 * Composes three optional signals around one number:
 *  - a ring, when the number is part of a known whole ("267 of 1310 delivered")
 *  - a delta chip, when a comparison to the previous period exists
 *  - a sparkline, when the shape of the trend matters more than the delta
 *
 * Supply only what is true. A ring with no denominator, or a delta with nothing
 * to compare against, is decoration pretending to be information.
 *
 * Server component: the entrance is a CSS animation and the only client code is
 * the <CountUp> leaf, so a row of eight cards ships almost no JavaScript.
 */
export function KpiCard({
  label,
  value,
  numeric,
  prefix = "",
  suffix = "",
  decimals = 0,
  hint,
  icon: Icon,
  tone = "brand",
  ringPct,
  ringLabel,
  delta,
  invertDelta = false,
  trend,
  href,
  delay = 0,
  className,
}: {
  label: string;
  /** Pre-formatted value. Use `numeric` instead when the figure should count up. */
  value?: string;
  numeric?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** 0–100. Only pass when the number really is a share of something. */
  ringPct?: number;
  ringLabel?: string;
  /** Percentage change against the previous period. */
  delta?: number;
  /** Set when a fall is good news (days waiting, overdue count). */
  invertDelta?: boolean;
  trend?: number[];
  href?: string;
  /** Stagger index; each step delays the entrance by 40ms. */
  delay?: number;
  className?: string;
}) {
  const deltaGood = delta === undefined ? null : invertDelta ? delta < 0 : delta > 0;
  const DeltaIcon =
    delta === undefined || delta === 0
      ? ArrowRight
      : delta > 0
        ? ArrowUpRight
        : ArrowDownRight;

  const body = (
    <div
      className={cn(
        "panel h-full animate-slide-up p-5 transition-shadow",
        href && "hover:shadow-lift",
        className
      )}
      style={{ animationDelay: `${delay * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                ICON_TONES[tone]
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>

        {ringPct !== undefined ? (
          <Ring
            value={ringPct}
            tone={tone}
            label={ringLabel ?? label}
            size={48}
            stroke={5}
          >
            {Math.round(ringPct)}%
          </Ring>
        ) : null}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[26px] font-bold leading-none tracking-tight tabular">
            {numeric !== undefined ? (
              <CountUp
                value={numeric}
                prefix={prefix}
                suffix={suffix}
                decimals={decimals}
              />
            ) : (
              (value ?? "—")
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {delta !== undefined ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular",
                  deltaGood === null
                    ? "bg-muted text-muted-foreground"
                    : deltaGood
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive"
                )}
              >
                <DeltaIcon className="h-3 w-3" />
                {Math.abs(delta).toFixed(Math.abs(delta) % 1 === 0 ? 0 : 1)}%
              </span>
            ) : null}
            {hint ? (
              <span className="text-xs text-muted-foreground">{hint}</span>
            ) : null}
          </div>
        </div>

        {trend && trend.length > 1 ? (
          <Sparkline
            values={trend}
            tone={SPARK_TONE[tone]}
            label={`${label} trend`}
            className="shrink-0"
          />
        ) : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="focus-ring block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
