import { useEffect, useRef, useState } from "react";
import type { FundingPoint } from "../carry/math";
import { ease, layout, onBeam, scene, spreadPnl } from "./scene";
import { onCue, reducedMotion, strike } from "./storm";
import { utcHour } from "./format";

const SPARK_LIFE = 240, DUST_LIFE = 650;

/** Crisp sparks and dust over the dithered world, plus labels that ride the beam. */
export function SceneOverlay({ shortLabel, longLabel, crowdLabel, shortSym }: { shortLabel: React.ReactNode; longLabel: React.ReactNode; crowdLabel: React.ReactNode; shortSym: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sRef = useRef<HTMLSpanElement>(null), lRef = useRef<HTMLSpanElement>(null), cRef = useRef<HTMLSpanElement>(null);
  const hitRef = useRef<HTMLDivElement>(null), readRef = useRef<HTMLDivElement>(null), ctlRef = useRef<HTMLDivElement>(null);
  const [hedged, setHedged] = useState(true);
  const motion = useRef({ vel: 0, shockTarget: 0, hold: 0, readUntil: 0, lift: null as null | { t0: number; from: number; to: number } });

  // Push the price for a moment, hold, then let it go. Anticipation: a small dip the other way first.
  const push = (s: number) => {
    const m = motion.current, now = performance.now();
    scene.shock = -s * 0.15; m.shockTarget = s; m.hold = now + 1400; m.readUntil = now + 3200;
  };
  const toggleHedge = () => {
    const next = !scene.hedged;
    scene.hedged = next; setHedged(next);
    motion.current.lift = { t0: performance.now(), from: scene.drop, to: next ? 1 : 0 };
    motion.current.readUntil = performance.now() + 2600;
  };

  // Drag the beam: up pushes the short leg's price up. Release lets it spring back.
  useEffect(() => {
    const hit = hitRef.current!;
    let y0 = 0, dragging = false;
    const down = (e: PointerEvent) => { if (!scene.ready) return; dragging = true; y0 = e.clientY; hit.setPointerCapture(e.pointerId); motion.current.hold = Infinity; };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      motion.current.shockTarget = Math.max(-0.3, Math.min(0.3, (y0 - e.clientY) / 600));
      motion.current.readUntil = performance.now() + 3200;
    };
    const up = () => { if (!dragging) return; dragging = false; motion.current.hold = performance.now() + 500; };
    hit.addEventListener("pointerdown", down); hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerup", up); hit.addEventListener("pointercancel", up);
    return () => { hit.removeEventListener("pointerdown", down); hit.removeEventListener("pointermove", move); hit.removeEventListener("pointerup", up); hit.removeEventListener("pointercancel", up); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0, onScreen = true, last = performance.now();
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; });
    io.observe(canvas);
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!onScreen || document.hidden) { raf = requestAnimationFrame(loop); return; }
      const m = motion.current;
      if (scene.ready) {
        if (now > m.hold) m.shockTarget = 0; // release: the price goes back
        scene.shock += (m.shockTarget - scene.shock) * Math.min(1, dt * 7);
        if (m.lift) { // hedge weight lifting off or dropping back; dust when it lands
          const k = Math.min(1, (now - m.lift.t0) / 520), e = m.lift.to > m.lift.from ? ease.inCubic(k) : ease.outQuint(k);
          scene.drop = m.lift.from + (m.lift.to - m.lift.from) * e;
          if (k >= 1) {
            if (m.lift.to === 1) {
              strike(0.4);
              const L0 = layout(canvas.clientWidth, canvas.clientHeight), [bx, by] = onBeam(L0, 1, 0);
              for (let i = 0; i < 14; i++) scene.dust.push({ born: now, x: bx + (Math.random() - 0.5) * L0.weight.w, y: by, vx: (Math.random() - 0.5) * 240, vy: -60 - Math.random() * 160 });
            }
            m.lift = null;
          }
        }
        // the beam: an underdamped spring toward the spread's P&L, so it overshoots and settles
        const lean = scene.hedged ? 0 : 0.07; // one weight on a beam tips it
        const target = Math.max(-0.34, Math.min(0.34, scene.baseTilt + lean - spreadPnl(scene.shock) * 2.4));
        const w = 10, zeta = 0.32;
        m.vel += (-(w * w) * (scene.tilt - target) - 2 * zeta * w * m.vel) * dt;
        scene.tilt += m.vel * dt;
        if (readRef.current) {
          const showRead = now < m.readUntil;
          readRef.current.style.opacity = showRead ? "1" : "0";
          if (showRead) {
            const pnl = spreadPnl(scene.shock);
            readRef.current.textContent = `${shortSym} ${scene.shock >= 0 ? "+" : "−"}${Math.abs(scene.shock * 100).toFixed(1)}% · your spread ${pnl >= 0 ? "+" : "−"}${Math.abs(pnl * 100).toFixed(1)}% ${scene.hedged ? "(hedged)" : "(no hedge)"}`;
            readRef.current.dataset.tone = Math.abs(pnl) > 0.05 ? "hot" : "";
          }
        }
      }
      const W = canvas.clientWidth, H = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const L = layout(W, H);
      const show = scene.active;
      for (const el of [sRef.current, lRef.current, cRef.current, ctlRef.current]) if (el) el.style.opacity = show ? "1" : "0";
      if (ctlRef.current) ctlRef.current.style.pointerEvents = show && scene.ready ? "auto" : "none";
      if (show) {
        if (hitRef.current) Object.assign(hitRef.current.style, { left: `${L.cx - L.half - 20}px`, top: `${L.pivotY - L.weight.h - 90}px`, width: `${2 * L.half + 40}px`, height: `${L.weight.h + 150}px`, display: scene.ready ? "block" : "none" });
        if (readRef.current) readRef.current.style.transform = `translate(${L.cx}px, ${L.pivotY + 36}px) translate(-50%, 0)`;
        if (ctlRef.current) ctlRef.current.style.transform = `translate(${L.cx}px, ${L.ground - 40}px) translate(-50%, 0)`;
        const [sx, sy] = onBeam(L, -1, L.weight.h + 14);
        const [lx, ly] = onBeam(L, 1, L.weight.h + 14 + (1 - scene.drop) * H * 0.75);
        if (sRef.current) sRef.current.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
        if (lRef.current) { lRef.current.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -100%)`; lRef.current.style.opacity = scene.drop > 0.98 ? "1" : "0"; }
        if (cRef.current) cRef.current.style.transform = `translate(${L.crowd.x0 + 14}px, ${L.ground - 66}px)`;
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
    <>
      <div className="scene-overlay" aria-hidden="true">
        <canvas ref={canvasRef} />
        <span ref={sRef} className="scene-label hot">{shortLabel}</span>
        <span ref={lRef} className="scene-label">{longLabel}</span>
        <span ref={cRef} className="scene-label dim">{crowdLabel}</span>
        <div ref={hitRef} className="scene-hit" title={`Drag up or down to move ${shortSym}'s price`} />
        <div ref={readRef} className="scene-readout" />
      </div>
      <div ref={ctlRef} className="scene-controls" role="group" aria-label="Try the hedge">
        <button type="button" onClick={() => push(0.1)}>Push {shortSym} +10%</button>
        <button type="button" onClick={() => push(-0.1)}>−10%</button>
        <button type="button" aria-pressed={!hedged} onClick={toggleHedge}>{hedged ? "Lift the hedge" : "Put the hedge back"}</button>
      </div>
    </>
  );
}

/** Runs the hero timeline: hedge lands, sparks follow the tape, then the last 720 hours replay. */
export function useHeroDirector(funding: FundingPoint[] | undefined, z: number, replayRef: React.RefObject<HTMLSpanElement>, corr = 0.8) {
  useEffect(() => { scene.corr = corr; }, [corr]);
  const state = useRef({ lastReceived: 0, total: 1, done: false });

  useEffect(() => {
    const wide = () => { scene.active = window.innerWidth >= 1200; }; // below this the copy needs the room
    wide(); window.addEventListener("resize", wide);
    Object.assign(scene, { tilt: 0.16, drop: 0, squash: 0, charge: 0, sparks: [], dust: [], replayIndex: -1, introDone: false, ready: false, shock: 0, hedged: true, baseTilt: z * 0.012 });
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
        if (replayRef.current) replayRef.current.textContent = `replaying ${utcHour(p.time)} · shorts ${p.rate >= 0 ? "received" : "paid"} ${(Math.abs(p.rate) * 100).toFixed(4)}%/h`;
      };
      tick();
    }, 250);
    return () => { window.clearInterval(poll); window.clearTimeout(timer); scene.replayIndex = -1; };
  }, [funding, replayRef]);

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
