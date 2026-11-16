"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";

import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";
import { IMAGES, img } from "@/lib/imagery";

/**
 * Public hero.
 *
 * One photograph, one sentence and the tracking field (owner, 16 Nov 2026: the
 * old split hero with its paragraph, three stacked buttons and a globe said too
 * much — "fewer words, more picture, well arranged"). The aircraft fills the
 * screen; the words sit low on it where the photograph is darkest.
 *
 * Tracking stays a field rather than a button: it is the single most common
 * reason anyone opens this site, and sending someone to another page to type a
 * number they already have in their hand is a step for nothing. The next
 * departure stays too, because a deadline is what turns "later" into "today".
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
    <section className="relative isolate flex min-h-[88svh] items-end overflow-hidden bg-[hsl(var(--ink))] text-white md:min-h-[92svh]">
      <Image
        src={img(IMAGES.airportNight, 2000, 72)}
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover object-[50%_35%]"
      />
      {/* Dark at the foot where the words are, open at the top where the
          aircraft is: the photograph does the work, the type stays legible. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-[hsl(var(--ink))] via-[hsl(var(--ink)/0.6)] to-[hsl(var(--ink)/0.2)]"
      />

      <div className="container pb-12 pt-32 md:pb-20">
        <p className="rise text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70 sm:text-xs">
          Guangzhou · Hong Kong → Dar es Salaam
        </p>
        <h1 className="rise rise-2 mt-4 max-w-3xl text-balance font-display text-[2.55rem] font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
          Mzigo wako kutoka China, <span className="text-signal">siku 3–10.</span>
        </h1>

        <form onSubmit={onSubmit} className="rise rise-3 mt-8 flex max-w-md gap-2">
          <div className="relative flex-1">
            <PackageSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/45" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="TX-000123"
              aria-label="Tracking or batch number"
              className="h-12 w-full rounded-xl border border-white/20 bg-black/30 pl-10 pr-3 font-mono text-[16px] uppercase tabular text-white outline-none backdrop-blur-md transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-white/35 focus:border-white/50"
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

        <div className="rise rise-4 mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <Link href="/pricing" className="inline-flex items-center gap-1.5 font-medium text-white/85 underline-offset-4 hover:text-white hover:underline">
            Bei ya mzigo <ArrowRight className="size-3.5" />
          </Link>
          <Link href="/book" className="inline-flex items-center gap-1.5 font-medium text-white/85 underline-offset-4 hover:text-white hover:underline">
            Book mzigo <ArrowRight className="size-3.5" />
          </Link>
          {nextFlight ? (
            <Link
              href="/schedule"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs text-white/75 backdrop-blur-md transition-colors hover:text-white"
            >
              <span className="size-1.5 rounded-full bg-signal" aria-hidden />
              Ndege inayofuata · {nextFlight.departureDay}
              <span className="text-white/50">{countdownLabel(nextFlight)}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
