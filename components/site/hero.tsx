"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";

import { ART, ART_SIZE, ROUTE, ROUTE_ENDS, useHeroScene } from "@/components/site/hero-art";
import { AIRCRAFT_PATH } from "@/lib/aircraft";
import { daysAwaySwahili, SWAHILI_DAYS, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Public hero: the whole scene in one view, alive (owner, 16 Nov 2026: "show
 * all of it, not zoomed, no blur", "the truck moving, the plane moving,
 * realistic", "planes coming from China to Tanzania"). See hero-art.tsx for how
 * the picture is made to move, and globals.css (`.hero…`) for the layout: the
 * words above the picture on a phone, beside it on a wide screen.
 *
 * Few words (owner, 16 Nov 2026: "those words are too much", and the panel
 * under them; then "use very less words"): the promise, one field and one
 * line. Tracking stays a field rather than a button: it is the single
 * most common reason anyone opens this site, and sending someone to another
 * page to type a number they already have in their hand is a step for nothing.
 * The next plane is the one date a buyer needs before anything else.
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
  const next = upcomingFlights(1)[0];

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(query);
    if (!code) return;
    router.push(`/track?q=${encodeURIComponent(code)}`);
  }

  return (
    <section className="hero">
      <canvas ref={canvasRef} aria-hidden className={cn("hero-canvas", live && "is-live")} />

      <div className="hero-copy container">
        <div className="pb-5 pt-24 sm:pb-8 sm:pt-28">
          <h1 className="rise text-balance font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] drop-shadow-[0_2px_18px_rgba(0,10,30,0.55)] sm:text-[2.6rem] xl:text-[3rem]">
            Mzigo wako kutoka China, <span className="text-[#ff3140]">ndani ya siku 3–10.</span>
          </h1>

          {/* One field, one button. */}
          <form
            onSubmit={onSubmit}
            className="rise rise-1 mt-7 flex max-w-[25rem] items-center gap-2 rounded-full border border-white/20 bg-[#04193f]/80 p-1.5 pl-4 shadow-[0_18px_44px_-22px_rgba(0,0,0,0.9)] transition-colors focus-within:border-white/55"
          >
            <label htmlFor="hero-track" className="sr-only">
              Fuatilia mzigo wako
            </label>
            <PackageSearch aria-hidden className="size-[18px] shrink-0 text-white/50" />
            <input
              id="hero-track"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="TX-000123"
              autoComplete="off"
              className="h-10 min-w-0 flex-1 bg-transparent font-mono text-[16px] uppercase tabular text-white outline-none placeholder:text-white/40"
            />
            <button
              type="submit"
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#D81E2A] px-4 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
            >
              Fuatilia
              <ArrowRight className="size-4" />
            </button>
          </form>

          {/* The next plane, in one line; the rest of the timetable is a press away. */}
          {next ? (
            <Link
              href="/schedule"
              className="rise rise-2 group mt-4 inline-flex items-center gap-2.5 text-[13px] text-white/70 transition-colors hover:text-white"
            >
              <span className="relative flex size-1.5" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ff3140] opacity-70 motion-reduce:animate-none" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[#ff3140]" />
              </span>
              {/* The date is today's on the visitor's own clock, which can be a day on from the server's. */}
              <span suppressHydrationWarning>
                Ndege ijayo:{" "}
                <span suppressHydrationWarning className="font-semibold text-white">
                  {SWAHILI_DAYS[next.departsAt.getDay()]} {next.departsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                <span className="mx-1.5 text-white/30">·</span>
                {daysAwaySwahili(next.daysAway)}
              </span>
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
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
        {/* On the map: aircraft flying the route from China to Dar, and both ends breathing out.
            Drawn in the picture's own pixels, so they sit on its red line at any size. */}
        <svg aria-hidden viewBox={`0 0 ${ART_SIZE} ${ART_SIZE}`} className="motion-reduce:hidden">
          <defs>
            <filter id="hero-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[
            { at: ROUTE_ENDS.china, c: "#ffd27a" },
            { at: ROUTE_ENDS.dar, c: "#ff3b47" },
          ].map((e) => (
            <circle key={e.c} cx={e.at[0]} cy={e.at[1]} r="10" fill="none" stroke={e.c} strokeWidth="4">
              <animate attributeName="r" values="10;54" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.95;0" dur="2.4s" repeatCount="indefinite" />
            </circle>
          ))}
          {[0, 1, 2].map((i) => (
            <g key={i} filter="url(#hero-glow)" opacity="0">
              {/* a wake of light behind it, then the aircraft itself, nose first along the line */}
              <path d="M -44 0 L -6 0" stroke="white" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />
              <path d={AIRCRAFT_PATH} transform="scale(1.9)" fill="white" />
              <animateMotion path={ROUTE} dur="10.5s" begin={`${i * 3.5}s`} repeatCount="indefinite" rotate="auto" />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.07;0.9;1" dur="10.5s" begin={`${i * 3.5}s`} repeatCount="indefinite" />
            </g>
          ))}
        </svg>
      </div>

      <div aria-hidden className="hero-mist" />
    </section>
  );
}
