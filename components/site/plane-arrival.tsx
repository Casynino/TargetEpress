import { AIRCRAFT_PATH } from "@/lib/aircraft";
import { cn } from "@/lib/utils";

/**
 * An aircraft gliding in across the sky with its trail drawing behind it
 * (owner, 16 Nov 2026: "I want a plane coming in nicely, not this small
 * thing"). The globe's own aircraft are a few pixels long; this one is the
 * plane a visitor actually notices.
 *
 * Pure SVG animation, so it needs no JavaScript and costs nothing to the page.
 * The flight path is one curve; the trail is the same curve revealed with a
 * dash offset over the same duration, so the plane always sits at its tip.
 * Someone who asked their phone for less motion gets the plane parked mid-sky
 * with its trail, not moving.
 */
const CURVE = "M 420 40 C 320 70, 230 120, 150 210 S 40 330, -40 360";

export function PlaneArrival({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none overflow-visible", className)}
    >
      <defs>
        <linearGradient id="plane-trail" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Moving version: hidden for reduced motion. */}
      <g className="motion-reduce:hidden">
        <path d={CURVE} pathLength={100} fill="none" stroke="url(#plane-trail)" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="100 100">
          <animate attributeName="stroke-dashoffset" values="100;0" dur="9s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.8;1" dur="9s" repeatCount="indefinite" />
        </path>
        <g>
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.8;1" dur="9s" repeatCount="indefinite" />
          <g>
            <animateMotion path={CURVE} dur="9s" repeatCount="indefinite" rotate="auto" />
            <path d={AIRCRAFT_PATH} transform="scale(1.9)" fill="white" style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.55))" }} />
          </g>
        </g>
      </g>

      {/* Still version for reduced motion: parked mid-sky on its trail. */}
      <g className="hidden motion-reduce:inline">
        <path d="M 420 40 C 320 70, 230 120, 150 210" fill="none" stroke="url(#plane-trail)" strokeWidth="1.4" strokeLinecap="round" />
        <path d={AIRCRAFT_PATH} transform="translate(150 210) rotate(132) scale(1.9)" fill="white" />
      </g>
    </svg>
  );
}
