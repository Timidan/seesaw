import { authenticatedFetch, throwApiError } from "../api/auth";
import { getSymbols } from "../api/account";
import { API_BASE_URL, BUILDER_FEE_BPS } from "../api/config";
import { updateLeverage, updateMarginMode } from "../api/orders";
import type { CreateOrderRequest } from "../types/order";
import type { SpreadPlan, SpreadSide } from "./plan";
import type { SpreadRecord } from "./store";
import type { BatchResult, LegState } from "./legs";
import type { FundingHistoryRow } from "./pnl";

export type SpreadSubmission = { record: SpreadRecord; response: BatchResult };
const sides: SpreadSide[] = ["short", "long"];
const newLeg = (clientId: string, requestedSize: number): LegState => ({ clientId, status: "sending", requestedSize, filledSize: 0, avgPrice: 0, fee: 0, builderFee: 0, closeFilledSize: 0, closeFee: 0, closeBuilderFee: 0 });
const nextCloseId = (record: SpreadRecord, side: SpreadSide) => {
  const previous = record.legs[side].closeClientId;
  const n = Number(previous?.match(/-r(\d+)$/)?.[1] ?? 0);
  return `ss-${record.id}-${side === "short" ? "cs" : "cl"}${previous ? `-r${n + 1}` : ""}`;
};
const feeHeader = BUILDER_FEE_BPS > 0 ? { "X-Builder-Fee-Bps": String(Math.floor(BUILDER_FEE_BPS)) } : undefined;

async function batch(orders: CreateOrderRequest[]): Promise<BatchResult> {
  const response = await authenticatedFetch(`${API_BASE_URL}/v2/orders/batch`, "POST", { orders }, feeHeader);
  if (!response.ok) return throwApiError(response, "Batch orders failed");
  return response.json();
}

export async function openSpread(plan: SpreadPlan, onPrepared?: (record: SpreadRecord) => void): Promise<SpreadSubmission> {
  if (plan.blockers.length || !plan.legs.short || !plan.legs.long) throw new Error(plan.blockers.join(" ") || "Spread plan is incomplete");
  const id = crypto.randomUUID(), at = Date.now();
  for (const side of sides) {
    const symbol = plan.legs[side]!.symbol;
    await updateMarginMode(symbol, "isolated");
    await updateLeverage(symbol, plan.leverage);
  }
  let settings = await getSymbols();
  for (let attempt = 0; attempt < 4 && [plan.short, plan.long].some((symbol) => settings.symbol_settings[symbol]?.margin_mode !== "isolated" || settings.symbol_settings[symbol]?.leverage !== plan.leverage); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    settings = await getSymbols();
  }
  const marginModeConfirmed = { short: settings.symbol_settings[plan.short]?.margin_mode === "isolated", long: settings.symbol_settings[plan.long]?.margin_mode === "isolated" };
  if (!marginModeConfirmed.short || !marginModeConfirmed.long) throw Object.assign(new Error("Isolated margin mode was not confirmed for both symbols."), { marginModeConfirmed });
  if (settings.symbol_settings[plan.short]?.leverage !== plan.leverage || settings.symbol_settings[plan.long]?.leverage !== plan.leverage) throw new Error("Leverage was not confirmed for both symbols.");
  const record: SpreadRecord = { id, short: plan.short, long: plan.long, notionalPerLeg: plan.notionalPerLeg, leverage: plan.leverage, openedAt: at, marginModeConfirmed,
    legs: { short: newLeg(`ss-${id}-s`, plan.legs.short.size), long: newLeg(`ss-${id}-l`, plan.legs.long.size) } };
  onPrepared?.(record);
  const orders: CreateOrderRequest[] = sides.map((side) => ({ client_order_id: record.legs[side].clientId, symbol: plan.legs[side]!.symbol, side: plan.legs[side]!.side, type: "market", size: String(plan.legs[side]!.size) }));
  return { record, response: await batch(orders) };
}

export async function closeSpread(record: SpreadRecord, onPrepared?: (ids: Record<SpreadSide, string>, targets: SpreadSide[]) => void): Promise<{ ids: Record<SpreadSide, string>; targets: SpreadSide[]; response: BatchResult }> {
  const targets = sides.filter((side) => record.legs[side].filledSize - record.legs[side].closeFilledSize > 0 && record.legs[side].status !== "closing");
  if (!targets.length) throw new Error("No filled legs to close.");
  const ids = { short: nextCloseId(record, "short"), long: nextCloseId(record, "long") };
  onPrepared?.(ids, targets);
  const orders: CreateOrderRequest[] = targets.map((side) => ({ client_order_id: ids[side], symbol: record[side], side: side === "short" ? "buy" : "sell", type: "market", size: String(record.legs[side].filledSize - record.legs[side].closeFilledSize), reduce_only: true }));
  return { ids, targets, response: await batch(orders) };
}

export async function retryLeg(record: SpreadRecord, side: SpreadSide, size: number, onPrepared?: (clientId: string) => void): Promise<{ clientId: string; response: BatchResult }> {
  if (!(size > 0) || !Number.isFinite(size)) throw new Error("Retry requires a valid remaining size.");
  if (!["rejected", "no_response"].includes(record.legs[side].status) && !(record.legs[side].status === "partial" && record.legs[side].reason)) throw new Error("This leg is not ready for retry.");
  const previous = record.legs[side].clientId;
  const n = Number(previous.match(/-r(\d+)$/)?.[1] ?? 0) + 1;
  const clientId = `ss-${record.id}-${side === "short" ? "s" : "l"}-r${n}`;
  onPrepared?.(clientId);
  const response = await batch([{ client_order_id: clientId, symbol: record[side], side: side === "short" ? "sell" : "buy", type: "market", size: String(size) }]);
  return { clientId, response };
}

export async function closeLeg(record: SpreadRecord, side: SpreadSide, onPrepared?: (clientId: string) => void): Promise<{ clientId: string; response: BatchResult }> {
  const size = record.legs[side].filledSize - record.legs[side].closeFilledSize;
  if (!(size > 0)) throw new Error("This leg has no open filled size.");
  const clientId = nextCloseId(record, side);
  onPrepared?.(clientId);
  const response = await batch([{ client_order_id: clientId, symbol: record[side], side: side === "short" ? "buy" : "sell", type: "market", size: String(size), reduce_only: true }]);
  return { clientId, response };
}

export async function getFundingSince(symbol: string, openedAt: number): Promise<FundingHistoryRow[]> {
  const query = new URLSearchParams({ symbol, startTime: String(openedAt) });
  const response = await authenticatedFetch(`${API_BASE_URL}/v2/history/funding?${query}`, "GET");
  if (!response.ok) return throwApiError(response, "Funding history failed");
  const data: unknown = await response.json();
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  // before the first hourly settlement Strike answers {"count":0,"funding":null}: that is an empty history, not an error
  const rows = Array.isArray(data) ? data : obj.rows ?? obj.funding ?? obj.history ?? obj.data ?? (Number(obj.count) === 0 ? [] : null);
  if (!Array.isArray(rows)) throw new Error("Unexpected funding history response");
  return rows as FundingHistoryRow[];
}
