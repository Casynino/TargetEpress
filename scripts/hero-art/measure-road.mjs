// Working tool: finds the coast road's far rail and its double-yellow centre line, column by column,
// and fits curves to them. The truck drives between the two; the numbers go into lib.mjs.
import { loadSource, N } from "./lib.mjs";
const art = await loadSource();
const px = (x, y) => { const i = (Math.round(y) * N + Math.round(x)) * 3; return [art[i], art[i + 1], art[i + 2]]; };
const yellow = (x, y) => { let s = 0; for (let d = -2; d <= 2; d++) { const [r, g, b] = px(x + d, y); s += r + g - 2 * b; } return s / 5; };
// rough positions read off a close-up; the search looks ±R px round them
const rough = (pts) => (x) => { for (let i = 0; i < pts.length - 1; i++) if (x <= pts[i + 1][0] || i === pts.length - 2) { const [a, b] = [pts[i], pts[i + 1]]; return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]); } };
const centreRough = rough([[440, 1253], [607, 1200], [813, 1140], [947, 1097], [1107, 1037], [1173, 1010], [1235, 978]]);
const railRough = rough([[440, 1143], [640, 1100], [867, 1043], [1133, 978], [1173, 958], [1220, 925]]);
const find = (x, y0, R) => { let best = -1e9, by = y0; for (let y = y0 - R; y <= y0 + R; y += 0.5) { const v = yellow(x, y) - Math.abs(y - y0) * 0.6; if (v > best) { best = v; by = y; } } return [by, Math.round(best)]; };
const rows = [];
for (let x = 460; x <= 1240; x += 20) {
  const hidden = x > 872 && x < 1132; // behind the truck: the rail cannot be seen
  const [yc, sc] = find(x, centreRough(x), 9);
  const [yr, sr] = hidden ? [NaN, 0] : find(x, railRough(x), 9);
  rows.push({ x, yc, sc, yr, sr });
}
console.log(rows.map((r) => `${r.x}: centre ${r.yc} (${r.sc})  rail ${Number.isNaN(r.yr) ? "—" : r.yr + " (" + r.sr + ")"}`).join("\n"));
// least-squares quadratic y = a + b·x + c·x², x centred on 1000 to keep the numbers tame
const fit = (pts) => { let S = [0, 0, 0, 0, 0], T = [0, 0, 0]; for (const [x0, y] of pts) { const x = x0 - 1000; S[0]++; S[1] += x; S[2] += x * x; S[3] += x ** 3; S[4] += x ** 4; T[0] += y; T[1] += x * y; T[2] += x * x * y; }
  const M = [[S[0], S[1], S[2], T[0]], [S[1], S[2], S[3], T[1]], [S[2], S[3], S[4], T[2]]];
  for (let i = 0; i < 3; i++) { for (let j = i + 1; j < 3; j++) { const f = M[j][i] / M[i][i]; for (let k = i; k < 4; k++) M[j][k] -= f * M[i][k]; } }
  const c = M[2][3] / M[2][2], b = (M[1][3] - M[1][2] * c) / M[1][1], a = (M[0][3] - M[0][1] * b - M[0][2] * c) / M[0][0]; return [a, b, c]; };
const good = (r, k, s) => r[s] > 120 && r.x <= 1180;
const centre = fit(rows.filter((r) => good(r, "yc", "sc")).map((r) => [r.x, r.yc]));
const rail = fit(rows.filter((r) => !Number.isNaN(r.yr) && good(r, "yr", "sr")).map((r) => [r.x, r.yr]));
const at = (f, x) => f[0] + f[1] * (x - 1000) + f[2] * (x - 1000) ** 2;
console.log("centre y = a + b(x−1000) + c(x−1000)²:", centre.map((v) => +v.toPrecision(6)));
console.log("rail:", rail.map((v) => +v.toPrecision(6)));
for (const x of [500, 700, 866, 1000, 1140, 1180]) console.log(x, "centre", at(centre, x).toFixed(1), "rail", at(rail, x).toFixed(1), "width", (at(centre, x) - at(rail, x)).toFixed(1));
