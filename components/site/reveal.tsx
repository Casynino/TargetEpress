"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Reveals its children as they scroll into view.
 *
 * Three rules it follows, because scroll animation is usually done badly:
 *
 *  1. Content is visible before JavaScript runs. The hidden state is applied by
 *     the effect, not the server, so a reader with a slow connection or a
 *     failed bundle sees a normal page rather than a blank one.
 *  2. It reveals once and disconnects. Elements that re-animate every time you
 *     scroll past make a page feel restless and cost battery on a phone.
 *  3. It defers entirely to prefers-reduced-motion — no transform, no
 *     transition, nothing to opt out of.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Milliseconds, for staggering a row of cards. Keep under ~200. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm) {
      setShown(true);
      return;
    }

    // Already on screen at load (above the fold): show it without animating in,
    // so the first paint is not a page of empty boxes sliding about.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) {
      setArmed(true);
      setShown(true);
      return;
    }

    setArmed(true);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      // Fires a little before the element reaches the viewport, so the motion
      // has finished by the time it is properly in view.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      style={shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        armed && "transition-[opacity,transform] duration-700 ease-out",
        armed && !shown && "translate-y-6 opacity-0",
        armed && shown && "translate-y-0 opacity-100",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** Staggers a list of children by index. Caps the delay so long lists do not crawl. */
export function RevealGroup({
  children,
  step = 70,
  className,
}: {
  children: React.ReactNode[];
  step?: number;
  className?: string;
}) {
  return (
    <>
      {children.map((child, index) => (
        <Reveal key={index} delay={Math.min(index * step, 280)} className={className}>
          {child}
        </Reveal>
      ))}
    </>
  );
}
