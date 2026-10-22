import { useMemo, useState } from "react";
import { spreadStats } from "../carry/math";
import { FundingTape } from "./FundingTape";
import { RatioChart, FundingChart } from "./charts";
import { OpenPanel } from "./OpenPanel";
import { MySpreads } from "./MySpreads";
import { Beam } from "./bits";
import { useFunding, useKlines, useLiveFunding, useSnapshot } from "./data";
import { base, corr, pct, plainPct, usd, z } from "./format";

export function SpreadPage({ short, long }: { short: string; long: string }) {
  const snap = useSnapshot();
  const live = useLiveFunding();
  const pair = snap.data?.pairs.find((p) => p.short === short && p.long === long)
    ?? snap.data?.pairs.find((p) => p.short === long && p.long === short);
  const flipped = !!pair && pair.short !== short;
  const fs = useFunding(short), fl = useFunding(long);
  const ks = useKlines(short), kl = useKlines(long);
  const [notional, setNotional] = useState(1000);

  const ratio = useMemo(() => (ks.data && kl.data ? spreadStats(ks.data, kl.data) : null), [ks.data, kl.data]);
  const funding = useMemo(() => {
    if (!fs.data || !fl.data) return null;
    const byTime = new Map(fl.data.map((p) => [p.time, p.rate]));
    let a = 0, b = 0;
    const sa: { time: number; value: number }[] = [], sb: typeof sa = [], st: typeof sa = [];
    for (const p of fs.data) {
      const rl = byTime.get(p.time);
      if (rl === undefined) continue;
      a += p.rate * 1000; b += -rl * 1000; // short receives +rate; long receives −rate
      sa.push({ time: p.time, value: a }); sb.push({ time: p.time, value: b }); st.push({ time: p.time, value: a + b });
    }
    return { sa, sb, st, hours: st.length };
  }, [fs.data, fl.data]);

  const S = base(short), L = base(long);
  const carry = pair ? (flipped ? -pair.carryApr : pair.carryApr) : null;
  const perDay30 = carry !== null ? (notional * carry) / 100 / 365 : null;
  const nowCarry = live.data ? (live.data[short] ?? 0) - (live.data[long] ?? 0) : null;
  const perDayNow = nowCarry !== null ? (notional * nowCarry) / 100 / 365 : null;

  return (
    <main className="wrap spread-top">
      <p className="crumb"><a href="#board">← All spreads</a></p>
      <h1 className="spread-title">
        <span className="leg"><span className="verb">short </span>{S}</span> <span className="leg"><span className="verb">/ long </span>{L}</span>
      </h1>
      {flipped && <p className="notice warn" style={{ maxWidth: 640 }}><b>Reversed.</b> Funding favoured the other direction over 30 days. <a className="link" href={`#/spread/${long}/${short}`}>See short {L} / long {S}</a>.</p>}

      <dl className="stats">
        <div className="stat"><dt>Funding a year, 30-day average</dt><dd className={carry !== null && carry > 0 ? "hot" : ""}>{carry !== null ? pct(carry) : "…"}</dd></div>
        <div className="stat"><dt>Funding a year, this hour</dt><dd>{nowCarry !== null ? pct(nowCarry) : "…"}</dd></div>
        <div className="stat"><dt>Hours the {S} short was paid</dt><dd>{pair ? plainPct((flipped ? pair.pctLongPaid : pair.pctShortPaid) * 100) : "…"}<small>of {funding?.hours ?? 720}</small></dd></div>
        <div className="stat"><dt>Correlation, hourly</dt><dd>{pair ? corr(pair.corr) : "…"}</dd></div>
        <div className="stat"><dt>Spread swing, 1σ</dt><dd>{ratio ? `${ratio.spreadSd.toFixed(1)}%` : "…"}</dd></div>
        <div className="stat"><dt>Stretch now</dt><dd style={{ display: "flex", alignItems: "center", gap: 10 }}>{ratio ? z(ratio.z) : "…"} {ratio && <Beam z={ratio.z} size={36} />}</dd></div>
      </dl>

      <div className="spread-grid">
        <div>
          <section className="chart-block" aria-labelledby="tapes">
            <h3 id="tapes">Who got paid, hour by hour</h3>
            <p className="note">Up: your side of that leg was paid that hour. Down: it paid. Hover for the rate.</p>
            <div style={{ marginTop: 16, display: "grid", gap: 18 }}>
              <div>
                <p className="tape-title"><b>Short {S}</b></p>
                {fs.data ? <FundingTape points={fs.data} side="short" height={52} label={`Short ${S} funding by hour`} /> : <div className="skel" style={{ height: 52 }} />}
              </div>
              <div>
                <p className="tape-title"><b>Long {L}</b></p>
                {fl.data ? <FundingTape points={fl.data} side="long" height={52} label={`Long ${L} funding by hour`} /> : <div className="skel" style={{ height: 52 }} />}
              </div>
            </div>
          </section>

          <section className="chart-block" aria-labelledby="fchart">
            <h3 id="fchart">Funding received per $1,000 in each leg</h3>
            <p className="note">Cumulative over the last 30 days. {funding && <>Total: <b style={{ color: "var(--strike)" }}>{usd(funding.st.at(-1)?.value ?? 0)}</b> on $2,000 of exposure.</>}</p>
            {funding ? <FundingChart short={funding.sa} long={funding.sb} total={funding.st} label={`Cumulative funding received, short ${S} and long ${L}`} /> : <div className="skel chart" />}
            <div className="chart-legend">
              <span><i className="swatch" style={{ borderColor: "#fde819" }} /> Both legs</span>
              <span><i className="swatch" style={{ borderColor: "#b2b8bf" }} /> Short {S}</span>
              <span><i className="swatch dash" style={{ borderColor: "#878d94" }} /> Long {L}</span>
            </div>
          </section>

          <section className="chart-block" aria-labelledby="rchart">
            <h3 id="rchart">{S} priced in {L}</h3>
            <p className="note">If the two legs kept moving together, this line stays inside its band. Price moves of the pair are your risk; funding is the income.</p>
            {ratio ? <RatioChart points={ratio.ratios} mean={ratio.meanRatio} upper={ratio.upperRatio} lower={ratio.lowerRatio} label={`${S} to ${L} price ratio over 30 days`} /> : <div className="skel chart" />}
            <div className="chart-legend">
              <span><i className="swatch" /> {S}/{L} price, hourly</span>
              <span><i className="swatch dash" style={{ borderColor: "#878d94" }} /> 30-day mean</span>
              <span><i className="swatch dash" style={{ borderColor: "#3a3f47", borderTopStyle: "dotted" }} /> ±2σ</span>
            </div>
          </section>

          <section className="chart-block" aria-labelledby="calc">
            <h3 id="calc">What the funding would pay</h3>
            <div className="field" style={{ maxWidth: 260 }}>
              <label htmlFor="calc-n">Size of each leg (USD)</label>
              <input id="calc-n" className="input" type="number" inputMode="decimal" min={10} step={10} value={notional} onChange={(e) => setNotional(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <dl className="kv" style={{ maxWidth: 420 }}>
              <div><dt>Per day at the 30-day average</dt><dd>{perDay30 !== null ? usd(perDay30) : "…"}</dd></div>
              <div><dt>Per week at the 30-day average</dt><dd>{perDay30 !== null ? usd(perDay30 * 7) : "…"}</dd></div>
              <div><dt>Per day at this hour's rate</dt><dd>{perDayNow !== null ? usd(perDayNow) : "…"}</dd></div>
            </dl>
            <p className="note" style={{ marginTop: 10 }}>An estimate from past rates, before trading fees. Funding settles hourly on Strike and can change sign.</p>
          </section>

          <section className="risks" aria-labelledby="risks">
            <h3 id="risks">What can go wrong</h3>
            <ul>
              <li>Funding can flip. The {S} short was paid in {pair ? plainPct((flipped ? pair.pctLongPaid : pair.pctShortPaid) * 100) : "most"} of the last 720 hours, not all of them.</li>
              <li>The legs can drift apart. Over 30 days the pair's worst move from its start was {ratio ? `${ratio.worstMove.toFixed(1)}%` : "…"}; a move like that would cost more than weeks of funding.</li>
              <li>Each leg is isolated margin and can be liquidated on its own. Higher leverage brings the liquidation price closer.</li>
              <li>Both orders go out in one request but fill separately. If one fills and the other does not, Seesaw shows which and lets you retry it or close the filled leg.</li>
            </ul>
          </section>
        </div>

        <aside aria-label="Open this spread">
          <OpenPanel short={short} long={long} />
        </aside>
      </div>

      <MySpreads />
    </main>
  );
}
