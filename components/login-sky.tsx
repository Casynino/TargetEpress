/**
 * The corridor, as a backdrop.
 *
 * A server component with no JavaScript in it at all. Every moving part is
 * either a CSS keyframe on transform/opacity or an SVG <animateMotion>, both of
 * which the browser runs on the compositor — so the sign-in page holds frame
 * rate on the cheapest phone in the warehouse and adds nothing to the bundle a
 * staff member downloads before they can even type their email.
 *
 * The routes are the real ones: Guangzhou, Hong Kong and Dubai into Dar es
 * Salaam. A login screen decorated with invented cities would be the first
 * thing this system said to its own staff, and it would be a lie.
 *
 * Everything stops under prefers-reduced-motion. A cargo desk is opened by
 * people at six in the morning; motion sickness is not a premium feature.
 */

/** Where each city sits on the map plate, in the SVG's own coordinates. */
type City = {
  id: string;
  name: string;
  x: number;
  y: number;
  /** The end of every route on this page. Drawn larger, and it pulses. */
  destination?: boolean;
};

const CITIES: City[] = [
  { id: "gz", name: "Guangzhou", x: 604, y: 150 },
  { id: "hk", name: "Hong Kong", x: 616, y: 182 },
  { id: "dxb", name: "Dubai", x: 404, y: 196 },
  { id: "dar", name: "Dar es Salaam", x: 296, y: 384, destination: true },
];

/**
 * Three arcs into one destination.
 *
 * Quadratic curves bowed north, the way a great-circle route actually looks on
 * a flat plate — a straight line between two cities would read as a diagram of
 * something else.
 */
const ROUTES = [
  { id: "r1", d: "M604 150 Q420 130 296 384", dur: "9s", delay: "0s" },
  { id: "r2", d: "M616 182 Q450 190 296 384", dur: "11s", delay: "2s" },
  { id: "r3", d: "M404 196 Q330 240 296 384", dur: "7.5s", delay: "4s" },
] as const;

/**
 * A plane, not a dot.
 *
 * Drawn nose-up at the origin so `rotate="auto"` points it along the path it is
 * flying. A circle travelling a line is a loading indicator; what was asked for
 * is an aircraft leaving China.
 */
const PLANE =
  "M0 -7 L2.1 -1.4 L7.4 1.2 L7.4 2.6 L2.1 1.6 L1.5 5.2 L3.6 6.6 L3.6 7.6 " +
  "L0 6.8 L-3.6 7.6 L-3.6 6.6 L-1.5 5.2 L-2.1 1.6 L-7.4 2.6 L-7.4 1.2 " +
  "L-2.1 -1.4 Z";

export function LoginSky() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 1 — deep space. Target's own navy falling to black rather than a
             stock midnight blue, so the page is still the brand's. */}
      <div className="absolute inset-0 bg-[#05070f]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 70% 10%, hsl(216 72% 22% / 0.55) 0%, transparent 60%)," +
            "radial-gradient(90% 70% at 15% 90%, hsl(3 81% 47% / 0.22) 0%, transparent 65%)",
        }}
      />

      {/* 2 — starfield, two plates at different sizes and speeds so the eye
             reads depth instead of wallpaper. */}
      <div
        className="drift-a absolute -inset-1/4 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, white 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 70% 65%, white 50%, transparent 50%)," +
            "radial-gradient(1.5px 1.5px at 45% 15%, white 50%, transparent 50%)",
          backgroundSize: "180px 180px, 260px 260px, 340px 340px",
        }}
      />
      <div
        className="drift-c absolute -inset-1/4 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 35% 55%, white 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 85% 25%, white 50%, transparent 50%)",
          backgroundSize: "120px 120px, 200px 200px",
        }}
      />

      {/* 3 — the corridor itself. */}
      <svg
        viewBox="0 0 960 540"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <radialGradient id="sky-globe" cx="38%" cy="32%">
            <stop offset="0%" stopColor="hsl(213 84% 64%)" stopOpacity="0.42" />
            <stop offset="60%" stopColor="hsl(216 72% 22%)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#05070f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sky-route" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(3 84% 58%)" />
            <stop offset="100%" stopColor="hsl(213 84% 64%)" />
          </linearGradient>
          <filter id="sky-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* One dot of the graticule, tiled — a hand-drawn map would be a
              hundred paths nobody can correct later. */}
          <pattern id="sky-dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" fill="hsl(213 84% 64%)" fillOpacity="0.38" />
          </pattern>
          <clipPath id="sky-sphere">
            <circle cx="430" cy="280" r="300" />
          </clipPath>
        </defs>

        {/* The sphere: a dotted plate clipped to a circle, with meridians
            sweeping across it. Cheaper than a projection and, at this opacity,
            indistinguishable from one. */}
        <circle cx="430" cy="280" r="300" fill="url(#sky-globe)" />
        <g clipPath="url(#sky-sphere)">
          <rect x="120" y="-30" width="620" height="620" fill="url(#sky-dots)" />
          <g className="sky-spin" style={{ transformOrigin: "430px 280px" }}>
            {[-240, -150, -60, 60, 150, 240].map((dx) => (
              <ellipse
                key={dx}
                cx="600"
                cy="270"
                rx={Math.abs(dx) * 0.62}
                ry="250"
                fill="none"
                stroke="hsl(213 84% 64%)"
                strokeOpacity="0.30"
              />
            ))}
          </g>
          {[-210, -105, 0, 105, 210].map((dy) => (
            <line
              key={dy}
              x1="120"
              y1={280 + dy}
              x2="740"
              y2={280 + dy}
              stroke="hsl(213 84% 64%)"
              strokeOpacity="0.22"
            />
          ))}
        </g>
        <circle
          cx="600"
          cy="270"
          r="250"
          fill="none"
          stroke="hsl(213 84% 64%)"
          strokeOpacity="0.50"
        />

        {/* Routes. The dash draws itself in, then a lit dot flies the path. */}
        {ROUTES.map((route) => (
          <g key={route.id}>
            <path
              d={route.d}
              fill="none"
              stroke="url(#sky-route)"
              strokeOpacity="0.9"
              strokeWidth="2"
              strokeDasharray="5 7"
              className="sky-draw"
              style={{ animationDelay: route.delay }}
            />
            <path d={PLANE} fill="hsl(3 84% 58%)" filter="url(#sky-glow)">
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

        {/* Cities. Dar pulses because it is the end of every route on the
            page — the one the people signing in are standing in. */}
        {CITIES.map((city) => (
          <g key={city.id}>
            {city.destination ? (
              <circle
                cx={city.x}
                cy={city.y}
                r="6"
                fill="none"
                stroke="hsl(3 84% 58%)"
                strokeOpacity="0.6"
                className="sky-ping"
              />
            ) : null}
            <circle
              cx={city.x}
              cy={city.y}
              r={city.destination ? 4 : 3}
              fill={city.destination ? "hsl(3 84% 58%)" : "hsl(213 84% 64%)"}
              filter="url(#sky-glow)"
            />
            <text
              x={city.x + 11}
              y={city.y + 4}
              className="font-mono"
              fontSize="10"
              fill="white"
              fillOpacity={city.destination ? 0.95 : 0.7}
              letterSpacing="0.08em"
            >
              {city.name.toUpperCase()}
            </text>
          </g>
        ))}
      </svg>

      {/* 4 — vignette, so the card always has something dark to sit on
             whatever the routes are doing behind it. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 30% 50%, transparent 0%, rgba(5,7,15,0.55) 70%, rgba(5,7,15,0.9) 100%)",
        }}
      />
    </div>
  );
}
