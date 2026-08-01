"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * A field of particles with real depth, rendered around the content.
 *
 * The trick worth stealing from the reference reel is not the particles — it
 * is that some of them are drawn *in front of* the text. A backdrop always
 * sits behind everything, so the page stays flat no matter how much is moving
 * in it. Put a handful of large, soft, out-of-focus motes over the headline
 * and the section suddenly has a near plane and a far plane, and the text
 * reads as sitting inside a space rather than on top of a picture.
 *
 * That is why this renders two canvases: one below the content, one above it.
 * Particles are assigned to a canvas by depth every frame, so a mote drifting
 * toward the viewer crosses from behind the headline to in front of it.
 *
 * Canvas 2D with a hand-rolled perspective divide, not Three.js. The whole
 * effect is points, and a WebGL runtime for points would cost more to download
 * on Tanzanian mobile data than every other asset on the page combined.
 */

type Particle = {
  /** Normalised to the field, roughly -1.1..1.1 — see the note in the effect. */
  x: number;
  y: number;
  z: number;
  /** Per-particle drift so the field never moves as one sheet. */
  vx: number;
  vy: number;
  vz: number;
  hue: "brand" | "gold" | "signal" | "white";
};

/** Where the near plane sits. Particles nearer than this are drawn in front. */
const NEAR_PLANE = 260;
const FOCAL = 620;
const DEPTH = 1400;

function readColour(el: HTMLElement, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
}

export function ParticleField({
  count = 130,
  className,
  /** Higher pulls the field toward the pointer more strongly. */
  parallax = 0.02,
}: {
  count?: number;
  className?: string;
  parallax?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    if (!wrap || !back || !front) return;

    const bctx = back.getContext("2d");
    const fctx = front.getContext("2d");
    if (!bctx || !fctx) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const palette = {
      brand: readColour(wrap, "--brand", "hsl(213 84% 64%)"),
      gold: readColour(wrap, "--gold", "hsl(43 78% 62%)"),
      signal: readColour(wrap, "--signal", "hsl(3 84% 58%)"),
      white: "#ffffff",
    };

    let w = 0;
    let h = 0;
    let dpr = 1;

    function size() {
      const r = wrap!.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      for (const c of [back!, front!]) {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      bctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();

    // Deterministic enough, and cheap. The field is decorative, so a simple
    // LCG beats pulling in a seeded-random dependency.
    let seed = 987654321;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const hues: Particle["hue"][] = [
      "brand",
      "brand",
      "brand",
      "gold",
      "signal",
      "white",
    ];

    // Positions are normalised rather than measured in pixels.
    //
    // They used to be seeded from w and h, which are whatever the element
    // measured on the very first frame. If that measurement is zero — a
    // background tab, a collapsed pane, a parent that is still display:none —
    // every particle is seeded into a one-pixel box and stays clustered in the
    // middle forever, because seeding only happens once. Normalised units are
    // multiplied by the current size at draw time, so the field fills whatever
    // the element becomes.
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: (rnd() - 0.5) * 2.2,
      y: (rnd() - 0.5) * 2.2,
      z: rnd() * DEPTH,
      vx: (rnd() - 0.5) * 0.00016,
      vy: (rnd() - 0.5) * 0.00016,
      vz: -(0.25 + rnd() * 0.7),
      hue: hues[Math.floor(rnd() * hues.length)],
    }));

    // Pointer parallax, eased rather than followed exactly — a field that
    // tracks the cursor one-to-one feels attached to it.
    let targetX = 0;
    let targetY = 0;
    let panX = 0;
    let panY = 0;

    function onPointer(event: PointerEvent) {
      const r = wrap!.getBoundingClientRect();
      targetX = (event.clientX - (r.left + r.width / 2)) * parallax;
      targetY = (event.clientY - (r.top + r.height / 2)) * parallax;
    }
    window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;

    function draw() {
      panX += (targetX - panX) * 0.05;
      panY += (targetY - panY) * 0.05;

      bctx!.clearRect(0, 0, w, h);
      fctx!.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      for (const p of particles) {
        if (!calm) {
          p.x += p.vx;
          p.y += p.vy;
          p.z += p.vz;
        }

        // Recycle to the back once it passes the camera, so the field never
        // empties out.
        if (p.z <= 1) {
          p.z = DEPTH;
          p.x = (rnd() - 0.5) * 2.2;
          p.y = (rnd() - 0.5) * 2.2;
        }

        const scale = FOCAL / (FOCAL + p.z);
        const sx = cx + (p.x * w + panX * (1 - scale) * 8) * scale;
        const sy = cy + (p.y * h + panY * (1 - scale) * 8) * scale;

        if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;

        const near = p.z < NEAR_PLANE;
        const ctx = near ? fctx! : bctx!;

        // Far particles are small and faint; near ones bloom and go soft, the
        // way something too close to a lens does.
        const radius = near ? 2 + (1 - p.z / NEAR_PLANE) * 9 : 0.6 + scale * 2.2;
        const alpha = near
          ? 0.16 * (1 - p.z / NEAR_PLANE) + 0.05
          : 0.12 + scale * 0.5;

        ctx.globalAlpha = Math.min(alpha, 0.85);
        ctx.fillStyle = palette[p.hue];

        if (near) {
          ctx.filter = "blur(3px)";
          ctx.beginPath();
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.filter = "none";
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      bctx!.globalAlpha = 1;
      fctx!.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    }

    draw();

    const observer = new ResizeObserver(() => size());
    observer.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, [count, parallax]);

  return (
    <div ref={wrapRef} className={cn("pointer-events-none absolute inset-0", className)}>
      <canvas ref={backRef} className="absolute inset-0 -z-10" />
      {/* The near plane. z-20 puts it above content sitting at z-10, which is
          the whole point — see the note at the top. */}
      <canvas ref={frontRef} className="absolute inset-0 z-20" />
    </div>
  );
}
