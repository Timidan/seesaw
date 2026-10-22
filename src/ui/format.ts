import type { Pair } from "../carry/math";

export const pct = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
export const plainPct = (v: number, digits = 0) => `${v.toFixed(digits)}%`;
export const usd = (v: number, digits = 2) =>
  `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const signedUsd = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${usd(v, digits)}`;
export const base = (sym: string) => sym.replace(/-USD$/, "");
export const corr = (v: number) => v.toFixed(2);
export const z = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}σ`;
export const shortId = (id: string | number | undefined | null) => {
  const s = String(id ?? "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};
export const utcHour = (ms: number) =>
  new Date(ms).toISOString().replace("T", " ").slice(5, 16) + " UTC";
/** Strike's own market icon for a symbol (served with CORS *); crypto, stocks and pre-IPO share one set. */
export const coinIcon = (sym: string) => `https://app.strikefinance.org/images/${base(sym).toLowerCase()}.webp`;
/** The spread the site leads with: best carry per unit of risk among pairs that move together. */
export const pickHero = (pairs: Pair[]) => [...pairs]
  .filter((p) => p.corr >= 0.6 && p.betaCarryApr > 0 && p.carryToRisk != null)
  .sort((a, b) => b.carryToRisk - a.carryToRisk)[0] as Pair | undefined;
