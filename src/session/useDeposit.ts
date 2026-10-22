import { useState } from "react";
import { buildDepositTx, confirmDeposit, getDepositQuote, type BuildTxResponse, type DepositConfirmResponse, type DepositQuoteResponse } from "../api/deposit";
import { connectWallet, getCardanoUtxos, type ConnectedWallet } from "../api/wallets";
import { sendDepositTransaction } from "./senders";

export type DepositHook = { quote: DepositQuoteResponse | null; transaction: BuildTxResponse | null; confirmation: DepositConfirmResponse | null; status: "idle" | "quoting" | "ready" | "submitting" | "pending"; error: string; prepare: (asset: string, atomicAmount: string) => Promise<void>; submit: (sendTransaction?: (transaction: BuildTxResponse, wallet: ConnectedWallet) => Promise<string>) => Promise<void>; confirm: (txHash: string) => Promise<void> };

// After a reload the session is restored without the wallet's provider object; get it back (no new signature).
const withApi = async (w: ConnectedWallet) => (w.api ? w : connectWallet(w.chain, w.walletId));

export function useDeposit(wallet: ConnectedWallet): DepositHook {
  const [quote, setQuote] = useState<DepositQuoteResponse | null>(null), [transaction, setTransaction] = useState<BuildTxResponse | null>(null);
  const [confirmation, setConfirmation] = useState<DepositConfirmResponse | null>(null);
  const [status, setStatus] = useState<DepositHook["status"]>("idle"), [error, setError] = useState("");
  const prepare = async (asset: string, atomicAmount: string) => {
    if (!/^[1-9]\d*$/.test(atomicAmount)) { setError("Enter a positive amount in the asset's smallest unit."); return; }
    setError(""); setQuote(null); setTransaction(null); setConfirmation(null); setStatus("quoting");
    try {
      const nextQuote = await getDepositQuote({ blockchain: wallet.chain, asset_symbol: asset, asset_amount: atomicAmount });
      const nextTransaction = await buildDepositTx({ request_id: nextQuote.request_id, user_address: wallet.address, ...(wallet.chain === "cardano" ? { utxos: await getCardanoUtxos((await withApi(wallet)).api) } : {}) });
      setQuote(nextQuote); setTransaction(nextTransaction); setStatus("ready");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Deposit preparation failed"); setStatus("idle"); }
  };
  const confirm = async (txHash: string) => {
    if (!quote || txHash.trim().length < 10) { setError("A quote and transaction hash are required."); return; }
    setError(""); setStatus("submitting");
    try { setConfirmation(await confirmDeposit({ request_id: quote.request_id, tx_hash: txHash.trim() })); setStatus("pending"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Deposit confirmation failed"); setStatus("ready"); }
  };
  const submit = async (sendTransaction?: (transaction: BuildTxResponse, wallet: ConnectedWallet) => Promise<string>) => {
    if (!transaction) { setError("Prepare a deposit first."); return; }
    if (quote && Date.now() >= quote.quote.expiration_at) { setError("Deposit quote expired. Request a new quote."); return; }
    setError(""); setStatus("submitting");
    try {
      const txHash = await (sendTransaction ?? sendDepositTransaction)(transaction, await withApi(wallet));
      await confirm(txHash);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Wallet submission failed"); setStatus("ready"); }
  };
  return { quote, transaction, confirmation, status, error, prepare, submit, confirm };
}
