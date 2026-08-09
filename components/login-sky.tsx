/**
 * The corridor seen from orbit.
 *
 * The first attempt put a full sphere in the middle of the page, and its
 * meridians and flight paths ran straight through the headline. Turning the
 * opacity down only made a faint mess: the fix is not contrast, it is
 * geography. Nothing is drawn where the words are.
 *
 * So the planet is a limb — the curve of the earth across the bottom right, the
 * way it looks from a window seat — and every route lives above it in the right
 * half of the frame. The left third, where the copy sits, carries stars and a
 * scrim and nothing else. A reader can be given something cinematic or
 * something legible; this is an attempt to owe them both by keeping the two
 * apart rather than negotiating between them.
 *
 * No JavaScript in any of it. Every moving part is a CSS keyframe on transform
 * or opacity, or an SVG <animateMotion> — both run on the compositor, so the
 * page holds frame rate on the cheapest phone in the warehouse and adds nothing
 * to the bundle somebody downloads before they can type their email.
 *
 * Everything stops under prefers-reduced-motion.
 */

/**
 * The planet's centre sits far below the frame, so only the top of the curve
 * shows. r and cy together decide where the horizon falls: 1120 − 720 = 400,
 * the lower quarter of a 540-tall viewBox.
 */
const EARTH = { cx: 690, cy: 1120, r: 720 };

/** Put a city on the limb, so a route visibly leaves the planet's surface. */
function onLimb(x: number) {
  const dx = x - EARTH.cx;
  return EARTH.cy - Math.sqrt(Math.max(EARTH.r ** 2 - dx ** 2, 0));
}

type City = { id: string; name: string; x: number; destination?: boolean };

/**
 * The real route list. A first screen decorated with invented destinations
 * would be the first thing this system said to its own staff.
 */
const CITIES: City[] = [
  { id: "gz", name: "Guangzhou", x: 906 },
  { id: "hk", name: "Hong Kong", x: 838 },
  { id: "dxb", name: "Dubai", x: 742 },
  { id: "dar", name: "Dar es Salaam", x: 520, destination: true },
];

const DAR = { x: 520, y: onLimb(520) };

/**
 * Arcs that climb off the surface and come back down to Dar.
 *
 * The control point is lifted well above both ends so the track bows the way a
 * long-haul route does on a globe. Every one of them stays right of x≈500,
 * which is where the copy column ends.
 */
const ROUTES = CITIES.filter((c) => !c.destination).map((city, i) => {
  const from = { x: city.x, y: onLimb(city.x) };
  const lift = [196, 152, 116][i] ?? 150;
  const mid = (from.x + DAR.x) / 2;
  return {
    id: city.id,
    d:
      `M${from.x} ${from.y.toFixed(0)} ` +
      `Q${mid.toFixed(0)} ${(Math.min(from.y, DAR.y) - lift).toFixed(0)} ` +
      `${DAR.x} ${DAR.y.toFixed(0)}`,
    dur: ["13s", "16s", "11s"][i] ?? "14s",
    delay: ["0s", "3.5s", "7s"][i] ?? "0s",
  };
});

/** Nose-up at the origin, so animateMotion's rotate="auto" banks it correctly. */
const PLANE =
  "M0 -6 L1.7 -1 L6.6 1.4 L6.6 2.6 L1.7 1.7 L1.2 4.8 L3 6 L3 6.9 " +
  "L0 6.2 L-3 6.9 L-3 6 L-1.2 4.8 L-1.7 1.7 L-6.6 2.6 L-6.6 1.4 L-1.7 -1 Z";

