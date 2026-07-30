import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatChip = {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
  href?: string;
};

const TONES = {
  neutral: "text-muted-foreground",
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

/**
 * The thin strip of live counters that sits above a dashboard.
 *
 * These are glanceable facts, not KPIs — "how many batches are in the air right
 * now" rather than "revenue this month". Keeping them in one horizontal rail
 * means the heavy KPI cards below can be fewer and larger.
 */
export function StatStrip({
  chips,
  className,
}: {
  chips: StatChip[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {chips.map((chip) => {
        const Icon = chip.icon;
        const body = (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs shadow-soft transition-colors",
              chip.href && "hover:border-brand/40 hover:bg-muted/60"
            )}
          >
            {Icon ? (
              <Icon
                className={cn("h-3.5 w-3.5", TONES[chip.tone ?? "neutral"])}
              />
            ) : null}
            <span className="text-muted-foreground">{chip.label}</span>
            <span className="font-semibold tabular">{chip.value}</span>
          </span>
        );

        return chip.href ? (
          <Link key={chip.label} href={chip.href} className="focus-ring rounded-full">
            {body}
          </Link>
        ) : (
          <span key={chip.label}>{body}</span>
        );
      })}
    </div>
  );
}
