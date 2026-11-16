"use client";

import { useEffect, useRef } from "react";

/**
 * The living sky behind the public site: the view from the flight deck, above
 * the cloud. A sea of cloud runs out to the horizon and comes slowly toward
 * the reader, faster as the page is scrolled, so going down the page is flying
 * forward. By night there is a moon over it; by day, soft sun. It leans a
 * little with the mouse.
 *
 * Drawn by one small fragment shader rather than played from a film: it
 * follows the day/night switch, never loops, and weighs nothing to download.
 * It is painted at about half size and stretched, which is what keeps it cheap
 * on a phone and is also why the cloud is soft: the softness is the look.
 * Nothing above it depends on it. Without WebGL the sky is the plain gradient
 * under this canvas; for someone who asked for less motion it is one still
 * frame.
 */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uT;     // seconds
uniform float uFly;   // how far the camera has flown: time, plus the page's scroll
uniform float uNight; // 0 day, 1 night
uniform vec2 uLook;   // the pointer, -1..1, eased

float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.02 + vec2(17.1, 9.2); a *= 0.5; } return s / 0.875; }
float fbm5(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(11.7, 5.3); a *= 0.5; } return s / 0.96875; }

// The height of the cloud top at a point on the deck. A second field pushes the first about, so the
// cloud billows and curls instead of lying in even lumps.
float deck(vec2 P){
  vec2 w = vec2(fbm3(P * 0.45 + 3.1), fbm3(P * 0.45 - 7.7)) - 0.5;
  return fbm5(P + 1.5 * w);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  float hz = 0.57 + uLook.y * 0.012; // the horizon, measured up from the foot of the screen

  // the open sky above the horizon
  vec3 top = mix(vec3(0.36, 0.60, 0.93), vec3(0.010, 0.022, 0.075), uNight);
  vec3 low = mix(vec3(0.83, 0.91, 0.985), vec3(0.075, 0.125, 0.27), uNight);
  float sy = clamp((uv.y - hz) / (1.0 - hz), 0.0, 1.0);
  vec3 col = mix(low, top, pow(sy, 0.72));

  // sun by day (its light only), moon by night (a small disc and a halo)
  vec2 lamp = vec2(0.84, hz + 0.30);
  float ld = length((uv - lamp) * vec2(asp, 1.0));
  vec3 glow = mix(vec3(1.0, 0.95, 0.82), vec3(0.50, 0.62, 0.95), uNight);
  col += glow * mix(0.30, 0.22, uNight) * exp(-ld * 3.2);
  col += vec3(0.92, 0.95, 1.0) * uNight * (smoothstep(0.026, 0.021, ld) * 0.85 + 0.30 * exp(-ld * ld * 380.0));

  if (uv.y < hz) {
    float d = hz - uv.y;
    float z = 0.115 / (d + 0.012); // distance out along the deck: far at the horizon, near at the foot
    vec2 P = vec2((uv.x - 0.5) * asp * z + uLook.x * 0.03, z + uFly) * 7.0;
    // Cloud has height, and from the side a high top hides what lies behind it. One step of that: look
    // again a little nearer wherever the first look found a high top, which makes the tops stand up
    // and overlap instead of lying flat like a printed sheet.
    P.y -= (deck(P) - 0.45) * 1.1;
    float h = deck(P);
    float towardLight = deck(P + vec2(0.20, 0.26));
    // tops that face the light are bright, the far side of each is in its own shadow, and the hollows are darker
    float shade = clamp(0.5 + (h - towardLight) * 4.2, 0.0, 1.0);
    float cover = smoothstep(0.40, 0.56, h);
    vec3 lit = mix(vec3(1.0, 0.995, 0.985), vec3(0.56, 0.65, 0.86), uNight);
    vec3 dim = mix(vec3(0.72, 0.80, 0.93), vec3(0.085, 0.125, 0.25), uNight);
    vec3 under = mix(vec3(0.50, 0.70, 0.94), vec3(0.016, 0.036, 0.095), uNight); // what shows through the gaps
    vec3 body = mix(dim, lit, shade) * (0.80 + 0.20 * smoothstep(0.42, 0.74, h));
    vec3 c = mix(under, body, cover);
    // the moon's or the sun's road of light on the cloud under it
    c += glow * mix(0.10, 0.20, uNight) * cover * shade * exp(-abs(uv.x - lamp.x) * asp * 3.2) * smoothstep(0.0, 0.3, d);
    col = mix(low, c, smoothstep(0.0, 0.20, d)); // far cloud goes into the haze at the horizon
  }

  // a little darker at the corners, as a lens is
  vec2 v = uv - 0.5;
  col *= 1.0 - dot(v, v) * mix(0.10, 0.42, uNight);
  // one bit of noise so the soft gradients do not band
  col += (hash(gl_FragCoord.xy + uT) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export function SkyScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const U = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = U("uRes"), uT = U("uT"), uFly = U("uFly"), uNight = U("uNight"), uLook = U("uLook");

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // About half the screen's size in each direction, never more than about half a megapixel: the cloud is
    // soft by nature, so the stretch does not show, and a phone's GPU hardly notices it.
    const size = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const k = Math.min(0.62, Math.sqrt(520_000 / Math.max(1, w * h)));
      const cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        gl.viewport(0, 0, cw, ch);
      }
      gl.uniform2f(uRes, cw, ch);
    };

    const isNight = () => document.documentElement.classList.contains("dark");
    let night = isNight() ? 1 : 0, nightTo = night;
    let scroll = window.scrollY / Math.max(1, window.innerHeight), scrollTo = scroll;
    const look = [0, 0], lookTo = [0, 0];
    let raf = 0, last = 0, t = 0, shown = false;

    const draw = (dt: number) => {
      t += dt;
      // everything eases, so a jump of the scroll wheel or a flick of the theme is a glide, not a cut
      const ease = 1 - Math.exp(-dt * 3.2);
      night += (nightTo - night) * (still ? 1 : 1 - Math.exp(-dt * 2.2));
      scroll += (scrollTo - scroll) * (still ? 1 : ease);
      look[0] += (lookTo[0] - look[0]) * ease;
      look[1] += (lookTo[1] - look[1]) * ease;
      gl.uniform1f(uT, t);
      gl.uniform1f(uFly, t * 0.012 + scroll * 0.2);
      gl.uniform1f(uNight, night);
      gl.uniform2f(uLook, look[0], look[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!shown) {
        shown = true;
        canvas.classList.add("is-live");
      }
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 31) return; // about thirty frames a second is all slow cloud needs
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      draw(dt);
    };
    const once = () => {
      size();
      draw(0);
    };

    const onScroll = () => {
      scrollTo = window.scrollY / Math.max(1, window.innerHeight);
      if (still) once();
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      lookTo[0] = (event.clientX / window.innerWidth) * 2 - 1;
      lookTo[1] = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const onResize = () => {
      size();
      if (still) once();
    };
    const onVisible = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (!document.hidden && !still) raf = requestAnimationFrame(frame);
    };
    const themeWatch = new MutationObserver(() => {
      nightTo = isNight() ? 1 : 0;
      if (still) once();
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    size();
    if (still) once();
    else raf = requestAnimationFrame(frame);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    if (!still) window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      themeWatch.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <canvas ref={ref} className="sky-canvas" />;
}
