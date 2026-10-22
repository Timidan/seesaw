import { API_BASE_URL } from "../api/config";
import type { PositionResponse } from "../types/position";

export interface PublicFill {
  symbol: string;
  side: "buy" | "sell";
  size: string;
  price: string;
  order_id: number;
  timestamp: number;
}

export interface PublicFunding {
  symbol: string;
  amount: string;
  timestamp: number;
}

async function publicHistory<T>(path: string, accountId: string): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  url.searchParams.set("account_id", accountId);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

export async function getPublicPositions(accountId: string): Promise<PositionResponse[]> {
  const data = await publicHistory<{ positions: PositionResponse[] | null }>("/v2/positions", accountId);
  return data.positions ?? [];
}

export async function getPublicFills(accountId: string): Promise<PublicFill[]> {
  const data = await publicHistory<{ fills: PublicFill[] | null }>("/v2/history/fill", accountId);
  return data.fills ?? [];
}

export async function getPublicFunding(accountId: string): Promise<PublicFunding[]> {
  const data = await publicHistory<{ funding: PublicFunding[] | null }>("/v2/history/funding", accountId);
  return data.funding ?? [];
}
