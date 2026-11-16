"use client";

import { useEffect, type RefObject } from "react";

/**
 * The homepage scene: the owner's own key art, alive (owner, 16 Nov 2026: "I
 * want the truck moving, I want the plane moving, I want that scene realistic").
 *
 * Nothing here is drawn by hand or modelled in 3D. `scripts/hero-art` cuts the
 * real aircraft and the real truck out of the picture and repaints the sky and
 * the road behind them; this file moves the cut-outs over the repaired picture:
 *
 *   - two trucks drive the coast road. The road's centre line and lane width
 *     were measured on the picture, and a truck keeps its place in the lane
 *     and takes its size from the lane's width, so it follows the bend and
 *     grows as it nears; at a steady speed it is 1/size, not size, that
 *     changes evenly with time. That is all the "physics" there is, and it is
 *     why it looks right;
 *   - two aircraft cross the sky from the China side to the Tanzania side,
 *     the way the cargo flies: the picture's own, and a second further off;
 *   - the sea and the ship's wake shimmer, the cloud billows, the city lights
 *     twinkle, the aircraft's strobes blink.
 *
 * One WebGL canvas (no library) covers the whole hero, so the aircraft can fly
 * anywhere on it. On a wide screen the whole picture stands at the right and
 * the canvas carries the scene on to the left of it — sky, the earth's horizon
 * on its own curve, the night ocean, the cloud deck — sharp, never blurred.
 * Along the foot of the scene it lays the picture's own low cloud, which
 * dissolves into the colour of the page below (day or night), so the picture
 * never ends on a hard edge. All positions are in the
 * picture's own pixels (1254 × 1254).
 *
 * The still picture is on screen first and stays underneath: the canvas starts
 * with the truck and the aircraft exactly where the picture has them, so the
 * hand-over cannot be seen. A phone that asks for less motion, or a browser
 * without WebGL, simply keeps the still picture.
 */
export const ART = "/brand/hero-art.webp";
export const ART_SIZE = 1254;

// Measured on the picture by scripts/hero-art (lib.mjs); keep the two in step.
const PLANE_BOX = [766, 66, 488, 224];
const TRUCK_BOX = [856, 920, 298, 226];

/** The route's main line, China → Dar, traced from the picture pixel by pixel. */
const ROUTE_POINTS: [number, number][] = [[843,457],[832,457],[814,456],[796,458],[778,460],[760,462],[743,466],[725,470],[707,474],[690,478],[672,483],[655,488],[638,494],[621,500],[604,506],[588,514],[571,521],[555,528],[539,537],[523,545],[507,554],[492,563],[477,573],[462,583],[447,593],[432,604],[419,616],[405,628],[392,640],[379,652],[366,665],[355,679],[343,693],[333,708],[324,723],[315,739],[308,756],[304,767],[302,772]];
export const ROUTE = ROUTE_POINTS.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");
export const ROUTE_ENDS = { china: ROUTE_POINTS[0], dar: ROUTE_POINTS[ROUTE_POINTS.length - 1] };

// Regions, as outlines on the picture: open water (less the ship), the cloud that
// billows, and the low cloud that lies over the road in the bottom-left corner.
const WATER = [[330,600],[470,555],[570,560],[625,605],[700,640],[780,635],[830,675],[900,710],[960,722],[1000,745],[960,772],[900,792],[862,830],[845,880],[800,940],[760,990],[720,1020],[640,1045],[520,1060],[400,1040],[320,1000],[272,960],[290,900],[318,820],[332,750],[312,700]];
const SHIP = [[446,760],[480,735],[560,700],[600,680],[700,655],[722,628],[748,638],[762,660],[778,672],[778,706],[742,736],[640,782],[520,832],[478,840],[458,822]];
const BILLOW = [
  [[70,720],[120,760],[150,900],[205,962],[330,1012],[420,1062],[480,1130],[560,1150],[660,1172],[770,1254],[70,1254]],
  [[1000,262],[1254,262],[1254,600],[1100,600],[1040,520],[1000,420],[900,332],[780,304],[780,280],[900,262]],
];
const LOW_CLOUD = [[0,880],[150,900],[205,962],[330,1012],[420,1062],[440,1156],[520,1154],[607,1190],[700,1213],[800,1216],[907,1233],[907,1254],[0,1254]];

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform sampler2D uArt, uPlane, uTruck, uMask;
uniform vec2 uRes;    // the canvas, in its own pixels
uniform vec4 uStage;  // where the picture sits on it: left, top, width, height
uniform vec3 uPage;   // the colour of the page under the hero, which the scene's foot dissolves into
uniform float uBank;  // how high the low cloud at the foot stands, in canvas pixels
uniform float uT;
const float N = ${ART_SIZE}.0;
const vec4 PLANE = vec4(${PLANE_BOX.map((v) => v.toFixed(1)).join(", ")});
const vec4 TRUCK = vec4(${TRUCK_BOX.map((v) => v.toFixed(1)).join(", ")});

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
float sat(vec3 c){ float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); return (mx - mn) / (mx + 0.0001); }
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
bool in01(vec2 v){ return v.x > 0.0 && v.x < 1.0 && v.y > 0.0 && v.y < 1.0; }

