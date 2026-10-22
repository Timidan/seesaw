import { useEffect, useState } from "react";
import { useSession } from "../session/SessionProvider";
import type { SpreadRecord } from "../spread/store";
import { useSpreadsCtx } from "./spreadsContext";
import { LegBoard } from "./OpenPanel";
import { useExecMarks } from "./data";
import { base, signedUsd } from "./format";

/** The user's spreads on this account: live price P&L, funding received since open, close both legs. */
export function MySpreads() {
  const session = useSession();
  const spreads = useSpreadsCtx();
  if (!session.connection || spreads.spreads.length === 0) return null;
  const list = [...spreads.spreads].sort((a, b) => b.openedAt - a.openedAt);
  return (
    <section className="section" id="your-spreads" aria-labelledby="mine" style={{ paddingTop: 72 }}>
      <h2 id="mine">Your spreads</h2>
      <p className="section-sub">Strike testnet, account {session.connection.accountId.slice(0, 8)}. Funding is read from your Strike funding history since each spread opened.</p>
      <div style={{ marginTop: 22, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {list.map((r) => <SpreadCard key={r.id} record={r} />)}
      </div>
    </section>
  );
}

function SpreadCard({ record }: { record: SpreadRecord }) {
  const spreads = useSpreadsCtx();
  const marks = useExecMarks([record.short, record.long]);
  const [pnl, setPnl] = useState<Awaited<ReturnType<typeof spreads.pnl>> | null>(null);
  const [pnlError, setPnlError] = useState("");
  const [closing, setClosing] = useState(false);
  const { status } = spreads.status(record);
  const live = status === "open" || status === "one_leg";

  useEffect(() => {
    if (!(marks[record.short] > 0 && marks[record.long] > 0)) return;
    let alive = true;
    spreads.pnl(record.id, marks).then((p) => { if (alive) { setPnl(p); setPnlError(""); } }, (e) => alive && setPnlError(String((e as Error)?.message ?? e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, marks[record.short], marks[record.long], status]);

  const tone = (v: number) => ({ color: v > 0 ? "var(--strike)" : v < 0 ? "var(--oxide)" : "var(--fg)" });
  return (
    <article className="panel" style={{ padding: 18 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h3 style={{ fontSize: 18, fontWeight: 800 }}>short {base(record.short)} / long {base(record.long)}</h3>
        <span className="muted">{status.replace("_", " ")}</span>
      </header>
      <p className="sub" style={{ color: "var(--fg-3)", fontSize: 13 }}>${record.notionalPerLeg} each leg · {record.leverage}× · opened {new Date(record.openedAt).toUTCString().slice(5, 22)} UTC</p>
      {pnl && (
        <dl className="kv">
          <div><dt>Price P&L</dt><dd style={tone(pnl.total.price)}>{signedUsd(pnl.total.price)}</dd></div>
          <div><dt>Funding received</dt><dd style={tone(pnl.total.funding)}>{signedUsd(pnl.total.funding)}</dd></div>
          <div><dt>Fees paid</dt><dd>{signedUsd(-Math.abs(pnl.total.fees))}</dd></div>
          <div><dt><b>Net</b></dt><dd style={{ ...tone(pnl.total.net), fontWeight: 700 }}>{signedUsd(pnl.total.net)}</dd></div>
        </dl>
      )}
      {!pnl && pnlError && <p className="notice">P&amp;L is not available yet: {pnlError}</p>}
      <LegBoard record={record} />
      {live && (
        <button type="button" className="btn btn-line" style={{ width: "100%", marginTop: 14 }} disabled={closing}
          onClick={async () => { setClosing(true); try { await spreads.close(record.id); } finally { setClosing(false); } }}>
          {closing ? "Closing both legs…" : "Close both legs"}
        </button>
      )}
    </article>
  );
}
