// Prepares the homepage picture from the owner's key art (source.webp, never
// changed) and writes what the page plays:
//
//   public/brand/hero-art.webp     the picture: route in Target red, the logo on the truck and the aircraft
//   public/brand/hero-plane.webp   the aircraft's box, three panels side by side: sky without it | its outline | where to paint the sky
//   public/brand/hero-truck.webp   the same for the truck: road without it | its outline | where to paint the road
//
//   node scripts/hero-art/bake.mjs [--check DIR]    (--check also writes pictures to look at)
import path from "node:path";
import { N, ROOT, sharp, loadSource, mask, poly, smooth, saveRGB, ROUTE_MAIN, ROUTE_SECOND } from "./lib.mjs";
import { cutPlane } from "./plane.mjs";
import { cutTruck, CONTAINER_SIDE } from "./truck.mjs";

const OUT = path.join(ROOT, "public/brand");
const checkAt = process.argv.indexOf("--check");
const CHECK = checkAt > 0 ? process.argv[checkAt + 1] : null;
const RED = [216, 30, 42]; // Target red, #D81E2A
const art = await loadSource();
const lum = (i) => 0.299 * art[i] + 0.587 * art[i + 1] + 0.114 * art[i + 2];

// ---- 1. The route, from the picture's gold to Target red -------------------
// Only the two lines themselves: a narrow band along each traced line, so the
// city lights beside them keep their gold. The stars at both ends stay as they are.
{
  const line = (pts, w) => `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const band = await mask(line(ROUTE_MAIN, 13) + line(ROUTE_SECOND, 7), 1.6);
  for (let p = 0, i = 0; p < N * N; p++, i += 3) {
    const k = band[p] / 255; if (k <= 0.02) continue;
    const L = lum(i) / 255, bright = smooth(0.16, 0.42, L) * k; if (bright <= 0) continue;
    const hot = Math.max(L - 0.8, 0) * 2.4; // the white-hot core stays white
    for (let c = 0; c < 3; c++) art[i + c] = art[i + c] * (1 - bright) + bright * 255 * Math.min(1, (RED[c] / 255) * (0.42 + L * 1.15) + hot);
  }
}

// ---- 2. The Target logo, painted on the side of the truck's container ------
const logo = await sharp(path.join(OUT, "target-express-logo.svg"), { density: 220 }).resize(560).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const logoAt = (u, v) => { // straight-alpha read, u and v in 0..1
  const x = Math.min(logo.info.width - 1, Math.max(0, Math.round(u * (logo.info.width - 1)))), y = Math.min(logo.info.height - 1, Math.max(0, Math.round(v * (logo.info.height - 1))));
  const i = (y * logo.info.width + x) * 4; return [logo.data[i], logo.data[i + 1], logo.data[i + 2], logo.data[i + 3] / 255];
};
{
  const [TL, TR, BR, BL] = CONTAINER_SIDE;
  const U = [0.1, 0.68], V = [0.15, 0.82], S = 6; // the panel's place on the side; S samples per pixel each way
  const wSum = new Float32Array(N * N), cSum = new Float32Array(N * N * 3);
  const stepsU = Math.round(140 * (U[1] - U[0]) * S), stepsV = Math.round(62 * (V[1] - V[0]) * S);
  let ref = 0, refN = 0;
  for (let a = 0; a <= stepsU; a++) for (let b = 0; b <= stepsV; b++) {
    const pu = a / stepsU, pv = b / stepsV, u = U[0] + pu * (U[1] - U[0]), v = V[0] + pv * (V[1] - V[0]);
    const x = (TL[0] * (1 - u) + TR[0] * u) * (1 - v) + (BL[0] * (1 - u) + BR[0] * u) * v;
    const y = (TL[1] * (1 - u) + TR[1] * u) * (1 - v) + (BL[1] * (1 - u) + BR[1] * u) * v;
    const p = Math.round(y) * N + Math.round(x);
    // a white plate with rounded corners, the logo inside it with a margin
    const mx = 0.07, my = 0.1, lu = (pu - mx) / (1 - 2 * mx), lv = (pv - my) / (1 - 2 * my);
    let col = [246, 248, 251];
    if (lu >= 0 && lu <= 1 && lv >= 0 && lv <= 1) { const [r, g, bb, al] = logoAt(lu, lv); col = [col[0] + (r - col[0]) * al, col[1] + (g - col[1]) * al, col[2] + (bb - col[2]) * al]; }
    const cx = Math.min(pu, 1 - pu) * 140 * (U[1] - U[0]), cy = Math.min(pv, 1 - pv) * 62 * (V[1] - V[0]), rr = 2.5;
    if (cx < rr && cy < rr && Math.hypot(rr - cx, rr - cy) > rr) continue;
    wSum[p] += 1; cSum[p * 3] += col[0]; cSum[p * 3 + 1] += col[1]; cSum[p * 3 + 2] += col[2];
    ref += lum(p * 3); refN++;
  }
  ref /= refN;
  for (let p = 0; p < N * N; p++) {
    if (!wSum[p]) continue;
    const cov = Math.min(1, wSum[p] / (S * S * 0.8)), i = p * 3;
    const shade = Math.min(1.12, Math.max(0.8, 0.9 + (lum(i) - ref) / 220)); // the container's ribs and its light show through the paint
    for (let c = 0; c < 3; c++) art[i + c] = art[i + c] * (1 - cov) + cov * Math.min(255, (cSum[i + c] / wSum[p]) * shade * 0.94);
  }
}

// ---- 3. The aircraft: turned to fly from China towards Tanzania, in Target's colours ----
// The picture has it heading right. It is cut out, the sky behind it rebuilt, and it is set back down
// mirrored, nose to the left — the way the cargo flies. Then a red fin and the logo on the fuselage,
// painted on after the turn so the name reads the right way round.
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const plane = await cutPlane(art);
{
  const { box: B, sky, alpha } = plane, W = B.w, H = B.h;
  const turned = new Float32Array(W * H), rgb = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = y * W + x, m = y * W + (W - 1 - x), i = ((B.y + y) * N + B.x + W - 1 - x) * 3;
    turned[q] = alpha[m];
    for (let c = 0; c < 3; c++) rgb[q * 3 + c] = art[i + c];
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = y * W + x, i = ((B.y + y) * N + B.x + x) * 3;
    for (let c = 0; c < 3; c++) art[i + c] = sky[q * 3 + c] * (1 - turned[q]) + rgb[q * 3 + c] * turned[q];
  }
  plane.alpha = turned;
  // where the sky is repainted when it flies off: its own outline, grown and feathered
  const grown = new Float32Array(W * H);
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) { let m = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) m = Math.max(m, turned[(y + dy) * W + x + dx]); grown[y * W + x] = m; }
  plane.hole = grown;

  const flip = (x) => 2 * B.x + W - 1 - x; // a place on the aircraft, after the turn
  const fin = await mask(poly([[964,150.3],[969.3,149.3],[981.7,173.3],[963.7,173.7]].map(([x, y]) => [flip(x), y])), 0.6);
  for (let p = 0, i = 0; p < N * N; p++, i += 3) { const k = fin[p] / 255; if (!k) continue; const L = lum(i); for (let c = 0; c < 3; c++) art[i + c] = art[i + c] * (1 - k) + k * Math.min(255, RED[c] * (0.5 + L / 150)); }
  // along the fuselage, below the windows; the paint is multiplied in, so the hull's shading stays
  const cx = flip(1121), cy = 148, w = 82, h = w * (logo.info.height / logo.info.width) * 0.9, ang = Math.atan2(118, 254), cos = Math.cos(ang), sin = Math.sin(ang);
  for (let y = Math.floor(cy - 60); y < cy + 60; y++) for (let x = Math.floor(cx - 60); x < cx + 60; x++) {
    let r = 0, g = 0, b = 0, al = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const dx = x + (sx + 0.5) / 3 - cx, dy = y + (sy + 0.5) / 3 - cy, u = (dx * cos + dy * sin) / w + 0.5, v = (-dx * sin + dy * cos) / h + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const s = logoAt(u, v); r += s[0] * s[3]; g += s[1] * s[3]; b += s[2] * s[3]; al += s[3];
    }
    if (al <= 0) continue;
    const i = (y * N + x) * 3, k = (al / 9) * 0.92, col = [r / al, g / al, b / al];
    for (let c = 0; c < 3; c++) art[i + c] = art[i + c] * (1 - k) + k * ((art[i + c] / 255) * 0.25 + 0.75) * col[c];
  }
}
await saveRGB(art, N, N, path.join(OUT, "hero-art.webp"), 86);

// ---- 4. The cut-outs the page moves: each a file of three panels ----------
async function atlas(cut, clean, file) {
  const { box: B, alpha, hole } = cut, W = B.w, H = B.h, out = new Uint8ClampedArray(W * 3 * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = y * W + x, a = clamp(alpha[q] * 255), h = clamp(hole[q] * 255);
    for (let c = 0; c < 3; c++) { out[(y * W * 3 + x) * 3 + c] = clamp(clean[q * 3 + c]); out[(y * W * 3 + W + x) * 3 + c] = a; out[(y * W * 3 + 2 * W + x) * 3 + c] = h; }
  }
  await saveRGB(out, W * 3, H, file, 90);
}
await atlas(plane, plane.sky, path.join(OUT, "hero-plane.webp"));
const truck = await cutTruck(art);
await atlas(truck, truck.patch, path.join(OUT, "hero-truck.webp"));

// The sky's own colour along the picture's top edge, for the page behind it.
{ let r = 0, g = 0, b = 0; for (let x = 0; x < 700; x++) { r += art[x * 3]; g += art[x * 3 + 1]; b += art[x * 3 + 2]; } console.log("sky at the top edge:", [r, g, b].map((v) => Math.round(v / 700))); }

if (CHECK) {
  // the scene with nothing in it, and the two cut-outs, to look at
  const empty = new Uint8ClampedArray(art);
  for (const cut of [plane, truck]) { const { box: B, hole } = cut, clean = cut.sky ?? cut.patch; for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { const q = y * B.w + x, i = ((B.y + y) * N + B.x + x) * 3; for (let c = 0; c < 3; c++) empty[i + c] = art[i + c] * (1 - hole[q]) + clean[q * 3 + c] * hole[q]; } }
  const raw = (buf) => sharp(Buffer.from(buf.buffer), { raw: { width: N, height: N, channels: 3 } });
  await raw(empty).extract({ left: 640, top: 40, width: 614, height: 1150 }).resize(520).png().toFile(path.join(CHECK, "b-empty.png"));
  await raw(art).extract({ left: 860, top: 60, width: 394, height: 240 }).resize(788, null, { kernel: "cubic" }).png().toFile(path.join(CHECK, "b-plane.png"));
  await raw(art).extract({ left: 860, top: 920, width: 300, height: 190 }).resize(900, null, { kernel: "cubic" }).png().toFile(path.join(CHECK, "b-truck.png"));
  await raw(art).extract({ left: 250, top: 400, width: 640, height: 420 }).png().toFile(path.join(CHECK, "b-route.png"));
}
console.log("baked");
