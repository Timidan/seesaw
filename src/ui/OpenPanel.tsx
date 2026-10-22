import { useEffect, useMemo, useRef, useState } from "react";
import { BUILDER_FEE_BPS } from "../api/config";
import { detectInstalledWallets, type SupportedChain } from "../api/wallets";
import type { ExchangeSymbol } from "../carry/data";
import { getExecutionMarkets, isTradable } from "../carry/execMarkets";
import { DEFAULT_FEE_RATES } from "../math/fees";
import { useSession } from "../session/SessionProvider";
import { useBuilderConnect } from "../session/useBuilderConnect";
import type { SpreadSide } from "../spread/plan";
import type { SpreadRecord } from "../spread/store";
import { useSpreadsCtx } from "./spreadsContext";
import { Beam } from "./bits";
import { useExecMarks, useSnapshot } from "./data";
import { base, pct, shortId, usd } from "./format";
import { reducedMotion, strike } from "./storm";

const CHAINS: { id: SupportedChain; label: string }[] = [
  { id: "ethereum", label: "Ethereum" }, { id: "solana", label: "Solana" }, { id: "cardano", label: "Cardano" },
];

export function OpenPanel({ short, long }: { short: string; long: string }) {
  const session = useSession();
  const [markets, setMarkets] = useState<ExchangeSymbol[] | null>(null);
  useEffect(() => { getExecutionMarkets().then(setMarkets, () => setMarkets([])); }, []);
  const tradable = !!markets && isTradable(short, long, markets);

  return (
    <div className="panel open">
      <h3>Open this spread</h3>
      <p className="sub">Both legs go to Strike testnet in one signed request, with Seesaw's builder code.</p>
      {markets === null ? <div className="skel" style={{ height: 120, marginTop: 18 }} />
        : !tradable ? <NotOnTestnet markets={markets} short={short} long={long} />
        : !session.connection ? <Connect />
        : <Ticket short={short} long={long} markets={markets} />}
    </div>
  );
}

