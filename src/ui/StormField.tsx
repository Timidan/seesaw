import { useEffect, useRef } from "react";
import { onCue, onStrike, reducedMotion } from "./storm";
import { layout, scene } from "./scene";

// One dithered world: real storm footage behind a lit beam, fulcrum, weights and crowd.
// Flashes come from data (strike()), the footage's own bolt is cued to the number slam.
const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D tex;
uniform vec2 res, vid, ptr;
uniform float t, flash;
uniform vec3 dot_c, hot_c, ground_c, fg_c, crowd_c;
uniform float scene_on;
uniform vec2 pivot;      // fulcrum apex, canvas px (y up)
uniform float halfl, thick, tilt, drop, squash, charge, groundY;
uniform vec2 wsize;      // weight half-size
uniform vec2 crowdX;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2, v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(q0, q0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(q1, q1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(q2, q2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

// Objects that tilt: beam + weights. m = 1 beam/fulcrum, 2 short weight, 3 hedge weight.
float beamSpace(vec2 p, out float m, out vec2 wl) {
  vec2 q = rot(tilt) * (p - pivot) - vec2(0.0, thick * 0.5);
  float d = sdBox(q, vec2(halfl, thick * 0.5)) - 1.0; m = 1.0; wl = vec2(0.0);
  vec2 sw = q - vec2(-halfl * 0.8, thick * 0.5 + wsize.y);
  float ds = sdBox(sw, wsize) - 1.0;
  if (ds < d) { d = ds; m = 2.0; wl = sw; }
  vec2 hs = wsize * vec2(1.0 + 0.18 * squash, 1.0 - 0.22 * squash);
  vec2 hw = q - vec2(halfl * 0.8, thick * 0.5 + hs.y + (1.0 - drop) * res.y * 0.75);
  float dh = sdBox(hw, hs) - 1.0;
  if (dh < d) { d = dh; m = 3.0; wl = hw; }
  return d;
}
float objects(vec2 p, out float m, out vec2 wl) {
  float d = beamSpace(p, m, wl);
  float baseW = max(thick * 4.5, 10.0);
  float f = sdTri(p, pivot, vec2(pivot.x - baseW, groundY), vec2(pivot.x + baseW, groundY));
  if (f < d) { d = f; m = 1.0; }
  return d;
}
float crowd(vec2 p, out float row) {
  float d = 1e5; row = 0.0;
  if (p.x < crowdX.x || p.x > crowdX.y) return d;
  for (int r = 0; r < 3; r++) {
    float fr = float(r), s = 1.15 + 0.4 * fr;           // back row smaller
    float base = groundY + (2.0 - fr) * 9.0;            // back row higher
    float cw = 10.0 * s;
    float xi = (p.x + fr * 37.0) / cw, idx = floor(xi), fx = (fract(xi) - 0.5) * cw;
    float h = hash(idx + fr * 91.0);
    if (h < 0.18) continue;
    float hh = 0.8 + 0.4 * h, bob = sin(t * 1.6 + h * 6.283) * 0.5 * s;
    float body = sdBox(vec2(fx, p.y - (base + 5.0 * s * hh + bob)), vec2(3.0 * s, 5.0 * s * hh)) - 1.4 * s;
    float head = length(vec2(fx, p.y - (base + 10.0 * s * hh + 2.8 * s + bob))) - 2.2 * s;
    float dr = min(body, head);
    if (dr < d) { d = dr; row = fr; }
  }
  return d;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  float ca = res.x / res.y, va = vid.x / max(vid.y, 1.0);
  vec2 sc = ca > va ? vec2(1.0, va / ca) : vec2(ca / va, 1.0);
  vec2 q = (uv - 0.5) * sc * 0.94 + 0.5 + vec2(sin(t * 0.04) * 0.01, 0.0);
  q.y = 1.0 - q.y;
  float lum = dot(texture(tex, q).rgb, vec3(0.299, 0.587, 0.114));
  float sky = smoothstep(0.07, 0.55, pow(lum, 0.8));
  float lamp = exp(-3.2 * length((uv - ptr) * vec2(ca, 1.0))) * 0.16 * step(0.02, sky);
  // flash lights the clouds, plus a falloff from the top-right where the bolts come from; never a flat fill
  float source = smoothstep(0.35, 1.0, uv.y) * smoothstep(0.25, 1.0, uv.x);
  float level = clamp(sky * (0.85 + flash * 0.8) + flash * 0.16 * source + lamp, 0.0, 1.0);
  vec3 tint = mix(dot_c, hot_c, clamp(flash * 0.9, 0.0, 1.0) * (0.35 + sky * 0.65));

  if (scene_on > 0.5) {
    vec3 L = normalize(vec3(0.55, 0.8, 0.55));
    if (px.y < groundY) { level = 0.02 + 0.06 * smoothstep(groundY - 14.0, groundY, px.y) * (1.0 + flash); tint = crowd_c; }
    float row; float dc = crowd(px, row);
    if (dc < 0.0) {
      float rim = clamp(crowd(px + vec2(0.0, 0.7), row) - dc, 0.0, 1.0); // top-facing edge catches the lightning
      level = (0.2 + 0.07 * row) + rim * (0.35 + flash * 0.8) * (0.6 + 0.2 * row);
      tint = crowd_c;
    }
    float m; vec2 wl; float d = objects(px, m, wl);
    if (d < 0.0) {
      float bev = 3.0, h0 = clamp(-d / bev, 0.0, 1.0);
      float m2; vec2 w2;
      float hx = clamp(-objects(px + vec2(1.0, 0.0), m2, w2) / bev, 0.0, 1.0);
      float hy = clamp(-objects(px + vec2(0.0, 1.0), m2, w2) / bev, 0.0, 1.0);
      vec3 n = normalize(vec3(h0 - hx, h0 - hy, 0.45));
      float diff = max(dot(n, L), 0.0);
      level = 0.08 + 0.32 * diff + flash * 0.75 * diff + 0.1 * (1.0 - h0);
      tint = fg_c;
      if (m == 2.0) { // the short weight fills with collected funding
        float fill = step(wl.y, -wsize.y + 2.0 * wsize.y * charge) * step(1.6, -d);
        if (fill > 0.5) { level = 0.62 + 0.25 * diff + flash * 0.2; tint = hot_c; }
      }
    }
  }

  float on = step(bayer8(floor(px)), level) * step(0.035, level);
  o = vec4(mix(ground_c, tint, on * (0.4 + level * 0.6)), 1.0);
}`;

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function StormField({ src, className = "" }: { src: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // CSS ground shows through; the page stays usable

    const sh = (type: number, code: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, code); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 10, 13, 255]));

    const names = ["res", "vid", "ptr", "t", "flash", "dot_c", "hot_c", "ground_c", "fg_c", "crowd_c", "scene_on", "pivot", "halfl", "thick", "tilt", "drop", "squash", "charge", "groundY", "wsize", "crowdX"] as const;
    const U = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<(typeof names)[number], WebGLUniformLocation | null>;
    gl.uniform3fv(U.dot_c, hex("#c0d3e8"));
    gl.uniform3fv(U.hot_c, hex("#fde819"));
    gl.uniform3fv(U.ground_c, hex("#080a0d"));
    gl.uniform3fv(U.fg_c, hex("#ebeff4"));
    gl.uniform3fv(U.crowd_c, hex("#7f93ad"));

    const reduced = reducedMotion();
    const video = document.createElement("video");
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: "auto" });
    video.setAttribute("aria-hidden", "true");
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    // Full-size behind the opaque canvas: browsers pause muted videos they consider invisible.
    Object.assign(video.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", zIndex: "0", pointerEvents: "none" });
    canvas.parentElement?.appendChild(video);
    video.src = src;
    video.load();

    // Footage director (clip 47947): black until 0.8 s, flicker 1.0-1.8 s, bright cloud 2.2-2.7 s, bolt 2.8-3.0 s.
    // Intro starts on the tape's "print-start" cue so the real bolt lands with the number slam.
    const AMBIENT: [number, number] = [1.95, 2.7], BOLT: [number, number] = [2.72, 3.25];
    let mode: "intro" | "ambient" | "bolt" = "intro";
    let ready = false, cued = false;
    const toAmbient = () => { mode = "ambient"; video.playbackRate = 0.35; video.currentTime = AMBIENT[0]; video.play().catch(() => {}); };
    const startIntro = () => { if (mode === "intro") video.play().catch(() => {}); };
    const offCue = onCue((name) => { if (name === "print-start") { cued = true; if (ready) startIntro(); } });
    const fallback = window.setTimeout(() => { if (!cued && mode === "intro") toAmbient(); }, 7000);
    video.addEventListener("loadeddata", () => {
      ready = true;
      if (reduced) { video.currentTime = 2.5; return; }
      video.pause(); video.currentTime = 0;
      if (cued) startIntro();
    }, { once: true });
    video.addEventListener("timeupdate", () => {
      if (mode === "intro" && video.currentTime > 3.4) toAmbient();
      else if (mode === "ambient" && video.currentTime > AMBIENT[1]) video.currentTime = AMBIENT[0];
      else if (mode === "bolt" && video.currentTime > BOLT[1]) toAmbient();
    });
    const onVis = () => { if (!document.hidden && !reduced && mode !== "intro") video.play().catch(() => {}); };
    document.addEventListener("visibilitychange", onVis);

    let flash = 0;
    const off = onStrike((p) => {
      if (reduced) return;
      flash = Math.max(flash, p);
      if (p >= 1.05 && mode === "ambient") { mode = "bolt"; video.playbackRate = 1; video.currentTime = BOLT[0]; video.play().catch(() => {}); }
    });
    const ptr = { x: 0.7, y: 0.6 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ptr.x = (e.clientX - r.left) / r.width; ptr.y = 1 - (e.clientY - r.top) / r.height;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const DOT = 3; // CSS px per dither dot; the canvas renders one pixel per dot
    const resize = () => {
      const w = Math.max(1, Math.ceil(canvas.clientWidth / DOT)), h = Math.max(1, Math.ceil(canvas.clientHeight / DOT));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!reduced && mode !== "intro") visible ? video.play().catch(() => {}) : video.pause(); });
    io.observe(canvas);

    let raf = 0, last = performance.now();
    function draw(now: number) {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      flash *= Math.exp(-dt * 7.5); // fast decay: a strike, not a glow
      if (ready && video.readyState >= 2) {
        gl!.bindTexture(gl!.TEXTURE_2D, tex);
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, video);
      }
      const W = canvas.clientWidth, H = canvas.clientHeight, Lg = layout(W, H);
      gl!.uniform2f(U.res, canvas.width, canvas.height);
      gl!.uniform2f(U.vid, video.videoWidth || 16, video.videoHeight || 9);
      gl!.uniform1f(U.t, now / 1000);
      gl!.uniform1f(U.flash, flash);
      gl!.uniform2f(U.ptr, ptr.x, ptr.y);
      gl!.uniform1f(U.scene_on, scene.active ? 1 : 0);
      gl!.uniform2f(U.pivot, Lg.cx / DOT, (H - Lg.pivotY) / DOT);
      gl!.uniform1f(U.halfl, Lg.half / DOT);
      gl!.uniform1f(U.thick, Lg.thick / DOT);
      gl!.uniform2f(U.wsize, Lg.weight.w / 2 / DOT, Lg.weight.h / 2 / DOT);
      gl!.uniform1f(U.groundY, (H - Lg.ground) / DOT);
      gl!.uniform2f(U.crowdX, Lg.crowd.x0 / DOT, Lg.crowd.x1 / DOT);
      gl!.uniform1f(U.tilt, scene.tilt);
      gl!.uniform1f(U.drop, scene.drop);
      gl!.uniform1f(U.squash, scene.squash);
      gl!.uniform1f(U.charge, scene.charge);
      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
    }
    let wasPaused = false;
    const loop = (now: number) => {
      if (scene.paused !== wasPaused) { wasPaused = scene.paused; if (wasPaused) video.pause(); else if (mode !== "intro") video.play().catch(() => {}); }
      if (visible && !document.hidden && !scene.paused) draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); off(); offCue(); window.clearTimeout(fallback); ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      video.pause(); video.removeAttribute("src"); video.load(); video.remove();
      gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(prog);
    };
  }, [src]);

  return <canvas ref={ref} className={className} style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", imageRendering: "pixelated" }} aria-hidden="true" />;
}
