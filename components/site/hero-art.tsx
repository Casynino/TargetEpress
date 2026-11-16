"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The owner's own key art, brought to life (owner, 16 Nov 2026: "I want that
 * look, moving like a video — it doesn't have to be 3D"). The picture is the
 * picture; what moves is laid on it, in its own pixel grid (1254 × 1254), so
 * everything stays where the picture put it:
 *
 *   - a WebGL pass (no library) that makes the sea shimmer and the ship's wake
 *     run, the clouds billow, the city lights twinkle, and lets the aircraft
 *     float, its wingtip strobes and beacon blinking;
 *   - an SVG layer: light running along the route (baked Target red into the
 *     picture by scripts/hero-art) and both ends pulsing, headlight and tail-light streaks racing the
 *     coast road, and the Target logo on the side of the truck's container;
 *   - the whole slowly drifting closer (`ken-burns`).
 *
 * The picture shows at once and alone until the canvas has drawn its first
 * frame. Nothing moves for a phone that asks for less motion, or where WebGL is
 * missing; the canvas stops drawing whenever it is off screen or the tab is
 * hidden.
 */
const ART = "/brand/hero-art.webp";
const N = 1254;

// Traced on the picture, in its pixels.
// Traced from the picture's own golden line, pixel by pixel, so the red lies exactly on it.
const ROUTE = "M 843 457 C 834 457, 809 455, 790 457 C 771 459, 750 462, 730 467 C 710 472, 690 480, 670 486 C 650 492, 630 496, 610 503 C 590 510, 568 520, 550 529 C 532 538, 520 548, 505 557 C 490 566, 475 575, 460 586 C 445 597, 430 609, 415 622 C 400 635, 382 650, 370 662 C 358 674, 349 681, 340 692 C 331 703, 324 717, 318 730 C 312 743, 305 765, 302 772";
const ROAD = "M 1015 885 C 1090 860, 1190 880, 1235 945 C 1262 990, 1150 1012, 1000 1042 C 800 1082, 450 1142, 0 1245";
const WATER = [[330,600],[470,555],[570,560],[625,605],[700,640],[780,635],[830,675],[900,710],[960,722],[1000,745],[960,772],[900,792],[862,830],[845,880],[800,940],[760,990],[720,1020],[640,1045],[520,1060],[400,1040],[320,1000],[272,960],[290,900],[318,820],[332,750],[312,700]];
const SHIP = [[446,760],[480,735],[560,700],[600,680],[700,655],[722,628],[748,638],[762,660],[778,672],[778,706],[742,736],[640,782],[520,832],[478,840],[458,822]];
const CLOUDS = [
  [[0,690],[60,700],[120,760],[150,900],[205,962],[330,1012],[420,1062],[480,1130],[560,1150],[660,1172],[770,1254],[0,1254]],
  [[1000,252],[1254,252],[1254,600],[1100,600],[1040,520],[1000,420],[900,332],[760,300],[650,330],[650,262],[760,244],[900,252]],
];
// The side of the truck's container: top-left, top-right, bottom-left.
const PANEL = { tl: [985, 968], tr: [1112, 957], bl: [987, 1018] } as const;