function NotOnTestnet({ markets, short, long }: { markets: ExchangeSymbol[]; short: string; long: string }) {
  const snap = useSnapshot();
  const alts = (snap.data?.pairs ?? []).filter((p) => p.carryApr > 0 && isTradable(p.short, p.long, markets)).slice(0, 3);
  return (
    <>
      <p className="notice" style={{ marginTop: 16 }}>
        <b>{base(short)}</b> / <b>{base(long)}</b> trades on Strike mainnet. This build sends orders to Strike testnet, which lists {markets.map((m) => base(m.symbol)).join(", ") || "only a few markets"}.
      </p>
      {alts.length > 0 && (
        <>
          <p className="sub" style={{ marginTop: 16 }}>Open one of these on testnet instead:</p>
          <div className="legs">
            {alts.map((p) => (
              <a key={p.short + p.long} className="leg-row" href={`#/spread/${p.short}/${p.long}`} style={{ textDecoration: "none" }} data-state="filled">
                <span className="leg-dot" aria-hidden />
                <span className="what">short {base(p.short)} / long {base(p.long)}</span>
                <span className="state" style={{ color: "var(--strike)" }}>{pct(p.carryApr)}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Connect() {
  const c = useBuilderConnect();
  // Start on a chain where this browser actually has a wallet.
  useEffect(() => {
    const found = detectInstalledWallets().find((w) => w.installed);
    if (found && found.chain !== c.chain) c.setChain(found.chain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div className="seg" role="group" aria-label="Wallet chain" style={{ marginTop: 18 }}>
        {CHAINS.map((ch) => <button key={ch.id} type="button" aria-pressed={c.chain === ch.id} onClick={() => c.setChain(ch.id)}>{ch.label}</button>)}
      </div>
      <div className="legs">
        {c.wallets.length === 0 && <p className="notice">No {c.chain} wallet found in this browser. Install one, or pick another chain.</p>}
        {c.wallets.map((w) => (
          <button key={w.id} type="button" className="btn btn-line" style={{ marginTop: 0, width: "100%", justifyContent: "flex-start" }}
            disabled={!!c.connectingWalletId} onClick={() => c.connect(w.id)}>
            {w.icon && <img src={w.icon} alt="" width={20} height={20} />} {c.connectingWalletId === w.id ? "Waiting for your wallet…" : `Connect ${w.name}`}
          </button>
        ))}
      </div>
      {c.status && <p className="sub" aria-live="polite" style={{ marginTop: 12 }}>{c.status}</p>}
      {c.error && <p className="notice err" role="alert"><b>Could not connect.</b> {c.error}</p>}
      <p className="sub" style={{ marginTop: 14 }}>You sign one message. It lets Seesaw place orders for this account with builder code <span className="mono">{c.builderCode}</span>. It cannot withdraw.</p>
    </>
  );
}

function Ticket({ short, long, markets }: { short: string; long: string; markets: ExchangeSymbol[] }) {
  const session = useSession();
  const spreads = useSpreadsCtx();
  const marks = useExecMarks([short, long]);
  const [notional, setNotional] = useState(20);
  const [leverage, setLeverage] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const conn = session.connection!;
  const builderFeeBps = Math.min(BUILDER_FEE_BPS, conn.feeShareBps);
  const filters = useMemo(() => Object.fromEntries(markets.map((m) => [m.symbol, m])), [markets]);
  const ready = marks[short] > 0 && marks[long] > 0;
  const plan = useMemo(
    () => (ready ? spreads.plan({ short, long, notionalPerLeg: notional, leverage, marks, filters, feeRates: DEFAULT_FEE_RATES, builderFeeBps }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, short, long, notional, leverage, marks[short], marks[long], filters, builderFeeBps, session.account, session.positions],
  );
  const active = spreads.spreads.find((r) => r.id === activeId) ?? null;

  const submit = async () => {
    if (!plan) return;
    setBusy(true); setErr("");
    try { const rec = await spreads.open(plan); setActiveId(rec.id); }
    catch (e) { setErr(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <dl className="kv">
        <div><dt>Wallet</dt><dd className="mono">{shortId(conn.address)} <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer", marginLeft: 6 }} onClick={session.disconnect}>Disconnect</button></dd></div>
        <div><dt>Available on Strike testnet</dt><dd>{usd(Number(session.account?.available_balance ?? 0))}</dd></div>
      </dl>
      <div className="field">
        <label htmlFor="n">Size of each leg (USD)</label>
        <input id="n" className="input" type="number" inputMode="decimal" min={10} step={5} value={notional} onChange={(e) => setNotional(Math.max(0, Number(e.target.value) || 0))} />
      </div>
      <div className="field">
        <span id="lev" style={{ fontSize: 13, color: "var(--fg-2)" }}>Leverage on each leg (isolated)</span>
        <div className="seg" role="group" aria-labelledby="lev">
          {[1, 2, 3].map((l) => <button key={l} type="button" aria-pressed={leverage === l} onClick={() => setLeverage(l)}>{l}×</button>)}
        </div>
      </div>
      {plan && (
        <dl className="kv">
          {(["short", "long"] as SpreadSide[]).map((s) => {
            const leg = plan.legs[s];
            return <div key={s}><dt>{s === "short" ? "Sell" : "Buy"} {base(s === "short" ? short : long)}</dt><dd>{leg ? `${leg.size} · liq ${leg.liquidationPrice > 0 ? usd(leg.liquidationPrice, leg.liquidationPrice < 10 ? 4 : 2) : "none"}` : "…"}</dd></div>;
          })}
          <div><dt>Margin needed</dt><dd>{usd(plan.requiredMargin)}</dd></div>
          <div><dt>Fees: Strike + Seesaw ({builderFeeBps} bps)</dt><dd>{usd(plan.estimatedTakerFees)} + {usd(plan.estimatedBuilderFees)}</dd></div>
        </dl>
      )}
      {!ready && <div className="skel" style={{ height: 80, marginTop: 18 }} />}
      {plan?.warnings.map((w) => <p key={w} className="notice warn"><b>Heads up.</b> {w}</p>)}
      {plan?.blockers.map((b) => <p key={b} className="notice err"><b>Can't open yet.</b> {b}</p>)}
      {plan?.blockers.some((b) => /balance|margin|fund/i.test(b)) && (
        <p className="sub" style={{ marginTop: 10 }}>Deposit test funds with this same wallet on the <a className="link" href="https://testnet.strikefinance.org" target="_blank" rel="noreferrer">Strike testnet app</a>; your balance updates here.</p>
      )}
      <button type="button" className="btn btn-strike" disabled={!plan || plan.blockers.length > 0 || busy || (!!active && spreads.status(active).status === "opening")} onClick={submit}>
        {busy ? "Sending both legs…" : `Open short ${base(short)} / long ${base(long)}`}
      </button>
      {err && <p className="notice err" role="alert"><b>Strike rejected the request.</b> {err}</p>}
      {active && <LegBoard record={active} />}
    </>
  );
}

/** Live leg rows. Explodes once when both legs fill: two strikes and the beam slams level. */
export function LegBoard({ record }: { record: SpreadRecord }) {
  const spreads = useSpreadsCtx();
  const { status, failedLeg } = spreads.status(record);
  const fired = useRef(false);
  const flashRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status !== "open" || fired.current) return;
    fired.current = true;
    strike(1.3); window.setTimeout(() => strike(1.1), 180);
    if (!reducedMotion()) flashRef.current?.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }, [status]);

  const word: Record<string, string> = { idle: "waiting", sending: "sending", pending: "sent, waiting for fill", partial: "partly filled", filled: "filled", rejected: "rejected", no_response: "no response from Strike", closing: "closing", closed: "closed" };
  return (
    <div aria-live="polite">
      <div ref={flashRef} className="flash" aria-hidden />
      <div className="legs">
        {(["short", "long"] as SpreadSide[]).map((s) => {
          const leg = record.legs[s];
          return (
            <div key={s} className="leg-row" data-state={leg.status}>
              <span className="leg-dot" aria-hidden />
              <span>
                <span className="what">{s === "short" ? "Sell" : "Buy"} {base(s === "short" ? record.short : record.long)}</span>
                <span className="meta" style={{ display: "block" }}>{leg.orderId ? `order ${shortId(leg.orderId)}` : shortId(leg.clientId)}{leg.avgPrice > 0 ? ` · ${leg.filledSize} @ ${leg.avgPrice}` : ""}</span>
              </span>
              <span className="state">{word[leg.status] ?? leg.status}</span>
            </div>
          );
        })}
      </div>
      {status === "open" && (
        <p className="notice" style={{ display: "flex", alignItems: "center", gap: 12 }}><Beam z={0} size={34} /> <span><b style={{ color: "var(--strike)" }}>Both legs filled.</b> The spread is open; funding settles every hour on Strike.</span></p>
      )}
      {status === "one_leg" && failedLeg && (
        <div className="notice err" role="alert">
          <b>Only one leg filled.</b> The {failedLeg} leg did not. You hold one side of the spread unhedged.
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-strike btn-sm" onClick={() => spreads.retryLeg(record.id, failedLeg)}>Retry the {failedLeg} leg</button>
            <button type="button" className="btn btn-line btn-sm" onClick={() => spreads.closeLeg(record.id, failedLeg === "short" ? "long" : "short")}>Close the filled leg</button>
          </div>
        </div>
      )}
      {status === "failed" && <p className="notice err" role="alert"><b>Neither leg filled.</b> {record.legs.short.reason || record.legs.long.reason || "Strike did not confirm either order."} Nothing is open.</p>}
    </div>
  );
}
