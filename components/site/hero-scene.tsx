import { HERO_CITIES, HERO_LAND, HERO_LIGHTS, HERO_MAP } from "@/lib/hero-map";
import { cn } from "@/lib/utils";

/**
 * The homepage hero's picture (owner, 16 Nov 2026, holding up a logistics
 * poster: "the sky on top, the airplane moving, the map down below, golden
 * routes — that look"). Drawn, not a photograph, so it is ours and in Target's
 * colours: an evening sky with clouds drifting, the real coastlines from East
 * Africa to China laid out like a table and tilted away, the region's cities
 * lit, golden routes into Dar es Salaam with light running along them, and an
 * airliner with a Target-red tail crossing the sky from China towards Tanzania.
 *
 * Everything moves with CSS and SVG animation: no script, nothing for a phone
 * to compute. A phone that asks for less motion gets the same picture, still.
 */

const { width: W, height: H } = HERO_MAP;
const DAR = HERO_CITIES.dar;

/** A lane into Dar, bowed away from the viewer so it reads as an arc over the map. */
function arc(from: readonly [number, number], lift: number) {
  const mx = (from[0] + DAR[0]) / 2;
  const my = (from[1] + DAR[1]) / 2 - lift;
  return `M ${from[0]} ${from[1]} Q ${mx} ${my} ${DAR[0]} ${DAR[1]}`;
}

const LANES = [
  { d: arc(HERO_CITIES.guangzhou, 170), main: true, dur: 3.6, delay: 0 },
  { d: arc(HERO_CITIES.hongKong, 120), main: true, dur: 4.2, delay: 1.4 },
  { d: arc(HERO_CITIES.dubai, 70), dur: 3.2, delay: 0.7 },
  { d: arc(HERO_CITIES.addis, 40), dur: 2.6, delay: 2.1 },
];

const ORIGINS = [HERO_CITIES.guangzhou, HERO_CITIES.hongKong, HERO_CITIES.dubai, HERO_CITIES.addis];

export function HeroScene({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {/* The sky: deep at the top, a cool glow along the horizon. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, hsl(217 55% 9%) 0%, hsl(212 50% 16%) 38%, hsl(200 45% 26%) 58%, hsl(205 50% 14%) 72%, hsl(217 55% 7%) 100%)",
        }}
      />
      <div className="absolute inset-x-0 top-[48%] h-[22%] bg-[radial-gradient(ellipse_60%_100%_at_50%_100%,hsl(190_80%_60%/0.25),transparent_70%)]" />

      {/* Clouds, drifting. */}
      <div className="hero-cloud left-[-10%] top-[46%] h-[8%] w-[60%] opacity-55 lg:top-[40%]" />
      <div className="hero-cloud hero-cloud-2 left-[45%] top-[52%] h-[7%] w-[50%] opacity-45 lg:top-[46%]" />
      <div className="hero-cloud hero-cloud-3 left-[15%] top-[58%] h-[5%] w-[40%] opacity-35 lg:top-[54%]" />

      {/* The map, tilted away like a table under the sky. */}
      <div className="absolute inset-x-[-40%] bottom-[-6%] h-[62%] [perspective:900px] sm:inset-x-[-20%] lg:inset-x-[-8%]">
        <div className="absolute inset-0 origin-bottom [transform:rotateX(52deg)] [mask-image:linear-gradient(to_top,black_55%,transparent)]">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <defs>
              <linearGradient id="hs-land" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="hsl(205 55% 22%)" />
                <stop offset="1" stopColor="hsl(212 55% 15%)" />
              </linearGradient>
              <linearGradient id="hs-gold" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="hsl(357 85% 62%)" />
                <stop offset="0.55" stopColor="hsl(38 95% 62%)" />
                <stop offset="1" stopColor="hsl(45 100% 70%)" />
              </linearGradient>
              <filter id="hs-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="hs-coast" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Sea and land; the coast glows. */}
            <rect width={W} height={H} fill="hsl(214 60% 9%)" />
            <path d={HERO_LAND} fill="url(#hs-land)" stroke="hsl(195 90% 65%)" strokeOpacity="0.8" strokeWidth="1.3" filter="url(#hs-coast)" />

            {/* The cities at night. */}
            <g fill="hsl(42 100% 72%)" filter="url(#hs-glow)">
              {HERO_LIGHTS.map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" opacity="0.85" />
              ))}
            </g>

            {/* The lanes: a golden arc each, and a point of light running it. */}
            <g fill="none" filter="url(#hs-glow)">
              {LANES.map((lane) => (
                <g key={lane.d}>
                  <path d={lane.d} stroke="url(#hs-gold)" strokeWidth={lane.main ? 3 : 2} strokeOpacity={lane.main ? 0.9 : 0.6} strokeLinecap="round" />
                  <path d={lane.d} pathLength={100} stroke="white" strokeWidth={lane.main ? 4 : 3} strokeLinecap="round" strokeDasharray="6 94" className="motion-reduce:hidden">
                    <animate attributeName="stroke-dashoffset" values="100;0" dur={`${lane.dur}s`} begin={`${lane.delay}s`} repeatCount="indefinite" />
                  </path>
                </g>
              ))}
              {/* Dotted feeder routes, as the business moves inside each region. */}
              <path d={`M ${HERO_CITIES.guangzhou[0]} ${HERO_CITIES.guangzhou[1]} Q 660 120 ${HERO_LIGHTS[0][0]} ${HERO_LIGHTS[0][1]}`} stroke="hsl(42 100% 72%)" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="2 6" />
              <path d={`M ${DAR[0]} ${DAR[1]} Q 300 300 ${HERO_LIGHTS[28][0]} ${HERO_LIGHTS[28][1]}`} stroke="hsl(42 100% 72%)" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="2 6" />
              <path d={`M ${DAR[0]} ${DAR[1]} Q 280 380 ${HERO_LIGHTS[33][0]} ${HERO_LIGHTS[33][1]}`} stroke="hsl(42 100% 72%)" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="2 6" />
            </g>

            {/* Where the lanes start, and Dar es Salaam where they all land. */}
            {ORIGINS.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="hsl(42 100% 75%)" filter="url(#hs-glow)" />
            ))}
            <g filter="url(#hs-glow)">
              <circle cx={DAR[0]} cy={DAR[1]} r="7" fill="hsl(357 85% 62%)" />
              <circle cx={DAR[0]} cy={DAR[1]} r="8" fill="none" stroke="hsl(357 85% 62%)" strokeWidth="2" className="motion-reduce:hidden">
                <animate attributeName="r" values="8;30" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.9;0" dur="2.4s" repeatCount="indefinite" />
              </circle>
            </g>
          </svg>
        </div>
      </div>

      {/* The aircraft, crossing the sky from China towards Tanzania. */}
      {/* It flies in the open sky between the words and the map, never across them. */}
      <div className="hero-plane absolute top-[47%] w-[62vw] min-w-[200px] max-w-[400px] sm:top-[45%] lg:top-[52%] lg:w-[24vw]">
        <Airliner />
      </div>
    </div>
  );
}

