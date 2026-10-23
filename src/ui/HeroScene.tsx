import { useEffect, useRef } from "react";
import type { FundingPoint } from "../carry/math";
import { ease, layout, onBeam, scene } from "./scene";
import { onCue, reducedMotion, strike } from "./storm";

const SPARK_LIFE = 240, DUST_LIFE = 650;

/** Crisp sparks and dust over the dithered world, plus labels that ride the beam. */
export function SceneOverlay({ shortLabel, longLabel }: { shortLabel: React.ReactNode; longLabel: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sRef = useRef<HTMLSpanElement>(null), lRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0, onScreen = true, last = performance.now(), vel = 0;
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; });
    io.observe(canvas);
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!onScreen || document.hidden) { raf = requestAnimationFrame(loop); return; }
      if (scene.ready) {
        // the beam: an underdamped spring toward its resting tilt, so it overshoots and settles
        const target = Math.max(-0.34, Math.min(0.34, scene.baseTilt));
        const w = 10, zeta = 0.32;
        vel += (-(w * w) * (scene.tilt - target) - 2 * zeta * w * vel) * dt;
        scene.tilt += vel * dt;
      }
      const W = canvas.clientWidth, H = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const L = layout(W, H);
      const show = scene.active;
      for (const el of [sRef.current, lRef.current]) if (el) el.style.opacity = show ? "1" : "0";
      if (show) {
        const [sx, sy] = onBeam(L, -1, L.weight.h + 14);
        const [lx, ly] = onBeam(L, 1, L.weight.h + 14 + (1 - scene.drop) * H * 0.75);
        if (sRef.current) sRef.current.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
        if (lRef.current) { lRef.current.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -100%)`; lRef.current.style.opacity = scene.drop > 0.98 ? "1" : "0"; }
      }
      // sparks: jagged, short-lived; seeded so each keeps its shape while it fades
      scene.sparks = scene.sparks.filter((s) => now - s.born < SPARK_LIFE);
      for (const s of scene.sparks) {
        const a = 1 - (now - s.born) / SPARK_LIFE;
        let seed = s.seed;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
        const [x0, y0] = s.from, [x1, y1] = s.to, n = 9;
        const nx = -(y1 - y0), ny = x1 - x0, len = Math.hypot(nx, ny) || 1;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let i = 1; i < n; i++) {
          const k = i / n, j = rnd() * 16 * Math.sin(k * Math.PI) * (0.6 + s.power);
          ctx.lineTo(x0 + (x1 - x0) * k + (nx / len) * j, y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 26 + (ny / len) * j);
        }
        ctx.lineTo(x1, y1);
        const c = s.paid ? "248,79,47" : "253,232,25";
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.strokeStyle = `rgba(${c},${0.18 * a})`; ctx.lineWidth = 3.5; ctx.stroke();
        ctx.strokeStyle = `rgba(${c},${a})`; ctx.lineWidth = 1.25; ctx.stroke();
      }
      scene.dust = scene.dust.filter((d) => now - d.born < DUST_LIFE);
      for (const d of scene.dust) {
        const k = (now - d.born) / 1000;
        ctx.fillStyle = `rgba(235,239,244,${1 - (now - d.born) / DUST_LIFE})`;
        ctx.fillRect(d.x + d.vx * k, d.y + d.vy * k + 420 * k * k, 3, 3);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  return (
    <div className="scene-overlay" aria-hidden="true">
      <canvas ref={canvasRef} />
      <span ref={sRef} className="scene-label hot">{shortLabel}</span>
      <span ref={lRef} className="scene-label">{longLabel}</span>
    </div>
  );
}

/** Runs the hero timeline: hedge lands, sparks follow the tape, then the last 720 hours replay. */
export function useHeroDirector(funding: FundingPoint[] | undefined, z: number) {
  const state = useRef({ lastReceived: 0, total: 1, done: false });

  useEffect(() => {
    const wide = () => { scene.active = window.innerWidth >= 1200; }; // below this the copy needs the room
    wide(); window.addEventListener("resize", wide);
    Object.assign(scene, { tilt: 0.16, drop: 0, squash: 0, charge: 0, sparks: [], dust: [], replayIndex: -1, introDone: false, ready: false, baseTilt: z * 0.012 });
    if (reducedMotion()) Object.assign(scene, { tilt: z * 0.012, drop: 1, charge: 1, ready: true });
    return () => window.removeEventListener("resize", wide);
  }, [z]);

  // Intro: the hedge weight drops when the tape starts printing.
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const off = onCue((name) => {
      if (name !== "print-start") return;
      const t0 = performance.now();
      let landed = false;
      const tick = (now: number) => {
        const t = now - t0;
        scene.drop = Math.min(1, ease.inCubic(Math.min(1, t / 360)));
        if (t >= 360 && !landed) {
          landed = true; strike(0.55);
          const L = layout(window.innerWidth, (document.querySelector(".hero") as HTMLElement)?.clientHeight ?? window.innerHeight);
          const [bx, by] = onBeam(L, 1, 0);
          for (let i = 0; i < 18; i++) scene.dust.push({ born: now, x: bx + (Math.random() - 0.5) * L.weight.w, y: by, vx: (Math.random() - 0.5) * 260, vy: -80 - Math.random() * 180 });
        }
        if (t >= 360) {
          const k = (t - 360) / 1000;
          scene.squash = Math.max(0, 1 - k * 4);
          scene.tilt = 0.16 * ease.settle(Math.min(1, k)) + z * 0.012 * Math.min(1, k);
        }
        if (t < 1500) raf = requestAnimationFrame(tick);
        else { scene.baseTilt = z * 0.012; scene.ready = true; } // hand the beam to the spring controller
      };
      raf = requestAnimationFrame(tick);
    });
    return () => { off(); cancelAnimationFrame(raf); };
  }, [z]);

  // Ambient: once the intro lands, replay the real 720 hours, one every 600 ms, with a playhead on the tape.
  useEffect(() => {
    if (!funding?.length || reducedMotion()) return;
    let i = 0, timer = 0;
    const poll = window.setInterval(() => {
      if (!scene.introDone) return;
      window.clearInterval(poll);
      const tick = () => {
        timer = window.setTimeout(tick, 1500 + Math.random() * 1500); // irregular, about one payment every 2 s
        if (!scene.active || document.hidden || scene.paused) return;
        const idx = i % funding.length, p = funding[idx]; i++;
        scene.replayIndex = idx;
        fire(p.rate < 0, Math.min(1, Math.sqrt(Math.abs(p.rate) / 0.0003)));
      };
      tick();
    }, 250);
    return () => { window.clearInterval(poll); window.clearTimeout(timer); scene.replayIndex = -1; };
  }, [funding]);

  /** Called with tape progress during the intro print. */
  return (received: number, printed: number, total: number) => {
    state.current.total = total;
    scene.charge = total ? received / total : 0;
    const fresh = received - state.current.lastReceived;
    state.current.lastReceived = received;
    for (let k = 0; k < Math.min(2, fresh); k++) fire(false, 0.5 + Math.random() * 0.5);
    if (printed >= total && !state.current.done) { state.current.done = true; window.setTimeout(() => { scene.introDone = true; }, 1400); }
  };
}

function fire(paid: boolean, power: number) {
  const hero = document.querySelector(".hero") as HTMLElement | null;
  if (!hero || !scene.active) return;
  const L = layout(hero.clientWidth, hero.clientHeight);
  const crowdX = L.crowd.x0 + 30 + Math.random() * Math.max(40, (L.crowd.x1 - L.crowd.x0) * 0.6);
  const crowdPt: [number, number] = [crowdX, L.ground - 52 - Math.random() * 14];
  const weightPt = onBeam(L, -1, L.weight.h * 0.6);
  scene.sparks.push({ born: performance.now(), from: paid ? weightPt : crowdPt, to: paid ? crowdPt : weightPt, power, paid, seed: 1 + Math.floor(Math.random() * 1e6) });
}
