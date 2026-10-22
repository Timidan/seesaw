import type { PricePoint } from "../carry/math";
import { reducedMotion } from "./storm";
import { base, corr } from "./format";

/** X-ray of a spread: where each leg's funding comes from, and the two price paths that cancel. Real numbers only. */
export function Xray({ short, long, shortApr, longApr, correlation, ps, pl }: {
  short: string; long: string;
  /** funding received a year by each leg, 30-day average, % (negative = that leg pays) */
  shortApr: number; longApr: number;
  correlation: number; ps?: PricePoint[]; pl?: PricePoint[];
}) {
  const S = base(short), L = base(long), total = shortApr + longApr;
  const motion = !reducedMotion();
  const path = (pts: PricePoint[] | undefined, other: PricePoint[] | undefined): number[] => {
    if (!pts?.length || !other?.length) return [];
    const times = new Set(other.map((p) => p.time));
    const shared = pts.filter((p) => times.has(p.time));
    const step = Math.max(1, Math.floor(shared.length / 140));
    const vals = shared.filter((_, i) => i % step === 0).map((p) => p.close / shared[0].close);
    return vals;
  };
  const vs = path(ps, pl), vl = path(pl, ps);
  const all = [...vs, ...vl];
  const lo = all.length ? Math.min(...all) : 1, hi = all.length ? Math.max(...all) : 1;
  const line = (v: number[]) => v.length < 2 ? "" : v.map((x, i) => `${i ? "L" : "M"}${(80 + (i / (v.length - 1)) * 480).toFixed(1)},${(292 - ((x - lo) / Math.max(1e-9, hi - lo)) * 48).toFixed(1)}`).join(" ");
  const flow = (apr: number) => (apr >= 0 ? "var(--strike)" : "var(--oxide)");
  const fmt = (apr: number) => `${apr >= 0 ? "+" : "−"}${Math.abs(apr).toFixed(1)}%`;

  return (
    <figure className="xray">
      <svg viewBox="0 0 640 320" role="img" aria-label={`Short ${S} receives ${fmt(shortApr)} a year in funding, long ${L} ${longApr >= 0 ? "receives" : "pays"} ${fmt(longApr)}; together ${fmt(total)}. Their prices moved together at ${corr(correlation)} correlation.`}>
        <defs>
          <marker id="xa" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker>
        </defs>
        {/* crowds paying in */}
        <g className="xray-src">
          {[0, 1, 2, 3, 4].map((i) => <circle key={`a${i}`} cx={46 + i * 11} cy={38 + (i % 2) * 3} r="4.2" />)}
          {[0, 1, 2, 3, 4].map((i) => <circle key={`b${i}`} cx={550 + i * 11} cy={38 + (i % 2) * 3} r="4.2" />)}
        </g>
        <text x="46" y="20" className="xray-k">{S} longs</text>
        <text x="594" y="20" className="xray-k" textAnchor="end">{L} shorts</text>
        <path id="fa" className="xray-flow" d="M70,52 C80,110 120,128 150,148" stroke={flow(shortApr)} markerEnd="url(#xa)" />
        <path id="fb" className="xray-flow" d={longApr >= 0 ? "M572,52 C562,110 520,128 490,148" : "M490,148 C520,128 562,110 572,52"} stroke={flow(longApr)} markerEnd="url(#xa)" />
        {motion && <>
          <circle r="3" fill={flow(shortApr)}><animateMotion dur="1.6s" repeatCount="indefinite"><mpath href="#fa" /></animateMotion></circle>
          <circle r="3" fill={flow(longApr)}><animateMotion dur={`${Math.max(1.6, Math.min(6, 1.6 * Math.abs(shortApr / (longApr || 1))))}s`} repeatCount="indefinite"><mpath href="#fb" /></animateMotion></circle>
        </>}
        <text x="108" y="92" className="xray-v" fill={flow(shortApr)}>{fmt(shortApr)}</text>
        <text x="532" y="92" className="xray-v" textAnchor="end" fill={flow(longApr)}>{fmt(longApr)}</text>
        {/* the total */}
        <text x="320" y="84" textAnchor="middle" className="xray-total">{fmt(total)}</text>
        <text x="320" y="106" textAnchor="middle" className="xray-k">a year, both legs</text>
        {/* beam, weights, pivot */}
        <rect x="80" y="196" width="480" height="10" className="xray-beam" />
        <rect x="112" y="150" width="76" height="46" className="xray-w hot" />
        <rect x="452" y="150" width="76" height="46" className="xray-w" />
        <text x="150" y="178" textAnchor="middle" className="xray-wl">short {S}</text>
        <text x="490" y="178" textAnchor="middle" className="xray-wl dark">long {L}</text>
        <path d="M320,206 L304,236 H336 Z" className="xray-beam" />
        {/* price paths that cancel */}
        <path d={line(vs)} className="xray-price" stroke="var(--mark-gold)" />
        <path d={line(vl)} className="xray-price" stroke="var(--fg-2)" strokeDasharray="3 3" />
        <text x="80" y="312" className="xray-k xray-cap">{S} and {L} price, 30 days</text>
        <text x="560" y="312" textAnchor="end" className="xray-k xray-cap">moved together · {corr(correlation)}</text>
      </svg>
    </figure>
  );
}
