// Working tool: finds the earth's limb (the bright line of air along its top edge) column by column and
// fits a circle to it. The scene is carried on to the left of the picture along that circle.
import { loadSource, N } from "./lib.mjs";
const art = await loadSource();
const lum = (x, y) => { const i = (y * N + x) * 3; return 0.299 * art[i] + 0.587 * art[i + 1] + 0.114 * art[i + 2]; };
const pts = [];
for (let x = 4; x <= 760; x += 28) {
  // the limb is the sharpest rise in brightness going down out of the dark sky
  let best = 0, by = 0;
  for (let y = 230; y < 400; y++) { let g = 0; for (let d = -3; d <= 3; d++) g += lum(x + d, y + 3) - lum(x + d, y - 3); if (g > best) { best = g; by = y; } }
  pts.push([x, by, Math.round(best)]);
}
console.log(pts.map((p) => p.join(",")).join("  "));
// algebraic circle fit: x² + y² + D·x + E·y + F = 0
let S = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
for (const [x, y] of pts) { const r = [x, y, 1], b = -(x * x + y * y); for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) S[i][j] += r[i] * r[j]; S[i][3] += r[i] * b; } }
for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const f = S[j][i] / S[i][i]; for (let k = i; k < 4; k++) S[j][k] -= f * S[i][k]; }
const F = S[2][3] / S[2][2], E = (S[1][3] - S[1][2] * F) / S[1][1], D = (S[0][3] - S[0][1] * E - S[0][2] * F) / S[0][0];
const cx = -D / 2, cy = -E / 2, R = Math.sqrt(cx * cx + cy * cy - F);
console.log("centre", cx.toFixed(1), cy.toFixed(1), "radius", R.toFixed(1));
console.log("worst miss", Math.max(...pts.map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - R))).toFixed(1), "px; limb at x=0:", (cy - Math.sqrt(R * R - cx * cx)).toFixed(1), " at x=-600:", (cy - Math.sqrt(R * R - (-600 - cx) ** 2)).toFixed(1));
