import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays } from "lucide-react";

import { FlightSchedule } from "@/components/site/flight-schedule";
import { PageHero } from "@/components/site/page-hero";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { IMAGES } from "@/lib/imagery";
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
    <>
    <PageHero
      image={IMAGES.airportNight}
      eyebrow="Flight schedule"
      title="Three flights a week, every week."
      body="Guangzhou to Dar es Salaam every Wednesday, Friday and Sunday. Get your cargo to our warehouse by the cut-off day and it goes on that flight."
    />

    {/* The three that matter. Stars, because the hero is a night apron and the
        page should read as one continuous sky rather than two bands. */}
    <section className="relative isolate bg-[hsl(var(--ink))] py-16 text-white md:py-20">
      <SectionBackdrop variant="stars" />
      <div className="container relative">
        <h2 className="rule-gold font-display text-xl font-bold">Next three</h2>
        <FlightSchedule className="mt-5" />
      </div>
    </section>

    {/* The month ahead. Drifting colour rather than stars, so the two lists do
        not look like the same block repeated. */}
    <section className="relative isolate bg-[hsl(var(--ink))] pb-16 pt-4 text-white md:pb-20">
      <SectionBackdrop variant="aurora" />
      <div className="container relative">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-gold">
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
      </div>
    </section>

    {/* The page ends on the loading bay: the two things a customer does after
        reading a schedule sit on a photograph, not on empty navy. */}
    <section className="relative isolate bg-[hsl(var(--ink))] pb-24 pt-16 text-white md:pt-20">
      <SectionBackdrop variant="photo" image={IMAGES.loadingTruck} />
      <div className="container relative">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/book"
            className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
          >
            Book your cargo
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
    </>
  );
}
