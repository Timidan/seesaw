import type { OrderTradeUpdateData } from "../types/ws";
import type { SpreadSide } from "./plan";

export type LegStatus = "idle" | "sending" | "pending" | "partial" | "filled" | "rejected" | "no_response" | "closing" | "closed";
export type LegState = { clientId: string; orderId?: string; status: LegStatus; requestedSize: number; filledSize: number; retryBase?: number; avgPrice: number; reason?: string; sentAt?: number; hasEvent?: boolean; fillIds?: string[]; fee: number; builderFee: number; closeClientId?: string; closeOrderId?: string; closeFilledSize: number; closeRetryBase?: number; exitPrice?: number; closeSentAt?: number; closeFee: number; closeBuilderFee: number };
export type SpreadStatus = "opening" | "open" | "one_leg" | "closing" | "closed" | "failed";
export type BatchResult = { successful?: ({ client_order_id?: string } | null)[] | null; failed?: { index: number; error: string }[] | null };
export type LegAction = { type: "send"; clientId: string; at: number; closing?: boolean } | { type: "batch"; accepted: boolean; reason?: string; closing?: boolean; at?: number } | { type: "trade"; event: OrderTradeUpdateData } | { type: "tick"; at: number } | { type: "unknown"; reason: string };

export function reduceLeg(leg: LegState, action: LegAction): LegState {
  if (action.type === "send") return action.closing ? { ...leg, closeClientId: action.clientId, closeRetryBase: leg.closeFilledSize, status: "closing", closeSentAt: undefined, hasEvent: false, reason: undefined } : { ...leg, clientId: action.clientId, retryBase: leg.filledSize, status: "sending", sentAt: undefined, hasEvent: false, reason: undefined };
  if (action.type === "unknown") return leg.status === "filled" || leg.status === "closed" || leg.status === "rejected" ? leg : { ...leg, status: "no_response", reason: action.reason };
  if (action.type === "batch") {
    if (action.accepted) return action.closing ? (leg.status === "closed" || leg.reason ? leg : { ...leg, status: "closing", closeSentAt: action.at ?? Date.now() }) : (["filled", "partial", "rejected", "no_response"].includes(leg.status) ? leg : { ...leg, status: "pending", sentAt: action.at ?? Date.now() });
    return leg.status === "filled" || leg.status === "closed" ? leg : { ...leg, status: action.closing ? "filled" : leg.filledSize ? "partial" : "rejected", reason: action.reason || "Batch command failed" };
  }
  if (action.type === "tick") {
    if (leg.status === "pending" && !leg.hasEvent && leg.sentAt && action.at - leg.sentAt >= 10000) return { ...leg, status: "no_response", reason: "No order event within 10 seconds" };
    if (leg.status === "closing" && !leg.hasEvent && leg.closeSentAt && action.at - leg.closeSentAt >= 10000) return { ...leg, status: "no_response", reason: "No close event within 10 seconds" };
    return leg;
  }
  const event = action.event, closing = !!leg.closeClientId && event.c === leg.closeClientId;
  if (!closing && event.c !== leg.clientId) return leg;
  const fillId = event.t > 0 ? `${closing ? "close" : "open"}:${event.fill_id ?? event.t}` : "";
  if (fillId && leg.fillIds?.includes(fillId)) return leg;
  const fillIds = fillId ? [...(leg.fillIds ?? []), fillId] : leg.fillIds;
  const status = event.X?.toUpperCase(), cumulative = Number(event.z || 0), lastQty = Number(event.l || 0), lastPrice = Number(event.L || 0);
  const previous = closing ? leg.closeFilledSize : leg.filledSize;
  const filledSize = Math.max(previous, (closing ? leg.closeRetryBase ?? 0 : leg.retryBase ?? 0) + (Number.isFinite(cumulative) ? cumulative : 0));
  const avgPrice = Number(event.ap) > 0 ? Number(event.ap) : lastQty > 0 && lastPrice > 0 && filledSize > previous
    ? ((closing ? leg.exitPrice ?? 0 : leg.avgPrice) * previous + lastPrice * (filledSize - previous)) / filledSize
    : closing ? leg.exitPrice ?? 0 : leg.avgPrice;
  const orderId = event.order_id || (event.i ? String(event.i) : undefined);
  const failed = status === "REJECTED" || status === "EXPIRED" || status === "CANCELED";
  const reason = failed ? event.cr || status.toLowerCase() : undefined;
  if (closing) return { ...leg, hasEvent: true, fillIds, closeOrderId: orderId ?? leg.closeOrderId, closeFilledSize: filledSize, exitPrice: avgPrice || leg.exitPrice,
    status: status === "FILLED" && filledSize >= leg.filledSize ? "closed" : failed ? "filled" : "closing", reason,
    closeFee: leg.closeFee + (event.t > 0 ? Number(event.n || 0) : 0), closeBuilderFee: leg.closeBuilderFee + (event.t > 0 ? Number(event.builder_fee || 0) : 0) };
  return { ...leg, hasEvent: true, fillIds, orderId: orderId ?? leg.orderId, filledSize, avgPrice, status: status === "FILLED" ? "filled" : failed ? (filledSize ? "partial" : "rejected") : filledSize ? "partial" : "pending", reason,
    fee: leg.fee + (event.t > 0 ? Number(event.n || 0) : 0), builderFee: leg.builderFee + (event.t > 0 ? Number(event.builder_fee || 0) : 0) };
}

export function spreadStatus(legs: Record<SpreadSide, LegState>): { status: SpreadStatus; failedLeg?: SpreadSide } {
  const a = legs.short.status, b = legs.long.status;
  if (a === "closed" && b === "closed") return { status: "closed" };
  if (a === "closing" || b === "closing" || a === "closed" || b === "closed") return { status: "closing" };
  const failed = (status: LegStatus) => status === "rejected" || status === "no_response";
  if (failed(a) && failed(b)) return { status: "failed" };
  if (failed(a) || failed(b) || (a === "partial" && !!legs.short.reason) || (b === "partial" && !!legs.long.reason)) return { status: "one_leg", failedLeg: failed(a) || (a === "partial" && !!legs.short.reason) ? "short" : "long" };
  if (a === "filled" && b === "filled") return { status: "open" };
  return { status: "opening" };
}
