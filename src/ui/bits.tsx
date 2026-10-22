import { useEffect, useRef } from "react";
import { reducedMotion, strike } from "./storm";

/** Big number that lands like a strike: falls in wide and blurred, slams tight, overshoots, settles. */
export function KineticNumber({ value, play, onImpact, className = "" }: { value: string; play: boolean; onImpact?: () => void; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !play || done.current) return;
    done.current = true;
    if (reducedMotion()) { onImpact?.(); return; }
    el.animate(
      [
        { opacity: 0, transform: "translateY(-0.14em) scale(1.3)", filter: "blur(10px)", letterSpacing: "0.12em" },
        { opacity: 1, offset: 0.55, transform: "translateY(0.03em) scale(0.95)", filter: "blur(0px)", letterSpacing: "-0.02em" },
        { opacity: 1, offset: 0.8, transform: "translateY(-0.01em) scale(1.015)", filter: "blur(0px)", letterSpacing: "0em" },
        { opacity: 1, transform: "none", filter: "blur(0px)", letterSpacing: "0em" },
      ],
      { duration: 760, easing: "cubic-bezier(0.7, 0, 0.84, 0)", fill: "both" },
    );
    const t = window.setTimeout(() => { strike(1.1); onImpact?.(); }, 760 * 0.55);
    return () => window.clearTimeout(t);
  }, [play, onImpact]);
  return <span ref={ref} className={className} style={play || reducedMotion() ? undefined : { opacity: 0 }}>{value}</span>;
}

/** The seesaw mark: a beam on a pivot. Tilt shows how stretched the spread is (z-score), capped at 3σ. */
export function Beam({ z = 0, size = 32, title }: { z?: number; size?: number; title?: string }) {
  const angle = Math.max(-3, Math.min(3, z)) * 7;
  return (
    <svg className="beam" width={size} height={size / 2} viewBox="0 0 32 16" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" style={{ transform: `rotate(${-angle}deg)` }} />
      <path d="M16 9 L12 15 H20 Z" fill="currentColor" />
    </svg>
  );
}

export function Mark() {
  return (
    <svg width="26" height="14" viewBox="0 0 32 16" aria-hidden="true">
      <line x1="2" y1="6" x2="30" y2="10" stroke="#fde819" strokeWidth="3" />
      <path d="M16 9 L12 15 H20 Z" fill="#ebeff4" />
    </svg>
  );
}
