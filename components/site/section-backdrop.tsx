import Image from "next/image";

import { img } from "@/lib/imagery";
import { cn } from "@/lib/utils";

/**
 * What sits behind a section.
 *
 * Every section on this site was a flat rectangle of one colour with cards
 * floating on it. No amount of adjusting the cards fixes that — the problem is
 * the empty field behind them, and it has to be solved once rather than eight
 * times.
 *
 * Three variants, so consecutive sections can differ without anyone inventing
 * a fourth:
 *
 *  - `aurora` — slow-drifting colour, like light moving behind the page
 *  - `quiet`  — depth without colour, for the page whose whole job is a figure
 *    somebody owes. Blue, gold and red washing behind a bill makes the amount
 *    look like part of a decoration, so this variant gets its structure from a
 *    grid, a single navy pool of light behind the card, and the ghost of the
 *    flight corridor along the top — nothing that competes for the eye with a
 *    number, and nothing that leaves the field a flat black rectangle either.
 *  - `stars`  — the same, with a field of stars over it
 *  - `photo`  — a photograph under a scrim heavy enough for body text
 *
 * All of it is CSS and one optional image. No canvas, no animation library:
 * these run on every section of a long page at once, on phones, on Tanzanian
 * mobile data. A backdrop that costs a frame budget is a backdrop that makes
 * the site feel worse than the empty rectangle it replaced.
 */

/**
 * Star positions, fixed rather than random.
 *
 * `Math.random()` at render time gives the server one set of stars and the
 * client another, and React throws a hydration mismatch. A seeded generator
 * evaluated once at module scope gives both the same sky.
 */
const STARS = (() => {
  let seed = 20260801;
  const rnd = () => {
    // Numerical Recipes LCG — deterministic, and good enough for dots.
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: 64 }, () => ({
    left: `${(rnd() * 100).toFixed(2)}%`,
    top: `${(rnd() * 100).toFixed(2)}%`,
    size: rnd() < 0.16 ? 2 : 1,
    delay: `${(rnd() * 6).toFixed(2)}s`,
    duration: `${(3 + rnd() * 4).toFixed(2)}s`,
  }));
})();

export function SectionBackdrop({
  variant = "aurora",
  image,
  className,
}: {
  variant?: "aurora" | "stars" | "photo" | "quiet";
  /** Required for `photo`; ignored otherwise. */
  image?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className
      )}
    >
      {variant === "photo" && image ? (
        <>
          <Image
            src={img(image, 1800)}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
          {/* Heavy enough that body text stays readable on any photograph,
              since these get swapped. */}
          <div className="absolute inset-0 bg-[hsl(var(--ink)/0.9)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--ink))] via-transparent to-[hsl(var(--ink))]" />
        </>
      ) : null}

      {/* Drifting colour. Three blobs at different speeds never line up, so the
          movement reads as ambient rather than as a loop.

          Skipped for `quiet`, and only for `quiet` — nine pages ask for stars
          today and get these blobs behind them, so removing them from `stars`
          would restyle the whole site to fix one page. */}
      {variant !== "quiet" ? (
        <>
          <div className="drift-a absolute -left-24 top-[-15%] h-[34rem] w-[34rem] rounded-full bg-brand/[0.13] blur-3xl" />
          <div className="drift-b absolute right-[-10%] top-[10%] h-[30rem] w-[30rem] rounded-full bg-gold/[0.09] blur-3xl" />
          <div className="drift-c absolute bottom-[-20%] left-[35%] h-[28rem] w-[28rem] rounded-full bg-signal/[0.08] blur-3xl" />
        </>
      ) : null}

      {variant === "stars" || variant === "quiet" ? (
        <div className="absolute inset-0">
          {STARS.map((star, i) => (
            <span
              key={i}
              className="twinkle absolute rounded-full bg-white"
              style={{
                left: star.left,
                top: star.top,
                width: star.size,
                height: star.size,
                animationDelay: star.delay,
                animationDuration: star.duration,
              }}
            />
          ))}
        </div>
      ) : null}

      {/*
        For `quiet`: light behind the card, and the corridor overhead.

        The field under the tracking result was a flat black rectangle with a
        few stars in it — the card looked like it had been dropped onto nothing.
        A pool of navy light gives it something to sit in, and two arcs at four
        per cent opacity carry the route from the hero down past the result
        without ever becoming a thing to look at. No gold, no red: the only
        figure on this page that should catch the eye is the one the customer
        owes.
      */}
      {variant === "quiet" ? (
        <>
          <div
            className="absolute inset-x-0 top-0 h-[38rem]"
            style={{
              background:
                "radial-gradient(60% 100% at 50% 0%, hsl(216 72% 34% / 0.22) 0%, transparent 70%)",
            }}
          />
          <div className="drift-a absolute left-1/2 top-[26%] h-[38rem] w-[52rem] -translate-x-1/2 rounded-full bg-brand/[0.07] blur-3xl" />
          <svg
            viewBox="0 0 1200 520"
            preserveAspectRatio="none"
            className="absolute inset-x-0 top-0 h-[26rem] w-full opacity-[0.16]"
          >
            <path
              d="M1180 40 Q 700 150 120 300"
              fill="none"
              stroke="hsl(205 90% 72%)"
              strokeWidth="1.2"
              strokeDasharray="6 10"
            />
            <path
              d="M1180 130 Q 640 300 60 400"
              fill="none"
              stroke="hsl(3 84% 60%)"
              strokeWidth="1.2"
              strokeDasharray="4 12"
            />
          </svg>
        </>
      ) : null}

      {/* A hairline grid, so the field has structure under the colour. */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--border)/0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)/0.5) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, #000 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, #000 20%, transparent 75%)",
        }}
      />
    </div>
  );
}
