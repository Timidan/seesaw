import { useEffect, useRef, useState } from "react";
import type { FundingPoint } from "../carry/math";
import { cue, reducedMotion, strike } from "./storm";
import { scene } from "./scene";
import { utcHour } from "./format";

const GOLD = "#ad9300", OXIDE = "#da4528", HOT = "#fde819", RULE = "#3a3f47", CROSS = "#b2b8bf";

type Props = {
  points: FundingPoint[];
  /** "short": positive funding is received. "long": negative funding is received. */
  side: "short" | "long";
  height?: number;
  print?: boolean;
  /** Fires as the print head moves: received hours so far, hours printed. */
  onProgress?: (received: number, printed: number) => void;
  label: string;
  flashes?: boolean;
  /** Draw the scene's replay playhead (hero only). */
  follow?: boolean;
};

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function FundingTape({ points, side, height = 96, print = false, onProgress, label, flashes = false, follow = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef(print && !reducedMotion() ? 0 : points.length);
  const [tip, setTip] = useState<{ x: number; i: number } | null>(null);
  const vals = points.map((p) => (side === "short" ? p.rate : -p.rate));
  const max = Math.max(1e-12, ...vals.map(Math.abs));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let raf = 0;

    const draw = (head: number, hover: number | null) => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const n = vals.length, step = w / n, bw = Math.max(1, step - (step > 3 ? 1 : 0.35));
      const mid = Math.round(h * 0.56) + 0.5;
      ctx.fillStyle = RULE; ctx.fillRect(0, mid - 0.5, w, 1);
      const upto = Math.min(n, Math.floor(head));
      for (let i = 0; i < upto; i++) {
        const v = vals[i];
        const mag = Math.max(2, Math.sqrt(Math.abs(v) / max) * (v >= 0 ? mid - 3 : h - mid - 3));
        const age = upto - i; // fresh ticks glow hot, then cool to gold
        ctx.fillStyle = v >= 0 ? (age < 14 && head < n ? HOT : GOLD) : OXIDE;
        const x = i * step;
        if (v >= 0) ctx.fillRect(x, mid - 1 - mag, bw, mag); else ctx.fillRect(x, mid + 1, bw, mag);
      }
      if (head < n) { ctx.fillStyle = HOT; ctx.fillRect(Math.min(w - 2, upto * step), 0, 2, h); }
      if (hover !== null) { ctx.fillStyle = CROSS; ctx.fillRect(Math.round(hover * step + bw / 2), 0, 1, h); }
      const ri = follow ? scene.replayIndex : -1;
      if (ri >= 0 && ri < upto) {
        const v = vals[ri];
        ctx.fillStyle = v >= 0 ? HOT : "#f84f2f";
        ctx.fillRect(Math.round(ri * step) - 1, 0, Math.max(2, bw + 2), h);
      }
    };

    let hovering: number | null = null;
    const redraw = () => draw(headRef.current, hovering);
    const ro = new ResizeObserver(redraw); ro.observe(canvas);

    if (headRef.current < vals.length) {
      let start = 0, lastFlash = 0, received = 0, counted = 0;
      if (flashes) window.setTimeout(() => cue("print-start"), 380);
      const delay = 380, dur = 2500;
      const tick = (now: number) => {
        if (!start) start = now;
        const k = Math.min(1, Math.max(0, (now - start - delay) / dur));
        const head = easeInOut(k) * vals.length;
        const upto = Math.floor(head);
        let burst = 0;
        for (; counted < upto; counted++) if (vals[counted] > 0) { received++; burst += Math.sqrt(vals[counted] / max); }
        if (flashes && burst > 0 && now - lastFlash > 110) { strike(Math.min(1, 0.25 + burst * 0.18)); lastFlash = now; }
        headRef.current = head;
        onProgress?.(received, upto);
        draw(head, null);
        if (k < 1) raf = requestAnimationFrame(tick);
        else { headRef.current = vals.length; draw(vals.length, null); if (flashes) strike(1.25); onProgress?.(received, vals.length); }
      };
      raf = requestAnimationFrame(tick);
    } else {
      onProgress?.(vals.filter((v) => v > 0).length, vals.length);
      redraw();
    }

    let lastReplay = -1, followRaf = 0;
    if (follow) {
      const watch = () => { if (scene.replayIndex !== lastReplay) { lastReplay = scene.replayIndex; draw(headRef.current, hovering); } followRaf = requestAnimationFrame(watch); };
      followRaf = requestAnimationFrame(watch);
    }
    const onMove = (e: PointerEvent) => {
      if (headRef.current < vals.length) return;
      const r = canvas.getBoundingClientRect();
      const i = Math.max(0, Math.min(vals.length - 1, Math.floor(((e.clientX - r.left) / r.width) * vals.length)));
      hovering = i; draw(headRef.current, i); setTip({ x: e.clientX - r.left, i });
    };
    const onLeave = () => { hovering = null; draw(headRef.current, null); setTip(null); };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(followRaf); ro.disconnect(); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerleave", onLeave); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, side]);

  const p = tip ? points[tip.i] : null;
  const v = tip ? vals[tip.i] : 0;
  return (
    <div className="tape-canvas-wrap">
      <canvas ref={canvasRef} role="img" aria-label={label} style={{ width: "100%", height }} />
      {tip && p && (
        <div className="tape-tip" style={{ left: Math.min(Math.max(tip.x, 90), (canvasRef.current?.clientWidth ?? 0) - 90) }}>
          {utcHour(p.time)} · <span className={v >= 0 ? "pos" : "neg"}>{v >= 0 ? "received" : "paid"} {(Math.abs(v) * 100).toFixed(4)}%/h</span>
        </div>
      )}
    </div>
  );
}
