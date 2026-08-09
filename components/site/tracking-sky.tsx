import { AIRCRAFT_PATH } from "@/lib/aircraft";
import { ROUTE_LAND } from "@/lib/route-land";

/**
 * The corridor, behind the tracking form.
 *
 * This page opened on a stock photograph of two cardboard boxes on a table.
 * It is a nice photograph and it is about packing, not about tracking — a
 * customer arriving from a WhatsApp link with a number in their hand is asking
 * "where is my box", and a still life answers a different question.
 *
 * So the backdrop is the route their box is somewhere on: the real lanes into
 * Dar es Salaam, aircraft flying them, and a locator pulse over Dar. The
 * coastlines and the city markers come from the same projection and the same
 * land data the homepage route map uses, so the two agree rather than merely
 * resembling each other.
 *
 * Everything lives in the right two thirds. The copy and the search field sit
 * on the left over a scrim, and nothing is drawn under them — the login page
 * taught this the expensive way: contrast cannot rescue a layout where the
 * decoration and the words want the same pixels.
 *
 * Zero JavaScript. SMIL for the aircraft, CSS keyframes for everything else,
 * both on the compositor. This is the first screen on the page most of this
 * business's customers ever load, on Tanzanian mobile data, and it must not
 * cost them a frame or a kilobyte of script.
 */

/** The same window, projection and land grid as components/site/route-map.tsx. */
const LON = [30, 122] as const;
const LAT = [-12, 34] as const;
const W = 640;
const H = 430;

function project(lon: number, lat: number): [number, number] {
  return [
    ((lon - LON[0]) / (LON[1] - LON[0])) * W,
    ((LAT[1] - lat) / (LAT[1] - LAT[0])) * H,
  ];
}

const DAR = project(39.28, -6.79);

const LANES = [
  { id: "gz", city: "Guangzhou", lon: 113.26, lat: 23.13, bow: -120, delay: "0s", dur: "13s" },
  { id: "hk", city: "Hong Kong", lon: 114.17, lat: 22.32, bow: -34, delay: "4.5s", dur: "15s" },
  { id: "dxb", city: "Dubai", lon: 55.27, lat: 25.2, bow: -62, delay: "8s", dur: "11s" },
] as const;

/** Quadratic arc from a lane's origin to Dar, bowed off the straight chord. */
function arc(lane: (typeof LANES)[number]) {
  const [x, y] = project(lane.lon, lane.lat);
  const [dx, dy] = DAR;
  const vx = dx - x;
  const vy = dy - y;
  const len = Math.hypot(vx, vy) || 1;
  const cx = (x + dx) / 2 + (-vy / len) * lane.bow;
  const cy = (y + dy) / 2 + (vx / len) * lane.bow;
  return {
    d: `M ${x.toFixed(1)} ${y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)}`,
    x,
    y,
  };
}

/**
 * 566 dots as one path rather than 566 circles — the browser lays out one node
 * for the same picture.
 */
const LAND_PATH = ROUTE_LAND.map(([x, y]) => `M${x} ${y}h1.6v1.6h-1.6z`).join("");