/**
 * An airliner in side view, nose to the left, drawn with light falling from
 * above: white upper fuselage shading to grey underneath, a swept wing with its
 * engine, the far wing behind, a Target-red tail with the blue line of the
 * brand along the cabin. Our own aircraft, so no airline's livery is borrowed.
 */
function Airliner() {
  return (
    <svg viewBox="0 0 320 110" className="h-auto w-full overflow-visible drop-shadow-[0_18px_24px_rgba(0,0,0,0.45)]">
      <defs>
        <linearGradient id="al-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#e8edf3" />
          <stop offset="1" stopColor="#8e9bad" />
        </linearGradient>
        <linearGradient id="al-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dfe5ec" />
          <stop offset="1" stopColor="#7d8a9c" />
        </linearGradient>
        <linearGradient id="al-tail" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(357 80% 58%)" />
          <stop offset="1" stopColor="hsl(357 70% 40%)" />
        </linearGradient>
        <linearGradient id="al-engine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2f5f8" />
          <stop offset="1" stopColor="#7b8796" />
        </linearGradient>
        <linearGradient id="al-trail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0.5" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Contrails behind the engines. */}
      <path d="M 300 56 L 420 52" stroke="url(#al-trail)" strokeWidth="3" strokeLinecap="round" />
      <path d="M 196 74 L 330 70" stroke="url(#al-trail)" strokeWidth="4" strokeLinecap="round" />

      {/* Far wing, behind the body. */}
      <path d="M 150 40 L 176 40 L 214 16 L 202 16 Z" fill="#aab5c3" />
      {/* Far tailplane. */}
      <path d="M 262 42 L 286 30 L 294 31 L 276 44 Z" fill="#aab5c3" />

      {/* Fuselage. */}
      <path
        d="M 14 56 C 14 46, 26 39, 46 38 L 252 38 C 266 38, 280 42, 296 50 L 306 56 C 296 60, 280 64, 254 65 L 46 66 C 26 66, 14 63, 14 56 Z"
        fill="url(#al-body)"
      />
      {/* The brand's line along the cabin. */}
      <path d="M 30 58 L 290 56" stroke="hsl(214 74% 52%)" strokeWidth="2.2" />
      {/* Cockpit and cabin windows. */}
      <path d="M 24 48 L 38 44 L 42 48 L 26 51 Z" fill="#1d2b3f" />
      <g fill="#2a3a52">
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} x={62 + i * 8.2} y={45.5} width="4" height="5" rx="1.6" />
        ))}
      </g>
      {/* Doors. */}
      <rect x="52" y="43" width="6" height="13" rx="1.5" fill="none" stroke="#9aa6b6" strokeWidth="0.8" />
      <rect x="250" y="43" width="6" height="12" rx="1.5" fill="none" stroke="#9aa6b6" strokeWidth="0.8" />

      {/* Tail fin, in Target red. */}
      <path d="M 236 38 L 264 4 L 284 4 L 280 38 Z" fill="url(#al-tail)" />
      <path d="M 262 10 L 278 10" stroke="white" strokeOpacity="0.5" strokeWidth="1.2" />
      {/* Near tailplane. */}
      <path d="M 254 52 L 296 46 L 302 49 L 266 57 Z" fill="url(#al-wing)" />

      {/* Near wing, swept back and down towards the viewer, with its engine. */}
      <path d="M 118 58 L 176 57 L 238 96 L 216 98 Z" fill="url(#al-wing)" />
      <rect x="132" y="64" width="54" height="17" rx="8.5" fill="url(#al-engine)" />
      <ellipse cx="134" cy="72.5" rx="4" ry="8" fill="#334155" />
      <path d="M 150 64 L 160 59 L 170 59 L 168 64 Z" fill="#9aa6b6" />
    </svg>
  );
}
