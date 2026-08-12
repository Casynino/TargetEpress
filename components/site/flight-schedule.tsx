import { CalendarClock, PlaneTakeoff } from "lucide-react";

import { countdownLabel, flightTone, upcomingFlights } from "@/lib/flights";
import { cn } from "@/lib/utils";

/**
 * When the next planes leave.
 *
 * Generated from today rather than stored, so it stays true forever with
 * nobody maintaining it. The number a customer actually needs is not the date
 * — it is the cut-off, because that is the deadline they can still miss.
 */
export function FlightSchedule({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  const flights = upcomingFlights(count);
  const fmt = (date: Date) =>
    date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", className)}>
      {flights.map((flight) => {
        const tone = flightTone(flight);
        return (
          <article
            key={flight.departsAt.toISOString()}
            className={cn(
              "relative overflow-hidden rounded-2xl border p-5 transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
              tone === "closed"
                ? "border-white/10 bg-white/[0.03]"
                : tone === "urgent"
                  ? "border-signal/40 bg-signal/10"
                  : "border-white/15 bg-white/5"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/50">
                <PlaneTakeoff className="h-3.5 w-3.5" />
                Departure
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  tone === "closed"
                    ? "bg-white/10 text-white/50"
                    : tone === "urgent"
                      ? "bg-signal text-signal-foreground"
                      : "bg-white/10 text-white/80"
                )}
              >
                {countdownLabel(flight)}
              </span>
            </div>

            <p className="mt-4 font-display text-2xl font-bold leading-none text-white">
              {flight.departureDay}
            </p>
            <p className="mt-1 text-sm text-white/60">{fmt(flight.departsAt)}</p>

            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/50">
                <CalendarClock className="h-3.5 w-3.5" />
                Cargo accepted until
              </p>
              <p className="mt-1.5 text-sm font-medium text-white">
                {flight.cutOffDay}, {fmt(flight.cutOffAt)}
              </p>
              <p className="mt-1 text-xs text-white/45">
                {tone === "closed"
                  ? "This flight has closed. Aim for the next one."
                  : "Your cargo must be at our Guangzhou warehouse by this day."}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
