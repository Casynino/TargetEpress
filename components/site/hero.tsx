"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";

import { PlaneArrival } from "@/components/site/plane-arrival";
import { CargoGlobe } from "@/components/ui/cargo-globe";
import { ParticleField } from "@/components/ui/particle-field";
import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";

/**
 * Public hero: the night sky, the earth turning, an aircraft gliding in, and
 * as few words as the page can hold (owner, 16 Nov 2026: "the globe must be
 * there", "smaller on the phone, the whole of it, turning nicely", "a plane
 * coming in", "too many words"). Four words of headline, the tracking field and
 * the next departure; the picture is the rest.
 *
 * On a phone it is one centred column: the whole globe, small enough to see
 * round, then the line and the field under it. On a computer the words sit on
 * the left and the globe on the right. The globe takes no touches on a phone —
 * a finger on it is somebody scrolling the page, never somebody spinning it.
 *
 * Tracking stays a field rather than a button: it is the single most common
 * reason anyone opens this site, and sending someone to another page to type a
 * number they already have in their hand is a step for nothing.
 */
export function Hero() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Derived from today's date, never stored. See lib/flights.ts.
  const nextFlight = upcomingFlights(1)[0];

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(query);
    if (!code) return;
    router.push(`/track?q=${encodeURIComponent(code)}`);
  }

  return (
    <section className="relative isolate overflow-hidden bg-[hsl(var(--ink))] text-white">
      {/* The sky: a deep blue glow under the earth, and slow drifting specks. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 50% 34%, hsl(214 80% 40% / 0.32), transparent 42%), radial-gradient(ellipse 60% 40% at 85% 8%, hsl(357 76% 48% / 0.12), transparent 70%)",
        }}
      />
      <ParticleField />

      <div className="container relative flex min-h-[100svh] flex-col justify-center pb-12 pt-24 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:pb-16 lg:pt-28">
        {/* The earth, with the aircraft coming in across it. */}
        <div className="relative mx-auto w-[74vw] max-w-[320px] max-lg:pointer-events-none lg:order-2 lg:w-full lg:max-w-[600px]">
          <div className="rise">
            <CargoGlobe spin={0.22} />
          </div>
          <PlaneArrival className="absolute left-[-30%] top-[-22%] h-[130%] w-[160%]" />
        </div>

        <div className="relative z-10 mt-8 text-center lg:order-1 lg:mt-0 lg:text-left">
          <p className="rise rise-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60 max-lg:hidden">
            Guangzhou · Hong Kong → Dar es Salaam
          </p>
          <h1 className="rise rise-1 text-balance font-display text-[2.5rem] font-bold leading-[1.02] tracking-tight sm:text-6xl lg:mt-5 xl:text-7xl">
            Kutoka China, <span className="text-signal">siku 3–10.</span>
          </h1>

          <form onSubmit={onSubmit} className="rise rise-2 mx-auto mt-7 flex max-w-md gap-2 lg:mx-0">
            <div className="relative flex-1">
              <PackageSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/45" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="TX-000123"
                aria-label="Tracking or batch number"
                className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] pl-10 pr-3 font-mono text-[16px] uppercase tabular text-white outline-none backdrop-blur-md transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-white/35 focus:border-white/45"
              />
            </div>
            <button
              type="submit"
              className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-signal px-5 font-semibold text-signal-foreground transition-[filter] hover:brightness-110"
            >
              Fuatilia
              <ArrowRight className="size-4" />
            </button>
          </form>

          {nextFlight ? (
            <Link
              href="/schedule"
              className="rise rise-3 mt-5 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.05] px-3.5 py-1.5 text-xs text-white/75 backdrop-blur-md transition-colors hover:text-white"
            >
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-signal" />
              </span>
              Ndege inayofuata · {nextFlight.departureDay}
              <span className="text-white/50">{countdownLabel(nextFlight)}</span>
            </Link>
          ) : null}
        </div>
      </div>

      {/* Hands the night to the page below without a hard edge. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[hsl(var(--ink))] to-transparent" />
    </section>
  );
}
