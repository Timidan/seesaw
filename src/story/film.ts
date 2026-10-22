// The story film, computed in the page from the scene stills (no rendered video): scroll drives a camera
// that eases in toward each scene's focal point, then flies through the hero's real storm footage to the
// next scene, passing one of the clip's real bolts mid-flight. Everything prints through the hero's Bayer
// dither; signal yellow survives only on funding coins. Reduced motion gets still scenes and plain fades.
import { lightning, onStrike, reducedMotion } from "../ui/storm";

const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D ta, tb, ts;
uniform vec4 ma, mb, ms;   // cover-fit maps: source uv = (uv.x, 1 - uv.y) * m.xy + m.zw
uniform vec2 fa, fb;       // focal points the camera eases toward (source uv)
uniform float za, zb;      // camera zoom per scene
uniform float wb, ws, flash, rain, time;
uniform vec3 ground, dotc, hot;
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
vec3 cam(sampler2D t, vec4 m, vec2 f, float z) {
  vec2 q = vec2(uv.x, 1.0 - uv.y) * m.xy + m.zw;
  return texture(t, f + (q - f) / z).rgb;
}
void main() {
  vec3 c = cam(ta, ma, fa, za);
  if (wb > 0.0) c = mix(c, cam(tb, mb, fb, zb), wb);
  // the footage is darkened first so even its brightest cloud keeps a dot texture instead of printing solid
  if (ws > 0.0) c = mix(c, texture(ts, vec2(uv.x, 1.0 - uv.y) * ms.xy + ms.zw).rgb * 0.55, ws);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float yel = smoothstep(0.18, 0.35, (c.r + c.g) * 0.5 - c.b) * smoothstep(0.35, 0.6, c.g);
  // every scene's lightning sits top-right, so flashes light from there
  float src = smoothstep(0.3, 1.0, uv.y) * smoothstep(0.2, 1.0, uv.x);
  // a flash lifts what is already lit, plus a falloff from the bolt's corner; never a flat fill
  float level = max(smoothstep(0.04, 0.75, pow(lum, 0.85)) * (1.0 + flash * 0.35) + flash * 0.16 * src, yel * 0.85);
  if (rain > 0.0) {
    vec2 px = gl_FragCoord.xy;
    float h = hash(floor((px.x + px.y * 0.22) / 2.0));
    float y = fract(px.y * 0.011 + time * (0.9 + h) + h * 7.0);
    level = max(level, rain * step(0.965, h) * step(y, 0.09) * 0.55);
  }
  level = clamp(level, 0.0, 1.0);
  float on = step(bayer8(gl_FragCoord.xy), level) * step(0.035, level);
  o = vec4(mix(ground, mix(dotc, hot, yel), on * (0.4 + level * 0.6)), 1.0);
}`;

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export type FilmOptions = {
  focus: [number, number][];        // per scene, landscape stills
  focusMobile: [number, number][];  // per scene, portrait stills
  rainScene: number;                // index of the scene with rain
  storm: string;                    // the footage the camera flies through between scenes
  dot?: number;                     // CSS px per dither dot
};

export function mountFilm(root: HTMLElement, opt: FilmOptions) {
  const dot = opt.dot ?? 2;
  const reduce = reducedMotion();
  const canvas = document.createElement("canvas");
  canvas.className = "story-dither";
  canvas.setAttribute("aria-hidden", "true");
  root.appendChild(canvas);
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) { canvas.remove(); return; } // the engine's own stills stay visible

  const sh = (type: number, code: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, code); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(["ta", "tb", "ts", "ma", "mb", "ms", "fa", "fb", "za", "zb", "wb", "ws", "flash", "rain", "time", "ground", "dotc", "hot"]
    .map((n) => [n, gl.getUniformLocation(prog, n)]));
  gl.uniform1i(U.ta, 0); gl.uniform1i(U.tb, 1); gl.uniform1i(U.ts, 2);
  gl.uniform3fv(U.ground, rgb("#080a0d"));
  gl.uniform3fv(U.dotc, rgb("#c0d3e8"));
  gl.uniform3fv(U.hot, rgb("#fde819"));
  const tex = [0, 1, 2].map((unit) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 10, 13, 255]));
    return t;
  });
  const held: (HTMLImageElement | null)[] = [null, null];

  // The storm clip, held as a blob so every seek works on any host.
  const storm = document.createElement("video");
  Object.assign(storm, { muted: true, playsInline: true, preload: "auto" });
  let stormReady = false;
  if (!reduce) fetch(opt.storm).then((r) => r.blob()).then((b) => {
    storm.src = URL.createObjectURL(b);
    storm.addEventListener("loadeddata", () => { stormReady = true; }, { once: true });
    storm.load();
  }).catch(() => {});

  // Flashes: the clip's own bolt mid-flight (scroll-locked), plus an ambient storm every 6-20 s.
  let ambient = 0, last = performance.now();
  onStrike((p) => { ambient = Math.max(ambient, p * 0.7); });
  if (!reduce) {
    const next = () => window.setTimeout(() => { if (!document.hidden) lightning(0.5 + Math.random() * 0.5); next(); }, 6000 + Math.random() * 14000);
    next();
  }

  const small = matchMedia("(max-width: 860px)"), portrait = matchMedia("(max-width: 860px) and (orientation: portrait)");
  const cover = (w: number, h: number, W: number, H: number, posY: number) => {
    const k = Math.max(W / w, H / h), dw = w * k, dh = h * k;
    return [W / dw, H / dh, -((W - dw) * 0.5) / dw, -((H - dh) * posY) / dh];
  };
  const posY = () => (portrait.matches ? 0.44 : small.matches ? 0.46 : 0.42);
  // Camera: eases in over the scene (slow in, slow out), keeps pushing while the scene dissolves into the storm.
  const zoom = (t: number) => (reduce ? 1 : 1 + 0.36 * smooth(0, 1, t) + 0.35 * Math.max(0, t - 1));
  const bind = (slot: number, img: HTMLImageElement) => {
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(gl.TEXTURE_2D, tex[slot]);
    if (held[slot] !== img && img.complete && img.naturalWidth) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); held[slot] = img; }
  };

  const draw = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    ambient *= Math.exp(-9 * dt);
    const W = Math.max(1, Math.ceil(canvas.clientWidth / dot)), H = Math.max(1, Math.ceil(canvas.clientHeight / dot));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H); }

    const scenes = Array.from(root.querySelectorAll<HTMLElement>(".sw-scene"));
    const seg = scenes.map((el) => ({ img: el.querySelector("img")!, s: Number(el.dataset.start), e: Number(el.dataset.end) }));
    if (!seg.length || !Number.isFinite(seg[0].e)) { requestAnimationFrame(draw); return; }
    const y = window.scrollY, T = 0.32 * window.innerHeight, N = seg.length;
    let k = seg.findIndex((g) => y < g.e); if (k < 0) k = N - 1;
    // Between two scenes: p runs 0 -> 1 across a band centred on their shared edge.
    let A = k, B = -1, p = 0;
    if (k < N - 1 && y > seg[k].e - T) { B = k + 1; p = (y - (seg[k].e - T)) / (2 * T); }
    else if (k > 0 && y < seg[k].s + T) { A = k - 1; B = k; p = (y - (seg[k].s - T)) / (2 * T); }
    const local = (i: number) => (y - seg[i].s) / Math.max(1, seg[i].e - seg[i].s);
    const focus = portrait.matches || small.matches ? opt.focusMobile : opt.focus;
    const vw = canvas.clientWidth, vh = canvas.clientHeight;

    bind(0, seg[A].img);
    gl.uniform4fv(U.ma, cover(seg[A].img.naturalWidth || 3, seg[A].img.naturalHeight || 2, vw, vh, posY()));
    gl.uniform2fv(U.fa, focus[A] ?? [0.5, 0.5]);
    gl.uniform1f(U.za, zoom(local(A)));
    let wb = 0, ws = 0, flash = ambient;
    if (B >= 0) {
      bind(1, seg[B].img);
      gl.uniform4fv(U.mb, cover(seg[B].img.naturalWidth || 3, seg[B].img.naturalHeight || 2, vw, vh, posY()));
      gl.uniform2fv(U.fb, focus[B] ?? [0.5, 0.5]);
      gl.uniform1f(U.zb, zoom(local(B)));
      if (reduce) wb = smooth(0.3, 0.7, p);
      else {
        wb = smooth(0.42, 0.58, p);                                // the next scene takes over under cloud cover
        ws = stormReady ? smooth(0, 0.35, p) * (1 - smooth(0.65, 1, p)) : 0;
        flash = Math.max(flash, Math.exp(-(((p - 0.5) / 0.06) ** 2)) * 0.3);
      }
    }
    if (ws > 0) {
      // Scrub 0.7-1.7 s of the clip: out of the dark, through its first real bolt (1.2 s) mid-flight, into dark cloud.
      // (Its 2.8-3.0 s flash lights the whole frame and would print as a flat fill.) Alternate flights are mirrored and reframed.
      const t = 0.7 + p * 1.0;
      if (!storm.seeking && Math.abs(storm.currentTime - t) > 1 / 30) { try { storm.currentTime = t; } catch { /* not seekable yet */ } }
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tex[2]);
      if (storm.readyState >= 2) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, storm);
      const m = cover(storm.videoWidth || 16, storm.videoHeight || 9, vw, vh, 0.5);
      const z = 1.1 + 0.08 * (A % 3), flip = A % 2 === 1;
      let [sx, sy, ox, oy] = [m[0] / z, m[1] / z, (m[2] - 0.5) / z + 0.5, (m[3] - 0.5) / z + 0.5];
      if (flip) { sx = -sx; ox = 1 - ox; }
      gl.uniform4fv(U.ms, [sx, sy, ox, oy]);
    }
    const rainAt = (i: number) => (i === opt.rainScene ? 1 : 0);
    gl.uniform1f(U.rain, reduce ? 0 : B >= 0 ? rainAt(A) * (1 - wb) * (1 - ws) + rainAt(B) * wb * (1 - ws) : rainAt(A));
    gl.uniform1f(U.wb, wb);
    gl.uniform1f(U.ws, ws);
    gl.uniform1f(U.flash, Math.min(1.2, flash));
    gl.uniform1f(U.time, reduce ? 0 : now / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
