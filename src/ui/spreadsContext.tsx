import { createContext, useContext, type ReactNode } from "react";
import { useSpreads, type SpreadsHook } from "../spread/useSpreads";

// One useSpreads() instance for the whole app: it owns records, the user-stream
// subscription and localStorage writes, so a second instance would fork state.
const Ctx = createContext<SpreadsHook | null>(null);

export function SpreadsProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useSpreads()}>{children}</Ctx.Provider>;
}

export function useSpreadsCtx(): SpreadsHook {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSpreadsCtx requires SpreadsProvider");
  return v;
}
