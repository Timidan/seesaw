import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { clearApiWalletKeys } from "../api/auth";
import type { ConnectedWallet, SupportedChain } from "../api/wallets";
import { useUserStream } from "../hooks/useUserStream";
import type { BuilderConnectResult } from "../types/account";

export type SessionConnection = { result: BuilderConnectResult; wallet: ConnectedWallet; accountId: string; chain: SupportedChain; address: string; builderCode: string; feeShareBps: number };
export type Session = ReturnType<typeof useUserStream> & { connection: SessionConnection | null; wallet: ConnectedWallet | null; connectSession: (connection: SessionConnection) => void; disconnect: () => void };
const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<SessionConnection | null>(null);
  const data = useUserStream(connection?.accountId ?? null);
  const disconnect = () => { clearApiWalletKeys(); setConnection(null); };
  useEffect(() => { window.addEventListener("strike:session-expired", disconnect); return () => window.removeEventListener("strike:session-expired", disconnect); }, []);
  return createElement(Context.Provider, { value: { ...data, connection, wallet: connection?.wallet ?? null, connectSession: setConnection, disconnect } }, children);
}

export function useSession(): Session {
  const session = useContext(Context);
  if (!session) throw new Error("useSession requires SessionProvider");
  return session;
}
