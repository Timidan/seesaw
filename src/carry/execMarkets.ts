import { PRICE_API_URL } from "../api/config";
import type { ExchangeSymbol } from "./data";

export async function getExecutionMarkets(): Promise<ExchangeSymbol[]> {
  const response = await fetch(`${PRICE_API_URL}/v2/exchangeInfo`);
  if (!response.ok) throw new Error(`Execution markets failed: ${response.status}`);
  const data: { symbols?: ExchangeSymbol[] } = await response.json();
  if (!Array.isArray(data.symbols)) throw new Error("Invalid execution exchangeInfo");
  return data.symbols.filter((symbol) => symbol.status.toUpperCase() === "TRADING");
}

export function isTradable(short: string, long: string, markets: ExchangeSymbol[]): boolean {
  return short !== long && [short, long].every((symbol) => markets.some((market) => market.symbol === symbol));
}
