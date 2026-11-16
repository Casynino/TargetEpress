"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BadgeCheck, PackageSearch, Plane } from "lucide-react";

import { LightNetwork } from "@/components/site/light-network";
import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";
import { IMAGES, img } from "@/lib/imagery";

/**
 * Public hero, as the owner's references draw logistics (16 Nov 2026): a real
 * aircraft at night, a floor of light with points travelling its lanes, and a
 * few glass labels floating in the air — "futuristic, things moving", in
 * Target's own navy, red and blue. The words are four, the tracking field and
 * the next departure.
 *
 * The photograph is real and carries no airline's livery. It drifts slowly
 * closer; the labels float; nothing moves for a phone that asks for less
 * motion.
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
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[hsl(var(--ink))] text-white">
      {/* The aircraft. */}
      <div aria-hidden className="absolute inset-0 -z-20 overflow-hidden">
        <Image
          src={img(IMAGES.planeClimb, 2200, 78)}
          alt=""
          fill
          priority
          sizes="100vw"
          className="ken-burns object-cover object-[58%_45%] [filter:contrast(1.12)_brightness(0.95)]"
        />
        {/* The dusk sky graded into Target's night: navy laid over it, the
            aircraft's own light coming through. */}
        <div className="absolute inset-0 bg-[hsl(214_80%_38%)] opacity-70 mix-blend-color" />
        <div className="absolute inset-0 bg-[hsl(217_55%_10%/0.3)]" />
      </div>
      {/* Night over it: dark at the top for the header, darker at the foot for
          the words, the aircraft's lights left burning in the middle. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--ink) / 0.75) 0%, hsl(var(--ink) / 0.15) 28%, hsl(var(--ink) / 0.25) 48%, hsl(var(--ink) / 0.92) 78%, hsl(var(--ink)) 100%), radial-gradient(ellipse 80% 50% at 50% 40%, transparent, hsl(var(--ink) / 0.35))",
        }}
      />
      {/* The floor of light under the words. */}
      <LightNetwork className="absolute inset-x-0 bottom-0 -z-10 h-[46%] w-full opacity-90" />

      {/* Glass labels in the air around the aircraft. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[60%]">
        <div className="container relative h-full">
          <div className="float-y absolute right-4 top-[22%] flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.07] px-3 py-2 backdrop-blur-md sm:right-8 lg:right-16 lg:top-[26%]">
            <span className="grid size-8 place-items-center rounded-full bg-signal/90 shadow-[0_0_18px_hsl(357_78%_58%/0.6)]">
              <Plane className="size-4" />
            </span>
            <span className="text-left leading-tight">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-white/55">Njia</span>
              <span className="block text-[13px] font-semibold">Guangzhou → Dar</span>
            </span>
          </div>
          <div className="float-y float-y-2 absolute left-4 top-[46%] flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.07] px-3 py-2 backdrop-blur-md sm:left-8 lg:left-16 lg:top-[22%]">
            <span className="glow-pulse grid size-8 place-items-center rounded-full bg-[hsl(214_74%_62%)]">
              <BadgeCheck className="size-4" />
            </span>
            <span className="text-left leading-tight">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-white/55">Mshirika rasmi</span>
              <span className="block text-[13px] font-semibold">Air Tanzania</span>
            </span>
          </div>
        </div>
      </div>

      <div className="container relative mt-auto pb-10 pt-[58svh] sm:pb-14 lg:pb-20 lg:pt-[46svh]">
        <h1 className="rise text-balance font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)] sm:text-6xl xl:text-7xl">
          Kutoka China, <span className="text-signal">siku 3–10.</span>
        </h1>

        <form onSubmit={onSubmit} className="rise rise-2 mt-6 flex max-w-md gap-2">
          <div className="relative flex-1">
            <PackageSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/45" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="TX-000123"
              aria-label="Tracking or batch number"
              className="h-12 w-full rounded-xl border border-white/15 bg-[hsl(var(--ink)/0.55)] pl-10 pr-3 font-mono text-[16px] uppercase tabular text-white outline-none backdrop-blur-md transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-white/35 focus:border-white/45"
            />
          </div>
          <button
            type="submit"
            className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-signal px-5 font-semibold text-signal-foreground shadow-[0_0_24px_hsl(357_78%_58%/0.45)] transition-[filter] hover:brightness-110"
          >
            Fuatilia
            <ArrowRight className="size-4" />
          </button>
        </form>

        {nextFlight ? (
          <Link
            href="/schedule"
            className="rise rise-3 mt-5 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/12 bg-[hsl(var(--ink)/0.5)] px-3.5 py-1.5 text-xs text-white/80 backdrop-blur-md transition-colors hover:text-white"
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
    </section>
  );
}
