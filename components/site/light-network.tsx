import { cn } from "@/lib/utils";

/**
 * A floor of light: a perspective grid running to the horizon, with nodes that
 * pulse and points of light travelling the lanes between them — the network
 * the business runs on, drawn the way logistics key art draws it (owner, 16 Nov
 * 2026, holding up four such pictures: "futuristic, cool, things moving").
 *
 * Pure SVG animation: no JavaScript, nothing for a phone to compute. Target's
 * own colours — the brand blue for the grid and most of the traffic, the
 * signal red for the one lane that matters, China to Dar. With less motion
 * asked for, the grid and nodes stay and the travelling lights stop.
 */
const VANISH = { x: 200, y: 18 };
const FEET = [-380, -250, -140, -50, 30, 110, 200, 290, 370, 450, 540, 650, 780];
const ROWS = [34, 52, 78, 114, 162, 225];

/** Lanes between nodes. `main` is the China → Dar lane, drawn in the signal red. */
const LANES: { d: string; dur: number; delay: number; main?: boolean }[] = [
  { d: "M 30 225 Q 120 130 230 114", dur: 4.2, delay: 0, main: true },
  { d: "M 370 225 Q 300 150 230 114", dur: 5, delay: 1.2 },
  { d: "M 230 114 Q 205 70 186 52", dur: 3.6, delay: 0.4 },
  { d: "M 110 162 Q 160 120 186 78", dur: 4.6, delay: 2 },
  { d: "M 290 162 Q 250 110 214 78", dur: 3.8, delay: 2.8 },
  { d: "M -50 162 Q 40 120 110 162", dur: 5.4, delay: 1.6 },
  { d: "M 450 162 Q 370 120 290 162", dur: 5.2, delay: 0.8 },
];
const NODES: { x: number; y: number; main?: boolean }[] = [
  { x: 30, y: 225, main: true },
  { x: 370, y: 225 },
  { x: 230, y: 114, main: true },
  { x: 110, y: 162 },
  { x: 290, y: 162 },
  { x: 186, y: 52 },
  { x: 186, y: 78 },
  { x: 214, y: 78 },
];

export function LightNetwork({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice" className={cn("pointer-events-none", className)}>
      <defs>
        <linearGradient id="ln-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.35" stopColor="white" stopOpacity="0.6" />
          <stop offset="1" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id="ln-mask">
          <rect width="400" height="260" fill="url(#ln-fade)" />
        </mask>
        <filter id="ln-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g mask="url(#ln-mask)">
        {/* The grid: lines to the vanishing point, and rows closing up toward it. */}
        <g stroke="hsl(214 74% 62%)" strokeOpacity="0.28" strokeWidth="0.6">
          {FEET.map((x) => (
            <line key={x} x1={x} y1={260} x2={VANISH.x} y2={VANISH.y} />
          ))}
          {ROWS.map((y) => (
            <line key={y} x1={-400} y1={y} x2={800} y2={y} />
          ))}
        </g>

        {/* Lanes, faint, with a point of light travelling each. */}
        <g fill="none" filter="url(#ln-glow)">
          {LANES.map((lane) => (
            <g key={lane.d}>
              <path d={lane.d} stroke={lane.main ? "hsl(357 78% 58%)" : "hsl(214 74% 62%)"} strokeOpacity="0.35" strokeWidth="0.8" />
              <path
                d={lane.d}
                pathLength={100}
                stroke={lane.main ? "hsl(357 90% 66%)" : "hsl(205 90% 72%)"}
                strokeWidth={lane.main ? 2 : 1.6}
                strokeLinecap="round"
                strokeDasharray="10 90"
                className="motion-reduce:hidden"
              >
                <animate attributeName="stroke-dashoffset" values="100;0" dur={`${lane.dur}s`} begin={`${lane.delay}s`} repeatCount="indefinite" />
              </path>
            </g>
          ))}
        </g>

        {/* Nodes: a bright point and a ring that breathes out from it. */}
        {NODES.map((n) => {
          const colour = n.main ? "hsl(357 90% 66%)" : "hsl(205 90% 72%)";
          return (
            <g key={`${n.x}-${n.y}`} filter="url(#ln-glow)">
              <circle cx={n.x} cy={n.y} r={n.main ? 2.6 : 1.8} fill={colour} />
              <circle cx={n.x} cy={n.y} r={3} fill="none" stroke={colour} strokeWidth="0.8" className="motion-reduce:hidden">
                <animate attributeName="r" values="3;11" dur="2.6s" begin={`${(n.x % 7) * 0.3}s`} repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.8;0" dur="2.6s" begin={`${(n.x % 7) * 0.3}s`} repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