vec3 art(vec2 q){ return texture2D(uArt, q / N).rgb; }
// Each cut-out file is three panels side by side: the scene without the thing | its outline | where to repaint.
vec3 panel(sampler2D t, vec2 b, float n){ return texture2D(t, vec2((n + clamp(b.x, 0.004, 0.996)) / 3.0, b.y)).rgb; }
// The picture with the aircraft and the truck taken out.
vec3 scene(vec2 q){
  vec3 c = art(q);
  vec2 b = (q - PLANE.xy) / PLANE.zw;
  if (in01(b)) c = mix(c, panel(uPlane, b, 0.0), panel(uPlane, b, 2.0).r);
  b = (q - TRUCK.xy) / TRUCK.zw;
  if (in01(b)) c = mix(c, panel(uTruck, b, 0.0), panel(uTruck, b, 2.0).r);
  return c;
}
float glow(vec2 d, float r){ return exp(-dot(d, d) / (r * r)); }

// ---- The coast road, measured on the picture (scripts/hero-art/measure-road.mjs): its double-yellow
// centre line as a curve in x, and how wide the far lane is at each x. A truck keeps its place in that
// lane and takes its size from the lane's width, so it follows the road's bend and grows as a real one would.
const float LANE = 72.6; // the far lane's width where the picture has the truck (x = 1000)
float roadCentre(float x){ float u = x - 1000.0; return 1079.09 - 0.364946 * u - 0.0000921758 * u * u; }
float laneAt(float w){ float b = -0.108517, c = -0.0000708528; return 1000.0 + (-b - sqrt(max(b * b - 4.0 * c * (LANE - w), 0.0))) / (2.0 * c); }

// One truck, \`ph\` of the way along its run (0 far off at the bend, 1 gone into the low cloud).
// At a steady speed on the road it is 1/size, not size, that changes evenly with time.
void truck(inout vec3 col, vec2 q, float ph, float fog){
  float s = 1.0 / mix(1.85, 0.667, ph);
  float x = laneAt(s * LANE);
  vec2 here = vec2(x, roadCentre(x) - 0.2 * s * LANE);
  vec2 h = vec2(1000.0, 1064.57) + (q - here) / s; // this pixel, on the truck as the picture has it
  vec2 b = (h - TRUCK.xy) / TRUCK.zw;
  if (!in01(b)) return;
  float seen = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(1.36, 1.5, s)) * (1.0 - fog);
  float a = panel(uTruck, b, 1.0).r * seen;
  col = mix(col, art(h), a);
  // its headlights on the wet road ahead of it
  float pool = glow((h - vec2(884.0, 1092.0)) / vec2(2.4, 1.0), 12.0) + glow((h - vec2(934.0, 1097.0)) / vec2(2.4, 1.0), 12.0);
  col += vec3(1.0, 0.74, 0.42) * pool * 0.34 * (1.0 - a) * seen;
}

