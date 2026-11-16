"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";

import { HeroFilm } from "@/components/site/hero-film";
import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";

/**
 * Public hero: the film (owner, 16 Nov 2026, "do what you did on the ZELab
 * sign-in — realistic, moving"). The earth at night from high over the Indian
 * Ocean, Target's red route from Guangzhou and Hong Kong into Dar es Salaam
 * with light running along it, a Target airliner crossing the sky, a container
 * ship sailing and a Target truck on the coast road — rendered in 3D into a
 * looping film (scripts/hero-film) and played by HeroFilm.
 *
 * The words sit in the dark sky at the top: the promise, the tracking field
 * and the next departure, nothing else. Tracking stays a field rather than a
 * button: it is the single most common reason anyone opens this site.
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
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-[#070d1a] text-white">
      <HeroFilm className="-z-20 lg:inset-auto lg:left-[24%] lg:right-0 lg:top-1/2 lg:aspect-video lg:-translate-y-1/2 lg:[mask-image:radial-gradient(ellipse_62%_62%_at_58%_50%,black_58%,transparent_100%)]" />
      {/* On a computer the whole film shows, right of the words, its edges feathered into the night. */}
      {/* Night laid over the top of the sky, so the words read on any frame. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[52%] bg-gradient-to-b from-[#060b16]/85 via-[#060b16]/45 to-transparent lg:h-[45%]" />

      <div className="container relative pt-24 sm:pt-28 lg:pt-32">
        <h1 className="rise rise-1 max-w-2xl text-balance font-display text-[2.5rem] font-bold leading-[1.02] tracking-tight drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)] sm:text-6xl xl:text-7xl">
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
              className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.08] pl-10 pr-3 font-mono text-[16px] uppercase tabular text-white outline-none backdrop-blur-md transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-white/40 focus:border-white/45"
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
            className="rise rise-3 mt-4 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.08] px-3 py-1.5 text-xs text-white/80 backdrop-blur-md transition-colors hover:text-white"
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
