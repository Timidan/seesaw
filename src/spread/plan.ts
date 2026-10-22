import { breakEvenDays, firstPassageProb, sizeLeg } from "../carry/math";
import type { ExchangeSymbol } from "../carry/data";
import type { FeeRates } from "../math/fees";
import { estimateBuilderFee } from "../math/fees";
import { calculateIsolatedLiquidationPrice } from "../math/positionCalculations";
import { snapToStep, decimalPlaces } from "../math/formatUtils";
import type { Market } from "../types/market";
import type { Position } from "../types/position";

export type SpreadSide = "short" | "long";
export type PlannedLeg = { symbol: string; side: "buy" | "sell"; size: number; notional: number; requiredMargin: number; liquidationPrice: number; takerFee: number; builderFee: number; liqDistance?: number; liqProb7d?: number; liqProb30d?: number };
export type SpreadPlan = { short: string; long: string; notionalPerLeg: number; leverage: number; legs: Record<SpreadSide, PlannedLeg | null>; requiredMargin: number; estimatedTakerFees: number; estimatedBuilderFees: number; blockers: string[]; warnings: string[]; breakEvenDays?: number };
export type PlanSpreadInput = { short: string; long: string; notionalPerLeg: number; leverage: number; marks: Record<string, number>; filters: Record<string, ExchangeSymbol | Market>; feeRates: FeeRates; builderFeeBps: number; availableBalance: number; existingPositions: Position[]; hedge?: { mode: "dollar" | "beta"; beta: number }; sigmaHourly?: Record<string, number>; hourlyCarry?: number };

export function planSpread(input: PlanSpreadInput): SpreadPlan {
  const { short, long, notionalPerLeg, leverage, marks, filters, feeRates, builderFeeBps, availableBalance, existingPositions } = input;
  const blockers: string[] = [], warnings: string[] = [];
  const legs: SpreadPlan["legs"] = { short: null, long: null };
  if (short === long) blockers.push("Choose two different symbols.");
  if (!(notionalPerLeg > 0) || !Number.isFinite(notionalPerLeg)) blockers.push("Enter a positive notional per leg.");
  if (!(leverage >= 1) || !Number.isInteger(leverage)) blockers.push("Enter a valid whole-number leverage.");
  if (!Number.isFinite(builderFeeBps) || builderFeeBps < 0 || builderFeeBps > 100) blockers.push("Builder fee must be between 0 and 100 bps.");
  const beta = input.hedge?.mode === "beta" ? input.hedge.beta : 1;
  if (!(beta > 0) || !Number.isFinite(beta)) blockers.push("Beta hedge needs a positive finite ratio.");
  for (const side of ["short", "long"] as const) {
    const symbol = side === "short" ? short : long, filter = filters[symbol], mark = marks[symbol];
    if (!filter || ("status" in filter && filter.status.toLowerCase() !== "trading")) { blockers.push(`${symbol} is unavailable on the execution network.`); continue; }
    if (existingPositions.some((p) => p.symbol === symbol && p.size > 0)) warnings.push(`${symbol} already has a position; Strike nets positions per symbol.`);
    if (!(mark > 0) || !Number.isFinite(mark)) { blockers.push(`${symbol} has no valid mark price.`); continue; }
    const market = "filters" in filter ? null : filter;
    const lot = "filters" in filter ? filter.filters.find((item) => item.filterType === "MARKET_LOT_SIZE") ?? filter.filters.find((item) => item.filterType === "LOT_SIZE") : null;
    const step = Number(market?.order_market_step_size ?? lot?.stepSize), min = Number(market?.order_market_min_size ?? lot?.minQty), minimumNotional = Number(market?.order_min_notional ?? ("filters" in filter ? filter.filters.find((item) => item.filterType === "MIN_NOTIONAL")?.notional : undefined) ?? 0);
    const sized = sizeLeg(side === "long" ? notionalPerLeg * beta : notionalPerLeg, mark, step, min, minimumNotional);
    if ("reason" in sized) { blockers.push(`${symbol}: ${sized.reason}.`); continue; }
    const size = snapToStep(sized.size, step, Math.max(decimalPlaces(String(step)), decimalPlaces(String(min))), min);
    if (size < min || size * mark < minimumNotional) { blockers.push(`${symbol} is below its order minimum after rounding.`); continue; }
    if (market && market.order_market_max_size && size > Number(market.order_market_max_size)) { blockers.push(`${symbol} exceeds maximum market size.`); continue; }
    if (market?.margin_tiers?.length && leverage > market.margin_tiers[0].max_leverage) blockers.push(`${symbol} supports at most ${market.margin_tiers[0].max_leverage}x leverage.`);
    const notional = size * mark, margin = notional / leverage;
    const mmr = Number(market?.margin_tiers?.[0]?.maintenance_margin_rate ?? 0.004);
    const ma = Number(market?.margin_tiers?.[0]?.maintenance_amount ?? 0);
    const liquidationPrice = calculateIsolatedLiquidationPrice(mark, side === "short" ? -size : size, margin, mmr, ma);
    const liqDistance = Math.abs(liquidationPrice / mark - 1);
    const sigma = input.sigmaHourly?.[symbol];
    legs[side] = { symbol, side: side === "short" ? "sell" : "buy", size, notional, requiredMargin: margin,
      liquidationPrice,
      takerFee: notional * feeRates.takerRate, builderFee: estimateBuilderFee(notional, builderFeeBps) };
    if (input.sigmaHourly) {
      legs[side]!.liqDistance = liqDistance;
      if (sigma !== undefined && Number.isFinite(sigma) && sigma >= 0) {
        legs[side]!.liqProb7d = side === "long" && liqDistance >= 1 ? 0 : firstPassageProb(liqDistance, sigma, 168, side);
        legs[side]!.liqProb30d = side === "long" && liqDistance >= 1 ? 0 : firstPassageProb(liqDistance, sigma, 720, side);
      } else warnings.push(`${symbol} has no valid hourly volatility for liquidation risk.`);
    }
  }
  const values = Object.values(legs).filter((leg): leg is PlannedLeg => leg !== null);
  const requiredMargin = values.reduce((sum, leg) => sum + leg.requiredMargin, 0);
  const estimatedTakerFees = values.reduce((sum, leg) => sum + leg.takerFee, 0);
  const estimatedBuilderFees = values.reduce((sum, leg) => sum + leg.builderFee, 0);
  if (values.length === 2 && !(availableBalance >= requiredMargin + estimatedTakerFees + estimatedBuilderFees)) blockers.push("Available balance is below estimated margin and entry fees.");
  const breakEven = input.hourlyCarry === undefined ? {} : {
    breakEvenDays: breakEvenDays(feeRates.takerRate + builderFeeBps / 10000, beta, input.hourlyCarry),
  };
  return { short, long, notionalPerLeg, leverage, legs, requiredMargin, estimatedTakerFees, estimatedBuilderFees, blockers, warnings, ...breakEven };
}
