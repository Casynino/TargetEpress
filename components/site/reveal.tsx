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

/**
 * The same three rules as Reveal, as a hook: whether the element has come into
 * view (`shown`), and whether the hidden state may be applied at all (`armed` —
 * never before JavaScript has run, never for a reader who asked for less
 * motion, never for something already on screen at load).
 */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    if (node.getBoundingClientRect().top < window.innerHeight * 0.9) {
      setArmed(true);
      setShown(true);
      return;
    }
    setArmed(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, armed, shown };
}

/**
 * A heading whose words rise into place one after another as it scrolls into
 * view (owner, 16 Nov 2026: "the text should move, as on ORA"). Each word
 * sits in its own clipped box and slides up out of it. The words are real text
 * in a real heading: a screen reader, a search engine and a browser without
 * JavaScript all get the plain sentence.
 */
export function RevealWords({
  text,
  as: Tag = "h2",
  className,
  accent,
}: {
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  /** Words from this index on take the accent colour. */
  accent?: { from: number; className: string };
}) {
  const { ref, armed, shown } = useInView<HTMLHeadingElement>();
  const words = text.split(" ");
  return (
    <Tag ref={ref as never} className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <span
            style={{ transitionDelay: `${Math.min(i * 55, 440)}ms` }}
            className={cn(
              "inline-block",
              accent && i >= accent.from && accent.className,
              armed && "transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.1,1)]",
              armed && !shown && "translate-y-[110%]"
            )}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </Tag>
  );
}

/**
 * A figure that counts up to its value when it scrolls into view. The server
 * renders the real figure, so it is right before JavaScript runs and for
 * anyone who asked for less motion.
 */
export function CountUp({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const { ref, armed, shown } = useInView<HTMLSpanElement>();
  const [n, setN] = useState(value);

  useEffect(() => {
    if (!armed || !shown) return;
    let raf = 0;
    const started = performance.now(), ms = 1300;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ms);
      setN(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [armed, shown, value]);

  return (
    <span ref={ref} className={className}>
      {(armed && !shown ? 0 : n).toLocaleString()}
      {suffix}
    </span>
  );
}

/**
 * Tells its own box how far the page has been scrolled through it, as `--p`
 * (0 to 1) for CSS to move things by: the markets row that runs sideways, a
 * photograph that lags behind the page. `pin` counts while the box is pinned
 * to the screen (it is taller than the screen); `through` counts from the box
 * entering at the foot of the screen to leaving at the top; `centre` is how
 * far down the box the middle of the screen has got. One listener, one
 * style write per frame; nothing is written for someone who asked for less
 * motion, so the CSS falls back to its still layout.
 */
export function ScrollProgress({
  mode = "through",
  as: Tag = "div",
  className,
  children,
  ...rest
}: {
  mode?: "pin" | "through" | "centre";
  as?: "div" | "section" | "ol";
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = node.getBoundingClientRect(), vh = window.innerHeight;
      const p =
        mode === "pin" ? -r.top / Math.max(1, r.height - vh) : mode === "centre" ? (vh * 0.56 - r.top) / Math.max(1, r.height) : (vh - r.top) / Math.max(1, r.height + vh);
      node.style.setProperty("--p", Math.min(1, Math.max(0, p)).toFixed(4));
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      cancelAnimationFrame(frame);
    };
  }, [mode]);

  return (
    <Tag ref={ref as never} className={className} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * A card that leans toward the mouse and catches a little light where the
 * pointer is (`.tilt` in globals.css). A mouse only: a finger has no hover, and
 * a card that lurches under a thumb is a nuisance. Nothing moves for someone
 * who asked for less motion.
 */
export function Tilt({ className, children, max = 4 }: { className?: string; children: React.ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  function onMove(event: React.PointerEvent<HTMLDivElement>) {
    const node = ref.current;
    if (!node || event.pointerType !== "mouse") return;
    const r = node.getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width, y = (event.clientY - r.top) / r.height;
    node.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    node.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    node.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    node.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
  }
  function onLeave() {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--rx", "0deg");
    node.style.setProperty("--ry", "0deg");
  }

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={cn("tilt", className)}>
      {children}
      <span aria-hidden className="tilt-sheen" />
    </div>
  );
}
