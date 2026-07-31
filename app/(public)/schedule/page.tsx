import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays } from "lucide-react";

import { FlightSchedule } from "@/components/site/flight-schedule";
import { upcomingFlights } from "@/lib/flights";

export const metadata: Metadata = {
  title: "Flight schedule",
  description:
    "Target Express flies cargo from Guangzhou to Dar es Salaam every Wednesday, Friday and Sunday. See the next departures and their cut-off days.",
};

export default function SchedulePage() {
  // A month ahead. Beyond that nobody is planning, and the page stops being a
  // schedule and starts being a calendar.
  const rest = upcomingFlights(15).slice(3);
  const fmt = (date: Date) =>
    date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  return (
    <section className="relative overflow-hidden bg-[hsl(var(--ink))] py-20 text-white sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand/20 via-transparent to-transparent"
      />
      <div className="container relative">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
          Flight schedule
        </p>
        <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold leading-[1.08] sm:text-5xl">
          Three flights a week, every week.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/70">
          Guangzhou to Dar es Salaam every Wednesday, Friday and Sunday. Get
          your cargo to our warehouse by the cut-off day and it goes on that
          flight.
        </p>

        <h2 className="mt-14 font-display text-xl font-bold">Next three</h2>
        <FlightSchedule className="mt-5" />

        <h2 className="mt-14 flex items-center gap-2 font-display text-xl font-bold">
          <CalendarDays className="h-5 w-5" />
          After that
        </h2>
        <ul className="mt-5 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          {rest.map((flight) => (
            <li
              key={flight.departsAt.toISOString()}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <span className="font-medium">{fmt(flight.departsAt)}</span>
              <span className="text-sm text-white/55">
                Cargo accepted until {flight.cutOffDay},{" "}
                {flight.cutOffAt.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/book"
            className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
          >
            Book a shipment
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/pickup"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-medium transition-colors hover:bg-white/10"
          >
            Request a pickup
          </Link>
        </div>

        <p className="mt-8 max-w-2xl text-xs text-white/40">
          Flight days are fixed, but a departure can shift for weather, airline
          capacity or customs. We message you if your cargo moves to the next
          flight.
        </p>
      </div>
    </section>
  );
}
