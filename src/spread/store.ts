import type { LegState } from "./legs";
import type { SpreadSide } from "./plan";

export type SpreadRecord = { id: string; short: string; long: string; notionalPerLeg: number; leverage: number; openedAt: number; legs: Record<SpreadSide, LegState>; marginModeConfirmed: Record<SpreadSide, boolean>; closedAt?: number };
const key = (accountId: string) => `seesaw:spreads:${accountId}`;

export function loadSpreads(accountId: string): SpreadRecord[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key(accountId)) || "[]");
    return Array.isArray(data) ? data.filter((item) => item && typeof item.id === "string" && item.legs?.short && item.legs?.long) : [];
  } catch { return []; }
}

export function saveSpreads(accountId: string, records: SpreadRecord[]): void {
  localStorage.setItem(key(accountId), JSON.stringify(records));
}
