import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pair } from "../carry/math";
import type { ExchangeSymbol } from "../carry/data";
import { getExecutionMarkets, isTradable } from "../carry/execMarkets";
import { StormField } from "./StormField";
import { FundingTape } from "./FundingTape";
import { Beam, KineticNumber } from "./bits";
import { SceneOverlay, useHeroDirector } from "./HeroScene";
import { useFunding, useSnapshot } from "./data";
import { base, corr, pct, plainPct, z } from "./format";

export const spreadHref = (p: { short: string; long: string }) => `#/spread/${p.short}/${p.long}`;

export function Home() {
  const snap = useSnapshot();
  const pairs = snap.data?.pairs ?? [];
  const hero = useMemo(() => pairs.find((p) => p.corr >= 0.6 && p.carryApr > 0), [pairs]);
  const [exec, setExec] = useState<ExchangeSymbol[] | null>(null);
  useEffect(() => { getExecutionMarkets().then(setExec, () => setExec([])); }, []);

  return (
    <main>
      <Hero hero={hero} total={pairs.filter((p) => p.carryApr > 0).length} asOf={snap.data?.asOf ?? null} error={snap.error} />
      <Board pairs={pairs} exec={exec} loading={!snap.data && !snap.error} />
    </main>
  );
}

function Hero({ hero, total, asOf, error }: { hero?: Pair; total: number; asOf: string | null; error?: string }) {
  const funding = useFunding(hero?.short ?? null);
  const [count, setCount] = useState({ received: 0, printed: 0 });
  const [landed, setLanded] = useState(false);
  const replay = useRef<HTMLSpanElement>(null);
  const feed = useHeroDirector(funding.data, hero?.z ?? 0, replay);
  const printed = funding.data ? count.printed >= funding.data.length : false;
  const hours = funding.data?.length ?? 720;
  const onProgress = useCallback((received: number, printed: number) => {
    setCount({ received, printed });
    feed(received, printed, hours);
  }, [feed, hours]);
  const short = hero ? base(hero.short) : "ADA", long = hero ? base(hero.long) : "SOL";

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-field"><StormField src="/footage/storm-47947-720.mp4" /></div>
      <div className="hero-scrim" />
      <SceneOverlay shortLabel={`short ${short} · collects`} longLabel={`long ${long} · hedge`} crowdLabel={`${short} longs pay every hour`} />
      <div className="hero-body">
        <div className="wrap">
          <div className="hero-copy">
            <h1 id="hero-title" className="display">Get paid to&nbsp;hedge</h1>
            <p className="hero-lede">
              {hero ? <>Strike's crowd is long {short}. Every hour, it pays the other side.</>
                : error ? <>Strike's market data did not load. Reload to try again.</>
                : <>Reading 30 days of Strike funding…</>}
            </p>
            {hero && (
              <div className="figure">
                <span className="figure-row"><KineticNumber className="figure-num" value={`+${Math.floor(hero.carryApr)}`} play={printed} onImpact={() => setLanded(true)} /><span className="figure-unit">%</span></span>
                <p className="figure-label"><b>a year, short {short} / long {long}</b>{pct(hero.carryApr)} in funding over 30 days · {corr(hero.corr)} correlation</p>
              </div>
            )}
            <div className="hero-actions" style={{ opacity: hero ? 1 : 0.4 }}>
              <a className="btn btn-strike" href={hero ? `#/spread/${hero.short}/${hero.long}` : "#board"} aria-disabled={!hero}>
                Open this spread <span className="arrow" aria-hidden>→</span>
              </a>
              <a className="link" href="#board">All {total || ""} spreads</a>
            </div>
          </div>
        </div>
      </div>
      <div className="hero-tape wrap">
        <div className="tape-head">
          <p className="tape-title"><b>{short} funding</b> · one tick per hour</p>
          <p className="tape-count num"><span className="hit">{count.received}</span> / {count.printed || hours} hours paid to shorts</p>
        </div>
        {funding.data
          ? <FundingTape points={funding.data} side="short" height={84} print flashes follow onProgress={onProgress}
              label={`${hero?.short} hourly funding over 30 days: shorts were paid in ${Math.round((hero?.pctShortPaid ?? 0) * hours)} of ${hours} hours.`} />
          : <div className="skel" style={{ height: 84 }} aria-hidden="true" />}
        <div className="tape-axis"><span>30 days ago</span><span ref={replay} className="tape-replay" aria-hidden="true" /><span>{landed && asOf ? `as of ${asOf.slice(0, 16).replace("T", " ")} UTC` : "now"}</span></div>
      </div>
    </section>
  );
}

