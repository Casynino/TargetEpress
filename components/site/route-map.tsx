import { COMPANY } from "@/lib/constants";

/**
 * The route network.
 *
 * Four lanes converging on Dar es Salaam, each with its own aircraft flying it.
 * It replaces a single arrow, which is what a freight homepage should never
 * reduce its own product to.
 *
 * The markers are placed by actual coordinates rather than by eye — see
 * `project()`. A logistics map with cities in invented positions is the kind of
 * detail that reads as fake to exactly the people who know the route.
 *
 * Still SMIL (`animateMotion`) rather than a motion library. It ships zero
 * kilobytes of script, runs on the compositor, and keeps working on a mid-range
 * Android on Tanzanian mobile data, which is what most of this site is read on.
 * Four moving planes would not justify a runtime.
 */

/** The window of the world this map shows, in degrees. */
const LON = [30, 122] as const;
const LAT = [-12, 34] as const;
const W = 640;
const H = 430;

/** Equirectangular, cropped to the window above. Honest enough at this scale. */
function project(lon: number, lat: number): [number, number] {
  const x = ((lon - LON[0]) / (LON[1] - LON[0])) * W;
  const y = ((LAT[1] - lat) / (LAT[1] - LAT[0])) * H;
  return [Math.round(x), Math.round(y)];
}

const DAR = project(39.28, -6.79);

type Lane = {
  id: string;
  city: string;
  country: string;
  lon: number;
  lat: number;
  /** How far the arc bows off the straight line. Distinguishes lanes that
   *  start close together — Guangzhou and Hong Kong are 90 km apart and would
   *  otherwise draw as one line. */
  bow: number;
  /** Seconds into the loop this aircraft departs, so they do not fly in step. */
  delay: number;
  /** Where the label sits relative to the marker. */
  anchor: "start" | "middle" | "end";
  dy: number;
  main?: boolean;
};

const LANES: Lane[] = [
  {
    id: "gz",
    city: "Guangzhou",
    country: "China",
    lon: 113.26,
    lat: 23.13,
    bow: -120,
    delay: 0,
    anchor: "end",
    dy: -26,
    main: true,
  },
  {
    id: "hk",
    city: "Hong Kong",
    country: "China",
    lon: 114.17,
    lat: 22.32,
    bow: -34,
    delay: 2,
    anchor: "end",
    dy: 34,
    main: true,
  },
  {
    id: "dxb",
    city: "Dubai",
    country: "UAE",
    lon: 55.27,
    lat: 25.2,
    bow: -62,
    delay: 4,
    anchor: "middle",
    dy: -24,
  },
  {
    id: "add",
    city: "Addis Ababa",
    country: "Ethiopia",
    lon: 38.74,
    lat: 8.98,
    bow: -46,
    delay: 6,
    anchor: "end",
    dy: -22,
  },
];

/** Quadratic arc from a lane's origin to Dar, bowed by `bow`. */
function arc(lane: Lane) {
  const [x, y] = project(lane.lon, lane.lat);
  const [dx, dy] = DAR;

  // Control point: the midpoint, pushed along the perpendicular of the chord.
  const mx = (x + dx) / 2;
  const my = (y + dy) / 2;
  const vx = dx - x;
  const vy = dy - y;
  const len = Math.hypot(vx, vy) || 1;
  const cx = mx + (-vy / len) * lane.bow;
  const cy = my + (vx / len) * lane.bow;

  return {
    d: `M ${x} ${y} Q ${Math.round(cx)} ${Math.round(cy)} ${dx} ${dy}`,
    x,
    y,
  };
}

const LOOP = 8; // seconds for one aircraft to fly its lane
const CYCLE = LOOP + 2; // a beat of empty sky before it comes round again

