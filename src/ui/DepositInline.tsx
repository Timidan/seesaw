import { useState } from "react";
import type { ConnectedWallet } from "../api/wallets";
import { EVM_DEPOSIT_CHAIN } from "../api/config";
import { useDeposit } from "../session/useDeposit";
import { shortId, usd } from "./format";

const ASSETS: Record<string, { symbol: string; decimals: number }[]> = {
  ethereum: [{ symbol: "USDC", decimals: 6 }], // Strike testnet rejects ETH ("unsupported asset")
  solana: [{ symbol: "USDC", decimals: 6 }, { symbol: "SOL", decimals: 9 }],
  cardano: [{ symbol: "ADA", decimals: 6 }],
};

/** "12.5" with 6 decimals -> "12500000", exact (no floating point). Empty string if invalid. */
function toAtomic(text: string, decimals: number): string {
  const m = text.trim().match(/^(\d*)(?:\.(\d*))?$/);
  if (!m || (!m[1] && !m[2])) return "";
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  const atomic = BigInt((m[1] || "0") + frac);
  return atomic > 0n ? atomic.toString() : "";
}

/** Deposit test funds without leaving the spread: quote, wallet signs, Strike credits the account. */
export function DepositInline({ wallet }: { wallet: ConnectedWallet }) {
  const d = useDeposit(wallet);
  const assets = ASSETS[wallet.chain] ?? [];
  const [asset, setAsset] = useState(assets[0]?.symbol ?? "");
  const [amount, setAmount] = useState("");
  const dec = assets.find((a) => a.symbol === asset)?.decimals ?? 6;
  const atomic = toAtomic(amount, dec);
  const busy = d.status === "quoting" || d.status === "submitting";

  return (
    <div className="deposit">
      <p className="sub" style={{ color: "var(--fg-2)" }}>Add funds to this Strike account from your {wallet.chain} wallet.</p>
      {wallet.chain === "ethereum" && EVM_DEPOSIT_CHAIN.id === "0xaa36a7" && (
        <p className="sub">Testnet takes USDC on Sepolia. Get free test USDC at <a className="link" href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a>; your wallet switches to Sepolia when you deposit.</p>
      )}
      <div className="deposit-row">
        {assets.length > 1 && (
          <div className="seg" role="group" aria-label="Asset" style={{ gridTemplateColumns: `repeat(${assets.length}, 1fr)` }}>
            {assets.map((a) => <button key={a.symbol} type="button" aria-pressed={asset === a.symbol} onClick={() => setAsset(a.symbol)}>{a.symbol}</button>)}
          </div>
        )}
        <label className="sr-only" htmlFor="dep-amt">Amount in {asset}</label>
        <input id="dep-amt" className="input" inputMode="decimal" placeholder={`Amount in ${asset}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {d.status !== "ready" && d.status !== "pending" && (
        <button type="button" className="btn btn-line" disabled={!atomic || busy} onClick={() => d.prepare(asset, atomic)}>
          {d.status === "quoting" ? "Getting a quote…" : "Get deposit quote"}
        </button>
      )}
      {d.quote && d.status === "ready" && (
        <>
          <p className="notice">Credits about <b>{usd(Number(d.quote.quote.usd_value))}</b> after {d.quote.confirmations_required} confirmations. Strike's minimum is $5.</p>
          <button type="button" className="btn btn-strike" disabled={busy} onClick={() => d.submit()}>Deposit {amount} {asset} with your wallet</button>
        </>
      )}
      {d.status === "submitting" && <p className="sub" aria-live="polite">Waiting for your wallet and the chain…</p>}
      {d.status === "pending" && d.confirmation && (
        <p className="notice" aria-live="polite"><b style={{ color: "var(--strike)" }}>Deposit sent.</b> Transaction <span className="mono">{shortId(d.confirmation.tx_hash)}</span>. Your balance updates here when Strike credits it.</p>
      )}
      {d.error && <p className="notice err" role="alert"><b>Deposit did not go through.</b> {d.error}</p>}
    </div>
  );
}
