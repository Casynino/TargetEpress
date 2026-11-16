// Cuts the truck out of the picture and repaints the road and trees behind it.
//
// The truck is boxy, so its outline is drawn by hand from a close-up. What was
// behind it cannot be seen, so it is rebuilt from what is beside it. Everything
// on a road runs along the road — the rail, the lane lines, the light trails of
// this long exposure — so the road is filled along "streamlines": lines that
// join the same place across the road on the truck's left to the same place on
// its right. Each streamline is coloured by fading from its left end to its
// right end, which carries every line across behind the truck in one piece.
// The trees above the rail do not run along the road, so they are laid in from
// the trees just above. Whatever broad difference in light is left at the edge
// of the repair is then spread smoothly across it.
import { N, mask, poly, fromZoom, sample, smooth, TRUCK_BOX } from "./lib.mjs";

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
const SPILL = Z([[40,470],[300,440],[660,430],[900,380],[1050,300],[1104,320],[1104,440],[900,540],[660,640],[440,700],[350,800],[16,800],[16,560]]);
/** The side of the container, for the logo: top-left, top-right, bottom-right, bottom-left. */
export const CONTAINER_SIDE = Z([[470,160],[1022,78],[1022,288],[480,415]]);

// Two columns, one on each side of the truck where the road is clear, and on each the height of the far
// rail and of the double-yellow centre line (measure-road.mjs). They fix how a place across the road on
// the left maps to the same place on the right: yRight = A·yLeft + B.
const LEFT = { x: 866, rail: 1040, centre: 1127.5 }, RIGHT = { x: 1146, rail: 977.7, centre: 1025 };
const A = (RIGHT.centre - RIGHT.rail) / (LEFT.centre - LEFT.rail), B = RIGHT.rail - A * LEFT.rail;
const TREES = { x: 944, y: 920, w: 144, h: 22 }; // the dark trees right behind the truck (measured: the lit ones stop above its roof)

export async function cutTruck(art) {
  const Bx = TRUCK_BOX, W = Bx.w, H = Bx.h;
  const body = await mask(poly(TRUCK), 0.7);
  const tight = await mask(poly(TRUCK), 4.5); // the truck, grown a little and feathered
  const wide = await mask(poly(SPILL), 8); // its light on the road: a wide, soft edge, since light has none

  const fill = new Float32Array(W * H * 3), alpha = new Float32Array(W * H), hole = new Float32Array(W * H), trees = new Float32Array(W * H), l = [0, 0, 0], r = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = Bx.x + x, Y = Bx.y + y, p = Y * N + X, q = y * W + x;
    alpha[q] = body[p] / 255;
    // nothing is repaired outside the two columns: there the picture is as it was
    hole[q] = Math.max(smooth(30, 150, tight[p]), smooth(40, 215, wide[p])) * smooth(LEFT.x, LEFT.x + 8, X) * (1 - smooth(RIGHT.x - 8, RIGHT.x, X));
    const t = Math.min(1, Math.max(0, (X - LEFT.x) / (RIGHT.x - LEFT.x)));
    const yL = (Y - t * B) / (1 - t + t * A), yR = A * yL + B, slope = (yR - yL) / (RIGHT.x - LEFT.x);
    // each end is read a little way outside its column, along the streamline, and averaged: one bright
    // pixel must not become a streak
    let cl = [0, 0, 0], cr = [0, 0, 0];
    for (let d = 0; d < 5; d++) {
      sample(art, LEFT.x - d * 2.5, yL - d * 2.5 * slope, l); sample(art, RIGHT.x + d * 2.5, yR + d * 2.5 * slope, r);
      for (let c = 0; c < 3; c++) { cl[c] += l[c] / 5; cr[c] += r[c] / 5; }
    }
    const e = t * t * (3 - 2 * t);
    // above the rail's hedge the trees are laid in bands, each slid sideways so the same bush is never under itself
    const above = LEFT.rail - 26 - yL, tree = smooth(0, 10, above);
    const band = Math.floor((Y - TREES.y) / TREES.h), v = (((Y - TREES.y) % TREES.h) + TREES.h) % TREES.h, u = (((X - TREES.x + band * 53) % TREES.w) + TREES.w) % TREES.w;
    const ti = ((TREES.y + v) * N + TREES.x + u) * 3;
    trees[q] = tree;
    for (let c = 0; c < 3; c++) { const road = cl[c] + (cr[c] - cl[c]) * e; fill[q * 3 + c] = road + (art[ti + c] - road) * tree; }
  }

  // The laid-in trees were lit somewhere else: the broad difference between the picture and the fill, known
  // outside the repair, is spread smoothly across it and added to the trees. (Not to the road: a streamline
  // already matches the picture at both its ends, and the truck's own shadow at the foot of the repair would
  // be spread up into it as a dark smudge.)
  const known = new Float32Array(W * H);
  for (let q = 0; q < W * H; q++) known[q] = hole[q] > 0 ? 0 : 1;
  const blurKnown = (get) => {
    const R = 6, tmp = new Float32Array(W * H * 4), out = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = y * W + x; let n = 0, a = 0, b = 0, c = 0; for (let d = -R; d <= R; d++) { const xx = x + d; if (xx < 0 || xx >= W) continue; const k = y * W + xx; if (!known[k]) continue; n += 1; a += get(k, 0); b += get(k, 1); c += get(k, 2); } tmp[q * 4] = a; tmp[q * 4 + 1] = b; tmp[q * 4 + 2] = c; tmp[q * 4 + 3] = n; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = y * W + x; let n = 0, a = 0, b = 0, c = 0; for (let d = -R; d <= R; d++) { const yy = y + d; if (yy < 0 || yy >= H) continue; const k = (yy * W + x) * 4; n += tmp[k + 3]; a += tmp[k]; b += tmp[k + 1]; c += tmp[k + 2]; } out[q * 4] = n ? a / n : 0; out[q * 4 + 1] = n ? b / n : 0; out[q * 4 + 2] = n ? c / n : 0; }
    return out;
  };
  const bArt = blurKnown((k, c) => art[((Bx.y + ((k / W) | 0)) * N + Bx.x + (k % W)) * 3 + c]);
  const bFill = blurKnown((k, c) => fill[k * 3 + c]);
  const diff = new Float32Array(W * H * 3);
  for (let q = 0; q < W * H; q++) for (let c = 0; c < 3; c++) diff[q * 3 + c] = known[q] ? Math.max(-70, Math.min(70, bArt[q * 4 + c] - bFill[q * 4 + c])) : 0;
  for (let it = 0; it < 700; it++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const q = y * W + x; if (hole[q] <= 0) continue;
    for (let c = 0; c < 3; c++) { const i = q * 3 + c; diff[i] += 1.9 * ((diff[i - 3] + diff[i + 3] + diff[i - W * 3] + diff[i + W * 3]) / 4 - diff[i]); }
  }

  const patch = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = y * W + x, i = ((Bx.y + y) * N + Bx.x + x) * 3;
    for (let c = 0; c < 3; c++) patch[q * 3 + c] = art[i + c] + (fill[q * 3 + c] + diff[q * 3 + c] * trees[q] - art[i + c]) * hole[q];
  }
  return { box: Bx, patch, alpha, hole };
}