const VERT = `attribute vec2 p; varying vec2 v; void main(){ v = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform sampler2D img; uniform sampler2D msk; uniform float t;
varying vec2 v;
const float PX = 1.0 / ${N}.0;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
float sat(vec3 c){ float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); return (mx - mn) / (mx + 0.0001); }
// The patch of sky the aircraft flies in, with soft edges: it floats whole, so the
// plane needs no cutting out — the smooth sky around it moves invisibly with it.
float planeZone(vec2 u){
  vec2 q = u / PX;
  float x = smoothstep(752.0, 790.0, q.x) * (1.0 - smoothstep(1222.0, 1250.0, q.x));
  float y = smoothstep(52.0, 84.0, q.y) * (1.0 - smoothstep(250.0, 286.0, q.y));
  return x * y;
}
float glow(vec2 u, vec2 at, float r){ vec2 d = (u - at * PX) / (r * PX); return exp(-dot(d, d)); }
void main(){
  vec2 uv = v;
  vec4 m = texture2D(msk, uv);
  vec3 base = texture2D(img, uv).rgb;

  // the sea: small crossing ripples, moving
  vec2 wo = vec2(sin(uv.y * 150.0 + t * 1.7) + 0.6 * sin(uv.x * 95.0 - t * 1.2 + uv.y * 40.0),
                 cos(uv.x * 115.0 + t * 1.4) + 0.5 * sin(uv.y * 72.0 - t * 0.9)) * 0.0014 * m.r;
  // the clouds: a slow billow
  vec2 co = (vec2(fbm(uv * 5.0 + vec2(t * 0.035, t * 0.012)), fbm(uv * 5.0 + vec2(4.7, 1.3) + vec2(-t * 0.02, t * 0.03))) - 0.5) * 0.02 * m.g;
  vec3 moved = texture2D(img, uv + wo + co).rgb;
  float watery = clamp(smoothstep(1.06, 1.3, base.b / (base.g + 0.02)) + smoothstep(0.55, 0.75, min(base.r, min(base.g, base.b))), 0.0, 1.0) * m.r;
  float mx = max(base.r, max(base.g, base.b));
  float cloudy = (1.0 - smoothstep(0.24, 0.4, sat(base))) * smoothstep(0.16, 0.3, mx) * m.g;
  vec3 col = mix(base, moved, max(watery, cloudy));

  // glints on the water
  col += pow(max(0.0, sin(uv.x * 540.0 + t * 2.1) * sin(uv.y * 390.0 - t * 1.6 + uv.x * 90.0)), 26.0) * 0.32 * watery;

  // city lights twinkle (on the globe only)
  float globe = smoothstep(270.0, 300.0, uv.y / PX) * (1.0 - smoothstep(740.0, 770.0, uv.y / PX));
  float gold = smoothstep(0.55, 0.85, base.r) * smoothstep(0.35, 0.6, base.g) * (1.0 - smoothstep(0.35, 0.6, base.b)) * globe * (1.0 - m.b);
  float cell = hash(floor(uv * 260.0));
  col *= mix(1.0, 0.72 + 0.6 * pow(0.5 + 0.5 * sin(t * (1.4 + cell * 3.0) + cell * 40.0), 3.0), gold);

  // the aircraft floats
  vec2 off = vec2(sin(t * 0.55) * 7.0, sin(t * 0.8 + 1.0) * 10.0) * PX;
  float pz = planeZone(uv);
  if (pz > 0.0) col = mix(col, texture2D(img, uv - off * pz).rgb, pz);
  float strobe = step(0.86, fract(t / 1.4)) + step(0.93, fract(t / 1.4 + 0.07));
  col += vec3(1.0) * (glow(uv - off, vec2(795.0, 178.0), 7.0) + glow(uv - off, vec2(1202.0, 205.0), 7.0)) * strobe;
  col += vec3(1.0, 0.18, 0.15) * glow(uv - off, vec2(1042.0, 220.0), 6.0) * (0.5 + 0.5 * sin(t * 4.5));

  gl_FragColor = vec4(col, 1.0);
}`;

function paintMask(): HTMLCanvasElement {
  const S = 512, k = S / N;
  const layer = (draw: (g: CanvasRenderingContext2D) => void, blur: number) => {
    const c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d")!;
    g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
    g.filter = `blur(${blur}px)`;
    draw(g);
    return g.getImageData(0, 0, S, S).data;
  };
  const poly = (g: CanvasRenderingContext2D, pts: number[][], fill: string) => {
    g.fillStyle = fill; g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)));
    g.closePath(); g.fill();
  };
  const r = layer((g) => { poly(g, WATER, "#fff"); poly(g, SHIP, "#000"); }, 6);
  const gch = layer((g) => CLOUDS.forEach((c) => poly(g, c, "#fff")), 10);
  const b = layer((g) => {
    g.save(); g.scale(k, k);
    g.strokeStyle = "#fff"; g.lineWidth = 46; g.lineCap = "round"; g.stroke(new Path2D(ROUTE));
    g.fillStyle = "#fff";
    g.beginPath(); g.arc(302, 772, 58, 0, Math.PI * 2); g.fill();
    g.restore();
  }, 4);
  const out = document.createElement("canvas"); out.width = out.height = S;
  const og = out.getContext("2d")!;
  const img = og.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = r[i]; img.data[i + 1] = gch[i]; img.data[i + 2] = b[i]; img.data[i + 3] = 255; }
  og.putImageData(img, 0, 0);
  return out;
}

function useLivingCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, imgRef: React.RefObject<HTMLImageElement | null>, onFirstFrame: () => void) {
  useEffect(() => {
    const canvas = canvasRef.current, picture = imgRef.current;
    if (!canvas || !picture) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) return;

    let raf = 0, visible = true, alive = true, first = true;
    const started = performance.now();

    const compile = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const texture = (unit: number, source: TexImageSource) => {
      const tx = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    };
    const uT = gl.getUniformLocation(prog, "t");

    const size = () => {
      const side = Math.min(N, Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
      if (side > 0 && canvas.width !== side) { canvas.width = canvas.height = side; gl.viewport(0, 0, side, side); }
    };
    const frame = () => {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      size();
      gl.uniform1f(uT, (performance.now() - started) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (first) { first = false; onFirstFrame(); }
      raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && alive && visible && !document.hidden) raf = requestAnimationFrame(frame); };

    const start = () => {
      if (!alive) return;
      texture(0, picture);
      texture(1, paintMask());
      gl.uniform1i(gl.getUniformLocation(prog, "img"), 0);
      gl.uniform1i(gl.getUniformLocation(prog, "msk"), 1);
      kick();
    };
    if (picture.complete && picture.naturalWidth) start();
    else picture.addEventListener("load", start, { once: true });

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); });
    io.observe(canvas);
    const onVis = () => kick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      picture.removeEventListener("load", start);
    };
  }, [canvasRef, imgRef, onFirstFrame]);
}

export function HeroArt({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [live, setLive] = useState(false);
  const [onFirst] = useState(() => () => setLive(true));
  useLivingCanvas(canvasRef, imgRef, onFirst);

  const [tlx, tly] = PANEL.tl, [trx, try_] = PANEL.tr, [blx, bly] = PANEL.bl;
  const W = 127, H = 50;
  const matrix = `matrix(${(trx - tlx) / W} ${(try_ - tly) / W} ${(blx - tlx) / H} ${(bly - tly) / H} ${tlx} ${tly})`;

  return (
    <div className={cn("relative aspect-square overflow-hidden", className)}>
      <div className="ken-burns absolute inset-0 [transform-origin:50%_55%]">
        {/* eslint-disable-next-line @next/next/no-img-element -- the canvas reads its pixels; it must be this exact file */}
        <img
          ref={imgRef}
          src={ART}
          alt="Ndege, meli na lori juu ya ramani: njia ya mzigo kutoka China hadi pwani ya Tanzania"
          width={N}
          height={N}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full"
        />
        <canvas ref={canvasRef} aria-hidden className={cn("absolute inset-0 h-full w-full transition-opacity duration-700", live ? "opacity-100" : "opacity-0")} />


        <svg aria-hidden viewBox={`0 0 ${N} ${N}`} className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            <filter id="art-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Light running the route, China to Dar. */}
          <g fill="none" filter="url(#art-glow)" className="motion-reduce:hidden">
            <path d={ROUTE} pathLength={100} stroke="white" strokeWidth="6" strokeLinecap="round" strokeDasharray="5 95">
              <animate attributeName="stroke-dashoffset" values="100;0" dur="3s" repeatCount="indefinite" />
            </path>
            <path d={ROUTE} pathLength={100} stroke="#ffd4cf" strokeWidth="4" strokeLinecap="round" strokeDasharray="3 97">
              <animate attributeName="stroke-dashoffset" values="100;0" dur="3s" begin="1.5s" repeatCount="indefinite" />
            </path>
          </g>
          {/* Both ends breathing out: gold in China, red at Dar. */}
          {[
            { x: 843, y: 457, c: "#ffd27a" },
            { x: 302, y: 772, c: "#ff3b47" },
          ].map((e) => (
            <circle key={e.x} cx={e.x} cy={e.y} r="10" fill="none" stroke={e.c} strokeWidth="4" className="motion-reduce:hidden">
              <animate attributeName="r" values="10;56" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.95;0" dur="2.4s" repeatCount="indefinite" />
            </circle>
          ))}

          {/* Headlights and tail lights racing the coast road. */}
          <g fill="none" filter="url(#art-glow)" className="motion-reduce:hidden">
            <path d={ROAD} pathLength={100} stroke="#ff4a3d" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="7 26">
              <animate attributeName="stroke-dashoffset" values="0;-33" dur="1.6s" repeatCount="indefinite" />
            </path>
            <path d={ROAD} pathLength={100} transform="translate(0 12)" stroke="#fff0cf" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="9 31">
              <animate attributeName="stroke-dashoffset" values="0;40" dur="1.3s" repeatCount="indefinite" />
            </path>
          </g>

          {/* The Target logo on the side of the truck's container. */}
          <g transform={matrix}>
            <rect width={W} height={H} rx="3" fill="#eef2f7" opacity="0.95" />
            <image href="/brand/target-express-logo.svg" x="8" y="5" width={W - 16} height={H - 10} preserveAspectRatio="xMidYMid meet" />
            <rect width={W} height={H} rx="3" fill="url(#panel-shade)" />
            <defs>
              <linearGradient id="panel-shade" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#000" stopOpacity="0" />
                <stop offset="1" stopColor="#0b1a33" stopOpacity="0.28" />
              </linearGradient>
            </defs>
          </g>
        </svg>
      </div>
    </div>
  );
}
