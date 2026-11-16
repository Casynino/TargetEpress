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
 * Public hero: a real airliner flying towards you through a bright sky of
 * white cloud (owner, 16 Nov 2026: "a nice background like clouds, white,
 * not that full blue"). The photograph drifts slowly closer, so the aircraft
 * keeps coming; a few soft clouds slide across in front of it. The words are
 * Target's navy on a white haze, the button its red: the promise, the tracking
 * field and the next departure, nothing else.
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
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-[hsl(205_70%_92%)] text-[hsl(217_45%_14%)]">
      {/* The aircraft in the sky, coming slowly closer. */}
      {/* On a computer the photograph sits right of centre, so the words on
          the left never land on the aircraft. */}
      <div aria-hidden className="absolute inset-0 -z-20 overflow-hidden lg:left-[18%] lg:right-[-18%]">
        <Image
          src={img(IMAGES.planeSky, 2200, 80)}
          alt=""
          fill
          priority
          sizes="100vw"
          className="ken-burns object-cover object-[50%_55%] [transform-origin:50%_50%]"
        />
      </div>
      {/* A white haze where the words are: across the top on a phone, down the
          left on a computer. The aircraft stays clear. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 lg:hidden"
        style={{ background: "linear-gradient(to bottom, rgb(255 255 255 / 0.92) 0%, rgb(255 255 255 / 0.78) 34%, rgb(255 255 255 / 0) 58%)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 max-lg:hidden"
        style={{ background: "linear-gradient(to right, rgb(255 255 255 / 0.94) 0%, rgb(255 255 255 / 0.8) 32%, rgb(255 255 255 / 0) 60%)" }}
      />
      {/* Soft clouds sliding across in front. */}
      <div aria-hidden className="drift-cloud left-[-15%] bottom-[8%] -z-10 h-[16%] w-[70%] opacity-80" />
      <div aria-hidden className="drift-cloud drift-cloud-2 right-[-20%] bottom-[18%] -z-10 h-[12%] w-[60%] opacity-70" />

      <div className="container relative pt-24 sm:pt-28 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-20">
        <div className="max-w-xl">
          <h1 className="rise rise-1 text-balance font-display text-[2.5rem] font-bold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
            Kutoka China, <span className="text-signal">siku 3–10.</span>
          </h1>

          <form onSubmit={onSubmit} className="rise rise-2 mt-6 flex max-w-md gap-2">
            <div className="relative flex-1">
              <PackageSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[hsl(217_30%_40%)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="TX-000123"
                aria-label="Tracking or batch number"
                className="h-12 w-full rounded-xl border border-[hsl(214_30%_80%)] bg-white pl-10 pr-3 font-mono text-[16px] uppercase tabular text-[hsl(217_45%_14%)] shadow-[0_8px_24px_-12px_rgba(15,30,60,0.35)] outline-none transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-[hsl(217_20%_55%)] focus:border-signal/60"
              />
            </div>
            <button
              type="submit"
              className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-signal px-5 font-semibold text-signal-foreground shadow-[0_10px_24px_-10px_hsl(357_78%_45%/0.7)] transition-[filter] hover:brightness-110"
            >
              Fuatilia
              <ArrowRight className="size-4" />
            </button>
          </form>

          {nextFlight ? (
            <Link
              href="/schedule"
              className="rise rise-3 mt-4 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[hsl(214_30%_85%)] bg-white/85 px-3 py-1.5 text-xs text-[hsl(217_30%_25%)] shadow-sm backdrop-blur-md transition-colors hover:text-[hsl(217_45%_14%)]"
            >
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-signal" />
              </span>
              Ndege inayofuata · {nextFlight.departureDay}
              <span className="text-[hsl(217_20%_50%)]">{countdownLabel(nextFlight)}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
