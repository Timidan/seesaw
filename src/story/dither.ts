// The story film through the hero's dither: one WebGL2 canvas over the engine's stage reads whichever
// scenes are visible (video once it has painted, the still poster before that), composites them at
// the engine's own opacities, and prints the result as Bayer dots. Signal yellow survives as yellow
// (funding coins); everything else is the hero's dot colour on the ink ground.

const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D ta, tb;
uniform vec4 ma, mb;   // cover-fit: source uv = (uv.x, 1 - uv.y) * m.xy + m.zw
uniform float oa, ob;  // top and under scene opacity
uniform vec3 ground, dotc, hot;
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
vec3 src(sampler2D t, vec4 m) { return texture(t, vec2(uv.x, 1.0 - uv.y) * m.xy + m.zw).rgb; }
void main() {
  vec3 c = ground;
  if (ob > 0.0) c = mix(c, src(tb, mb), ob);
  if (oa > 0.0) c = mix(c, src(ta, ma), oa);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float yel = smoothstep(0.18, 0.35, (c.r + c.g) * 0.5 - c.b) * smoothstep(0.35, 0.6, c.g);
  float level = max(smoothstep(0.04, 0.75, pow(lum, 0.85)), yel * 0.85);
  float on = step(bayer8(gl_FragCoord.xy), level) * step(0.035, level);
  o = vec4(mix(ground, mix(dotc, hot, yel), on * (0.4 + level * 0.6)), 1.0);
}`;

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

type Src = { el: HTMLVideoElement | HTMLImageElement; w: number; h: number; video: boolean };

export function mountDither(root: HTMLElement, dot = 2) {
  const canvas = document.createElement("canvas");
  canvas.className = "story-dither";
  canvas.setAttribute("aria-hidden", "true");
  root.appendChild(canvas);
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) { canvas.remove(); return; } // the engine's plain video stays visible

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
  const U = Object.fromEntries(["ta", "tb", "ma", "mb", "oa", "ob", "ground", "dotc", "hot"].map((n) => [n, gl.getUniformLocation(prog, n)]));
  gl.uniform1i(U.ta, 0);
  gl.uniform1i(U.tb, 1);
  gl.uniform3fv(U.ground, rgb("#080a0d"));
  gl.uniform3fv(U.dotc, rgb("#c0d3e8"));
  gl.uniform3fv(U.hot, rgb("#fde819"));

  const tex = [0, 1].map((unit) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  });
  const held: (Src["el"] | null)[] = [null, null]; // a still only needs uploading once per slot

  // Same framing as the engine's CSS (object-fit: cover; object-position: center 42% / 46% / 44%).
  const small = matchMedia("(max-width: 860px)"), portrait = matchMedia("(max-width: 860px) and (orientation: portrait)");
  const cover = (w: number, h: number, W: number, H: number) => {
    const y = portrait.matches ? 0.44 : small.matches ? 0.46 : 0.42;
    const k = Math.max(W / w, H / h), dw = w * k, dh = h * k;
    return [W / dw, H / dh, -((W - dw) * 0.5) / dw, -((H - dh) * y) / dh];
  };
  const source = (scene: HTMLElement): Src | null => {
    const v = scene.querySelector("video");
    if (v && scene.classList.contains("has-clip") && v.readyState >= 2) return { el: v, w: v.videoWidth, h: v.videoHeight, video: true };
    const img = scene.querySelector("img");
    if (img && img.complete && img.naturalWidth) return { el: img, w: img.naturalWidth, h: img.naturalHeight, video: false };
    return null;
  };

  const draw = () => {
    const W = Math.max(1, Math.ceil(canvas.clientWidth / dot)), H = Math.max(1, Math.ceil(canvas.clientHeight / dot));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H); }
    const visible = Array.from(root.querySelectorAll<HTMLElement>(".sw-scene"))
      .map((el) => ({ el, op: Number(el.style.opacity) || 0, z: Number(el.style.zIndex) || 0 }))
      .filter((s) => s.op > 0.001)
      .sort((a, b) => b.z - a.z)
      .slice(0, 2);
    [0, 1].forEach((slot) => {
      const s = visible[slot], src = s && source(s.el);
      gl.uniform1f(slot ? U.ob : U.oa, src ? s.op : 0);
      if (!src) return;
      gl.activeTexture(gl.TEXTURE0 + slot);
      gl.bindTexture(gl.TEXTURE_2D, tex[slot]);
      // video frames change under scrubbing (and a seek may still be decoding), so re-upload them every frame
      if (src.video || held[slot] !== src.el) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src.el);
        held[slot] = src.video ? null : src.el;
      }
      gl.uniform4fv(slot ? U.mb : U.ma, cover(src.w, src.h, canvas.clientWidth, canvas.clientHeight));
    });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
