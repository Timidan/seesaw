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
