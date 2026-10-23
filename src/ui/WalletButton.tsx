import { useEffect, useRef, useState, type RefObject } from "react";
import type { SupportedChain, WalletInfo } from "../api/wallets";
import { useSession } from "../session/SessionProvider";
import { useBuilderConnect } from "../session/useBuilderConnect";
import { shortId, usd } from "./format";
import "./wallet.css";

// The picker is one <dialog> owned by the header button. Anything else (the order panel) opens it by event.
const OPEN_EVENT = "seesaw:connect-wallet";
export const openWalletModal = () => window.dispatchEvent(new Event(OPEN_EVENT));

const GROUPS: { chain: SupportedChain; label: string }[] = [
  { chain: "cardano", label: "Cardano" }, { chain: "ethereum", label: "Ethereum" }, { chain: "solana", label: "Solana" },
];

function WalletIcon({ icon, chain }: { icon?: string; chain: SupportedChain }) {
  return icon ? <img className="wb-ico" src={icon} alt="" width={20} height={20} /> : <span className="wb-ico wb-ico-fb" aria-hidden>{chain[0].toUpperCase()}</span>;
}

export function WalletButton() {
  const { connection } = useSession();
  const c = useBuilderConnect();
  const dlg = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const open = () => { c.refresh(); if (dlg.current && !dlg.current.open) dlg.current.showModal(); };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Connected: the picker is done. (The browser returns focus to whatever opened it.)
  useEffect(() => { if (connection) dlg.current?.close(); }, [connection]);
  // The panel's Connect button leaves the page on success, so focus would fall to <body>.
  const onClose = () => { if (document.activeElement === document.body) trigger.current?.focus(); };
  const close = () => dlg.current?.close();

  return (
    <div className="wb">
      {connection
        ? <Account address={connection.address} icon={c.wallets.find((w) => w.id === connection.wallet.walletId && w.chain === connection.chain)?.icon} chain={connection.chain} trigger={trigger} />
        : <>
          <span className="net-chip" title="Orders go to Strike testnet. Rankings use Strike mainnet data."><i aria-hidden /> <span className="long">Orders: Strike testnet</span><span className="short">Testnet</span></span>
          <button ref={trigger} type="button" className="btn btn-line btn-sm" onClick={openWalletModal}>Connect wallet</button>
        </>}
      <dialog ref={dlg} className="wm" aria-labelledby="wm-title" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="wm-in">
          <div className="wm-head">
            <h2 id="wm-title" className="h-sec">Connect a wallet</h2>
            <button type="button" className="wm-x" aria-label="Close" onClick={close}>×</button>
          </div>
          {c.wallets.length === 0
            ? <p className="notice">No wallet found in this browser. Install <a className="link" href="https://www.lace.io" target="_blank" rel="noreferrer">Lace</a> for Cardano or <a className="link" href="https://rabby.io" target="_blank" rel="noreferrer">Rabby</a> for Ethereum, then reload.</p>
            : GROUPS.map((g) => {
              const list = c.wallets.filter((w: WalletInfo) => w.chain === g.chain);
              return list.length > 0 && (
                <section key={g.chain} aria-labelledby={`wm-${g.chain}`}>
                  <h3 id={`wm-${g.chain}`} className="wm-group">{g.label}</h3>
                  <ul className="wm-list">
                    {list.map((w) => (
                      <li key={w.id}>
                        <button type="button" className="btn btn-line wm-wallet" disabled={!!c.connectingWalletId} aria-busy={c.connectingWalletId === w.id} onClick={() => c.connect(w.id, w.chain)}>
                          <WalletIcon icon={w.icon} chain={w.chain} /> {w.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          <p className="wm-status" aria-live="polite">{c.status}</p>
          {c.error && <p className="notice err" role="alert"><b>Could not connect.</b> {c.error}</p>}
          <p className="wm-trust">One signature. Seesaw can trade for this account on Strike testnet but cannot withdraw.</p>
        </div>
      </dialog>
    </div>
  );
}

/** Connected state: the menu carries the network (the header chip shows only before connecting). Wallet icon and short address; click for the address, balance and Disconnect. */
function Account({ address, icon, chain, trigger }: { address: string; icon?: string; chain: SupportedChain; trigger: RefObject<HTMLButtonElement> }) {
  const { account, disconnect } = useSession();
  const [open, setOpen] = useState(false), [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open, trigger]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <div ref={wrap} className="wb-account">
      <button ref={trigger} type="button" className="btn btn-line btn-sm wb-btn" aria-haspopup="dialog" aria-expanded={open} aria-label={`Wallet ${shortId(address)}`} onClick={() => setOpen(!open)}>
        <WalletIcon icon={icon} chain={chain} /> <span className="mono">{shortId(address)}</span>
      </button>
      {open && (
        <div className="wb-menu" role="dialog" aria-label="Wallet">
          <div className="wb-addr">
            <span className="mono" title={address}>{shortId(address)}</span>
            <button type="button" className="wb-copy" aria-label="Copy address" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            <span className="sr-only" aria-live="polite">{copied ? "Address copied" : ""}</span>
          </div>
          <dl className="kv">
            <div><dt>Network</dt><dd>Strike testnet</dd></div>
            <div><dt>Available</dt><dd>{account?.available_balance != null ? usd(Number(account.available_balance)) : "—"}</dd></div>
          </dl>
          <button type="button" className="btn btn-line btn-sm" onClick={() => { setOpen(false); disconnect(); }}>Disconnect</button>
        </div>
      )}
    </div>
  );
}
