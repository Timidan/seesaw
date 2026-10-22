import { API_BASE_URL, DEMO_ACCOUNT_ID } from "../api/config";
import { usePublicSpread } from "../spread/usePublicSpread";
import { Beam } from "./bits";
import { Coin } from "./Coin";
import { base, shortId, signedUsd, usd } from "./format";

/** A real spread on Strike testnet, read from public endpoints. Proof for visitors without a wallet. */
export function LiveSpread() {
  const live = usePublicSpread(DEMO_ACCOUNT_ID || null);
  if (!DEMO_ACCOUNT_ID) return null;
  const legs = live.legs.slice(0, 2);
  const price = live.legs.reduce((a, l) => a + l.unrealizedPnl, 0);
  const funding = (live.funding ?? []).reduce((a, f) => a + f.amount, 0);
  const proof = `${API_BASE_URL}/v2/positions?account_id=${DEMO_ACCOUNT_ID}`;
  const tone = (v: number) => ({ color: v > 0 ? "var(--strike)" : v < 0 ? "var(--oxide)" : "var(--fg)" });

  return (
    <section className="section live" aria-labelledby="live-title">
      <div className="wrap">
        <div className="section-head">
          <div>
            <h2 id="live-title" className="display">Live right now</h2>
            <p className="section-sub">One real spread on Strike testnet, opened with Seesaw. Read from Strike's public API every 15 seconds.</p>
          </div>
          <a className="link mono" href={proof} target="_blank" rel="noreferrer">Check it on Strike's API ↗</a>
        </div>
        {live.error && <p className="notice err" role="alert"><b>Could not read the demo account.</b> {live.error}</p>}
        {!live.updatedAt && !live.error && <div className="skel" style={{ height: 160 }} />}
        {live.updatedAt && (
          <div className="live-grid">
            <div className="live-legs">
              {legs.length === 0 && <p className="empty">No open spread on the demo account right now.</p>}
              {legs.map((l) => (
                <div key={l.symbol} className="live-leg">
                  <span className={`live-side ${l.side}`}>{l.side}</span>
                  <span className="live-sym display"><Coin sym={l.symbol} size={30} /> {base(l.symbol)}</span>
                  <span className="num">{l.size} @ {l.entryPrice}</span>
                  <span className="num muted">now {l.markPrice}</span>
                  <span className="num" style={tone(l.unrealizedPnl)}>{signedUsd(l.unrealizedPnl)}</span>
                </div>
              ))}
              {legs.length === 2 && <div className="live-beam"><Beam z={0} size={64} /></div>}
            </div>
            <dl className="live-totals">
              <div><dt>Price P&amp;L</dt><dd className="num" style={tone(price)}>{signedUsd(price)}</dd></div>
              <div><dt>Funding received</dt><dd className="num" style={tone(funding)}>{signedUsd(funding, 4)}</dd></div>
              <div><dt>Net</dt><dd className="num display" style={tone(price + funding)}>{signedUsd(price + funding)}</dd></div>
            </dl>
            <ol className="live-fills" aria-label="Recent fills">
              {live.fills.slice(0, 4).map((f) => (
                <li key={`${f.orderId}-${f.time}`}>
                  <span className="mono muted">{new Date(f.time).toISOString().slice(5, 16).replace("T", " ")}</span>
                  <span>{f.side === "sell" ? "Sold" : "Bought"} {f.size} {base(f.symbol)} at {usd(f.price, f.price < 10 ? 4 : 2)}</span>
                  <span className="mono muted">order {shortId(f.orderId)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="note">Account <span className="mono">{shortId(DEMO_ACCOUNT_ID)}</span>{live.updatedAt ? ` · updated ${new Date(live.updatedAt).toISOString().slice(11, 19)} UTC` : ""}</p>
      </div>
    </section>
  );
}
