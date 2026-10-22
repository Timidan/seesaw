import type { SpreadRecord } from "./store";

export type FundingHistoryRow = { symbol?: string; amount?: string | number; funding_amount?: string | number; fundingAmount?: string | number; funding_fee?: string | number; timestamp?: string | number; time?: string | number; funding_time?: string | number };
export type LegPnl = { price: number; funding: number; fees: number; net: number };

export function calculateSpreadPnl(record: SpreadRecord, marks: Record<string, number>, fundingRows: Record<string, FundingHistoryRow[]>): { short: LegPnl; long: LegPnl; total: LegPnl } {
  const leg = (side: "short" | "long"): LegPnl => {
    const state = record.legs[side], symbol = record[side], mark = marks[symbol];
    const closed = Math.min(state.closeFilledSize, state.filledSize), remaining = state.filledSize - closed;
    if (remaining > 0 && !(Number.isFinite(mark) && mark > 0)) throw new Error(`A live mark is required for ${symbol}`);
    const price = ((state.exitPrice ? (state.exitPrice - state.avgPrice) * closed : 0) + (Number.isFinite(mark) && mark > 0 ? (mark - state.avgPrice) * remaining : 0)) * (side === "long" ? 1 : -1);
    const funding = (fundingRows[symbol] ?? []).reduce((sum, row) => {
      const time = Number(row.timestamp ?? row.time ?? row.funding_time), amount = Number(row.amount ?? row.funding_amount ?? row.funding_fee ?? row.fundingAmount);
      if (!Number.isFinite(time) || !Number.isFinite(amount)) throw new Error(`Unrecognized funding row for ${symbol}`);
      return time >= record.openedAt && (!record.closedAt || time <= record.closedAt) ? sum + amount : sum;
    }, 0);
    const fees = state.fee + state.builderFee + state.closeFee + state.closeBuilderFee;
    return { price, funding, fees, net: price + funding - fees };
  };
  const short = leg("short"), long = leg("long");
  return { short, long, total: { price: short.price + long.price, funding: short.funding + long.funding, fees: short.fees + long.fees, net: short.net + long.net } };
}
