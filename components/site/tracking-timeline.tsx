"use client";

import { useEffect, useState } from "react";
import { Check, MapPin, PackageCheck, Plane, Warehouse } from "lucide-react";

import type { PublicTimelineEntry } from "@/lib/tracking";
import { cn } from "@/lib/utils";

/** A timeline step with its timestamp already turned into words on the server. */
export type TimelineStep = PublicTimelineEntry & { atLabel: string | null };

const STEP_ICON: Record<string, typeof Plane> = {
  READY_TO_DEPART: Warehouse,
  IN_TRANSIT: Plane,
  RECEIVED_AT_DAR: MapPin,
  READY_FOR_PICKUP: PackageCheck,
  DELIVERED: Check,
};

/**
 * The customer-facing journey.
 *
 * The progress line grows on mount rather than appearing filled — it is the one
 * piece of motion on the page that carries meaning, because "how far along am
 * I" is the entire question the customer came to answer. Everything else here
 * is static.
 *
 * The line is drawn to the *current* step, never past it. A bar that overshoots
 * would tell someone their cargo has landed when it is still in the air.
 */
export function TrackingTimeline({ steps }: { steps: TimelineStep[] }) {
  const currentIndex = steps.findIndex((step) => step.current);
  const reached = currentIndex >= 0 ? currentIndex : steps.filter((s) => s.done).length - 1;
  const progress =
    steps.length > 1 ? Math.max(0, reached) / (steps.length - 1) : 0;

  const [grown, setGrown] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGrown(true);
      return;
    }
    const timer = window.setTimeout(() => setGrown(true), 120);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <ol className="relative">
      {/* The rail, and the brand-coloured fill that grows along it. */}
      <span
        aria-hidden="true"
        className="absolute left-[15px] top-3 w-0.5 bg-border"
        style={{ height: `calc(100% - 2.5rem)` }}
      />
      <span
        aria-hidden="true"
        className="absolute left-[15px] top-3 w-0.5 origin-top bg-brand transition-transform duration-[1200ms] ease-out"
        style={{
          height: `calc(100% - 2.5rem)`,
          transform: `scaleY(${grown ? progress : 0})`,
        }}
      />

      {steps.map((step) => {
        const Icon = STEP_ICON[step.status] ?? MapPin;
        const active = step.done || step.current;

        return (
          <li key={step.status} className="relative flex gap-4 pb-7 last:pb-0">
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                step.current
                  ? "border-brand bg-brand text-brand-foreground shadow-[0_0_0_4px_hsl(var(--brand)/0.15)]"
                  : step.done
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border bg-background text-muted-foreground/50"
              )}
            >
              <Icon className="h-4 w-4" />
              {step.current ? (
                <span className="absolute inset-0 animate-ping rounded-full bg-brand/30 [animation-duration:2.5s]" />
              ) : null}
            </span>

            <div className="min-w-0 pt-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
                {step.current ? (
                  <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                    now
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">{step.location}</p>
              {/* Formatted on the server: a date rendered client-side would
                  use the visitor's locale and mismatch the server's HTML. */}
              {step.atLabel ? (
                <p className="mt-0.5 text-xs text-muted-foreground/80">
                  {step.atLabel}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
