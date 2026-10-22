import { useEffect, useState } from "react";
import { getMarkPrice } from "../api/account";
import { getPublicFills, getPublicFunding, getPublicPositions } from "./publicSpread";

export interface PublicSpreadState {
  legs: { symbol: string; side: "short" | "long"; size: number; entryPrice: number; markPrice: number; unrealizedPnl: number; liquidationPrice?: number; isolated?: boolean }[];
  fills: { symbol: string; side: "buy" | "sell"; size: number; price: number; orderId: number; time: number }[];
  funding?: { symbol: string; amount: number; time: number }[];
  updatedAt: number | null;
  error?: string;
}

const empty: PublicSpreadState = { legs: [], fills: [], updatedAt: null };

export function usePublicSpread(accountId: string | null, pollMs = 15000): PublicSpreadState {
  const [state, setState] = useState<PublicSpreadState>(empty);
  useEffect(() => {
    setState(empty);
    if (!accountId) return;
    let active = true;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const [positions, fills, funding] = await Promise.all([
          getPublicPositions(accountId), getPublicFills(accountId), getPublicFunding(accountId),
        ]);
        const marks = await Promise.all(positions.map((position) => getMarkPrice(position.symbol)));
        if (active) setState({
          legs: positions.map((position, index) => ({
            symbol: position.symbol,
            side: Number(position.size) < 0 ? "short" : "long",
            size: Math.abs(Number(position.size)),
            entryPrice: Number(position.entry_price),
            markPrice: Number(marks[index].p),
            unrealizedPnl: Number(position.upnl),
            ...(Number(position.liquidation_price) > 0 ? { liquidationPrice: Number(position.liquidation_price) } : {}),
            isolated: position.margin_mode === "isolated",
          })),
          fills: fills.map((fill) => ({ symbol: fill.symbol, side: fill.side, size: Number(fill.size), price: Number(fill.price), orderId: fill.order_id, time: fill.timestamp })),
          funding: funding.map((payment) => ({ symbol: payment.symbol, amount: Number(payment.amount), time: payment.timestamp })),
          updatedAt: Date.now(),
        });
      } catch (cause) {
        if (active) setState((current) => ({ ...current, error: cause instanceof Error ? cause.message : "Public spread fetch failed" }));
      } finally { loading = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, pollMs);
    return () => { active = false; clearInterval(timer); };
  }, [accountId, pollMs]);
  return state;
}
