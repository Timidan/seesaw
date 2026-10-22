import { useEffect, useState } from "react";
import { generateApiWalletKeys, storeApiWalletKeys } from "../api/auth";
import { requestSignature, verifySignature } from "../api/builderConnect";
import { BUILDER_CODE, BUILDER_FEE_BPS } from "../api/config";
import { connectWallet, detectInstalledWallets, signMessage, type SupportedChain, type WalletInfo } from "../api/wallets";
import { useSession } from "./SessionProvider";

export type BuilderConnectHook = { wallets: WalletInfo[]; chain: SupportedChain; setChain: (chain: SupportedChain) => void; builderCode: string; setBuilderCode: (code: string) => void; status: string; error: string; connectingWalletId: string | null; connect: (walletId: string) => Promise<void> };

export function useBuilderConnect(): BuilderConnectHook {
  const { connectSession } = useSession();
  const [wallets, setWallets] = useState<WalletInfo[]>([]), [chain, setChain] = useState<SupportedChain>("cardano");
  const [builderCode, setBuilderCode] = useState(BUILDER_CODE), [status, setStatus] = useState(""), [error, setError] = useState("");
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => setWallets(detectInstalledWallets()), 500); return () => clearTimeout(timer); }, []);
  const connect = async (walletId: string) => {
    if (!builderCode.trim()) { setError("Enter a builder code."); return; }
    setError(""); setConnectingWalletId(walletId);
    try {
      setStatus("Connecting to wallet...");
      const wallet = await connectWallet(chain, walletId);
      const keys = generateApiWalletKeys();
      setStatus("Requesting challenge...");
      const challenge = await requestSignature({ address: wallet.address, chain, publicKey: keys.publicKey, builderCode: builderCode.trim(), feeShareBps: BUILDER_FEE_BPS });
      setStatus("Sign the message in your wallet...");
      const signature = await signMessage(wallet, challenge.message_to_sign);
      setStatus("Verifying...");
      const result = await verifySignature({ nonce: challenge.nonce, walletSignature: signature });
      storeApiWalletKeys(keys);
      connectSession({ result, wallet, accountId: result.account_id, chain, address: wallet.address, builderCode: result.builder_code, feeShareBps: result.fee_share_bps });
      setStatus("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection failed"); setStatus(""); }
    finally { setConnectingWalletId(null); }
  };
  return { wallets: wallets.filter((wallet) => wallet.chain === chain), chain, setChain, builderCode, setBuilderCode, status, error, connectingWalletId, connect };
}
