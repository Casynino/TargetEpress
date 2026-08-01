import { COMPANY } from "@/lib/constants";

/**
 * The route, drawn.
 *
 * One aircraft flying an arc from Guangzhou to Dar es Salaam, on a repeating
 * loop. It is the only decorative animation on the site, and it earns its place
 * by being the thing the company actually does — a moving plane on a freight
 * homepage is not ornament, it is the product.
 *
 * Deliberately SMIL (`animateMotion`) rather than a JavaScript animation
 * library. It ships zero kilobytes of script, runs on the compositor, and
 * keeps working on a mid-range Android on Tanzanian mobile data, which is what
 * most of this site is read on. A motion library for one moving plane would
 * cost more to download than the entire page.
 *
 * Reduced motion is honoured in CSS rather than by removing the plane: someone
 * who has asked for stillness still sees the route and the aircraft, parked at
 * the end of it.
 */
export function RouteMap() {
  return (
    <section className="section border-y bg-[hsl(var(--ink))] text-white">
      <div className="container">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Njia yetu · Our route
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
              Guangzhou hadi Dar es Salaam,
              <br />
              mara tatu kila wiki.
            </h2>
            <p className="mt-4 max-w-md text-white/65">
              Mzigo wako unapokelewa, unapimwa na kupigwa picha kwenye ghala
              letu Guangzhou — kisha unapanda ndege.
              <span className="mt-2 block text-sm text-white/45">
                Received, weighed and photographed at our own warehouse in
                China, then flown. Electronics and liquids route through Hong
                Kong, everything else through Guangzhou.
              </span>
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-white/10 pt-6 sm:grid-cols-3">
              {[
                { value: "3", label: "flights a week" },
                { value: "2", label: "departure airports" },
                { value: COMPANY.promiseEn.match(/\w+/)?.[0] ?? "Days", label: "door to door" },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="font-display text-2xl font-bold tabular">
                    {item.value}
                  </dt>
                  <dd className="mt-0.5 text-xs text-white/50">{item.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <svg
              viewBox="0 0 600 320"
              className="w-full"
              role="img"
              aria-label="Flight route from Guangzhou, China to Dar es Salaam, Tanzania"
            >
              <defs>
                <linearGradient id="routeFade" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="0.15" />
                  <stop offset="50%" stopColor="hsl(var(--signal))" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0.15" />
                </linearGradient>
              </defs>

              {/* The arc itself. Referenced by id below so the plane and the
                  trail follow exactly the same curve. */}
              <path
                id="cargoRoute"
                d="M 90 230 Q 300 40 510 190"
                fill="none"
                stroke="url(#routeFade)"
                strokeWidth="2"
                strokeDasharray="6 8"
              />

              {/* Endpoints */}
              <g>
                <circle cx="90" cy="230" r="7" fill="hsl(var(--signal))" />
                <circle
                  cx="90"
                  cy="230"
                  r="14"
                  fill="none"
                  stroke="hsl(var(--signal))"
                  strokeOpacity="0.35"
                />
                <text
                  x="90"
                  y="264"
                  textAnchor="middle"
                  className="fill-white/80 text-[13px] font-semibold"
                >
                  Guangzhou
                </text>
                <text
                  x="90"
                  y="281"
                  textAnchor="middle"
                  className="fill-white/40 text-[11px]"
                >
                  China
                </text>
              </g>

              <g>
                <circle cx="510" cy="190" r="7" fill="hsl(var(--brand))" />
                <circle
                  cx="510"
                  cy="190"
                  r="14"
                  fill="none"
                  stroke="hsl(var(--brand))"
                  strokeOpacity="0.4"
                />
                <text
                  x="510"
                  y="224"
                  textAnchor="middle"
                  className="fill-white/80 text-[13px] font-semibold"
                >
                  Dar es Salaam
                </text>
                <text
                  x="510"
                  y="241"
                  textAnchor="middle"
                  className="fill-white/40 text-[11px]"
                >
                  Tanzania
                </text>
              </g>

              {/* The aircraft. rotate="auto" banks it into the curve, so it
                  leans the way a plane actually would. */}
              <g className="route-plane">
                <path
                  d="M 0 -7 L 16 0 L 0 7 L 4 0 Z"
                  fill="white"
                  transform="translate(-8,0)"
                />
                <animateMotion
                  dur="7s"
                  repeatCount="indefinite"
                  rotate="auto"
                  keyPoints="0;1"
                  keyTimes="0;1"
                  calcMode="linear"
                >
                  <mpath href="#cargoRoute" />
                </animateMotion>
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* Stillness for anyone who asked for it: the plane parks at the end of
          the route rather than disappearing. */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .route-plane animateMotion { display: none; }
          .route-plane { transform: translate(510px, 190px); }
        }
      `}</style>
    </section>
  );
}
