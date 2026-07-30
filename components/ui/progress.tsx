import { cn } from "@/lib/utils";

const TONES = {
  brand: "bg-brand",
  signal: "bg-signal",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-destructive",
} as const;

export function Progress({
  value,
  max = 100,
  tone = "brand",
  className,
  label,
  striped = false,
}: {
  value: number;
  max?: number;
  tone?: keyof typeof TONES;
  className?: string;
  label?: string;
  /** Striped fill reads as "in progress" rather than "this much of a total". */
  striped?: boolean;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out-expo",
          TONES[tone]
        )}
        style={{
          width: `${pct}%`,
          ...(striped
            ? {
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 6px, transparent 6px 12px)",
              }
            : null),
        }}
      />
    </div>
  );
}
