import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand/10 text-brand",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  danger: "bg-destructive/10 text-destructive",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 shadow-soft transition-shadow",
        href && "hover:shadow-lift"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              TONES[tone]
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {/*
        Sized by how long the figure is, not by hope.

        A fixed text-2xl fits "TSh 1,476,765" and runs off the edge of its own
        card at "TSh -37,932,246" — and a money headline that silently drops its
        last digits is worse than a slightly smaller one. Same rule as the
        finance overview band; shillings are simply longer than dollars, so the
        figures this app shows are the long kind by default.
      */}
      <p
        className={`mt-2 font-display font-bold tabular ${(() => {
          /* A number arrives here as often as a string, and Number has no
             length — measure what will actually be painted. */
          const n = String(value).length;
          if (n <= 11) return "text-2xl";
          if (n <= 14) return "text-xl";
          if (n <= 17) return "text-lg";
          return "text-base";
        })()}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}
