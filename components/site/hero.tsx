"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BadgeCheck, PackageSearch } from "lucide-react";

import { HeroScene } from "@/components/site/hero-scene";
import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";

/**
 * Public hero (owner, 16 Nov 2026, holding up a logistics poster: "the sky on
 * top, the airplane moving, the map down below — exactly that look"). The words
 * sit high in the sky, few of them: the promise, the tracking field, the next
 * departure. The picture is `HeroScene`: clouds drifting, an airliner crossing
 * from China towards Tanzania, and the map below with golden routes into Dar.
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
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-[hsl(var(--ink))] text-white">
      <HeroScene className="-z-10" />

      <div className="container relative pt-24 sm:pt-28 lg:pt-32">
        <p className="rise text-[11px] font-semibold uppercase tracking-[0.28em] text-[hsl(42_100%_72%)]">
          <span className="sm:hidden">China → Dar es Salaam</span>
          <span className="max-sm:hidden">Guangzhou · Hong Kong → Dar es Salaam</span>
        </p>
        <h1 className="rise rise-1 mt-3 max-w-2xl text-balance font-display text-[2.4rem] font-bold leading-[1.02] tracking-tight drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)] sm:text-6xl xl:text-7xl">
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

        <div className="rise rise-3 mt-4 flex flex-wrap items-center gap-2">
          {nextFlight ? (
            <Link
              href="/schedule"
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/12 bg-[hsl(var(--ink)/0.5)] px-3 py-1.5 text-xs text-white/80 backdrop-blur-md transition-colors hover:text-white"
            >
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-signal" />
              </span>
              Ndege inayofuata · {nextFlight.departureDay}
            </Link>
          ) : null}
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/12 bg-[hsl(var(--ink)/0.5)] px-3 py-1.5 text-xs text-white/80 backdrop-blur-md">
            <BadgeCheck className="size-3.5 text-[hsl(214_74%_70%)]" />
            Mshirika rasmi wa Air Tanzania
          </span>
        </div>
      </div>
    </section>
  );
}
