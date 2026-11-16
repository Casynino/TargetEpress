"use client";

import { useCallback, useRef, useState } from "react";

import { ART, ART_SIZE, ROUTE, ROUTE_ENDS, useHeroScene } from "@/components/site/hero-art";
import { AIRCRAFT_PATH } from "@/lib/aircraft";
import { cn } from "@/lib/utils";

/**
 * Public hero: the whole scene in one view, alive (owner, 16 Nov 2026: "show
 * all of it, not zoomed, no blur", "the truck moving, the plane moving,
 * realistic", "planes coming from China to Tanzania"). See hero-art.tsx for how
 * the picture is made to move, and globals.css (`.hero…`) for the layout: the
 * words above the picture on a phone, beside it on a wide screen.
 *
 * Words only, and few (owner, 16 Nov 2026: the tracking box and the line
 * under it were "too much"; then "huge and clean, key words, not too many",
 * with the days "very small"): three short lines that say the whole business
 * (buy in China, by air, to Dar) and the promise as a small label over them.
 * They stand beside or above the scene, never over it. Tracking and the next
 * flights are the first thing under the scene (TrackPill and the flights on
 * the homepage).
 */
export function Hero() {
  const [live, setLive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLImageElement>(null);
  const onLive = useCallback(() => setLive(true), []);
  useHeroScene(canvasRef, stageRef, pictureRef, onLive);

  return (
    <section className="hero">
      <canvas ref={canvasRef} aria-hidden className={cn("hero-canvas", live && "is-live")} />

      <div className="hero-copy container">
        <div className="pb-4 pt-24 sm:pb-8 sm:pt-28">
          {/* The promise, small: the three key words under it are what is read first. */}
          <p className="rise flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.26em] text-white/85 sm:text-[13px]">
            <span aria-hidden className="h-[3px] w-8 rounded-full bg-[#ff3140]" />
            Siku 3–10
          </p>
          {/* Three short lines, large. Sized to the screen so the longest stays on one line on the
              narrowest phone, and never so large on a computer that it leaves its column. */}
          <h1 className="mt-4 font-display text-[min(3rem,11.6vw)] font-extrabold uppercase leading-[0.98] tracking-[-0.045em] drop-shadow-[0_2px_18px_rgba(0,10,30,0.55)] sm:text-[3.4rem] xl:text-[3.8rem]">
            <span className="rise rise-1 block">Nunua China.</span>
            <span className="rise rise-2 block">Kwa ndege.</span>
            <span className="rise rise-3 block text-[#ff3140]">Hadi Dar.</span>
          </h1>
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
