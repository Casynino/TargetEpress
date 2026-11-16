"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BadgeCheck, PackageSearch } from "lucide-react";

import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";

/**
 * Public hero: the owner's own key art (16 Nov 2026) — the earth at dusk from
 * high up, the golden route from southern China landing on the Tanzanian
 * coast, an aircraft overhead — with the words beside it in the same navy as
 * its sky, so the picture and the page are one surface. On a phone the words
 * come first and the whole square picture sits under them; on a computer the
 * words are on the left and the picture fills the right, its edge fading out.
 *
 * Life is added on top of the picture rather than painted into it: the picture
 * drifts slowly closer, light runs along its golden route, and the two ends of
 * the route pulse. The overlay is drawn in the picture's own pixel grid
 * (1254 × 1254) and moves with it, so the light stays on the route. Nothing
 * moves for a phone that asks for less motion.
 *
 * Tracking stays a field rather than a button: it is the single most common
 * reason anyone opens this site, and sending someone to another page to type a
 * number they already have in their hand is a step for nothing.
 */
const SKY = "#011f48"; // the picture's own sky, measured, so the edges disappear
const ROUTE = "M 843 457 C 640 470, 390 500, 300 775"; // the golden arc, China → Dar, traced on the picture

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
    <section className="relative isolate overflow-hidden text-white" style={{ backgroundColor: SKY }}>
      <div className="container relative pt-24 sm:pt-28 lg:grid lg:min-h-[100svh] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-6 lg:pb-10 lg:pt-24">
        <div className="relative z-10">
          <p className="rise text-[11px] font-semibold uppercase tracking-[0.28em] text-[hsl(42_100%_72%)]">
            <span className="sm:hidden">China → Dar es Salaam</span>
            <span className="max-sm:hidden">Guangzhou · Hong Kong → Dar es Salaam</span>
          </p>
          <h1 className="rise rise-1 mt-3 text-balance font-display text-[2.4rem] font-bold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
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
                className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] pl-10 pr-3 font-mono text-[16px] uppercase tabular text-white outline-none backdrop-blur-md transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-white/35 focus:border-white/45"
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

          <div className="rise rise-3 mt-4 flex flex-wrap items-center gap-2">
            {nextFlight ? (
              <Link
                href="/schedule"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs text-white/80 backdrop-blur-md transition-colors hover:text-white"
              >
                <span className="relative flex size-2" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-signal" />
                </span>
                Ndege inayofuata · {nextFlight.departureDay}
                <span className="text-white/50">{countdownLabel(nextFlight)}</span>
              </Link>
            ) : null}
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs text-white/80 backdrop-blur-md">
              <BadgeCheck className="size-3.5 text-[hsl(214_74%_70%)]" />
              Mshirika rasmi wa Air Tanzania
            </span>
          </div>
        </div>

        {/* The picture. Square; full width on a phone, the right side on a computer. */}
        <div className="relative -mx-4 mt-6 aspect-square overflow-hidden sm:mx-auto sm:max-w-[620px] lg:mx-0 lg:mt-0 lg:max-w-none lg:-mr-[6vw]">
          <div className="ken-burns absolute inset-0 [transform-origin:45%_55%]">
            <Image
              src="/brand/hero-home.webp"
              alt="Ndege, meli na lori juu ya ramani: njia ya mzigo kutoka China hadi pwani ya Tanzania"
              fill
              priority
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-cover"
            />
            <svg aria-hidden viewBox="0 0 1254 1254" className="absolute inset-0 h-full w-full">
              <defs>
                <filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {/* Light running the route, two at a time. */}
              <g fill="none" filter="url(#hero-glow)" className="motion-reduce:hidden">
                <path d={ROUTE} pathLength={100} stroke="white" strokeWidth="7" strokeLinecap="round" strokeDasharray="5 95">
                  <animate attributeName="stroke-dashoffset" values="100;0" dur="3.2s" repeatCount="indefinite" />
                </path>
                <path d={ROUTE} pathLength={100} stroke="hsl(42 100% 75%)" strokeWidth="5" strokeLinecap="round" strokeDasharray="3 97">
                  <animate attributeName="stroke-dashoffset" values="100;0" dur="3.2s" begin="1.6s" repeatCount="indefinite" />
                </path>
              </g>
              {/* The two ends of the route breathing out. */}
              {[
                { x: 843, y: 457, colour: "hsl(42 100% 70%)" },
                { x: 300, y: 775, colour: "hsl(357 85% 62%)" },
              ].map((end) => (
                <circle key={end.x} cx={end.x} cy={end.y} r="12" fill="none" stroke={end.colour} strokeWidth="4" className="motion-reduce:hidden">
                  <animate attributeName="r" values="12;60" dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="0.9;0" dur="2.4s" repeatCount="indefinite" />
                </circle>
              ))}
            </svg>
          </div>
          {/* Edges fading into the page: the sky above, the left on a computer,
              the next section below. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[14%]" style={{ background: `linear-gradient(to bottom, ${SKY}, transparent)` }} />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[28%] lg:block" style={{ background: `linear-gradient(to right, ${SKY}, transparent)` }} />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[16%] bg-gradient-to-t from-[hsl(var(--ink))] to-transparent" />
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[hsl(var(--ink))] to-transparent" />
    </section>
  );
}
