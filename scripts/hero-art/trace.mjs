// Follows the picture's two route lines from the China star to the Dar star and
// prints them as point lists. A ridge follower: step along the line, and at each
// step take the brightest point across it. Used once to get the paths that
// hero-art.tsx and bake.mjs share; kept so the trace can be repeated.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { data, info } = await sharp(path.join(HERE, "source.webp")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const lum = (x, y) => { x = Math.round(x); y = Math.round(y); const i = (y * W + x) * 3; return (data[i] + data[i + 1] + data[i + 2]) / 3; };
// brightness averaged a little along the line direction, so a single city light cannot pull the trace off
const along = (x, y, dx, dy) => (lum(x - dx * 2, y - dy * 2) + lum(x, y) + lum(x + dx * 2, y + dy * 2)) / 3;

function follow(start, dir, end, reach) {
  let [x, y] = start, [dx, dy] = dir;
  const pts = [[x, y]];
  for (let n = 0; n < 600; n++) {
    const nx = x + dx * 3, ny = y + dy * 3;
    let best = -1, bx = nx, by = ny;
    for (let o = -reach; o <= reach; o += 0.5) {
      const px = nx - dy * o, py = ny + dx * o;
      const v = along(px, py, dx, dy) - Math.abs(o) * 1.5; // prefer straight on
      if (v > best) { best = v; bx = px; by = py; }
    }
    const ndx = bx - x, ndy = by - y, len = Math.hypot(ndx, ndy);
    dx = dx * 0.75 + (ndx / len) * 0.25; dy = dy * 0.75 + (ndy / len) * 0.25;
    const l2 = Math.hypot(dx, dy); dx /= l2; dy /= l2;
    x = bx; y = by; pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(best)]);
    if (Math.hypot(x - end[0], y - end[1]) < 8) break;
  }
  return pts;
}
const main = follow([832, 457], [-1, 0], [302, 772], 3);
const second = follow([826, 470], [-1, 0.12], [302, 772], 2.5);
const thin = (p) => p.filter((_, i) => i % 6 === 0 || i === p.length - 1).map(([x, y]) => [Math.round(x), Math.round(y)]);
console.log("MAIN", main.length, JSON.stringify(thin(main)));
console.log("SECOND", second.length, JSON.stringify(thin(second)));
console.log("weakest main", Math.min(...main.slice(1).map((p) => p[2])), "weakest second", Math.min(...second.slice(1).map((p) => p[2])));