type SortKey = "carryApr" | "corr" | "z" | "pctShortPaid";

function Board({ pairs, exec, loading }: { pairs: Pair[]; exec: ExchangeSymbol[] | null; loading: boolean }) {
  const [hedged, setHedged] = useState(true);
  const [testnet, setTestnet] = useState(false);
  const [sort, setSort] = useState<SortKey>("carryApr");
  const [limit, setLimit] = useState(20);
  const tradable = (p: Pair) => !!exec && isTradable(p.short, p.long, exec);
  const rows = useMemo(() => {
    let r = pairs.filter((p) => p.carryApr > 0);
    if (hedged) r = r.filter((p) => p.corr >= 0.6);
    if (testnet) r = r.filter(tradable);
    const key = sort;
    return [...r].sort((a, b) => (key === "z" ? Math.abs(b.z) - Math.abs(a.z) : b[key] - a[key]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, hedged, testnet, sort, exec]);

  const head = (key: SortKey, label: string, cls = "") => (
    <th className={cls} aria-sort={sort === key ? "descending" : undefined}>
      <button type="button" onClick={() => setSort(key)}>{label}{sort === key && <span aria-hidden>↓</span>}</button>
    </th>
  );

  return (
    <section className="section" id="board" aria-labelledby="board-title">
      <div className="wrap">
        <div className="section-head">
          <div>
            <h2 id="board-title">Every Strike spread, ranked by the funding it paid</h2>
            <p className="section-sub">Short the leg the crowd is long, hold a correlated leg the other way, and the funding gap is yours. Figures are 30-day averages from Strike mainnet; past funding is not a forecast.</p>
          </div>
          <div className="board-controls" role="group" aria-label="Filters">
            <button type="button" className="toggle" aria-pressed={hedged} onClick={() => setHedged((v) => !v)}>Correlation 0.6 or higher</button>
            <button type="button" className="toggle" aria-pressed={testnet} onClick={() => setTestnet((v) => !v)}>Tradable on testnet</button>
          </div>
        </div>
        <div className="board-scroll">
          <table className="board">
            <thead>
              <tr>
                <th scope="col">Spread</th>
                {head("carryApr", "Funding a year")}
                {head("pctShortPaid", "Hours short leg was paid", "hide-sm")}
                {head("corr", "Correlation")}
                <th className="hide-sm" scope="col">Spread swing</th>
                {head("z", "Stretch now", "hide-sm")}
                <th scope="col"><span className="sr-only">Execution</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }, (_, i) => (
                <tr key={i} aria-hidden="true"><td colSpan={7}><div className="skel" style={{ height: 18, width: `${70 - i * 4}%` }} /></td></tr>
              ))}
              {rows.slice(0, limit).map((p) => (
                <tr key={`${p.short}/${p.long}`} onClick={() => (location.hash = spreadHref(p).slice(1))}>
                  <td>
                    <a className="pair" href={spreadHref(p)} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none" }}>
                      <Beam z={p.z} title={`Stretch ${z(p.z)}`} />
                      <span className="pair-name"><span className="legword">short</span> {base(p.short)} <span className="legword">/ long</span> {base(p.long)}</span>
                    </a>
                  </td>
                  <td><span className="carry">{pct(p.carryApr)}</span></td>
                  <td className="hide-sm">
                    <span className="paidbar"><span className="num">{plainPct(p.pctShortPaid * 100)}</span>
                      <span className="paidbar-track" aria-hidden><span className="paidbar-fill" style={{ width: `${p.pctShortPaid * 100}%` }} /></span></span>
                  </td>
                  <td>{corr(p.corr)}</td>
                  <td className="hide-sm">{p.spreadSd.toFixed(1)}%</td>
                  <td className="hide-sm">{z(p.z)}</td>
                  <td>{tradable(p) ? <span className="tag"><i />testnet</span> : <span className="muted mono">mainnet</span>}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="empty">No spread passes these filters. Turn off "Tradable on testnet" to see mainnet spreads; Strike's testnet lists only BTC, ETH and SOL.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="board-more">
          <span>{rows.length} spreads · ranked from {pairs.length} Strike market pairs</span>
          {rows.length > limit && <button type="button" className="btn btn-line btn-sm" onClick={() => setLimit(rows.length)}>Show all {rows.length}</button>}
        </div>
      </div>
    </section>
  );
}
