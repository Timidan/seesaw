import { useEffect, useState } from "react";
import { generateApiWalletKeys, storeApiWalletKeys } from "../api/auth";
import { requestSignature, verifySignature } from "../api/builderConnect";
import { BUILDER_CODE, BUILDER_FEE_BPS } from "../api/config";
import { connectWallet, detectInstalledWallets, signMessage, type SupportedChain, type WalletInfo } from "../api/wallets";
import { useSession } from "./SessionProvider";

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
// Strike's connect errors, in words a user can act on.
const plain = (message: string, address: string) =>
  /own builder code/i.test(message)
    ? `${short(address)} owns the Seesaw builder code, and Strike does not let a builder trade through its own code. Switch to another address in your wallet and connect again.`
    : message;

export type BuilderConnectHook = { wallets: WalletInfo[]; refresh: () => void; status: string; error: string; connectingWalletId: string | null; connect: (walletId: string, chain: SupportedChain) => Promise<void> };

/** Wallets from every chain, and the connect flow: wallet, one signature for Strike Builder Connect, then the session. */
export function useBuilderConnect(): BuilderConnectHook {
  const { connectSession } = useSession();
  const [wallets, setWallets] = useState<WalletInfo[]>([]), [status, setStatus] = useState(""), [error, setError] = useState("");
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  // Extensions inject late: look shortly after load, and again whenever the picker opens (refresh).
  useEffect(() => { const timer = setTimeout(() => setWallets(detectInstalledWallets()), 500); return () => clearTimeout(timer); }, []);
  const refresh = () => { setWallets(detectInstalledWallets()); setError(""); };
  const connect = async (walletId: string, chain: SupportedChain) => {
    setError(""); setConnectingWalletId(walletId);
    let address = "";
    try {
      setStatus("Connecting to your wallet…");
      const wallet = await connectWallet(chain, walletId, true);
      address = wallet.address;
      const keys = generateApiWalletKeys();
      setStatus("Preparing the message…");
      const challenge = await requestSignature({ address: wallet.address, chain, publicKey: keys.publicKey, builderCode: BUILDER_CODE, feeShareBps: BUILDER_FEE_BPS });
      setStatus(`Sign the message in your wallet with ${short(wallet.address)}…`);
      const signature = await signMessage(wallet, challenge.message_to_sign);
      setStatus("Verifying…");
      const result = await verifySignature({ nonce: challenge.nonce, walletSignature: signature });
      storeApiWalletKeys(keys);
      connectSession({ result, wallet, accountId: result.account_id, chain, address: wallet.address, builderCode: result.builder_code, feeShareBps: result.fee_share_bps });
      setStatus("");
    } catch (cause) { setError(cause instanceof Error ? plain(cause.message, address) : "Connection failed"); setStatus(""); }
    finally { setConnectingWalletId(null); }
  };
  return { wallets, refresh, status, error, connectingWalletId, connect };
}
