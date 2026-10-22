import { useCallback, useEffect, useRef, useState } from "react";
import { userStream } from "../ws/userStream";
import type { OrderTradeUpdateData } from "../types/ws";
import { useSession } from "../session/SessionProvider";
import { closeLeg as sendCloseLeg, closeSpread as sendCloseSpread, getFundingSince, openSpread as sendOpenSpread, retryLeg as sendRetryLeg } from "./engine";
import { reduceLeg, spreadStatus, type BatchResult } from "./legs";
import { planSpread, type PlanSpreadInput, type SpreadPlan, type SpreadSide } from "./plan";
import { calculateSpreadPnl } from "./pnl";
import { loadSpreads, saveSpreads, type SpreadRecord } from "./store";

export type SpreadsHook = { spreads: SpreadRecord[]; plan: (input: Omit<PlanSpreadInput, "availableBalance" | "existingPositions">) => SpreadPlan; open: (plan: SpreadPlan) => Promise<SpreadRecord>; close: (id: string) => Promise<void>; retryLeg: (id: string, side: SpreadSide) => Promise<void>; closeLeg: (id: string, side: SpreadSide) => Promise<void>; pnl: (id: string, marks: Record<string, number>) => Promise<ReturnType<typeof calculateSpreadPnl>>; status: (record: SpreadRecord) => ReturnType<typeof spreadStatus> };
const sides: SpreadSide[] = ["short", "long"];

export function useSpreads(): SpreadsHook {
  const { connection, account, positions } = useSession();
  const accountId = connection?.accountId ?? null;
  const [spreads, setSpreads] = useState<SpreadRecord[]>([]);
  const records = useRef<SpreadRecord[]>([]);
  const mutate = useCallback((change: (current: SpreadRecord[]) => SpreadRecord[]) => {
    const next = change(records.current);
    records.current = next;
    setSpreads(next);
    if (accountId) saveSpreads(accountId, next);
  }, [accountId]);
  useEffect(() => { const next = accountId ? loadSpreads(accountId) : []; records.current = next; setSpreads(next); }, [accountId]);
  const update = useCallback((id: string, side: SpreadSide, change: Parameters<typeof reduceLeg>[1]) => mutate((current) => current.map((record) => {
    if (record.id !== id) return record;
    const next = { ...record, legs: { ...record.legs, [side]: reduceLeg(record.legs[side], change) } };
    return spreadStatus(next.legs).status === "closed" && !next.closedAt ? { ...next, closedAt: Date.now() } : next;
  })), [mutate]);
  const applyBatch = (id: string, targets: SpreadSide[], response: BatchResult, closing = false) => targets.forEach((side, index) => {
    const failed = response.failed?.find((item) => item.index === index);
    update(id, side, { type: "batch", accepted: !failed, reason: failed?.error, closing, at: Date.now() });
  });
  useEffect(() => {
    if (!accountId) return;
    const off = userStream.on("ORDER_TRADE_UPDATE", (event: OrderTradeUpdateData) => {
      const match = records.current.flatMap((record) => sides.map((side) => ({ record, side })))
        .find(({ record, side }) => event.c && (event.c === record.legs[side].clientId || event.c === record.legs[side].closeClientId));
      if (match) update(match.record.id, match.side, { type: "trade", event });
    });
    const timer = setInterval(() => { const at = Date.now(); for (const record of records.current) for (const side of sides) {
      const leg = record.legs[side];
      if ((leg.status === "pending" && !leg.hasEvent && leg.sentAt && at - leg.sentAt >= 10000) || (leg.status === "closing" && !leg.hasEvent && leg.closeSentAt && at - leg.closeSentAt >= 10000)) update(record.id, side, { type: "tick", at });
    } }, 1000);
    return () => { off(); clearInterval(timer); };
  }, [accountId, update]);
  const plan = (input: Omit<PlanSpreadInput, "availableBalance" | "existingPositions">) => planSpread({ ...input, availableBalance: Number(account?.available_balance ?? 0), existingPositions: positions });
  const open = async (spreadPlan: SpreadPlan) => {
    if (!accountId) throw new Error("Connect before opening a spread.");
    let prepared: SpreadRecord | null = null;
    try {
      const result = await sendOpenSpread(spreadPlan, (record) => { prepared = record; mutate((current) => [record, ...current]); });
      applyBatch(result.record.id, sides, result.response);
      return records.current.find((record) => record.id === result.record.id) ?? result.record;
    } catch (error) {
      if (prepared) for (const side of sides) update((prepared as SpreadRecord).id, side, { type: "unknown", reason: "Batch outcome is unknown; check positions and orders before retrying." });
      throw error;
    }
  };
  const find = (id: string) => { const record = records.current.find((item) => item.id === id); if (!record) throw new Error("Spread record not found."); return record; };
  const close = async (id: string) => {
    let targets: SpreadSide[] = [];
    try {
      const result = await sendCloseSpread(find(id), (ids, selected) => { targets = selected; selected.forEach((side) => update(id, side, { type: "send", clientId: ids[side], closing: true, at: Date.now() })); });
      applyBatch(id, result.targets, result.response, true);
    } catch (error) { targets.forEach((side) => update(id, side, { type: "unknown", reason: "Close outcome is unknown; check positions before retrying." })); throw error; }
  };
  const retryLeg = async (id: string, side: SpreadSide) => {
    const record = find(id), size = record.legs[side].requestedSize - record.legs[side].filledSize;
    try { const result = await sendRetryLeg(record, side, size, (clientId) => update(id, side, { type: "send", clientId, at: Date.now() })); applyBatch(id, [side], result.response); }
    catch (error) { update(id, side, { type: "unknown", reason: "Retry outcome is unknown; check positions before retrying." }); throw error; }
  };
  const closeLeg = async (id: string, side: SpreadSide) => {
    try { const result = await sendCloseLeg(find(id), side, (clientId) => update(id, side, { type: "send", clientId, closing: true, at: Date.now() })); applyBatch(id, [side], result.response, true); }
    catch (error) { update(id, side, { type: "unknown", reason: "Close outcome is unknown; check positions before retrying." }); throw error; }
  };
  const pnl = async (id: string, marks: Record<string, number>) => {
    const record = find(id);
    const [short, long] = await Promise.all([getFundingSince(record.short, record.openedAt), getFundingSince(record.long, record.openedAt)]);
    return calculateSpreadPnl(record, marks, { [record.short]: short, [record.long]: long });
  };
  return { spreads, plan, open, close, retryLeg, closeLeg, pnl, status: (record) => spreadStatus(record.legs) };
}
