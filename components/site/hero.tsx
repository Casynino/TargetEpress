"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";

import { HeroArt } from "@/components/site/hero-art";
import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";

/**
 * Public hero: the owner's own picture, alive (16 Nov 2026: "I want that look,
 * moving like a video"). See HeroArt for what moves. On a computer the words
 * sit on the left and the picture fills the right, its edges feathered into
 * the night; on a phone the words come first and the picture runs the full
 * width under them.
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
    <section className="relative isolate overflow-hidden bg-[#0f1b30] text-white">
      {/* A deep glow behind the picture, so its edges have somewhere to fade to. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_70%_at_78%_50%,#182A48,transparent_72%)] max-lg:bg-[radial-gradient(ellipse_90%_45%_at_50%_75%,#182A48,transparent_72%)]" />

      <div className="container relative pt-24 sm:pt-28 lg:static lg:flex lg:min-h-[100svh] lg:items-center lg:pb-10 lg:pt-24">
        <div className="relative z-10 lg:max-w-[42%]">
          <h1 className="rise rise-1 text-balance font-display text-[2.5rem] font-bold leading-[1.02] tracking-tight drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)] sm:text-6xl xl:text-7xl">
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

        {/* The picture: full width under the words on a phone. */}
        {/* On a computer it runs off the right edge of the screen, its left, top and foot fading into the navy. */}
        <HeroArt className="-mx-4 mt-6 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_88%,transparent)] sm:mx-auto sm:max-w-[620px] lg:absolute lg:right-0 lg:top-1/2 lg:mx-0 lg:mt-0 lg:h-[min(94svh,980px,64vw)] lg:w-auto lg:max-w-none lg:-translate-y-1/2 lg:[-webkit-mask-composite:source-in] lg:[mask-composite:intersect] lg:[mask-image:linear-gradient(to_right,transparent,black_32%),linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]" />
      </div>
    </section>
  );
}
