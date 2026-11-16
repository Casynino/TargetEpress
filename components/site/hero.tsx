"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";

import { CargoGlobe } from "@/components/ui/cargo-globe";
import { ParticleField } from "@/components/ui/particle-field";
import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";

/**
 * Public hero: the night sky, the earth turning under it, and the aircraft
 * flying the real lanes from Guangzhou and Hong Kong into Dar es Salaam
 * (owner, 16 Nov 2026: "the globe must be there — we should see planes moving,
 * we should see China", with as few words as possible). One sentence, the
 * tracking field, two links and the next departure; the globe is the rest.
 *
 * On a phone the words come first and the globe rises under them like a
 * horizon, wider than the screen. It does not take touches there: a finger
 * on it is a visitor scrolling the page, never one trying to spin the earth.
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
      {/* The sky: a deep blue glow where the earth meets it, and slow drifting
          specks — things in the air. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% 100%, hsl(214 80% 35% / 0.45), transparent 70%), radial-gradient(ellipse 60% 40% at 85% 10%, hsl(357 76% 48% / 0.12), transparent 70%)",
        }}
      />
      <ParticleField />

      <div className="container relative pt-28 sm:pt-32 lg:grid lg:min-h-[100svh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-10 lg:pb-16 lg:pt-28">
        <div className="relative z-10">
          <p className="rise text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65 sm:text-xs">
            <span className="sm:hidden">China → Dar es Salaam</span>
            <span className="max-sm:hidden">Guangzhou · Hong Kong → Dar es Salaam</span>
          </p>
          <h1 className="rise rise-1 mt-4 text-balance font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
            Mzigo wako kutoka China, <span className="text-signal">siku 3–10.</span>
          </h1>

          <form onSubmit={onSubmit} className="rise rise-2 mt-8 flex max-w-md gap-2">
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

          <div className="rise rise-3 mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link href="/pricing" className="inline-flex items-center gap-1.5 font-medium text-white/80 underline-offset-4 hover:text-white hover:underline">
              Bei ya mzigo <ArrowRight className="size-3.5" />
            </Link>
            <Link href="/book" className="inline-flex items-center gap-1.5 font-medium text-white/80 underline-offset-4 hover:text-white hover:underline">
              Book mzigo <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* The earth. On a phone it is wider than the screen and its lower
            part runs off the foot of the section, like a horizon. */}
        {/* Centred on the screen from an outer box: the entrance animation
            owns the inner box's transform, and would undo a shift put there. */}
        <div className="relative left-1/2 -mb-[20%] mt-8 w-[100vw] max-w-[640px] -translate-x-1/2 max-lg:pointer-events-none lg:left-0 lg:mb-0 lg:mt-0 lg:w-full lg:translate-x-0">
        <div className="rise rise-4 relative">
          <CargoGlobe />
          {nextFlight ? (
            <Link
              href="/schedule"
              className="pointer-events-auto absolute left-1/2 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-[hsl(var(--ink)/0.55)] px-3.5 py-1.5 text-xs text-white/80 backdrop-blur-md transition-colors hover:text-white max-lg:top-[4%] lg:bottom-[6%] lg:top-auto"
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
      </div>

      {/* Hands the night to the page below without a hard edge. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[hsl(var(--ink))] to-transparent" />
    </section>
  );
}
