// Cuts the aircraft out of the picture and repaints the sky behind it.
//
// The plane sits on smooth evening sky, so the sky behind it can be rebuilt: a
// hull is drawn loosely round the plane (tight only where cloud touches it),
// the sky inside the hull is filled in from the sky round it (a soap-film
// fill), and whatever differs from that sky is plane. Its lights' flares are
// kept with it, so they fly too.
import { N, mask, poly, disc, fromZoom, smooth, PLANE_BOX } from "./lib.mjs";

// Read off a 3× close-up whose corner is (780, 80).
const Z = (pts) => fromZoom(pts, 780, 80, 3);
const HULL = Z([
  [44,284],[60,281],[200,279],[350,277],[538,273],[538,204],[560,196],[582,198],[614,266],
  [735,219],[800,185],[900,137],[1000,95],[1090,61],[1150,47],[1200,43],[1240,49],[1273,65],[1291,90],[1293,112],
  [1285,137],[1264,166],[1236,194],[1206,224],[1150,251],[1100,271],[1050,291],[1022,303],
  [1058,311],[1095,304],[1140,304],[1176,320],[1197,346],[1272,371],[1284,380],[1272,392],[1200,396],
  [1188,408],[1165,421],[1120,427],[1060,423],[1040,413],[1000,417],[945,416],[916,407],
  [880,404],[830,416],[790,432],[760,448],[720,465],[690,476],[600,483],[545,480],[512,470],[504,452],
  [330,438],[308,427],[328,417],[544,419],[540,385],
  [478,379],[415,371],[358,355],[280,355],[270,331],[200,319],[120,309],[60,303],[44,298],
]);
const FLARES = [[48,293,28],[1152,232,30],[790,415,26],[1268,378,24],[830,283,12]].map(([x, y, r]) => [780 + x / 3, 80 + y / 3, r / 3]);
// The fin is nearly the sky's own blue, so it is told to be plane.
const FIN = Z([[552,211],[568,208],[605,280],[551,281]]);

export async function cutPlane(art) {
  const B = PLANE_BOX, W = B.w, H = B.h;
  const hullM = await mask(poly(HULL) + FLARES.map(([x, y, r]) => disc(x, y, r)).join(""));
  const wide = await mask(poly(HULL) + FLARES.map(([x, y, r]) => disc(x, y, r + 2)).join(""), 2.2); // hull grown ~4px
  const finM = await mask(poly(FIN));

  // The box, as floats; `hole` marks what is to be rebuilt.
  const sky = new Float32Array(W * H * 3), hole = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (B.y + y) * N + (B.x + x), q = y * W + x;
    for (let c = 0; c < 3; c++) sky[q * 3 + c] = art[p * 3 + c];
    hole[q] = wide[p] > 40 ? 1 : 0;
  }
  // Start the hole from the average of what surrounds it, then relax: every hole
  // pixel becomes the mean of its neighbours until the film settles.
  const mean = [0, 0, 0]; let cnt = 0;
  for (let q = 0; q < W * H; q++) if (!hole[q]) { for (let c = 0; c < 3; c++) mean[c] += sky[q * 3 + c]; cnt++; }
  for (let q = 0; q < W * H; q++) if (hole[q]) for (let c = 0; c < 3; c++) sky[q * 3 + c] = mean[c] / cnt;
  const w = 1.92;
  for (let it = 0; it < 900; it++) {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const q = y * W + x; if (!hole[q]) continue;
      for (let c = 0; c < 3; c++) {
        const i = q * 3 + c, avg = (sky[i - 3] + sky[i + 3] + sky[i - W * 3] + sky[i + W * 3]) / 4;
        sky[i] += w * (avg - sky[i]);
      }
    }
  }

  // What differs from the rebuilt sky, inside the hull, is the plane.
  let a = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (B.y + y) * N + (B.x + x), q = y * W + x;
    if (!hullM[p]) continue;
    const d = Math.hypot(art[p * 3] - sky[q * 3], art[p * 3 + 1] - sky[q * 3 + 1], art[p * 3 + 2] - sky[q * 3 + 2]);
    a[q] = Math.max(smooth(16, 40, d), finM[p] / 255);
  }
  // Keep the one big piece; anything else that differed from the sky was a speck of cloud.
  const lab = new Int32Array(W * H).fill(-1); let best = -1, bestN = 0;
  for (let s = 0; s < W * H; s++) {
    if (a[s] < 0.5 || lab[s] !== -1) continue;
    const stack = [s]; lab[s] = s; let n = 0;
    while (stack.length) { const q = stack.pop(); n++; const x = q % W; for (const r of [q - 1, q + 1, q - W, q + W]) { if (r < 0 || r >= W * H) continue; if (Math.abs((r % W) - x) > 1) continue; if (a[r] >= 0.5 && lab[r] === -1) { lab[r] = s; stack.push(r); } } }
    if (n > bestN) { bestN = n; best = s; }
  }
  // Flood the outside from the box's edge; what the flood cannot reach is inside the plane.
  const out = new Uint8Array(W * H), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const q = st.pop(); if (out[q] || (a[q] >= 0.5 && lab[q] === best)) continue; out[q] = 1; const x = q % W; if (x > 0) st.push(q - 1); if (x < W - 1) st.push(q + 1); if (q >= W) st.push(q - W); if (q < W * (H - 1)) st.push(q + W); }
  for (let q = 0; q < W * H; q++) {
    if (!out[q]) a[q] = 1; // inside the plane: solid
    else if (lab[q] !== best && a[q] >= 0.5) a[q] = 0; // a separate speck
    else if (a[q] < 0.5) { /* soft edge or flare glow near the plane: keep only if it touches the body */ }
  }
  // Soft glow that is not attached to the body goes; then one gentle pass to take the stair-steps off the edge.
  const near = new Uint8Array(W * H);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const q = y * W + x; if (a[q] <= 0) continue; let ok = 0; for (let dy = -2; dy <= 2 && !ok; dy++) for (let dx = -2; dx <= 2; dx++) if (a[q + dy * W + dx] >= 0.99) { ok = 1; break; } near[q] = ok; }
  const flare = new Uint8Array(W * H);
  for (const [fx, fy, fr] of FLARES) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(B.x + x - fx, B.y + y - fy) <= fr) flare[y * W + x] = 1;
  for (let q = 0; q < W * H; q++) if (a[q] < 0.99 && !near[q] && !flare[q]) a[q] = 0;
  const soft = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const q = y * W + x; soft[q] = (a[q] * 4 + a[q - 1] + a[q + 1] + a[q - W] + a[q + W]) / 8; }

  return { box: B, sky, alpha: soft, hole };
}