export function RouteMap() {
  return (
    <section className="section relative overflow-hidden border-y bg-[hsl(var(--ink))] text-white">
      {/* A wash of colour behind the map, so the section is not a flat
          rectangle of navy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-0 h-[520px] w-[520px] rounded-full bg-brand/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 bottom-0 h-[420px] w-[420px] rounded-full bg-gold/10 blur-3xl"
      />

      <div className="container relative">
        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="eyebrow-gold">Njia zetu · Our routes</p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
              Four lanes into
              <br />
              Dar es Salaam.
            </h2>
            <p className="mt-4 max-w-md text-white/65">
              Mzigo wako unapokelewa, unapimwa na kupigwa picha kwenye ghala
              letu Guangzhou — kisha unapanda ndege.
              <span className="mt-2 block text-sm text-white/45">
                We load in Guangzhou and Hong Kong. Depending on the airline and
                what you are sending, your cargo flies direct or connects
                through the Dubai or Addis Ababa hubs — the same tracking number
                either way.
              </span>
            </p>

            <ul className="mt-8 space-y-2.5 border-t border-white/10 pt-6">
              {LANES.map((lane) => (
                <li key={lane.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      lane.main
                        ? "h-2 w-2 shrink-0 rounded-full bg-signal"
                        : "h-2 w-2 shrink-0 rounded-full bg-gold"
                    }
                  />
                  <span className="font-medium">{lane.city}</span>
                  <span className="text-white/30">→</span>
                  <span className="text-white/55">Dar</span>
                  {lane.main ? (
                    <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-signal">
                      We load here
                    </span>
                  ) : (
                    <span className="ml-auto text-[11px] uppercase tracking-wider text-white/35">
                      Transit hub
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <dl className="mt-8 grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
              {[
                { value: "3", label: "flights a week" },
                { value: "2", label: "loading airports" },
                {
                  value: COMPANY.promiseEn.match(/\w+/)?.[0] ?? "Days",
                  label: "door to door",
                },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="font-display text-2xl font-bold tabular text-gold">
                    {item.value}
                  </dt>
                  <dd className="mt-0.5 text-xs text-white/50">{item.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full overflow-visible"
              role="img"
              aria-label="Air cargo routes into Dar es Salaam from Guangzhou, Hong Kong, Dubai and Addis Ababa"
            >
              <defs>
                {LANES.map((lane) => (
                  <linearGradient
                    key={lane.id}
                    id={`lane-${lane.id}`}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    <stop
                      offset="0%"
                      stopColor={
                        lane.main ? "hsl(var(--signal))" : "hsl(var(--gold))"
                      }
                      stopOpacity="0.85"
                    />
                    <stop
                      offset="100%"
                      stopColor="hsl(var(--brand))"
                      stopOpacity="0.25"
                    />
                  </linearGradient>
                ))}

                {/* Faint field of dots, so the routes sit on something rather
                    than floating in empty navy. */}
                <pattern
                  id="mapDots"
                  width="16"
                  height="16"
                  patternUnits="userSpaceOnUse"
                >
                  <circle
                    cx="1.5"
                    cy="1.5"
                    r="1"
                    fill="hsl(var(--brand))"
                    opacity="0.16"
                  />
                </pattern>
              </defs>

              <rect width={W} height={H} fill="url(#mapDots)" />

              {/* Routes, drawn under the markers */}
              {LANES.map((lane) => {
                const { d } = arc(lane);
                return (
                  <path
                    key={lane.id}
                    id={`route-${lane.id}`}
                    d={d}
                    fill="none"
                    stroke={`url(#lane-${lane.id})`}
                    strokeWidth={lane.main ? 2 : 1.4}
                    strokeDasharray={lane.main ? "6 8" : "3 7"}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Origin markers */}
              {LANES.map((lane) => {
                const { x, y } = arc(lane);
                const colour = lane.main
                  ? "hsl(var(--signal))"
                  : "hsl(var(--gold))";
                return (
                  <g key={lane.id}>
                    <circle cx={x} cy={y} r={lane.main ? 6 : 4.5} fill={colour} />
                    <circle
                      cx={x}
                      cy={y}
                      r={lane.main ? 13 : 10}
                      fill="none"
                      stroke={colour}
                      strokeOpacity="0.35"
                    />
                    <text
                      x={x}
                      y={y + lane.dy}
                      textAnchor={lane.anchor}
                      className="fill-white/85 text-[13px] font-semibold"
                    >
                      {lane.city}
                    </text>
                    <text
                      x={x}
                      y={y + lane.dy + 15}
                      textAnchor={lane.anchor}
                      className="fill-white/40 text-[11px]"
                    >
                      {lane.country}
                    </text>
                  </g>
                );
              })}

              {/* Destination. Larger, and the only marker that pulses — it is
                  the point of the whole picture. */}
              <g>
                <circle
                  cx={DAR[0]}
                  cy={DAR[1]}
                  r="22"
                  fill="hsl(var(--brand))"
                  opacity="0.12"
                  className="dar-pulse"
                />
                <circle cx={DAR[0]} cy={DAR[1]} r="8" fill="hsl(var(--brand))" />
                <circle
                  cx={DAR[0]}
                  cy={DAR[1]}
                  r="16"
                  fill="none"
                  stroke="hsl(var(--brand))"
                  strokeOpacity="0.45"
                />
                <text
                  x={DAR[0]}
                  y={DAR[1] + 40}
                  textAnchor="middle"
                  className="fill-white text-[14px] font-bold"
                >
                  Dar es Salaam
                </text>
                <text
                  x={DAR[0]}
                  y={DAR[1] + 57}
                  textAnchor="middle"
                  className="fill-gold text-[11px] font-semibold uppercase tracking-[0.14em]"
                >
                  Tanzania
                </text>
              </g>

              {/* The aircraft. rotate="auto" banks each one into its own curve,
                  so it leans the way a plane actually would. Each holds at the
                  destination for the tail of the cycle rather than snapping
                  back to China the instant it lands. */}
              {LANES.map((lane) => (
                <g key={lane.id} className="route-plane">
                  <path
                    d="M 14 0 L -6 6 L -2 0 L -6 -6 Z"
                    fill="#fff"
                    opacity={lane.main ? 1 : 0.75}
                    transform={lane.main ? "scale(1)" : "scale(0.8)"}
                  />
                  <animateMotion
                    dur={`${CYCLE}s`}
                    begin={`${lane.delay}s`}
                    repeatCount="indefinite"
                    rotate="auto"
                    keyPoints="0;1;1"
                    keyTimes={`0;${(LOOP / CYCLE).toFixed(3)};1`}
                    calcMode="linear"
                  >
                    <mpath href={`#route-${lane.id}`} />
                  </animateMotion>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* Stillness for anyone who asked for it: the aircraft are hidden rather
          than frozen mid-air, and the routes and markers still tell the story. */}
      <style>{`
        .dar-pulse {
          animation: darPulse 3.5s ease-in-out infinite;
          transform-origin: ${DAR[0]}px ${DAR[1]}px;
        }
        @keyframes darPulse {
          0%, 100% { transform: scale(1);    opacity: 0.12; }
          50%      { transform: scale(1.35); opacity: 0.03; }
        }
        @media (prefers-reduced-motion: reduce) {
          .route-plane { display: none; }
          .dar-pulse { animation: none; }
        }
      `}</style>
    </section>
  );
}
