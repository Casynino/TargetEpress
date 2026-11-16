// Cuts the truck out of the picture and repaints the road and trees behind it.
//
// The truck is boxy, so its outline is drawn by hand from a close-up. What was
// behind it cannot be seen, so it is rebuilt from what is beside it: the road
// from the stretch of road just ahead (lines on a straight road all run to one
// vanishing point, so road copied along those rays lines up by itself), and the
// trees from the trees just above.
import { N, mask, poly, fromZoom, sample, smooth, ROAD_VP, TRUCK_BOX } from "./lib.mjs";

// Read off a 4× close-up whose corner is (870, 930).
const Z = (pts) => fromZoom(pts, 870, 930, 4);
export const TRUCK = Z([
  [56,288],[72,286],[80,262],[92,240],[102,216],[160,192],[214,168],[243,160],[243,146],
  [820,59],[1016,66],[1040,76],[1042,292],[1036,348],[1004,356],
  [986,370],[978,390],[958,400],[935,402],[912,412],[885,416],[862,424],[838,420],
  [780,442],[700,456],[655,460],[640,474],[628,472],
  [615,497],[600,510],[580,514],[552,514],[522,522],[495,514],[480,502],
  [470,530],[402,542],[392,558],[375,568],[355,572],[335,568],[318,556],[308,540],
  [292,558],[150,560],[110,554],[78,542],[65,517],[61,480],[63,400],[59,356],[53,340],
]);
// The light the truck throws on the wet road ahead of it and under it: rebuilt too.
const SPILL = Z([[40,470],[300,470],[420,520],[660,470],[900,410],[1050,318],[1085,330],[1085,400],[880,470],[640,550],[430,610],[340,790],[16,790],[16,560]]);
/** The side of the container, for the logo: top-left, top-right, bottom-right, bottom-left. */
export const CONTAINER_SIDE = Z([[470,160],[1022,78],[1022,288],[480,415]]);

const RAIL = 0.233; // the far guard rail, as a slope from the vanishing point
const TREES = { x: 944, y: 920, w: 144, h: 22 }; // the dark trees right behind the truck (measured: the lit ones stop above its roof)

export async function cutTruck(art) {
  const B = TRUCK_BOX, W = B.w, H = B.h, [vx, vy] = ROAD_VP;
  const body = await mask(poly(TRUCK), 0.7);
  const tight = await mask(poly(TRUCK), 4.5); // the truck, grown a little and feathered
  const wide = await mask(poly(SPILL), 8); // its light on the road: a wide, soft edge, since light has none

  const patch = new Float32Array(W * H * 3), alpha = new Float32Array(W * H), hole = new Float32Array(W * H);
  const src = new Float32Array(W * H * 3), tree = new Float32Array(W * H), diff = new Float32Array(W * H * 3), px = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = B.x + x, Y = B.y + y, p = Y * N + X, q = y * W + x;
    alpha[q] = body[p] / 255;
    hole[q] = Math.max(smooth(30, 150, tight[p]), smooth(40, 215, wide[p]));
    const a = vx - X, above = vy + RAIL * a - Y; // px above the rail's foot
    // Road and rail: from the same ray, further down the road, where there is no truck.
    const aSrc = 775 + ((a - 470) * (972 - 775)) / (760 - 470), k = aSrc / a;
    sample(art, vx + (X - vx) * k, vy + (Y - vy) * k, px);
    src[q * 3] = px[0]; src[q * 3 + 1] = px[1]; src[q * 3 + 2] = px[2];
    tree[q] = smooth(7, 14, above);
  }
  // Outside the hole the picture is known, so the difference between it and the copied road is known
  // there: it is the light the copy lacks (the road here is lit warmer). Only the broad difference is
  // taken — both blurred first, from known pixels only — or a lane line a pixel out of place would
  // count as light. Inside the hole the difference is filled in smoothly below.
  const known = new Float32Array(W * H);
  for (let q = 0; q < W * H; q++) known[q] = hole[q] > 0 || tree[q] > 0 ? 0 : 1;
  const blurKnown = (get) => {
    const R = 7, tmp = new Float32Array(W * H * 4), out = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = y * W + x; let n = 0, a = 0, b = 0, c = 0; for (let d = -R; d <= R; d++) { const xx = x + d; if (xx < 0 || xx >= W) continue; const r = y * W + xx, k = known[r]; if (!k) continue; n += 1; a += get(r, 0); b += get(r, 1); c += get(r, 2); } tmp[q * 4] = a; tmp[q * 4 + 1] = b; tmp[q * 4 + 2] = c; tmp[q * 4 + 3] = n; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = y * W + x; let n = 0, a = 0, b = 0, c = 0; for (let d = -R; d <= R; d++) { const yy = y + d; if (yy < 0 || yy >= H) continue; const r = (yy * W + x) * 4; n += tmp[r + 3]; a += tmp[r]; b += tmp[r + 1]; c += tmp[r + 2]; } out[q * 4] = n ? a / n : 0; out[q * 4 + 1] = n ? b / n : 0; out[q * 4 + 2] = n ? c / n : 0; out[q * 4 + 3] = n; }
    return out;
  };
  const bArt = blurKnown((r, c) => art[((B.y + ((r / W) | 0)) * N + B.x + (r % W)) * 3 + c]);
  const bSrc = blurKnown((r, c) => src[r * 3 + c]);
  for (let q = 0; q < W * H; q++) for (let c = 0; c < 3; c++) diff[q * 3 + c] = known[q] ? Math.max(-90, Math.min(90, bArt[q * 4 + c] - bSrc[q * 4 + c])) : 0;
  const w = 1.9;
  for (let it = 0; it < 700; it++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const q = y * W + x; if (hole[q] <= 0) continue;
    for (let c = 0; c < 3; c++) { const i = q * 3 + c; diff[i] += w * ((diff[i - 3] + diff[i + 3] + diff[i - W * 3] + diff[i + W * 3]) / 4 - diff[i]); }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = B.x + x, Y = B.y + y, p = Y * N + X, q = y * W + x;
    for (let c = 0; c < 3; c++) patch[q * 3 + c] = art[p * 3 + c];
    if (hole[q] <= 0) continue;
    // Above the rail there is sea on that ray but trees here: lay the trees from just above in bands,
    // each band slid sideways so the same bush is never straight under itself.
    const band = Math.floor((Y - TREES.y) / TREES.h), v = (((Y - TREES.y) % TREES.h) + TREES.h) % TREES.h;
    const u = (((X - TREES.x + band * 53) % TREES.w) + TREES.w) % TREES.w;
    const ti = ((TREES.y + v) * N + TREES.x + u) * 3;
    for (let c = 0; c < 3; c++) {
      const road = src[q * 3 + c] + diff[q * 3 + c] * (1 - tree[q]);
      const fill = road + (art[ti + c] - road) * tree[q];
      patch[q * 3 + c] += (fill - patch[q * 3 + c]) * hole[q];
    }
  }
  return { box: B, patch, alpha, hole };
}
