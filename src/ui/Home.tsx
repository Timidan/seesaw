import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pair } from "../carry/math";
import type { ExchangeSymbol } from "../carry/data";
import { isTradable } from "../carry/execMarkets";
import { StormField } from "./StormField";
import { FundingTape } from "./FundingTape";
import { Beam, KineticNumber } from "./bits";
import { SceneOverlay, useHeroDirector } from "./HeroScene";
import { MiniTape } from "./MiniTape";
import { Coin, Leg } from "./Coin";
import { scene } from "./scene";
import { LiveSpread } from "./LiveSpread";
import { CarryMachine } from "./anatomy/CarryMachine";
import { useExecMarkets, useFunding, useSnapshot } from "./data";
import { base, corr, pct, pickHero, z } from "./format";

export const spreadHref = (p: { short: string; long: string }) => `#/spread/${p.short}/${p.long}`;

export function Home() {
  const snap = useSnapshot();
  const pairs = snap.data?.pairs ?? [];
  // Hero = best risk-adjusted spread among pairs that move together.
  const hero = useMemo(() => pickHero(pairs), [pairs]);
  const bins = useMemo(() => Object.fromEntries(Object.entries(snap.data?.symbols ?? {}).map(([k, v]) => [k, v.bins ?? []])), [snap.data]);
  const heroSym = hero ? snap.data?.symbols[hero.short] : undefined;
  const execLoad = useExecMarkets();
  const exec: ExchangeSymbol[] | null = execLoad.data ?? (execLoad.error ? [] : null);

  return (
    <main>
      <Hero hero={hero} total={pairs.filter((p) => p.carryApr > 0).length} asOf={snap.data?.asOf ?? null} error={snap.error} />
      {hero && heroSym && <How hero={hero} hours={heroSym.hours} paid={Math.round(heroSym.pctPositive * heroSym.hours)} />}
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
  const feed = useHeroDirector(funding.data, hero?.z ?? 0, replay, hero?.corr ?? 0.8);
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
      <div className="hero-field"><StormField src="/footage/storm-47947-720.mp4" poster="/footage/storm-47947-poster.jpg" /></div>
      <div className="hero-scrim" />
      <SceneOverlay shortLabel={<><Coin sym={hero?.short ?? "ADA-USD"} size={16} /> short {short} · collects</>} longLabel={<><Coin sym={hero?.long ?? "SOL-USD"} size={16} /> long {long} · hedge</>} crowdLabel={<><Coin sym={hero?.short ?? "ADA-USD"} size={14} /> {short} longs pay every hour</>} shortSym={short} />
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
                <KineticNumber className="figure-num" value={pct(hero.betaCarryApr)} play={reveal} onImpact={() => setLanded(true)} />
                <p className="figure-label"><b>a year, short {short} / long {long}</b>30-day funding · hedged 1 : {hero.beta.toFixed(2)} · moves together {corr(hero.corr)}</p>
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

/** The mechanism, as a machine you can push: true numbers for the hero pair, from the snapshot. */
function How({ hero, hours, paid }: { hero: Pair; hours: number; paid: number }) {
  return (
    <section className="section how" id="how" aria-labelledby="how-title">
      <div className="wrap how-grid">
        <div>
          <h2 id="how-title" className="display">Let the crowd pay</h2>
          <p className="section-sub">Press the beam. With the hedge on, it barely moves. Lift the hedge and press again.</p>
          <p className="section-sub"><a className="link" href="/story.html">New to this? Take the one-minute tour</a></p>
        </div>
        <CarryMachine titleId="how-title" short={base(hero.short)} long={base(hero.long)} beta={hero.beta} carryApr={hero.betaCarryApr}
          hoursPaid={paid} hours={hours} corr={hero.corr} hedgedVolApr={hero.hedgedVolApr} dollarVolApr={hero.dollarVolApr} />
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

type SortKey = "carryToRisk" | "betaCarryApr" | "ewmaCarryApr" | "corr";

function Board({ pairs, exec, loading, bins }: { pairs: Pair[]; exec: ExchangeSymbol[] | null; loading: boolean; bins: Record<string, number[]> }) {
  const [hedged, setHedged] = useState(true);
  const [testnet, setTestnet] = useState(false);
  const [sort, setSort] = useState<SortKey>("carryToRisk");
  const [limit, setLimit] = useState(16);
  const tradable = (p: Pair) => !!exec && isTradable(p.short, p.long, exec);
  const rows = useMemo(() => {
    let r = pairs.filter((p) => p.betaCarryApr > 0);
    if (hedged) r = r.filter((p) => p.corr >= 0.6);
    if (testnet) r = r.filter(tradable);
    const key = sort;
    return [...r].sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity));
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
            <p className="section-sub">Every Strike pair, ranked by the funding it paid per unit of risk over 30 days.</p>
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
                {head("betaCarryApr", "A year")}
                {head("carryToRisk", "Per unit of risk")}
                {head("ewmaCarryApr", "Paying now", "hide-md")}
                {head("corr", "Moves together", "hide-md")}
                <th scope="col" className="hide-xs"><span className="sr-only">Execution</span></th>
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
                      <span className="pair-name"><Leg sym={p.short} side="short" /><span className="pair-sep" aria-hidden>/</span><Leg sym={p.long} side="long" /></span>
                    </a>
                  </td>
                  <td className="hide-sm">{bins[p.short] && bins[p.long]
                    ? <MiniTape shortBins={bins[p.short]} longBins={bins[p.long]} label={`Net funding for short ${base(p.short)} / long ${base(p.long)}, 30 days`} />
                    : null}</td>
                  <td><span className="carry">{pct(p.betaCarryApr)}</span></td>
                  <td><span className="num" style={{ fontWeight: 600 }}>{p.carryToRisk != null ? p.carryToRisk.toFixed(2) : "–"}</span></td>
                  <td className="hide-md" style={{ color: p.ewmaCarryApr < 0 ? "var(--oxide)" : undefined }}>{pct(p.ewmaCarryApr)}</td>
                  <td className="hide-md"><span className="corrbar"><span className="num">{corr(p.corr)}</span><span className="paidbar-track" aria-hidden><span className="paidbar-fill" style={{ width: `${Math.max(0, p.corr) * 100}%`, background: "var(--fg-3)" }} /></span></span></td>
                  <td className="hide-xs">{tradable(p) ? <span className="tag"><i />testnet</span> : <span className="muted">mainnet</span>}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="empty">Nothing matches. Only a few Strike testnet markets can be opened and closed right now; turn off "Only testnet pairs" to see every market.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="board-more">
          <span className="num">{rows.length} of {pairs.length} pairs</span>
          {rows.length > limit && <button type="button" className="btn btn-line btn-sm" onClick={() => setLimit(rows.length)}>Show all {rows.length}</button>}
        </div>
      </div>
    </section>
  );
}
