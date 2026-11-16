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
 *   - the truck drives the coast road. Lines along a straight road meet at one
 *     vanishing point, so driving along it is a scaling about that point; and
 *     at a steady speed it is 1/scale, not scale, that changes evenly with time.
 *     That is all the "physics" there is, and it is why it looks right;
 *   - the aircraft comes in the same way, from far off over the earth, growing
 *     as it nears, and leaves past the top right;
 *   - the sea and the ship's wake shimmer, the cloud billows, the city lights
 *     twinkle, the aircraft's strobes blink.
 *
 * One WebGL canvas (no library) covers the whole hero, so the aircraft can fly
 * anywhere on it. Around the picture it paints what the picture would show
 * there: the sky carried on above it, and on wide screens the soft-focus plate
 * to its left. All positions are in the picture's own pixels (1254 × 1254).
 *
 * The still picture is on screen first and stays underneath: the canvas starts
 * with the truck and the aircraft exactly where the picture has them, so the
 * hand-over cannot be seen. A phone that asks for less motion, or a browser
 * without WebGL, simply keeps the still picture.
 */
export const ART = "/brand/hero-art.webp";
export const PLATE = "/brand/hero-plate.webp";
export const ART_SIZE = 1254;
export const PLATE_WIDTH = 1500;

// Measured on the picture by scripts/hero-art (lib.mjs); keep the two in step.
const PLANE_BOX = [766, 66, 488, 224];
const TRUCK_BOX = [856, 920, 298, 226];
const ROAD_VP = [1620, 868];
/** Where the aircraft comes from: a point low over the earth, on the line it flies. */
const PLANE_VP = [250, 387];

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
uniform sampler2D uArt, uPlane, uTruck, uMask, uPlate;
uniform vec2 uRes;    // the canvas, in its own pixels
uniform vec4 uStage;  // where the picture sits on it: left, top, width, height
uniform float uT;
const float N = ${ART_SIZE}.0;
const vec4 PLANE = vec4(${PLANE_BOX.map((v) => v.toFixed(1)).join(", ")});
const vec4 TRUCK = vec4(${TRUCK_BOX.map((v) => v.toFixed(1)).join(", ")});
const vec2 ROAD_VP = vec2(${ROAD_VP.map((v) => v.toFixed(1)).join(", ")});
const vec2 PLANE_VP = vec2(${PLANE_VP.map((v) => v.toFixed(1)).join(", ")});

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

void main(){
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 q = (frag - uStage.xy) / uStage.zw * N; // this pixel, in the picture's pixels
  bool inside = q.x >= 0.0 && q.x <= N && q.y >= 0.0 && q.y <= N;
  vec3 col;
  float fog = 0.0;

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
    fog = m.b * smoothstep(0.26, 0.5, lum(col)) * (1.0 - smoothstep(0.3, 0.55, sat(col)));

    // ---- the truck, driving the road towards us ----
    float ph = fract(uT / 16.0 + 0.5166);
    float inv = mix(1.70, 0.345, ph); // 1/scale: even in time = a steady speed on the road
    vec2 h = ROAD_VP + (q - ROAD_VP) * inv; // where this pixel is on the truck as the picture has it
    vec2 tb = (h - TRUCK.xy) / TRUCK.zw;
    if (in01(tb)) {
      float a = panel(uTruck, tb, 1.0).r * (1.0 - fog);
      col = mix(col, art(h), a);
      // its headlights on the wet road ahead of it
      float pool = glow((h - vec2(884.0, 1092.0)) / vec2(2.4, 1.0), 12.0) + glow((h - vec2(934.0, 1097.0)) / vec2(2.4, 1.0), 12.0);
      col += vec3(1.0, 0.74, 0.42) * pool * 0.34 * (1.0 - a) * (1.0 - fog);
    }
  } else if (q.x < 0.0) {
    // left of the picture: the same scene carried on, out of focus
    col = texture2D(uPlate, vec2(clamp((q.x + ${PLATE_WIDTH}.0) / ${PLATE_WIDTH}.0, 0.002, 0.999), clamp(q.y / N, 0.002, 0.998))).rgb;
  } else {
    col = art(clamp(q, vec2(1.0), vec2(N - 1.0)));
  }
  // above the picture the sky goes on, a little deeper the higher it gets
  if (q.y < 0.0) col *= mix(1.0, 0.8, clamp(-q.y / 700.0, 0.0, 1.0));

  // ---- the aircraft, coming in from far off and passing overhead ----
  float pp = fract(uT / 24.0 + 0.7245);
  float sp = 0.10 * pow(24.0, pp);
  vec2 hp = PLANE_VP + (q - PLANE_VP) / sp - vec2(sin(uT * 0.9) * 1.5, sin(uT * 1.3 + 1.0) * 2.5);
  vec2 pb = (hp - PLANE.xy) / PLANE.zw;
  if (in01(pb)) {
    float appear = smoothstep(0.0, 0.08, pp);
    col = mix(col, art(hp), panel(uPlane, pb, 1.0).r * appear);
    float strobe = step(0.86, fract(uT / 1.4)) + step(0.93, fract(uT / 1.4 + 0.07));
    col += vec3(1.0) * (glow(hp - vec2(796.0, 177.7), 4.5) + glow(hp - vec2(1202.7, 206.0), 4.5)) * strobe * appear;
    col += vec3(1.0, 0.2, 0.16) * glow(hp - vec2(1043.3, 218.3), 4.0) * (0.5 + 0.5 * sin(uT * 4.5)) * appear;
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
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "low-power" });
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

    // Never more canvas pixels than the picture has to give: sharper would cost battery and show nothing.
    const fit = () => {
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw || !ch) return false;
      const s = stage.getBoundingClientRect(), c = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2, (ART_SIZE / Math.max(1, s.width)) * 1.15, Math.sqrt(2_600_000 / (cw * ch)));
      const w = Math.max(1, Math.round(cw * scale)), h = Math.max(1, Math.round(ch * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uRes, w, h);
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
    Promise.all([ready, load("/brand/hero-plane.webp"), load("/brand/hero-truck.webp"), load(PLATE)])
      .then(([, plane, truck, plate]) => {
        if (!alive) return;
        texture(0, "uArt", picture);
        texture(1, "uPlane", plane);
        texture(2, "uTruck", truck);
        texture(3, "uMask", paintMasks());
        texture(4, "uPlate", plate);
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
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [canvasRef, stageRef, pictureRef, onLive]);
}
