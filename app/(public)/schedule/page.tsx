import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, PackageCheck, Plane } from "lucide-react";

import { PageHero } from "@/components/site/page-hero";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { IMAGES } from "@/lib/imagery";
import { countdownLabel, flightTone, FLIGHT_DAYS, upcomingFlights, type ScheduledFlight } from "@/lib/flights";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Flight schedule",
  description:
    "Target Express flies cargo from Guangzhou to Dar es Salaam every Wednesday, Friday and Sunday. See the next departures and their cut-off days.",
};

const short = (date: Date) => date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const dayMonth = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/** Monday-first week, the way a customer reads a calendar. JS day numbers. */
const WEEK = [1, 2, 3, 4, 5, 6, 0].map((n) => ({
  n,
  label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n],
  flies: (FLIGHT_DAYS as readonly number[]).includes(n),
}));

/**
 * The schedule, arranged to be read at a glance (owner, 16 Nov 2026: "the
 * schedule should be well arranged and nice"). The next flight large, with its
 * one deadline drawn as a line from cut-off to take-off; the weekly pattern as
 * seven days with the three flight days lit; the two after it side by side; the
 * month ahead as dates grouped by week. Every date is generated from today, so
 * the page never goes stale and nobody maintains it.
 */
export default function SchedulePage() {
  // A month ahead. Beyond that nobody is planning, and the page stops being a
  // schedule and starts being a calendar.
  const flights = upcomingFlights(15);
  const [next, ...others] = flights;
  const soon = others.slice(0, 2);
  const later = others.slice(2);

  // Later flights, three to a week, so they read as weeks rather than a list.
  const weeks: ScheduledFlight[][] = [];
  for (let i = 0; i < later.length; i += 3) weeks.push(later.slice(i, i + 3));

  const nextTone = flightTone(next);

  return (
    <>
      <PageHero
        image={IMAGES.airportNight}
        eyebrow="Flight schedule"
        title="Three flights a week, every week."
        body="Guangzhou to Dar es Salaam, every Wednesday, Friday and Sunday."
      />

      <section className="relative isolate bg-[hsl(var(--ink))] py-14 text-white md:py-20">
        <SectionBackdrop variant="stars" />
        <div className="container relative grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
          {/* The next flight. */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-signal">Next flight</p>
            <article
              className={cn(
                "mt-4 rounded-3xl border bg-white/[0.04] p-6 backdrop-blur-md sm:p-8",
                nextTone === "urgent" ? "border-signal/50 shadow-[0_0_40px_hsl(357_78%_58%/0.18)]" : "border-white/12",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-[2rem] font-bold leading-none tracking-tight sm:text-5xl">{next.departureDay}</p>
                  <p className="mt-2 text-white/60">{dayMonth(next.departsAt)}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                    nextTone === "closed" ? "bg-white/10 text-white/55" : nextTone === "urgent" ? "bg-signal text-signal-foreground" : "bg-white/10 text-white/85",
                  )}
                >
                  {countdownLabel(next)}
                </span>
              </div>

              {/* The one deadline, drawn: cargo in Guangzhou by the cut-off, then the plane. */}
              <ol className="mt-8 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <li className="flex flex-col items-start gap-2">
                  <span className="grid size-10 place-items-center rounded-full border border-[hsl(42_100%_70%/0.5)] text-[hsl(42_100%_72%)]">
                    <PackageCheck className="size-5" strokeWidth={1.7} />
                  </span>
                  <span className="text-xs leading-tight">
                    <span className="block text-white/50">Cargo in by</span>
                    <span className="block font-semibold">{short(next.cutOffAt)}</span>
                  </span>
                </li>
                <li aria-hidden className="-mt-9 h-px bg-gradient-to-r from-[hsl(42_100%_70%/0.6)] to-signal/70" />
                <li className="flex flex-col items-end gap-2 text-right">
                  <span className="grid size-10 place-items-center rounded-full bg-signal text-signal-foreground shadow-[0_0_20px_hsl(357_78%_58%/0.5)]">
                    <Plane className="size-5" />
                  </span>
                  <span className="text-xs leading-tight">
                    <span className="block text-white/50">Takes off</span>
                    <span className="block font-semibold">{short(next.departsAt)}</span>
                  </span>
                </li>
              </ol>
            </article>
          </div>

          <div className="space-y-8">
            {/* The weekly pattern. */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/50">Every week</p>
              <ul className="mt-4 grid grid-cols-7 gap-1.5">
                {WEEK.map((d) => (
                  <li
                    key={d.n}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-semibold",
                      d.flies ? "border-signal/40 bg-signal/10 text-white" : "border-white/8 text-white/35",
                    )}
                  >
                    {d.label}
                    {d.flies ? <Plane className="size-3.5 text-signal" /> : <span className="size-3.5" />}
                  </li>
                ))}
              </ul>
            </div>

            {/* The two after the next. */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/50">Then</p>
              <ul className="mt-4 grid grid-cols-2 gap-3">
                {soon.map((f) => (
                  <li key={f.departsAt.toISOString()} className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
                    <p className="font-display text-xl font-semibold leading-none">{f.departureDay}</p>
                    <p className="mt-1.5 text-sm text-white/60">{dayMonth(f.departsAt)}</p>
                    <p className="mt-3 text-xs text-white/45">
                      Cargo in by <span className="text-white/80">{short(f.cutOffAt)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* The month ahead, a week to a row. */}
      <section className="relative isolate bg-[hsl(var(--ink))] pb-16 pt-2 text-white md:pb-20">
        <SectionBackdrop variant="aurora" />
        <div className="container relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/50">The month ahead</p>
          <ul className="mt-4 space-y-2">
            {weeks.map((week) => (
              <li key={week[0].departsAt.toISOString()} className="grid grid-cols-3 gap-2">
                {week.map((f) => (
                  <span key={f.departsAt.toISOString()} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <span className="block text-sm font-semibold">{short(f.departsAt)}</span>
                    <span className="mt-0.5 block text-[11px] text-white/45">in by {f.cutOffAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The page ends on the loading bay: the two things a customer does after
          reading a schedule sit on a photograph, not on empty navy. */}
      <section className="relative isolate bg-[hsl(var(--ink))] pb-24 pt-14 text-white md:pt-20">
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
            Flight days are fixed, but a departure can shift for weather, airline capacity or customs. We message you if
            your cargo moves to the next flight.
          </p>
        </div>
      </section>
    </>
  );
}
