// Shared helpers for the hero picture scripts: pixel buffers, masks drawn from
// polygons, and the measurements taken off the picture (all in its own pixels,
// 1254 × 1254).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const sharp = require("sharp");
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
export const N = 1254;

/** The source picture as RGB bytes. */
export async function loadSource() {
  const { data } = await sharp(path.join(HERE, "source.webp")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return new Uint8ClampedArray(data);
}

/** A greyscale mask (0..255, N × N) from SVG shapes; `blur` softens it. */
export async function mask(shapes, blur = 0) {
  let img = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}"><rect width="${N}" height="${N}" fill="#000"/>${shapes}</svg>`));
  if (blur > 0) img = img.blur(blur);
  return new Uint8Array(await img.greyscale().raw().toBuffer());
}
export const poly = (pts, fill = "#fff") => `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${fill}"/>`;
export const disc = (x, y, r, fill = "#fff") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
/** Points read off a magnified close-up (see zoom.mjs) back to picture pixels. */
export const fromZoom = (pts, ox, oy, s) => pts.map(([x, y]) => [+(ox + x / s).toFixed(2), +(oy + y / s).toFixed(2)]);

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Bilinear read of an RGB buffer at a fractional position. */
export function sample(buf, x, y, out = [0, 0, 0]) {
  x = Math.min(N - 1.001, Math.max(0, x)); y = Math.min(N - 1.001, Math.max(0, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = (y0 * N + x0) * 3;
  for (let c = 0; c < 3; c++) {
    out[c] = (buf[i + c] * (1 - fx) + buf[i + 3 + c] * fx) * (1 - fy) + (buf[i + N * 3 + c] * (1 - fx) + buf[i + N * 3 + 3 + c] * fx) * fy;
  }
  return out;
}

/** Saves an RGB buffer (any size) as WebP. */
export const saveRGB = (buf, w, h, file, quality = 86) => sharp(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), { raw: { width: w, height: h, channels: 3 } }).webp({ quality }).toFile(file);

// ---- Measurements ---------------------------------------------------------

/** The route's two lines, China star → Dar star, followed pixel by pixel (trace.mjs). */
export const ROUTE_MAIN = [[832,457],[814,456],[796,458],[778,460],[760,462],[743,466],[725,470],[707,474],[690,478],[672,483],[655,488],[638,494],[621,500],[604,506],[588,514],[571,521],[555,528],[539,537],[523,545],[507,554],[492,563],[477,573],[462,583],[447,593],[432,604],[419,616],[405,628],[392,640],[379,652],[366,665],[355,679],[343,693],[333,708],[324,723],[315,739],[308,756],[304,767]];
export const ROUTE_SECOND = [[826,470],[808,469],[790,473],[773,477],[755,482],[738,486],[720,491],[703,495],[685,501],[668,506],[651,512],[634,518],[618,525],[601,531],[584,539],[568,546],[552,554],[535,562],[520,571],[504,580],[489,589],[473,599],[458,609],[444,619],[429,630],[415,641],[401,652],[388,665],[375,677],[362,690],[350,704],[339,717],[328,732],[318,747],[308,762],[305,767]];
export const CHINA = [843, 457];
export const DAR = [302, 772];

/** The aircraft's box, and the truck's, with room round each. */
export const PLANE_BOX = { x: 766, y: 66, w: 488, h: 224 };
export const TRUCK_BOX = { x: 856, y: 920, w: 298, h: 226 };
