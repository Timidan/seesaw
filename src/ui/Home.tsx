import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pair } from "../carry/math";
import type { ExchangeSymbol } from "../carry/data";
import { getExecutionMarkets, isTradable } from "../carry/execMarkets";
import { StormField } from "./StormField";
import { FundingTape } from "./FundingTape";
import { Beam, KineticNumber } from "./bits";
import { SceneOverlay, useHeroDirector } from "./HeroScene";
import { MiniTape } from "./MiniTape";
import { scene } from "./scene";
import { LiveSpread } from "./LiveSpread";
import { useFunding, useSnapshot } from "./data";
import { base, corr, pct, z } from "./format";

export const spreadHref = (p: { short: string; long: string }) => `#/spread/${p.short}/${p.long}`;

export function Home() {
  const snap = useSnapshot();
  const pairs = snap.data?.pairs ?? [];
  const hero = useMemo(() => pairs.find((p) => p.corr >= 0.6 && p.carryApr > 0), [pairs]);
  const bins = useMemo(() => Object.fromEntries(Object.entries(snap.data?.symbols ?? {}).map(([k, v]) => [k, v.bins ?? []])), [snap.data]);
  const [exec, setExec] = useState<ExchangeSymbol[] | null>(null);
  useEffect(() => { getExecutionMarkets().then(setExec, () => setExec([])); }, []);

  return (
    <main>
      <Hero hero={hero} total={pairs.filter((p) => p.carryApr > 0).length} asOf={snap.data?.asOf ?? null} error={snap.error} />
      <LiveSpread />
      <Board pairs={pairs} exec={exec} loading={!snap.data && !snap.error} bins={bins} />
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
  // The number must never stay hidden: show it if the tape cannot load or takes too long.
  const [late, setLate] = useState(false);
  useEffect(() => { if (!hero) return; const t = window.setTimeout(() => setLate(true), 6500); return () => window.clearTimeout(t); }, [hero]);
  const reveal = printed || late || !!funding.error;
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
                <KineticNumber className="figure-num" value={pct(hero.carryApr)} play={reveal} onImpact={() => setLanded(true)} />
                <p className="figure-label"><b>a year, short {short} / long {long}</b>funding over 30 days · moves together {corr(hero.corr)}</p>
              </div>
            )}
            <div className="hero-actions" style={{ opacity: hero ? 1 : 0.4 }}>
              <a className="btn btn-strike" href={hero ? `#/spread/${hero.short}/${hero.long}` : "#board"}>
                Open this spread <span className="arrow" aria-hidden>→</span>
              </a>
              <a className="link" href="#board">All {total || ""} spreads</a>
            </div>
          </div>
        </div>
      </div>
      <PauseMotion />
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

function PauseMotion() {
  const [paused, setPaused] = useState(false);
  return (
    <button type="button" className="pause" aria-pressed={paused} onClick={() => { scene.paused = !paused; setPaused(!paused); }}>
      {paused ? "Play motion" : "Pause motion"}
    </button>
  );
}

type SortKey = "carryApr" | "corr" | "z" | "pctShortPaid";

function Board({ pairs, exec, loading, bins }: { pairs: Pair[]; exec: ExchangeSymbol[] | null; loading: boolean; bins: Record<string, number[]> }) {
  const [hedged, setHedged] = useState(true);
  const [testnet, setTestnet] = useState(false);
  const [sort, setSort] = useState<SortKey>("carryApr");
  const [limit, setLimit] = useState(16);
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
            <h2 id="board-title" className="display">The board</h2>
            <p className="section-sub">Every Strike pair, ranked by the funding it paid in 30 days.</p>
          </div>
          <div className="board-controls" role="group" aria-label="Filters">
            <button type="button" className="toggle" aria-pressed={hedged} onClick={() => setHedged((v) => !v)}>Only pairs that move together</button>
            <button type="button" className="toggle" aria-pressed={testnet} onClick={() => setTestnet((v) => !v)}>Only testnet pairs</button>
          </div>
        </div>
        <div className="board-scroll">
          <table className="board">
            <thead>
              <tr>
                <th scope="col">Spread</th>
                <th scope="col" className="hide-sm">30 days, net funding</th>
                {head("carryApr", "A year")}
                {head("corr", "Moves together")}
                {head("z", "Stretch", "hide-sm")}
                <th scope="col"><span className="sr-only">Execution</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }, (_, i) => (
                <tr key={i} aria-hidden="true"><td colSpan={6}><div className="skel" style={{ height: 18, width: `${70 - i * 4}%` }} /></td></tr>
              ))}
              {rows.slice(0, limit).map((p) => (
                <tr key={`${p.short}/${p.long}`} onClick={() => (location.hash = spreadHref(p).slice(1))}>
                  <td>
                    <a className="pair" href={spreadHref(p)} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none" }}>
                      <Beam z={p.z} title={`Stretch ${z(p.z)}`} />
                      <span className="pair-name"><span className="legword">short</span> {base(p.short)} <span className="legword">/ long</span> {base(p.long)}</span>
                    </a>
                  </td>
                  <td className="hide-sm">{bins[p.short] && bins[p.long]
                    ? <MiniTape shortBins={bins[p.short]} longBins={bins[p.long]} label={`Net funding for short ${base(p.short)} / long ${base(p.long)}, 30 days`} />
                    : null}</td>
                  <td><span className="carry">{pct(p.carryApr)}</span></td>
                  <td><span className="corrbar"><span className="num">{corr(p.corr)}</span><span className="paidbar-track" aria-hidden><span className="paidbar-fill" style={{ width: `${Math.max(0, p.corr) * 100}%`, background: "var(--fg-3)" }} /></span></span></td>
                  <td className="hide-sm">{z(p.z)}</td>
                  <td>{tradable(p) ? <span className="tag"><i />testnet</span> : <span className="muted mono">mainnet</span>}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="empty">Nothing matches. Strike's testnet lists only BTC, ETH and SOL; turn off "Only testnet pairs" to see every market.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="board-more">
          <span className="mono">{rows.length} of {pairs.length} pairs</span>
          {rows.length > limit && <button type="button" className="btn btn-line btn-sm" onClick={() => setLimit(rows.length)}>Show all {rows.length}</button>}
        </div>
      </div>
    </section>
  );
}
