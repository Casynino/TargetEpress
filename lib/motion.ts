"use client";

import { useEffect, useRef, useState } from "react";
import type { Transition, Variants } from "motion/react";

/**
 * Shared motion language.
 *
 * Three rules, applied everywhere:
 *  1. Entrances move a short distance (6–16px) and never bounce. Cargo software
 *     should feel precise, not playful.
 *  2. Nothing animates for longer than ~0.45s. Warehouse staff are working,
 *     not watching.
 *  3. Every animation is decoration. If it is switched off, the screen still
 *     works — see the prefers-reduced-motion block in globals.css.
 */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const transition: Transition = {
  duration: 0.24,
  ease: EASE_OUT,
};

export const transitionSlow: Transition = {
  duration: 0.42,
  ease: EASE_OUT,
};

/** Fade + short rise. The default entrance for panels and cards. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition },
};

/** For a list/grid of cards — children come in one after another. */
export const stagger = (gap = 0.05): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap } },
});

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition },
};

/** Scroll-reveal defaults, so every section reveals the same way. */
export const inView = {
  initial: "hidden" as const,
  whileInView: "show" as const,
  viewport: { once: true, margin: "-80px" },
};

/** True when the user has asked for reduced motion. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * Counts a number up on mount.
 *
 * Used on KPI figures. Returns the target immediately when reduced motion is
 * requested, so the number is never withheld from someone who just wants to
 * read it.
 */
export function useCountUp(target: number, duration = 900) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // Ease-out cubic: fast start, settles precisely on the value.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setValue(target);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration, reduced]);

  return value;
}
