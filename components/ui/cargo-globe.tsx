"use client";

import { useEffect, useRef } from "react";
import { geoContains, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from "d3-geo";
import { timer, type Timer } from "d3-timer";

import { AIRCRAFT_LENGTH, traceAircraft } from "@/lib/aircraft";
import { cn } from "@/lib/utils";

/**
 * The route, on a rotating earth.
 *
 * A dotted wireframe globe with the great circle from Guangzhou to Dar es
 * Salaam drawn on it and an aircraft flying the line. It is the one piece of
 * the site that has to make somebody stop, and it earns that by showing the
 * actual thing the company does rather than decorating.
 *
 * Deliberate departures from the usual version of this component:
 *
 *  - **The land data is vendored**, not fetched from GitHub at runtime. A
 *    homepage that waits on a third-party raw file before it can draw is a
 *    homepage that is blank whenever that host is slow.
 *  - **No scroll-to-zoom.** Capturing the wheel on a full-width landing
 *    element means a visitor scrolling the page instead zooms a globe and
 *    cannot get past it. Drag to spin is kept; the wheel belongs to the page.
 *  - **Dots are computed once** on a fixed global grid and cached at module
 *    scope, so returning to the page is instant and the work does not scale
 *    with how many land polygons happen to be in view.
 *  - **Colours come from the theme**, read off CSS custom properties, so the
 *    globe matches the brand in both light and dark rather than being a black
 *    circle bolted onto the page.
 */

const DAR: [number, number] = [39.28, -6.79];

/**
 * The same four lanes the flat route map draws, on the sphere.
 *
 * Kept in the same order and with the same wording as `route-map.tsx` so the
 * two never drift apart — a globe claiming a route the map below it does not
 * show is worse than either on its own.
 *
 * `offset` staggers the aircraft so they do not fly in formation. `dy` nudges
 * a label off its marker: Guangzhou and Hong Kong are 90 km apart and their
 * labels collide at this scale.
 */
type Lane = {
  city: string;
  at: [number, number];
  main: boolean;
  offset: number;
  dy: number;
};

const LANES: Lane[] = [
  { city: "Guangzhou", at: [113.26, 23.13], main: true, offset: 0, dy: -16 },
  { city: "Hong Kong", at: [114.17, 22.32], main: true, offset: 0.25, dy: 22 },
  { city: "Dubai", at: [55.27, 25.2], main: false, offset: 0.5, dy: -16 },
  { city: "Addis Ababa", at: [38.74, 8.98], main: false, offset: 0.75, dy: -16 },
];

/** Longitude that puts the whole network on screen at once. */
const ROUTE_CENTRE = -(113.26 + DAR[0]) / 2;

type Dot = [number, number];

/**
 * Land dots, computed once for the lifetime of the tab.
 *
 * A fixed lat/lng grid rather than per-polygon bounding boxes: it costs the
 * same regardless of which countries are in view, and it distributes evenly
 * instead of clumping around small islands.
 */
let dotCache: Dot[] | null = null;

function landDots(features: GeoJSON.FeatureCollection, step: number): Dot[] {
  if (dotCache) return dotCache;

  const dots: Dot[] = [];
  for (let lng = -180; lng <= 180; lng += step) {
    for (let lat = -84; lat <= 84; lat += step) {
      const point: Dot = [lng, lat];
      for (const feature of features.features) {
        if (geoContains(feature, point)) {
          dots.push(point);
          break;
        }
      }
    }
  }
  dotCache = dots;
  return dots;
}

function readColour(el: HTMLElement, variable: string, fallback: string) {
  const value = getComputedStyle(el).getPropertyValue(variable).trim();
  return value ? `hsl(${value})` : fallback;
}

export function CargoGlobe({
  className,
  /** Degrees per frame. Slow — this sits behind text people are reading. */
  spin = 0.12,
}: {
  className?: string;
  spin?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const palette = {
      ocean: readColour(wrap, "--ink", "hsl(217 45% 8%)"),
      land: readColour(wrap, "--brand", "hsl(213 84% 64%)"),
      grid: readColour(wrap, "--muted-foreground", "hsl(216 14% 62%)"),
      route: readColour(wrap, "--signal", "hsl(3 84% 58%)"),
      transit: readColour(wrap, "--gold", "hsl(43 78% 62%)"),
    };

    let features: GeoJSON.FeatureCollection | null = null;
    let dots: Dot[] = [];
    let frame: Timer | null = null;
    let cancelled = false;

    // State that the render loop reads.
    let lambda = ROUTE_CENTRE;
    let phi = -12;
    let progress = 0;
    let dragging = false;

    const projection = geoOrthographic().clipAngle(90);
    const path = geoPath(projection, context);

    /** Great-circle position at t, one per lane, for the aircraft. */
    const along = LANES.map((lane) => geoInterpolate(lane.at, DAR));

    function size() {
      const rect = wrap!.getBoundingClientRect();
      const side = Math.max(240, Math.min(rect.width, rect.height || rect.width));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas!.width = side * dpr;
      canvas!.height = side * dpr;
      canvas!.style.width = `${side}px`;
      canvas!.style.height = `${side}px`;
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);

      projection.scale(side / 2 - 2).translate([side / 2, side / 2]);
      return side;
    }

    let side = size();

    // Paint the sphere before the land data arrives, so the element never
    // occupies space as a blank rectangle. Gating visibility on React state
    // is what left this invisible when a fetch resolved after an unmount.
    projection.rotate([lambda, phi]);
    context.beginPath();
    path({ type: "Sphere" });
    context.fillStyle = palette.ocean;
    context.fill();

    /** True when a lon/lat is on the hemisphere facing the viewer. */
    function facing(point: [number, number]) {
      const centre: [number, number] = [-lambda, -phi];
      return geoDistance(point, centre) < Math.PI / 2;
    }

    function draw() {
      projection.rotate([lambda, phi]);
      context!.clearRect(0, 0, side, side);

      // Globe body
      context!.beginPath();
      path({ type: "Sphere" });
      context!.fillStyle = palette.ocean;
      context!.globalAlpha = 0.55;
      context!.fill();
      context!.globalAlpha = 1;

      // Graticule, very faint — it reads as engineering, not decoration
      context!.beginPath();
      path(geoGraticule10());
      context!.strokeStyle = palette.grid;
      context!.globalAlpha = 0.18;
      context!.lineWidth = 0.5;
      context!.stroke();
      context!.globalAlpha = 1;

      // Land, as dots
      context!.fillStyle = palette.land;
      for (const dot of dots) {
        if (!facing(dot)) continue;
        const p = projection(dot);
        if (!p) continue;
        context!.beginPath();
        context!.arc(p[0], p[1], side > 700 ? 1.7 : side > 420 ? 1.35 : 1, 0, Math.PI * 2);
        context!.fill();
      }

      // The routes. Transit lanes are thinner and gold so the two the company
      // actually loads at read as the primary pair.
      for (const [index, lane] of LANES.entries()) {
        context!.beginPath();
        path({
          type: "LineString",
          coordinates: [lane.at, DAR],
        } as GeoJSON.LineString);
        context!.strokeStyle = lane.main ? palette.route : palette.transit;
        context!.globalAlpha = lane.main ? 0.85 : 0.55;
        context!.lineWidth = lane.main ? 2 : 1.2;
        context!.setLineDash(lane.main ? [5, 7] : [3, 6]);
        context!.stroke();
        context!.setLineDash([]);
        context!.globalAlpha = 1;
        void index;
      }

      // Origin markers
      for (const lane of LANES) {
        if (!facing(lane.at)) continue;
        const p = projection(lane.at);
        if (!p) continue;

        const colour = lane.main ? palette.route : palette.transit;

        context!.beginPath();
        context!.arc(p[0], p[1], lane.main ? 3.5 : 2.6, 0, Math.PI * 2);
        context!.fillStyle = colour;
        context!.fill();

        context!.beginPath();
        context!.arc(p[0], p[1], lane.main ? 8 : 6, 0, Math.PI * 2);
        context!.strokeStyle = colour;
        context!.globalAlpha = 0.35;
        context!.lineWidth = 1;
        context!.stroke();
        context!.globalAlpha = 1;

        // Five labels on a small sphere is clutter, so they only appear once
        // there is room for them.
        if (side > 420) {
          context!.font = `600 ${lane.main ? 11 : 10}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
          context!.fillStyle = colour;
          context!.textAlign = "center";
          context!.globalAlpha = lane.main ? 1 : 0.8;
          context!.fillText(lane.city, p[0], p[1] + lane.dy);
          context!.globalAlpha = 1;
        }
      }

      // Destination. Every lane ends here, so it gets the larger mark.
      if (facing(DAR)) {
        const p = projection(DAR);
        if (p) {
          context!.beginPath();
          context!.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
          context!.fillStyle = palette.route;
          context!.fill();

          context!.beginPath();
          context!.arc(p[0], p[1], 11, 0, Math.PI * 2);
          context!.strokeStyle = palette.route;
          context!.globalAlpha = 0.4;
          context!.lineWidth = 1.2;
          context!.stroke();
          context!.globalAlpha = 1;

          if (side > 380) {
            context!.font =
              '700 12px ui-sans-serif, system-ui, -apple-system, sans-serif';
            context!.fillStyle = palette.route;
            context!.textAlign = "center";
            context!.fillText("Dar es Salaam", p[0], p[1] + 22);
          }
        }
      }

      // The aircraft, one per lane, offset around the loop so they are spread
      // along their routes rather than departing together.
      for (const [index, lane] of LANES.entries()) {
        const t = (progress + lane.offset) % 1;
        const here = along[index](t);
        if (!facing(here)) continue;

        const p = projection(here);
        const ahead = projection(along[index](Math.min(t + 0.01, 1)));
        if (!p || !ahead) continue;

        const angle = Math.atan2(ahead[1] - p[1], ahead[0] - p[0]);

        // The outline is 28 units nose to tail; size it against the sphere so
        // the aircraft stay legible on a small globe without turning into
        // paper darts on a large one.
        const wanted = side > 700 ? 15 : side > 420 ? 12 : 9;
        const scale = (wanted / AIRCRAFT_LENGTH) * (lane.main ? 1 : 0.82);

        context!.save();
        context!.translate(p[0], p[1]);
        context!.rotate(angle);
        context!.scale(scale, scale);
        traceAircraft(context!);
        context!.fillStyle = "#fff";
        context!.globalAlpha = lane.main ? 1 : 0.8;
        context!.fill();
        context!.restore();
        context!.globalAlpha = 1;
      }
    }

    async function start() {
      const response = await fetch("/geo/land-110m.json");
      if (!response.ok || cancelled) return;
      features = (await response.json()) as GeoJSON.FeatureCollection;
      if (cancelled) return;

      dots = landDots(features, 2.6);
      draw();

      if (calm) return; // A still globe, centred on the route.

      frame = timer(() => {
        if (!dragging) lambda -= spin;
        progress = (progress + 0.0016) % 1;
        draw();
      });
    }

    // Drag to spin. No wheel handler on purpose — see the note above.
    function onPointerDown(event: PointerEvent) {
      dragging = true;
      canvas!.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const startLambda = lambda;
      const startPhi = phi;

      function onMove(move: PointerEvent) {
        lambda = startLambda + (move.clientX - startX) * 0.35;
        phi = Math.max(-75, Math.min(75, startPhi - (move.clientY - startY) * 0.35));
        if (calm) draw();
      }
      function onUp() {
        dragging = false;
        canvas!.removeEventListener("pointermove", onMove);
        canvas!.removeEventListener("pointerup", onUp);
      }
      canvas!.addEventListener("pointermove", onMove);
      canvas!.addEventListener("pointerup", onUp);
    }

    canvas.addEventListener("pointerdown", onPointerDown);

    const observer = new ResizeObserver(() => {
      side = size();
      draw();
    });
    observer.observe(wrap);

    void start();

    return () => {
      cancelled = true;
      frame?.stop();
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, [spin]);

  return (
    <div
      ref={wrapRef}
      className={cn("relative aspect-square w-full select-none", className)}
    >
      <canvas
        ref={canvasRef}
        aria-label="Rotating globe showing the air cargo route from Guangzhou, China to Dar es Salaam, Tanzania"
        role="img"
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />
      {/* A ring of light behind the sphere, so it sits in the page rather than
          on top of it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[8%] -z-10 rounded-full bg-brand/20 blur-3xl"
      />
    </div>
  );
}
