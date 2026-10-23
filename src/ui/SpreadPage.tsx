import { useMemo, useState } from "react";
import { firstPassageProb, spreadStats } from "../carry/math";
import { FundingTape } from "./FundingTape";
import { RatioChart, FundingChart } from "./charts";
import { OpenPanel } from "./OpenPanel";
import { MySpreads } from "./MySpreads";
import { Xray } from "./Xray";
import { Beam } from "./bits";
import { Coin } from "./Coin";
import { useFunding, useKlines, useLiveFunding, useSnapshot } from "./data";
import { base, corr, pct, usd, z } from "./format";

export function SpreadPage({ short, long }: { short: string; long: string }) {
  const snap = useSnapshot();
  const live = useLiveFunding();
  const pair = snap.data?.pairs.find((p) => p.short === short && p.long === long)
    ?? snap.data?.pairs.find((p) => p.short === long && p.long === short);
  const flipped = !!pair && pair.short !== short;
  const fs = useFunding(short), fl = useFunding(long);
  const ks = useKlines(short), kl = useKlines(long);
  const [size, setSize] = useState(1000);

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
    const flips = fs.data.filter((p) => p.rate < 0).length;
    return { sa, sb, st, hours: st.length, flips };
  }, [fs.data, fl.data]);

  const S = base(short), L = base(long);
  const sym = snap.data?.symbols;
  const beta = pair && !flipped ? pair.beta : 1;
  const shortApr = sym?.[short]?.fundingApr30d ?? 0, longApr = -(sym?.[long]?.fundingApr30d ?? 0) * beta;
  const carry = pair ? shortApr + longApr : null;
  // chance an isolated 2× leg reaches liquidation within 30 days (zero-drift first passage)
  const liq30 = (s: string, side: "short" | "long") => sym?.[s]?.sigmaHourly ? firstPassageProb(0.48, sym[s].sigmaHourly, 720, side) : null;
  const worstLiq = Math.max(liq30(short, "short") ?? 0, liq30(long, "long") ?? 0);
  const halfLife = pair?.halfLifeHours ?? null;
  const nowCarry = live.data ? (live.data[short] ?? 0) - (live.data[long] ?? 0) : null;
  const perWeek = carry !== null ? (size * carry) / 100 / 52 : null; // per $ of the short leg, hedge-sized long leg

  return (
    <main className="wrap spread-top">
      <p className="crumb"><a href="#/app">← The board</a></p>
      <h1 className="spread-title">
        <span className="verb">short </span><Coin sym={short} size={58} className="title-coin" />{S}<span className="verb"> / long </span><Coin sym={long} size={58} className="title-coin" />{L}
      </h1>
      {flipped && <p className="notice warn" style={{ maxWidth: 640 }}><b>Reversed.</b> Funding favoured the other way. <a className="link" href={`#/spread/${long}/${short}`}>Short {L} / long {S}</a></p>}

      <dl className="stats">
        <div className="stat"><dt>A year, 30-day funding</dt><dd className={carry !== null && carry > 0 ? "hot" : ""}>{carry !== null ? pct(carry) : "…"}</dd></div>
        <div className="stat"><dt>Paying now</dt><dd style={{ color: pair && pair.ewmaCarryApr < 0 ? "var(--oxide)" : undefined }}>{pair ? pct(pair.ewmaCarryApr) : nowCarry !== null ? pct(nowCarry) : "…"}</dd></div>
        <div className="stat"><dt>Per unit of risk</dt><dd>{pair?.carryToRisk != null ? pair.carryToRisk.toFixed(2) : "…"}</dd></div>
        <div className="stat"><dt>Hedge, {S} : {L}</dt><dd>1 : {beta.toFixed(2)}</dd></div>
        <div className="stat"><dt>Swing a year, hedged</dt><dd>{pair ? `${pair.hedgedVolApr.toFixed(0)}%` : "…"}<small>{pair ? `vs ${pair.dollarVolApr.toFixed(0)}% at 1\u00a0:\u00a01` : ""}</small></dd></div>
        <div className="stat"><dt>Stretch now</dt><dd style={{ display: "flex", alignItems: "center", gap: 10 }}>{ratio ? z(ratio.z) : "…"} {ratio && <Beam z={ratio.z} size={36} />}</dd></div>
      </dl>

      <div className="spread-grid">
        <div>
          {pair ? <Xray short={short} long={long} shortApr={shortApr} longApr={longApr} correlation={pair.corr} beta={beta} ps={ks.data} pl={kl.data} /> : <div className="skel" style={{ height: 320 }} />}

          <section className="chart-block" aria-labelledby="tapes">
            <h2 className="h-sec" id="tapes">Every hour, who got paid</h2>
            <div className="tapes">
              <div>
                <p className="tape-title"><b>Short {S}</b></p>
                {fs.data ? <FundingTape points={fs.data} side="short" height={46} label={`Short ${S} funding by hour`} /> : <div className="skel" style={{ height: 46 }} />}
              </div>
              <div>
                <p className="tape-title"><b>Long {L}</b></p>
                {fl.data ? <FundingTape points={fl.data} side="long" height={46} label={`Long ${L} funding by hour`} /> : <div className="skel" style={{ height: 46 }} />}
              </div>
            </div>
          </section>

          <section className="chart-block" aria-labelledby="fchart">
            <h2 className="h-sec" id="fchart">$1,000 in each leg, 30 days</h2>
            {funding ? <FundingChart short={funding.sa} long={funding.sb} total={funding.st} label={`Cumulative funding received, short ${S} and long ${L}`} /> : <div className="skel chart" />}
            <div className="chart-legend">
              <span><i className="swatch" style={{ borderColor: "#fde819" }} /> Both legs {funding && <b className="num" style={{ color: "var(--strike)" }}>{usd(funding.st.at(-1)?.value ?? 0)}</b>}</span>
              <span><i className="swatch" style={{ borderColor: "#b2b8bf" }} /> Short {S}</span>
              <span><i className="swatch dash" style={{ borderColor: "#878d94" }} /> Long {L}</span>
            </div>
          </section>

          <section className="chart-block" aria-labelledby="rchart">
            <h2 className="h-sec" id="rchart">{S} priced in {L}</h2>
            {ratio ? <RatioChart points={ratio.ratios} mean={ratio.meanRatio} upper={ratio.upperRatio} lower={ratio.lowerRatio} label={`${S} to ${L} price ratio over 30 days`} /> : <div className="skel chart" />}
          </section>

          <section className="chart-block calc" aria-labelledby="calc">
            <h2 className="h-sec" id="calc">What it would have paid</h2>
            <p className="calc-out"><span className="display num">{perWeek !== null ? usd(perWeek, perWeek < 100 ? 2 : 0) : "…"}</span><span className="calc-unit">a week</span></p>
            <label className="calc-label" htmlFor="calc-n">with <b className="num">{usd(size, 0)}</b> in each leg</label>
            <input id="calc-n" className="range" type="range" min={20} max={20000} step={20} value={size} onChange={(e) => setSize(Number(e.target.value))} />
            <p className="note">30-day average, before fees. Not a forecast.</p>
          </section>

          <section className="risks" aria-labelledby="risks">
            <h2 className="h-sec" id="risks">What can go wrong</h2>
            <ul className="risk-list">
              <li>
                <span className="risk-art">{fs.data ? <FundingTape points={fs.data} side="short" height={22} label={`${S} funding by hour, red hours shorts paid`} /> : null}</span>
                <span><b>Funding flips.</b> {funding ? `${funding.flips} of ${fs.data?.length ?? 720} hours went the other way` : ""}{pair ? `, ${Math.round(pair.flip7d * 100)}% of the last week.` : "."}</span>
              </li>
              <li>
                <span className="risk-art"><Beam z={ratio ? Math.sign(ratio.z) * 3 : 3} size={44} /></span>
                <span><b>Legs drift.</b> {ratio ? `Worst 30-day move ${ratio.worstMove.toFixed(1)}%.` : ""}{halfLife ? ` Stretches have halved in about ${halfLife < 48 ? `${Math.round(halfLife)} hours` : `${(halfLife / 24).toFixed(1)} days`}.` : ""}</span>
              </li>
              <li>
                <span className="risk-art"><span className="liq"><i style={{ left: "50%" }} /><i className="x" style={{ left: "96%" }} /></span></span>
                <span><b>Each leg can be liquidated.</b> {worstLiq ? `At 2×, about ${Math.round(worstLiq * 100)}% chance the jumpier leg is liquidated within 30 days.` : "Isolated margin. Seesaw shows each liquidation price first."}</span>
              </li>
              <li>
                <span className="risk-art"><span className="two"><i /><i /></span></span>
                <span><b>Two orders, not one.</b> Sent together, filled apart.</span>
              </li>
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