// One aircraft crossing the sky from the China side to the Tanzania side — right to left, the way the
// cargo flies — \`u\` of the way across. \`size\` 1 is as the picture has it; a smaller one, flying
// higher by \`lift\`, reads as another aircraft further off. \`span\` is how far it has to go.
void plane(inout vec3 col, vec2 q, float u, float size, float lift, float seed, float span){
  float x = N + 300.0 - u * span;
  vec2 here = vec2(x, 170.0 - lift + (1010.0 - x) * 0.03 + sin(uT * 0.7 + seed) * 3.0);
  vec2 hp = vec2(1010.0, 170.0) + (q - here) / size; // this pixel, on the aircraft as the picture has it
  vec2 b = (hp - PLANE.xy) / PLANE.zw;
  if (!in01(b)) return;
  col = mix(col, art(hp), panel(uPlane, b, 1.0).r);
  float strobe = step(0.86, fract(uT / 1.4 + seed)) + step(0.93, fract(uT / 1.4 + 0.07 + seed));
  col += vec3(1.0) * (glow(hp - vec2(1223.0, 177.7), 4.5) + glow(hp - vec2(816.3, 206.0), 4.5)) * strobe;
  col += vec3(1.0, 0.2, 0.16) * glow(hp - vec2(975.7, 218.3), 4.0) * (0.5 + 0.5 * sin(uT * 4.5 + seed));
}

// The picture's own low cloud (its bottom-left corner), as a texture that can be laid anywhere: tiled with
// every other tile mirrored, so it never shows a seam. rgb is the cloud, a is how much cloud there is — the
// sea and the dark between the billows come out clear, so the bank keeps the real cloud's ragged top.
const vec2 CLOUD = vec2(372.0, 182.0); // the patch of cloud that is tiled: it starts below Africa's southern tip
vec4 cloud(vec2 p){
  float x = mod(p.x, 2.0 * CLOUD.x); if (x > CLOUD.x) x = 2.0 * CLOUD.x - x;
  vec3 c = art(vec2(4.0 + x, 968.0 + clamp(p.y, 0.0, CLOUD.y)));
  return vec4(c, smoothstep(0.2, 0.42, lum(c)) * (1.0 - smoothstep(0.4, 0.62, sat(c))));
}

// ---- Left of the picture, on a wide screen, the scene carries on: the same sky, the earth's horizon
// following its curve (the limb is an arc of a circle — scripts/hero-art/measure-limb.mjs), and under it
// the night side of the earth, ocean, where the picture's lights die away. Nothing is blurred: by the
// edge it is the picture itself, turned about the globe's centre; further out the sky and the horizon
// are still the picture's, and the ocean is its own blue.
const vec2 GLOBE = vec2(430.0, 3560.0);
const float GLOBE_R = 3268.0;
vec3 leftOf(vec2 q){
  float d = -q.x; // how far left of the picture, in its pixels
  vec2 v = q - GLOBE; float r = length(v);
  float edge = asin(clamp(-GLOBE.x / r, -1.0, 1.0)), here = atan(v.x, -v.y);
  float lim = 300.0 / r;                                   // the picture is followed back this far, then held
  float a2 = edge + lim * (1.0 - exp(-(edge - here) / lim));
  vec3 c = scene(clamp(GLOBE + r * vec2(sin(a2), -cos(a2)), vec2(1.0), vec2(N - 1.0)));
  float under = smoothstep(GLOBE_R - 16.0, GLOBE_R - 72.0, r); // below the haze along the limb
  vec3 ocean = mix(vec3(0.03, 0.17, 0.34), vec3(0.0, 0.075, 0.2), smoothstep(GLOBE_R - 50.0, GLOBE_R - 560.0, r));
  ocean *= 0.94 + 0.12 * fbm(q * 0.012);                   // never a flat field
  c = mix(c, ocean, under * smoothstep(20.0, 330.0, d));
  vec4 deck = cloud(vec2(q.x - 4.0, q.y - 968.0));         // the low cloud deck carries on too, its top as ragged as cloud is
  float top = 985.0 + 70.0 * fbm(vec2(q.x * 0.007, 2.0)) - 34.0 * deck.a;
  c = mix(c, deck.rgb, deck.a * smoothstep(top, top + 46.0, q.y) * (1.0 - smoothstep(1125.0, 1150.0, q.y)));
  return c * mix(1.0, 0.82, smoothstep(300.0, 1300.0, d)); // and the far corner of the frame falls off a little
}

