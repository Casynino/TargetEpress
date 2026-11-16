"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";

import { ART, ART_SIZE, PLATE, ROUTE, ROUTE_ENDS, useHeroScene } from "@/components/site/hero-art";
import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Public hero: the scene fills the screen (owner, 16 Nov 2026: "full screen —
 * no block of colour beside the picture"; "the truck moving, the plane moving,
 * realistic"). See hero-art.tsx for how the picture is made to move.
 *
 * Layout is in globals.css (`.hero…`). On a phone the words sit in the sky and
 * the whole picture runs the full width under them. On a wide screen the
 * picture stands at the right, a little taller than the screen, and the same
 * scene carries on to the left edge out of focus, with the words on it.
 *
 * Tracking stays a field rather than a button: it is the single most common
 * reason anyone opens this site, and sending someone to another page to type a
 * number they already have in their hand is a step for nothing.
 */
export function Hero() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [live, setLive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLImageElement>(null);
  const onLive = useCallback(() => setLive(true), []);
  useHeroScene(canvasRef, stageRef, pictureRef, onLive);

  // Derived from today's date, never stored. See lib/flights.ts.
  const nextFlight = upcomingFlights(1)[0];

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(query);
    if (!code) return;
    router.push(`/track?q=${encodeURIComponent(code)}`);
  }

  return (
    <section className="hero">
      <canvas ref={canvasRef} aria-hidden className={cn("hero-canvas", live && "is-live")} />
      {/* The stills the canvas plays over, and all there is without it. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- the canvas reads these exact files */}
      <img src={PLATE} alt="" aria-hidden className="hero-plate" />
      <div aria-hidden className="hero-scrim" />

      <div className="hero-copy container">
        <div className="max-w-xl pb-6 pt-24 sm:pt-28 lg:pb-0 lg:pt-0">
          <h1 className="rise rise-1 text-balance font-display text-[2.5rem] font-bold leading-[1.02] tracking-tight drop-shadow-[0_2px_20px_rgba(0,10,30,0.6)] sm:text-6xl xl:text-7xl">
            Kutoka China, <span className="text-[#ff3140]">siku 3–10.</span>
          </h1>

          <form onSubmit={onSubmit} className="rise rise-2 mt-6 flex max-w-md gap-2">
            <div className="relative flex-1">
              <PackageSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/50" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="TX-000123"
                aria-label="Tracking or batch number"
                className="h-12 w-full rounded-xl border border-white/20 bg-[#00183d]/45 pl-10 pr-3 font-mono text-[16px] uppercase tabular text-white outline-none backdrop-blur-md transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-white/45 focus:border-white/55"
              />
            </div>
            <button
              type="submit"
              className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#D81E2A] px-5 font-semibold text-white shadow-[0_8px_28px_-6px_rgba(216,30,42,0.75)] transition-[filter] hover:brightness-110"
            >
              Fuatilia
              <ArrowRight className="size-4" />
            </button>
          </form>

          {nextFlight ? (
            <Link
              href="/schedule"
              className="rise rise-3 mt-4 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-[#00183d]/45 px-3 py-1.5 text-xs text-white/85 backdrop-blur-md transition-colors hover:text-white"
            >
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ff3140] opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-[#ff3140]" />
              </span>
              Ndege inayofuata · {nextFlight.departureDay}
              <span className="text-white/55">{countdownLabel(nextFlight)}</span>
            </Link>
          ) : null}
        </div>
      </div>

      <div ref={stageRef} className="hero-stage">
        {/* eslint-disable-next-line @next/next/no-img-element -- the canvas reads its pixels; it must be this exact file */}
        <img
          ref={pictureRef}
          src={ART}
          alt="Ndege na lori la Target Express juu ya ramani: njia ya mzigo kutoka China hadi pwani ya Tanzania"
          width={ART_SIZE}
          height={ART_SIZE}
          fetchPriority="high"
          decoding="async"
        />
        {/* Light running the route, China to Dar, and both ends breathing out. Drawn in the picture's own pixels. */}
        <svg aria-hidden viewBox={`0 0 ${ART_SIZE} ${ART_SIZE}`} className="motion-reduce:hidden">
          <defs>
            <filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g fill="none" filter="url(#hero-glow)">
            <path d={ROUTE} pathLength={100} stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="5 95">
              <animate attributeName="stroke-dashoffset" values="100;0" dur="3s" repeatCount="indefinite" />
            </path>
            <path d={ROUTE} pathLength={100} stroke="#ffd9d4" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="3 97">
              <animate attributeName="stroke-dashoffset" values="100;0" dur="3s" begin="1.5s" repeatCount="indefinite" />
            </path>
          </g>
          {[
            { at: ROUTE_ENDS.china, c: "#ffd27a" },
            { at: ROUTE_ENDS.dar, c: "#ff3b47" },
          ].map((e) => (
            <circle key={e.c} cx={e.at[0]} cy={e.at[1]} r="10" fill="none" stroke={e.c} strokeWidth="4">
              <animate attributeName="r" values="10;54" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.95;0" dur="2.4s" repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
      </div>

      <div aria-hidden className="hero-mist" />
    </section>
  );
}
