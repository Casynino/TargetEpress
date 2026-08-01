import { readFileSync, writeFileSync } from "node:fs";
import { geoContains } from "d3-geo";

const land = JSON.parse(readFileSync("public/geo/land-110m.json", "utf8"));

// Must match route-map.tsx exactly.
const LON = [30, 122], LAT = [-12, 34], W = 640, H = 430;
const STEP = 1.9;

const dots = [];
for (let lon = LON[0]; lon <= LON[1]; lon += STEP) {
  for (let lat = LAT[0]; lat <= LAT[1]; lat += STEP) {
    for (const f of land.features) {
      if (geoContains(f, [lon, lat])) {
        dots.push([
          Math.round(((lon - LON[0]) / (LON[1] - LON[0])) * W * 10) / 10,
          Math.round(((LAT[1] - lat) / (LAT[1] - LAT[0])) * H * 10) / 10,
        ]);
        break;
      }
    }
  }
}
console.log("land dots:", dots.length, "of", Math.round(((LON[1]-LON[0])/STEP+1)*((LAT[1]-LAT[0])/STEP+1)), "grid points");

writeFileSync(
  "lib/route-land.ts",
  `/**
 * The landmasses under the route map, as dots.
 *
 * Generated from the same vendored land-110m.json the globe uses, through the
 * same projection window as \`route-map.tsx\` — so the coastlines line up with
 * the city markers instead of merely suggesting a map.
 *
 * Pre-computed rather than derived at render time: geoContains over 127
 * polygons for every grid point is real work, and the answer never changes.
 * Regenerate with scripts/gen-route-land.mjs if the window or step changes.
 *
 * Window: lon ${LON[0]}..${LON[1]}, lat ${LAT[0]}..${LAT[1]}, ${W}x${H}, step ${STEP}°.
 */
export const ROUTE_LAND: ReadonlyArray<readonly [number, number]> = ${JSON.stringify(dots)};
`
);
console.log("wrote lib/route-land.ts");
