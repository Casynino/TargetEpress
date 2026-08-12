import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertItem = {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  meta?: string;
  href?: string;
  icon?: LucideIcon;
};

const SEVERITY: Record<
  AlertSeverity,
  { bar: string; badge: string; label: string; icon: LucideIcon }
> = {
  critical: {
    bar: "bg-destructive",
    badge: "bg-destructive/10 text-destructive",
    label: "Critical",
    icon: AlertTriangle,
  },
  warning: {
    bar: "bg-warning",
    badge: "bg-warning/10 text-warning",
    label: "Warning",
    icon: AlertTriangle,
  },
  info: {
    bar: "bg-info",
    badge: "bg-info/10 text-info",
    label: "Info",
    icon: Clock,
  },
};

const ORDER: AlertSeverity[] = ["critical", "warning", "info"];

/**
 * Priority queue of things needing a decision.
 *
 * This is the panel that answers "what do I need to do today?", so it is
 * ordered by severity rather than by time, and it has a fixed height with
 * internal scroll — a queue that grows down the page stops being a queue and
 * becomes a wall.
 */
export function AlertQueue({
  items,
  title = "Needs your attention",
  description,
  emptyMessage = "Nothing needs a decision right now.",
  className,
}: {
  items: AlertItem[];
  title?: string;
  description?: string;
  emptyMessage?: string;
  className?: string;
}) {
  const sorted = [...items].sort(
    (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity)
  );

  const criticalCount = items.filter((i) => i.severity === "critical").length;

  return (
    <section className={cn("panel flex flex-col", className)}>
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-display font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {criticalCount > 0 ? (
          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive tabular">
            {criticalCount} critical
          </span>
        ) : null}
      </header>

      {sorted.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <CheckCircle2 className="h-7 w-7 text-success" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="max-h-[360px] divide-y overflow-y-auto">
          {sorted.map((item) => {
            const meta = SEVERITY[item.severity];
            const Icon = item.icon ?? meta.icon;

            const inner = (
              <div className="flex gap-3 px-5 py-3.5">
                {/* Severity is carried by a bar AND a labelled badge, never by
                    colour alone. */}
                <span
                  className={cn("mt-0.5 w-0.5 shrink-0 rounded-full", meta.bar)}
                  aria-hidden
                />
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    item.severity === "critical"
                      ? "text-destructive"
                      : item.severity === "warning"
                        ? "text-warning"
                        : "text-info"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                        meta.badge
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {item.detail}
                  </p>
                  {item.meta ? (
                    <p className="mt-1 text-xs text-muted-foreground/80 tabular">
                      {item.meta}
                    </p>
                  ) : null}
                </div>
                {item.href ? (
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                ) : null}
              </div>
            );

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="focus-ring group block transition-colors hover:bg-muted/40"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