export function LoginSky() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Space. Target's own navy falling to black rather than a stock
          midnight blue, so the page is still the brand's. */}
      <div className="absolute inset-0 bg-[#04060d]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 78% 78%, hsl(216 72% 26% / 0.55) 0%, transparent 62%)," +
            "radial-gradient(60% 50% at 62% 96%, hsl(3 81% 47% / 0.20) 0%, transparent 60%)",
        }}
      />

      {/* Stars, two plates at different speeds so the eye reads depth. */}
      <div
        className="drift-a absolute -inset-1/4 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, white 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 70% 65%, white 50%, transparent 50%)," +
            "radial-gradient(1.4px 1.4px at 45% 15%, white 50%, transparent 50%)",
          backgroundSize: "190px 190px, 270px 270px, 350px 350px",
        }}
      />
      <div
        className="drift-c absolute -inset-1/4 opacity-35"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 35% 55%, white 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 85% 25%, white 50%, transparent 50%)",
          backgroundSize: "130px 130px, 210px 210px",
        }}
      />

      <svg
        viewBox="0 0 960 540"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="sky-surface" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(213 84% 64%)" stopOpacity="0.22" />
            <stop offset="45%" stopColor="hsl(216 72% 22%)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#04060d" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="sky-route" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="hsl(3 84% 58%)" stopOpacity="0.15" />
            <stop offset="55%" stopColor="hsl(3 84% 58%)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="hsl(213 84% 70%)" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="sky-air" cx="50%" cy="100%">
            <stop offset="70%" stopColor="hsl(205 90% 60%)" stopOpacity="0" />
            <stop offset="92%" stopColor="hsl(205 90% 60%)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="hsl(205 90% 60%)" stopOpacity="0" />
          </radialGradient>
          <filter id="sky-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="sky-dots" width="13" height="13" patternUnits="userSpaceOnUse">
            <circle cx="1.4" cy="1.4" r="1.1" fill="hsl(205 90% 70%)" fillOpacity="0.34" />
          </pattern>
          <clipPath id="sky-earth">
            <circle cx={EARTH.cx} cy={EARTH.cy} r={EARTH.r} />
          </clipPath>
        </defs>

        {/* Atmosphere: a halo just outside the limb, which is what sells a
            curve as a planet rather than a large circle. */}
        <circle
          cx={EARTH.cx}
          cy={EARTH.cy}
          r={EARTH.r + 26}
          fill="url(#sky-air)"
          opacity="0.55"
        />

        {/* The surface. The texture drifts rather than the plate turning —
            rotating the whole thing would drag the pattern with it and read as
            spinning wallpaper instead of a world. */}
        <g clipPath="url(#sky-earth)">
          <circle cx={EARTH.cx} cy={EARTH.cy} r={EARTH.r} fill="url(#sky-surface)" />
          <rect
            className="drift-b"
            x={EARTH.cx - EARTH.r}
            y={EARTH.cy - EARTH.r}
            width={EARTH.r * 2}
            height={EARTH.r * 2}
            fill="url(#sky-dots)"
          />
          {[70, 190, 330].map((d) => (
            <circle
              key={d}
              cx={EARTH.cx}
              cy={EARTH.cy}
              r={EARTH.r - d}
              fill="none"
              stroke="hsl(205 90% 70%)"
              strokeOpacity="0.16"
            />
          ))}
        </g>

        {/* The limb itself, lit. */}
        <circle
          cx={EARTH.cx}
          cy={EARTH.cy}
          r={EARTH.r}
          fill="none"
          stroke="hsl(205 90% 72%)"
          strokeOpacity="0.55"
          strokeWidth="1.4"
        />

        {/* Routes. Each draws itself in, then an aircraft flies it. */}
        {ROUTES.map((route) => (
          <g key={route.id}>
            <path
              d={route.d}
              fill="none"
              stroke="url(#sky-route)"
              strokeWidth="1.6"
              strokeDasharray="4 8"
              className="sky-draw"
              style={{ animationDelay: route.delay }}
            />
            <path d={PLANE} fill="white" filter="url(#sky-soft)">
              <animateMotion
                dur={route.dur}
                begin={route.delay}
                repeatCount="indefinite"
                path={route.d}
                rotate="auto"
              />
            </path>
          </g>
        ))}

        {/* Cities, labelled beneath the mark so nothing rides over the card. */}
        {CITIES.map((city) => {
          const y = onLimb(city.x);
          return (
            <g key={city.id}>
              {city.destination ? (
                <circle
                  cx={city.x}
                  cy={y}
                  r="7"
                  fill="none"
                  stroke="hsl(3 84% 58%)"
                  strokeOpacity="0.7"
                  className="sky-ping"
                />
              ) : null}
              <circle
                cx={city.x}
                cy={y}
                r={city.destination ? 4.5 : 3}
                fill={city.destination ? "hsl(3 84% 58%)" : "hsl(205 90% 75%)"}
                filter="url(#sky-soft)"
              />
              <text
                x={city.x}
                y={y + 20}
                textAnchor="middle"
                className="font-mono"
                fontSize="9.5"
                fill="white"
                fillOpacity={city.destination ? 0.9 : 0.5}
                letterSpacing="0.14em"
              >
                {city.name.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      {/*
        The reading scrim.

        Whatever the routes are doing, the left third stays dark enough for
        display type to sit on it. This is the layer that makes everything above
        safe to be bold: without it, every decision has to be argued against
        legibility, and legibility loses slowly.
      */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(4,6,13,0.96) 0%, rgba(4,6,13,0.88) 26%, rgba(4,6,13,0.45) 46%, transparent 62%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, transparent 40%, rgba(4,6,13,0.75) 100%)",
        }}
      />
    </div>
  );
}
