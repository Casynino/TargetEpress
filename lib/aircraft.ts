/**
 * The aircraft silhouette, defined once.
 *
 * Both the globe (canvas) and the route map (SVG) draw a plane along a flight
 * path, and they were each drawing their own four-point triangle — which read
 * as an arrowhead, not an aeroplane. One outline, two renderers, so they can
 * never drift apart again.
 *
 * Drawn nose-first along +x, because that is the direction both callers rotate
 * into: SVG `animateMotion rotate="auto"` and the canvas `atan2` of the next
 * point both align +x with the direction of travel.
 *
 * Roughly 28 units nose to tail and 18 across the wings. Callers scale it —
 * see `AIRCRAFT_LENGTH` if you need to size against it.
 */
export const AIRCRAFT_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [16, 0], // nose

  // upper fuselage forward, then the swept left wing
  [6, -1.6],
  [4, -1.9],
  [-1, -9],
  [-3.5, -9],
  [-1.5, -1.9],

  // rear fuselage, then the left tailplane
  [-7, -1.7],
  [-9.5, -5],
  [-11.5, -5],
  [-10.5, -1.5],

  [-12, 0], // tail

  // mirrored: right tailplane, rear fuselage, right wing, forward fuselage
  [-10.5, 1.5],
  [-11.5, 5],
  [-9.5, 5],
  [-7, 1.7],
  [-1.5, 1.9],
  [-3.5, 9],
  [-1, 9],
  [4, 1.9],
  [6, 1.6],
];

/** Nose-to-tail length in outline units, for callers sizing against it. */
export const AIRCRAFT_LENGTH = 28;

/** The same outline as an SVG `d`, generated so it cannot fall out of step. */
export const AIRCRAFT_PATH = `${AIRCRAFT_OUTLINE.map(
  ([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`
).join(" ")} Z`;

/** Trace the outline into a 2D context. The caller owns transform and fill. */
export function traceAircraft(context: CanvasRenderingContext2D) {
  context.beginPath();
  AIRCRAFT_OUTLINE.forEach(([x, y], i) => {
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}
