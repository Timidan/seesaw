import type { BuildTxResponse } from "../api/deposit";
import { EVM_DEPOSIT_CHAIN } from "../api/config";
import { signCardanoTx, type ConnectedWallet } from "../api/wallets";

import { attachCardanoWitness } from "./cardanoCbor";

export async function sendDepositTransaction(transaction: BuildTxResponse, wallet: ConnectedWallet): Promise<string> {
  if (transaction.blockchain !== wallet.chain) throw new Error("Deposit chain does not match wallet");
  if (transaction.format === "evm_tx_params") {
    if (!wallet.api?.request) throw new Error("Wallet cannot send Ethereum transactions");
    // Strike's EVM tx params carry no chain id: make sure the wallet is on the deposit network first.
    await ensureChain(wallet.api, EVM_DEPOSIT_CHAIN);
    if (transaction.approval_tx) {
      const approvalHash: string = await wallet.api.request({ method: "eth_sendTransaction", params: [transaction.approval_tx] });
      let receipt: { status: string } | null = null;
      for (let attempt = 0; attempt < 120 && !receipt; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        receipt = await wallet.api.request({ method: "eth_getTransactionReceipt", params: [approvalHash] });
      }
      if (!receipt || receipt.status !== "0x1") throw new Error("Token approval was not confirmed successfully");
    }
    return wallet.api.request({ method: "eth_sendTransaction", params: [transaction.unsigned_tx] });
  }
  if (transaction.format === "solana_base64") {
    if (Date.now() >= transaction.expires_at * 1000) throw new Error("Solana transaction expired; prepare the deposit again");
    if (!wallet.api?.signAndSendTransaction) throw new Error("Wallet cannot sign and send Solana transactions");
    const bytes = Uint8Array.from(atob(transaction.unsigned_tx), (char) => char.charCodeAt(0));
    const result = await wallet.api.signAndSendTransaction(bytes);
    const signature = typeof result === "string" ? result : result?.signature;
    if (typeof signature !== "string") throw new Error("Solana wallet did not return a signature");
    return signature;
  }
  if (Date.now() >= transaction.expires_at) throw new Error("Cardano transaction expired; prepare the deposit again");
  if (!wallet.api?.submitTx) throw new Error("Wallet does not support CIP-30 submitTx");
  const witnesses = await signCardanoTx(wallet.api, transaction.unsigned_tx);
  return wallet.api.submitTx(attachCardanoWitness(transaction.unsigned_tx, witnesses));
}

async function ensureChain(api: { request: (args: { method: string; params?: unknown[] }) => Promise<any> }, want: { id: string; name: string }) {
  const on = async () => String(await api.request({ method: "eth_chainId" })).toLowerCase();
  if ((await on()) === want.id) return;
  try { await api.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want.id }] }); }
  catch { throw new Error(`Switch your wallet to ${want.name} and try again.`); }
  if ((await on()) !== want.id) throw new Error(`Switch your wallet to ${want.name} and try again.`);
}
