import type { BuildTxResponse } from "../api/deposit";
import { signCardanoTx, type ConnectedWallet } from "../api/wallets";

import { attachCardanoWitness } from "./cardanoCbor";

export async function sendDepositTransaction(transaction: BuildTxResponse, wallet: ConnectedWallet): Promise<string> {
  if (transaction.blockchain !== wallet.chain) throw new Error("Deposit chain does not match wallet");
  if (transaction.format === "evm_tx_params") {
    if (!wallet.api?.request) throw new Error("Wallet cannot send Ethereum transactions");
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
