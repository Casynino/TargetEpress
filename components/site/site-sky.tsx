import { SkyScene } from "@/components/site/sky-scene";
import { AIRCRAFT_PATH } from "@/lib/aircraft";

/**
 * The sky every public page sits on, fixed behind the page (see `.site-sky`
 * in globals.css for how it follows day and night).
 *
 * The scene itself is SkyScene: above the cloud, flying. Over it, two planes
 * cross far off now and then, and by night the stars come out. Words are never
 * laid straight on the busy part of it: cards on the public site are glass
 * (`.site .bg-card`), which is what keeps a moving sky and readable text on
 * the same page.
 */
export function SiteSky() {
  return (
    <div aria-hidden className="site-sky">
      <SkyScene />
      <span className="sky-lane sky-lane-a">
        <Plane id="sky-trail-a" />
      </span>
      <span className="sky-lane sky-lane-b">
        <Plane id="sky-trail-b" />
      </span>
    </div>
  );
}

/** A plane seen from far below, nose to the right, its trail thinning out behind it. */
function Plane({ id }: { id: string }) {
  return (
    <svg className="sky-plane" viewBox="-190 -12 208 24" width="208" height="24">
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <rect x="-190" y="-0.7" width="180" height="1.4" rx="0.7" fill={`url(#${id})`} />
      <path d={AIRCRAFT_PATH} fill="currentColor" />
    </svg>
  );
}
