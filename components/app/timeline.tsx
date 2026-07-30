import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type TimelineStep = {
  id: string;
  label: string;
  place?: string;
  at?: string | null;
  note?: string;
  by?: string;
  state: "done" | "current" | "todo" | "failed";
  icon?: LucideIcon;
};

/**
 * The shipment timeline — the component customers and staff look at most.
 *
 * Design notes:
 *  - The connector between a completed step and the next is drawn solid; the
 *    remainder is dashed. You can tell how far along a shipment is without
 *    reading a single word.
 *  - The current step gets a ring and a subtle pulse. Everything ahead of it is
 *    deliberately low contrast, so the eye lands on "where is it now".
 */
export function Timeline({
  steps,
  compact = false,
  className,
}: {
  steps: TimelineStep[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <ol className={cn("relative", className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const Icon = step.icon;
        const nextDone =
          !isLast && (steps[index + 1].state === "done" || steps[index + 1].state === "current");

        return (
          <li key={step.id} className="flex gap-4">
            {/* Rail */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full transition-colors",
                  compact ? "h-6 w-6" : "h-8 w-8",
                  step.state === "done" && "bg-brand text-brand-foreground",
                  step.state === "current" &&
                    "bg-signal text-signal-foreground ring-4 ring-signal/20 animate-pulse-ring",
                  step.state === "failed" &&
                    "bg-destructive text-destructive-foreground",
                  step.state === "todo" &&
                    "border-2 border-dashed border-muted-foreground/30 bg-background text-muted-foreground/50"
                )}
              >
                {step.state === "done" && !Icon ? (
                  <Check className={compact ? "h-3 w-3" : "h-4 w-4"} strokeWidth={3} />
                ) : Icon ? (
                  <Icon className={compact ? "h-3 w-3" : "h-4 w-4"} />
                ) : (
                  <span
                    className={cn(
                      "rounded-full bg-current",
                      compact ? "h-1.5 w-1.5" : "h-2 w-2"
                    )}
                  />
                )}
              </span>

              {!isLast ? (
                <span
                  className={cn(
                    "my-1 w-px flex-1",
                    nextDone
                      ? "bg-brand/50"
                      : "bg-[repeating-linear-gradient(to_bottom,hsl(var(--border))_0_4px,transparent_4px_8px)]"
                  )}
                />
              ) : null}
            </div>

            {/* Body */}
            <div className={cn("min-w-0 flex-1", compact ? "pb-4" : "pb-6")}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p
                  className={cn(
                    "font-medium",
                    compact ? "text-sm" : "text-[15px]",
                    step.state === "todo" && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                {step.at ? (
                  <span className="text-xs text-muted-foreground tabular">
                    {step.at}
                  </span>
                ) : null}
              </div>

              {step.place ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{step.place}</p>
              ) : null}

              {step.note ? (
                <p
                  className={cn(
                    "mt-1.5 text-sm",
                    step.state === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {step.note}
                </p>
              ) : null}

              {step.by ? (
                <p className="mt-1 text-xs text-muted-foreground/70">{step.by}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