export function TrackingSky() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[hsl(var(--ink))]" />

      {/* Depth, before anything is drawn on it. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 90% at 76% 40%, hsl(216 72% 30% / 0.55) 0%, transparent 66%)," +
            "radial-gradient(50% 60% at 96% 96%, hsl(3 81% 47% / 0.16) 0%, transparent 62%)",
        }}
      />

      {/* Two star plates at different speeds, so the field has depth rather
          than being a texture. */}
      <div
        className="drift-a absolute -inset-1/4 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 22% 32%, white 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 68% 62%, white 50%, transparent 50%)," +
            "radial-gradient(1.4px 1.4px at 46% 14%, white 50%, transparent 50%)",
          backgroundSize: "200px 200px, 280px 280px, 360px 360px",
        }}
      />
      <div
        className="drift-c absolute -inset-1/4 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 36% 56%, white 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 84% 26%, white 50%, transparent 50%)",
          backgroundSize: "140px 140px, 220px 220px",
        }}
      />

      {/* The map. Pushed right and cropped: on a phone the copy takes the
          screen and the corridor becomes atmosphere rather than a diagram
          nobody can read at that size. */}
      {/*
        `meet`, not `slice`.

        Slicing cropped the bottom of the frame, and the bottom of this frame is
        Dar es Salaam — the one place on the map the page is about. The map now
        fits its box whole, and the box is what moves between breakpoints.
        The extra 34 units of viewBox are headroom for the DAR ES SALAAM label,
        which sits below the marker at the very edge of the projection.
      */}
      {/*
        The svg is wrapped rather than positioned directly.

        An <svg> is a replaced element: give it top and bottom offsets and a
        height of auto and it does NOT stretch between them — it derives its
        height from its width and its own aspect ratio, overflows the box, and
        gets clipped. Which is how Dar es Salaam ended up below the fold twice.
        The wrapper owns the box; the svg fills it.
      */}
      <div className="absolute inset-y-6 right-0 w-full sm:right-2 lg:inset-y-8 lg:right-6 lg:w-[64%]">
      <svg
        viewBox={`0 -14 ${W} ${H + 42}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full opacity-90"
      >
        <defs>
          <linearGradient id="tsky-lane" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--signal))" stopOpacity="0.9" />
            <stop offset="60%" stopColor="hsl(var(--signal))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(205 90% 70%)" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="tsky-dar">
            <stop offset="0%" stopColor="hsl(3 84% 60%)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="hsl(3 84% 60%)" stopOpacity="0" />
          </radialGradient>
          <filter id="tsky-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Land. Faint enough to read as geography rather than as content. */}
        <path d={LAND_PATH} fill="hsl(205 90% 76%)" fillOpacity="0.17" />

        {/* The glow over the destination, under everything else. */}
        <circle cx={DAR[0]} cy={DAR[1]} r="92" fill="url(#tsky-dar)" />

        {LANES.map((lane) => {
          const { d, x, y } = arc(lane);
          return (
            <g key={lane.id}>
              <path
                d={d}
                fill="none"
                stroke="url(#tsky-lane)"
                strokeWidth="1.5"
                strokeDasharray="5 7"
                className="sky-draw"
                style={{ animationDelay: lane.delay }}
              />
              <path d={AIRCRAFT_PATH} fill="white" transform="scale(0.62)" filter="url(#tsky-soft)">
                <animateMotion
                  dur={lane.dur}
                  begin={lane.delay}
                  repeatCount="indefinite"
                  path={d}
                  rotate="auto"
                />
              </path>

              <circle cx={x} cy={y} r="3.2" fill="hsl(205 90% 78%)" filter="url(#tsky-soft)" />
              <text
                x={x}
                y={y - 11}
                textAnchor="middle"
                className="font-mono"
                fontSize="10"
                fill="white"
                fillOpacity="0.5"
                letterSpacing="0.14em"
              >
                {lane.city.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Dar es Salaam, pinging. This is the tracking motif: the page is
            watching one place, and everything on the map is heading for it. */}
        <circle
          cx={DAR[0]}
          cy={DAR[1]}
          r="9"
          fill="none"
          stroke="hsl(3 84% 60%)"
          strokeOpacity="0.75"
          className="sky-ping"
        />
        <circle cx={DAR[0]} cy={DAR[1]} r="4.5" fill="hsl(3 84% 58%)" filter="url(#tsky-soft)" />
        <text
          x={DAR[0]}
          y={DAR[1] + 20}
          textAnchor="middle"
          className="font-mono"
          fontSize="10.5"
          fill="white"
          fillOpacity="0.85"
          letterSpacing="0.14em"
        >
          DAR ES SALAAM
        </text>
      </svg>
      </div>

      {/* The reading scrim. Whatever the corridor is doing, the left side stays
          dark enough for display type and a form field to sit on it. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, hsl(var(--ink)) 0%, hsl(var(--ink)/0.94) 30%, hsl(var(--ink)/0.55) 52%, transparent 72%)",
        }}
      />
      {/* Light at the top edge only. A bottom scrim strong enough to blend the
          hero into the page was also strong enough to swallow Dar es Salaam,
          and the destination is the one marker on this map that has to be
          legible. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, hsl(var(--ink)/0.7) 0%, transparent 16%, transparent 74%, hsl(var(--ink)/0.55) 100%)",
        }}
      />
      {/* The gold edge every other hero on this site carries, so this one still
          belongs to the same page set. */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[hsl(var(--gold)/0.12)] to-transparent" />
    </div>
  );
}
