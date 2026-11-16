"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

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
 * Words only (owner, 16 Nov 2026: the tracking box and the line under it
 * were "too much"; then "huge and clean", with the days "very small"). The
 * words and their lettering are the company's own poster, which the owner
 * sent: "Bei zimedondoka, speed ile ile!", the China to Tanzania pill, and its
 * one line of copy. Never a Swahili phrase made up here: one was tried
 * ("Nunua China. Kwa ndege.") and the owner threw it out as bad Swahili. The
 * words stand beside or above the scene, never over it. Tracking and the next
 * flights are the first thing under the scene.
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
        <div className="pb-5 pt-[6.75rem] sm:pb-8 sm:pt-28">
          {/* The company's own poster headline, lettered as on the poster (`.poster…` in globals.css):
              the first two lines on its red banner, the third with its red stroke under it. Sized to
              the screen, and kept modest on a phone (the owner found it "too big" there): it stands
              in the sky over the picture and must leave the picture alone. */}
          <h1 className="poster text-[min(3.4rem,11.6vw)] sm:text-[4.3rem] xl:text-[4.6rem]">
            <span className="rise poster-line poster-red">Bei</span>
            <span className="rise rise-1 poster-line poster-red">zimedondoka,</span>
            <span className="rise rise-2 poster-line poster-swoosh">Speed ile ile!</span>
          </h1>
          <div className="rise rise-3 mt-5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
            <span className="inline-flex h-9 items-stretch overflow-hidden rounded-full border-2 border-white bg-[#182A48] font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-white shadow-[0_10px_26px_-12px_rgba(0,0,0,0.8)] sm:h-10 sm:text-sm">
              <span className="flex items-center bg-[#D81E2A] pl-4 pr-5 [clip-path:polygon(0_0,100%_0,calc(100%-10px)_100%,0_100%)]">China</span>
              <span className="flex items-center gap-2 pl-1.5 pr-4">
                <ArrowRight aria-hidden className="size-4" strokeWidth={3} />
                Tanzania
              </span>
            </span>
            <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.2em] text-white/85">Siku 3–10</span>
          </div>
          {/* The poster's own line. Left off a phone, where the scene needs the room. */}
          <p className="rise rise-4 mt-4 max-w-[22rem] text-[15px] leading-relaxed text-white/80 max-sm:hidden">
            Tuma mzigo wako kwa bei nafuu zaidi bila kuacha kufurahia huduma ya haraka!
          </p>
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
