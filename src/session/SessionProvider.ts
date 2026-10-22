import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { clearApiWalletKeys, loadApiWalletKeys } from "../api/auth";
import type { ConnectedWallet, SupportedChain } from "../api/wallets";
import { useUserStream } from "../hooks/useUserStream";
import type { BuilderConnectResult } from "../types/account";

export type SessionConnection = { result: BuilderConnectResult; wallet: ConnectedWallet; accountId: string; chain: SupportedChain; address: string; builderCode: string; feeShareBps: number };
export type Session = ReturnType<typeof useUserStream> & { connection: SessionConnection | null; wallet: ConnectedWallet | null; connectSession: (connection: SessionConnection) => void; disconnect: () => void };
const Context = createContext<Session | null>(null);

// The connection survives a reload in this tab, alongside the API wallet key (see api/auth.ts). The wallet's
// provider object cannot be stored; deposits re-acquire it when the user starts one.
const SESSION_STORE = "seesaw:session";
function savedConnection(): SessionConnection | null {
  try {
    if (!loadApiWalletKeys()) return null;
    const s = JSON.parse(sessionStorage.getItem(SESSION_STORE) || "null");
    return s ? { ...s, wallet: { chain: s.chain, walletId: s.walletId, address: s.address, api: null } } : null;
  } catch { return null; }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<SessionConnection | null>(savedConnection);
  const data = useUserStream(connection?.accountId ?? null);
  const connectSession = (c: SessionConnection) => {
    try { const { wallet, ...rest } = c; sessionStorage.setItem(SESSION_STORE, JSON.stringify({ ...rest, walletId: wallet.walletId })); } catch { /* memory only */ }
    setConnection(c);
  };
  const disconnect = () => { clearApiWalletKeys(); try { sessionStorage.removeItem(SESSION_STORE); } catch { /* memory only */ } setConnection(null); };
  useEffect(() => { window.addEventListener("strike:session-expired", disconnect); return () => window.removeEventListener("strike:session-expired", disconnect); }, []);
  return createElement(Context.Provider, { value: { ...data, connection, wallet: connection?.wallet ?? null, connectSession, disconnect } }, children);
}

export function useSession(): Session {
  const session = useContext(Context);
  if (!session) throw new Error("useSession requires SessionProvider");
  return session;
}