void main(){
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 q = (frag - uStage.xy) / uStage.zw * N; // this pixel, in the picture's pixels
  bool inside = q.x >= 0.0 && q.x <= N && q.y >= 0.0 && q.y <= N;
  vec3 col;

  if (inside) {
    vec2 uv = q / N;
    vec3 m = texture2D(uMask, uv).rgb;
    vec3 base = scene(q);

    // the sea: small crossing ripples; the cloud: a slow billow
    vec2 wo = vec2(sin(uv.y * 150.0 + uT * 1.7) + 0.6 * sin(uv.x * 95.0 - uT * 1.2 + uv.y * 40.0),
                   cos(uv.x * 115.0 + uT * 1.4) + 0.5 * sin(uv.y * 72.0 - uT * 0.9)) * 0.0014 * m.r;
    vec2 co = (vec2(fbm(uv * 5.0 + vec2(uT * 0.035, uT * 0.012)), fbm(uv * 5.0 + vec2(4.7, 1.3) + vec2(-uT * 0.02, uT * 0.03))) - 0.5) * 0.02 * m.g;
    vec3 moved = scene(q + (wo + co) * N);
    float watery = clamp(smoothstep(1.06, 1.3, base.b / (base.g + 0.02)) + smoothstep(0.55, 0.75, min(base.r, min(base.g, base.b))), 0.0, 1.0) * m.r;
    float mx = max(base.r, max(base.g, base.b));
    float cloudy = (1.0 - smoothstep(0.24, 0.4, sat(base))) * smoothstep(0.16, 0.3, mx) * m.g;
    col = mix(base, moved, max(watery, cloudy));
    col += pow(max(0.0, sin(uv.x * 540.0 + uT * 2.1) * sin(uv.y * 390.0 - uT * 1.6 + uv.x * 90.0)), 26.0) * 0.32 * watery; // glints

    // city lights twinkle, on the earth only
    float earth = smoothstep(270.0, 300.0, q.y) * (1.0 - smoothstep(740.0, 770.0, q.y)) * smoothstep(0.0, 50.0, q.x);
    float gold = smoothstep(0.55, 0.85, base.r) * smoothstep(0.35, 0.6, base.g) * (1.0 - smoothstep(0.35, 0.6, base.b)) * earth;
    float cell = hash(floor(uv * 260.0));
    col *= mix(1.0, 0.72 + 0.6 * pow(0.5 + 0.5 * sin(uT * (1.4 + cell * 3.0) + cell * 40.0), 3.0), gold);

    // low cloud lies over the road in the corner: what drives into it is hidden by it
    float fog = m.b * smoothstep(0.26, 0.5, lum(col)) * (1.0 - smoothstep(0.3, 0.55, sat(col)));

    // ---- two trucks on the road, half a run apart; the further one first ----
    float run = uT / 12.0 + 0.7185; // at the start one stands exactly where the picture has it
    truck(col, q, fract(run + 0.5), fog);
    truck(col, q, fract(run), fog);
  } else if (q.x < 0.0) {
    col = leftOf(vec2(q.x, clamp(q.y, 1.0, N - 1.0)));
  } else {
    // above the picture its top row carries on as sky; right of it (only in a window squarer than
    // the picture) the scene is turned back on itself and sinks into the night
    col = mix(scene(clamp(vec2(min(q.x, 2.0 * N - q.x), q.y), vec2(1.0), vec2(N - 1.0))), vec3(0.0, 0.07, 0.2), smoothstep(8.0, 170.0, q.x - N));
  }
  // above the picture the sky goes on, a little deeper the higher it gets
  if (q.y < 0.0) col *= mix(1.0, 0.8, clamp(-q.y / 700.0, 0.0, 1.0));

  // ---- two aircraft, China to Tanzania: the picture's own, and a second further off, half a crossing behind ----
  float span = N + 600.0 + max(uStage.x, 0.0) * N / uStage.z; // right across the picture and whatever scene lies left of it
  float fly = uT * 58.0 / span + (N + 300.0 - 1010.0) / span; // at the start one is exactly where the picture has it
  plane(col, q, fract(fly + 0.5), 0.58, 72.0, 2.0, span);
  plane(col, q, fract(fly), 1.0, 0.0, 0.0, span);

  // ---- low cloud along the foot of the scene, which the scene dissolves into; under it is the page ----
  float k = N / uStage.z;                 // canvas pixels to picture pixels
  float by = (uRes.y - frag.y) * k;       // height above the hero's foot
  float hb = uBank * k;                   // the bank's height
  if (by < hb * 1.05) {
    float cx = (frag.x - uStage.x) * k;
    float night = 1.0 - smoothstep(0.25, 0.6, lum(uPage)); // 1 over a dark page, 0 over a light one
    vec4 far = cloud(vec2(cx * 0.8 + uT * 2.2, CLOUD.y - (by - 0.28 * hb) * (CLOUD.y / (0.72 * hb))));  // the far bank, standing higher
    vec4 near = cloud(vec2(cx * 0.62 - uT * 3.4 + 170.0, CLOUD.y - by * (CLOUD.y / (0.6 * hb))));      // the near one: bigger, lower
    float floorIn = smoothstep(0.5 * hb, 0.12 * hb, by);                                          // lower down no clear air is left
    far.rgb = mix(far.rgb, uPage, 0.3 * night);
    near.rgb = mix(near.rgb * mix(1.22, 0.9, night), uPage, 0.25 * night);
    // each bank's top is as ragged as cloud is: it stands higher here, lower there, and thins out upward
    float farTop = hb * (0.66 + 0.34 * fbm(vec2(cx * 0.006 + uT * 0.008, 5.0)));
    float nearTop = hb * (0.4 + 0.24 * fbm(vec2(cx * 0.009 - uT * 0.012, 9.0)));
    float farIn = smoothstep(farTop, farTop * 0.62, by - (far.a - 0.5) * 0.16 * hb);
    float nearIn = smoothstep(nearTop, nearTop * 0.6, by - (near.a - 0.5) * 0.14 * hb);
    col = mix(col, far.rgb, clamp(far.a + floorIn * 0.6, 0.0, 1.0) * farIn * 0.9);
    col = mix(col, min(near.rgb, vec3(1.0)), clamp(near.a + floorIn, 0.0, 1.0) * nearIn);
    col = mix(col, uPage, smoothstep(0.42 * hb, 0.04 * hb, by));
  }

  gl_FragColor = vec4(col, 1.0);
}`;

/** The three regions as one small texture. Painted small and scaled up, which softens their edges on every browser. */
function paintMasks(): HTMLCanvasElement {
  const LOW = 72, S = 256, k = LOW / ART_SIZE;
  const layer = (draw: (g: CanvasRenderingContext2D) => void) => {
    const low = document.createElement("canvas"); low.width = low.height = LOW;
    const g = low.getContext("2d")!;
    g.fillStyle = "#000"; g.fillRect(0, 0, LOW, LOW);
    draw(g);
    const big = document.createElement("canvas"); big.width = big.height = S;
    const b = big.getContext("2d")!;
    b.imageSmoothingEnabled = true; b.imageSmoothingQuality = "high";
    b.drawImage(low, 0, 0, S, S);
    return b.getImageData(0, 0, S, S).data;
  };
  const fill = (g: CanvasRenderingContext2D, pts: number[][], colour: string) => {
    g.fillStyle = colour; g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)));
    g.closePath(); g.fill();
  };
  const water = layer((g) => { fill(g, WATER, "#fff"); fill(g, SHIP, "#000"); });
  const billow = layer((g) => BILLOW.forEach((c) => fill(g, c, "#fff")));
  const low = layer((g) => fill(g, LOW_CLOUD, "#fff"));
  const out = document.createElement("canvas"); out.width = out.height = S;
  const og = out.getContext("2d")!;
  const img = og.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = water[i]; img.data[i + 1] = billow[i]; img.data[i + 2] = low[i]; img.data[i + 3] = 255; }
  og.putImageData(img, 0, 0);
  return out;
}

const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

/**
 * Runs the scene on `canvas`, which covers the hero; `stage` is the box the
 * picture occupies (the layout is CSS's business — this only asks where it is)
 * and `picture` the still image in it. Calls `onLive` once the first frame is up.
 */
export function useHeroScene(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  stageRef: RefObject<HTMLElement | null>,
  pictureRef: RefObject<HTMLImageElement | null>,
  onLive: () => void,
) {
  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current, picture = pictureRef.current;
    if (!canvas || !stage || !picture) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // alpha on: the part of the canvas that is off screen is not drawn (see `fit`), and must show the still picture through, never black
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true, powerPreference: "low-power" });
    if (!gl) return;

    let raf = 0, alive = true, visible = true, first = true, last = 0;
    const started = performance.now();

    const compile = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const texture = (unit: number, name: string, source: TexImageSource) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    };
    const uT = gl.getUniformLocation(prog, "uT"), uRes = gl.getUniformLocation(prog, "uRes"), uStage = gl.getUniformLocation(prog, "uStage");

    // The scene's foot dissolves into the page, so it has to know the page's colour: the site has a
    // day/night switch, and the colour changes with it.
    const uPage = gl.getUniformLocation(prog, "uPage"), uBank = gl.getUniformLocation(prog, "uBank");
    const readPage = () => {
      const m = getComputedStyle(stage.closest(".site") ?? document.body).backgroundColor.match(/[\d.]+/g);
      if (m && m.length >= 3) gl.uniform3f(uPage, +m[0] / 255, +m[1] / 255, +m[2] / 255);
    };
    readPage();
    const themeWatch = new MutationObserver(readPage);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });

    // On a computer the hero is taller than the screen. Only the band of it that is on screen (and a margin
    // for scrolling) is drawn each frame, and the pixel budget is spent on that band, so a big screen gets a
    // sharp picture without shading two screens' worth of pixels nobody can see.
    const MARGIN = 300;
    gl.enable(gl.SCISSOR_TEST);
    const fit = () => {
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw || !ch) return false;
      const s = stage.getBoundingClientRect(), c = canvas.getBoundingClientRect();
      const top = Math.max(0, -c.top - MARGIN), bottom = Math.min(ch, window.innerHeight - c.top + MARGIN);
      if (bottom <= top) return false;
      const band = Math.min(ch, window.innerHeight + 2 * MARGIN);
      const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3_000_000 / (cw * band)));
      const w = Math.max(1, Math.round(cw * scale)), h = Math.max(1, Math.round(ch * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.scissor(0, Math.floor((ch - bottom) * (h / ch)), w, Math.ceil((bottom - top) * (h / ch)));
      gl.uniform2f(uRes, w, h);
      // the cloud at the foot: a fifth of the picture's width, but never more of the screen than a sixth
      gl.uniform1f(uBank, Math.max(70, Math.min(0.2 * s.width, 0.17 * ch)) * (h / ch));
      gl.uniform4f(uStage, (s.left - c.left) * (w / cw), (s.top - c.top) * (h / ch), s.width * (w / cw), s.height * (h / ch));
      return true;
    };
    const frame = (now: number) => {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 21) return; // about 45 frames a second is plenty for this
      last = now;
      if (!fit()) return;
      gl.uniform1f(uT, (now - started) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (first) { first = false; onLive(); }
    };
    const kick = () => { if (!raf && alive && visible && !document.hidden) raf = requestAnimationFrame(frame); };

    const ready = picture.complete && picture.naturalWidth ? Promise.resolve() : new Promise<void>((r) => picture.addEventListener("load", () => r(), { once: true }));
    Promise.all([ready, load("/brand/hero-plane.webp"), load("/brand/hero-truck.webp")])
      .then(([, plane, truck]) => {
        if (!alive) return;
        texture(0, "uArt", picture);
        texture(1, "uPlane", plane);
        texture(2, "uTruck", truck);
        texture(3, "uMask", paintMasks());
        kick();
      })
      .catch(() => { /* a piece failed to load: the still picture stays */ });

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); });
    io.observe(canvas);
    const onVis = () => kick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      themeWatch.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [canvasRef, stageRef, pictureRef, onLive]);
}
