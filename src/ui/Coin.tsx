import { useState } from "react";
import { coinIcon } from "./format";

// Market icons and the Strike mark are Strike's own assets, loaded from Strike's app (CORS *), so every
// market (crypto, stocks, pre-IPO) uses one consistent set. Missing icons fall back to a lettered disc.

export function Coin({ sym, size = 20, className = "" }: { sym: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const base = sym.replace(/-USD$/, "");
  if (failed) return <span className={`coin coin-fallback ${className}`} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{base.slice(0, 3)}</span>;
  return <img className={`coin ${className}`} src={coinIcon(sym)} width={size} height={size} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/** "short ADA" / "long SOL" as icon + ticker with a small direction mark. */
export function Leg({ sym, side, size = 20 }: { sym: string; side: "short" | "long"; size?: number }) {
  return (
    <span className={`legchip ${side}`}>
      <Coin sym={sym} size={size} />
      <span className="legchip-sym">{sym.replace(/-USD$/, "")}</span>
      <span className="legchip-side">{side === "short" ? "short" : "long"}</span>
    </span>
  );
}

export function StrikeMark({ height = 16 }: { height?: number }) {
  return <img className="strike-mark" src="https://app.strikefinance.org/logo-dark.svg" height={height} alt="Strike" />;
}
