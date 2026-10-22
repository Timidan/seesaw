import type { FundingPoint, PricePoint } from "./math";

export const MAINNET_PRICE = "https://api.strikefinance.org/price/v2";
const MAINNET_FUNDING = "https://api.strikefinance.org/stat/v1/stats/coin/history/funding";

export type ExchangeSymbol = {
  symbol: string;
  status: string;
  filters: { filterType: string; stepSize?: string; minQty?: string; notional?: string }[];
};
export type Premium = { symbol: string; markPrice: string; fundingRate: string };
export type SymbolHistory = { prices: PricePoint[]; funding: FundingPoint[] };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, typeof window === "undefined" ? { headers: { "User-Agent": "Mozilla/5.0" } } : undefined);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json() as Promise<T>;
}

export async function getExchangeInfo(base = MAINNET_PRICE): Promise<ExchangeSymbol[]> {
  const result = await getJson<{ symbols: ExchangeSymbol[] }>(`${base}/exchangeInfo`);
  if (!Array.isArray(result.symbols)) throw new Error("Invalid exchangeInfo response");
  return result.symbols;
}

export async function getPremiumIndex(): Promise<Premium[]> {
  const result = await getJson<Premium[]>(`${MAINNET_PRICE}/premiumIndex`);
  if (!Array.isArray(result)) throw new Error("Invalid premiumIndex response");
  return result;
}

export async function getKlines(symbol: string): Promise<PricePoint[]> {
  const params = new URLSearchParams({ symbol, interval: "1h", limit: "720", priceType: "mark" });
  const rows = await getJson<(string | number)[][]>(`${MAINNET_PRICE}/klines?${params}`);
  if (!Array.isArray(rows)) throw new Error(`Invalid klines for ${symbol}`);
  return rows.map((row) => ({ time: Number(row[0]), close: Number(row[4]) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.close) && point.close > 0);
}

export async function getFundingHistory(symbol: string): Promise<FundingPoint[]> {
  const params = new URLSearchParams({ symbol, days: "30" });
  const result = await getJson<{ columns: string[]; data: (string | number)[][] }>(`${MAINNET_FUNDING}?${params}`);
  if (!Array.isArray(result.data)) throw new Error(`Invalid funding history for ${symbol}`);
  return result.data.map((row) => ({ time: Number(row[0]), rate: Number(row[1]) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.rate))
    .sort((a, b) => a.time - b.time);
}

export async function getSymbolHistory(symbol: string): Promise<SymbolHistory> {
  const [prices, funding] = await Promise.all([getKlines(symbol), getFundingHistory(symbol)]);
  return { prices, funding };
}

export async function getAllHistories(symbols: string[]): Promise<Record<string, SymbolHistory>> {
  const result: Record<string, SymbolHistory> = {};
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, symbols.length) }, async () => {
    while (next < symbols.length) {
      const symbol = symbols[next++];
      result[symbol] = await getSymbolHistory(symbol);
    }
  }));
  return result;
}
