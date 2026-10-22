import { useEffect, useRef } from "react";

/** A spread's net funding over 30 days in 6-hour bins: up = the spread received, down = it paid. */
export function MiniTape({ shortBins, longBins, width = 132, height = 30, label }: { shortBins: number[]; longBins: number[]; width?: number; height?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext("2d")!, dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = width * dpr; c.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(shortBins.length, longBins.length);
    const net = Array.from({ length: n }, (_, i) => shortBins[i] - longBins[i]); // short receives +rate, long receives −rate
    const max = Math.max(1e-12, ...net.map(Math.abs));
    const mid = Math.round(height * 0.62) + 0.5, step = width / n;
    ctx.fillStyle = "#262a31"; ctx.fillRect(0, mid - 0.5, width, 1);
    net.forEach((v, i) => {
      const mag = Math.max(1, Math.sqrt(Math.abs(v) / max) * (v >= 0 ? mid - 1 : height - mid - 1));
      ctx.fillStyle = v >= 0 ? "#ad9300" : "#da4528";
      if (v >= 0) ctx.fillRect(i * step, mid - mag, Math.max(1, step - 0.3), mag); else ctx.fillRect(i * step, mid + 1, Math.max(1, step - 0.3), mag);
    });
  }, [shortBins, longBins, width, height]);
  return <canvas ref={ref} role="img" aria-label={label} style={{ width, height, display: "inline-block", verticalAlign: "middle" }} />;
}
