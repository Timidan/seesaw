import { useEffect, useState } from "react";
import { getFundingHistory, getKlines, getPremiumIndex } from "../carry/data";
import type { FundingPoint, PricePoint } from "../carry/math";
import type { Snapshot } from "../carry/snapshot";
import { PRICE_API_URL } from "../api/config";
import type { ExchangeSymbol } from "../carry/data";
import { getExecutionMarkets } from "../carry/execMarkets";

// UI glue: cached loaders over Codex's public-data fetchers. No logic beyond caching.
const cache = new Map<string, Promise<unknown>>();
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key) as Promise<T>;
}

export type Load<T> = { data?: T; error?: string };

function useLoad<T>(key: string | null, fn: () => Promise<T>): Load<T> {
  const [state, setState] = useState<Load<T>>({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    setState({});
    once(key, fn).then((data) => live && setState({ data }), (e) => live && setState({ error: String(e?.message ?? e) }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export const useSnapshot = () =>
  useLoad<Snapshot>("snapshot", async () => {
    const r = await fetch("/snapshot.json");
    if (!r.ok) throw new Error(`snapshot ${r.status}`);
    return r.json();
  });

export const useFunding = (symbol: string | null) =>
  useLoad<FundingPoint[]>(symbol && `funding:${symbol}`, () => getFundingHistory(symbol!));

export const useKlines = (symbol: string | null) =>
  useLoad<PricePoint[]>(symbol && `klines:${symbol}`, () => getKlines(symbol!));

/** Mark prices on the execution network (testnet by default), refreshed every 5 s while mounted. */
export function useExecMarks(symbols: string[]) {
  const [marks, setMarks] = useState<Record<string, number>>({});
  const key = symbols.join(",");
  useEffect(() => {
    if (!key) return;
    let live = true;
    const pull = () => fetch(`${PRICE_API_URL}/v2/premiumIndex`).then((r) => r.json()).then((rows: { symbol: string; markPrice: string }[]) => {
      if (live && Array.isArray(rows)) setMarks(Object.fromEntries(rows.filter((r) => key.split(",").includes(r.symbol)).map((r) => [r.symbol, Number(r.markPrice)])));
    }).catch(() => {});
    pull();
    const t = window.setInterval(pull, 5000);
    return () => { live = false; window.clearInterval(t); };
  }, [key]);
  return marks;
}

/** Current hourly funding per symbol (annualised %), live from Strike mainnet. */
export const useLiveFunding = () =>
  useLoad<Record<string, number>>("premium", async () => {
    const rows = await getPremiumIndex();
    return Object.fromEntries(rows.map((r) => [r.symbol, Number(r.fundingRate) * 24 * 365 * 100]));
  });

/** Execution-network markets that can actually fill a small market order: listed AND with bids and asks
 *  worth at least $40 in the top five levels. Testnet lists ADA with an empty book, for example. */
export const useExecMarkets = () =>
  useLoad<ExchangeSymbol[]>("exec-markets", async () => {
    const listed = await getExecutionMarkets();
    const ok = await Promise.all(listed.map(async (m) => {
      try {
        const r = await fetch(`${PRICE_API_URL}/v2/depth?symbol=${m.symbol}&limit=5`);
        const d = await r.json() as { bids?: [string, string][]; asks?: [string, string][] };
        const usd = (rows?: [string, string][]) => (rows ?? []).slice(0, 5).reduce((a, [p, q]) => a + Number(p) * Number(q), 0);
        return usd(d.bids) >= 40 && usd(d.asks) >= 40;
      } catch { return false; }
    }));
    return listed.filter((_, i) => ok[i]);
  });
