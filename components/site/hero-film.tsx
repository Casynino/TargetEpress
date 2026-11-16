"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The homepage film, played the way the ZELab sign-in plays its own (owner,
 * 16 Nov 2026: "do what you did on ZELab, better"): a 3D scene rendered into a
 * 24-second loop — see scripts/hero-film — as an animated WebP, one for a phone
 * held upright and one for a screen held wide; the browser picks by
 * orientation.
 *
 * The poster (the film's first frame, a few dozen KB) is on screen at once.
 * The film, a few MB, is only asked for once the poster is showing and the
 * page has settled, and fades in over it when it has arrived, so nobody waits
 * on a dark screen. A phone on data saver, or one that asks for less motion,
 * keeps the poster and never downloads the film.
 */
const FILM = {
  poster: { portrait: "/brand/film/hero-portrait-poster.webp", landscape: "/brand/film/hero-landscape-poster.webp" },
  film: { portrait: "/brand/film/hero-portrait.webp", landscape: "/brand/film/hero-landscape.webp" },
} as const;

function Frames({ kind, className, onLoad }: { kind: keyof typeof FILM; className?: string; onLoad?: () => void }) {
  return (
    <picture className={className}>
      <source media="(orientation: portrait)" srcSet={FILM[kind].portrait} />
      {/* eslint-disable-next-line @next/next/no-img-element -- an animated WebP, played as it is */}
      <img
        src={FILM[kind].landscape}
        alt=""
        width={1920}
        height={1080}
        decoding="async"
        fetchPriority={kind === "poster" ? "high" : "low"}
        onLoad={onLoad}
        className="h-full w-full object-cover"
      />
    </picture>
  );
}

export function HeroFilm({ className }: { className?: string }) {
  const [start, setStart] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const still =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (still) return;
    // After the page has settled, so the film never competes with what the visitor came for.
    const go = () => setStart(true);
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback && w.cancelIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(go, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div aria-hidden className={cn("absolute inset-0 overflow-hidden", className)}>
      <Frames kind="poster" className="absolute inset-0" />
      {start ? (
        <Frames
          kind="film"
          onLoad={() => setShown(true)}
          className={cn("absolute inset-0 transition-opacity duration-1000", shown ? "opacity-100" : "opacity-0")}
        />
      ) : null}
    </div>
  );
}
