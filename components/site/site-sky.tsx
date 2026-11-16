import { AIRCRAFT_PATH } from "@/lib/aircraft";
import { IMAGES, img } from "@/lib/imagery";

/**
 * The sky every public page sits on, fixed behind the page (see `.site-sky`
 * in globals.css for why, and how it follows day and night).
 *
 * Quiet on purpose (owner, 16 Nov 2026: the first one was "too much, I can't
 * read anything … make the balance"): a plain sky with faint cloud in it, more
 * of it along the foot of the screen, drifting; and now and then a small plane
 * crossing far off with its trail. Nothing in it is strong enough to compete
 * with a word laid over it.
 *
 * One photograph of real cloud, used twice (far and near). A plain <img>, not
 * next/image: it is decoration behind the whole site, and a phone should fetch
 * the small crop and nothing else.
 */
export function SiteSky() {
  const cloud = (className: string) => (
    <picture>
      <source media="(max-width: 700px)" srcSet={img(IMAGES.skyAbove, 900, 55)} />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img className={className} src={img(IMAGES.skyAbove, 1800, 58)} alt="" decoding="async" />
    </picture>
  );
  return (
    <div aria-hidden className="site-sky">
      {cloud("sky-far")}
      {cloud("sky-near")}
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
