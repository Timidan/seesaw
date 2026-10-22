export type PricePoint = { time: number; close: number };
export type FundingPoint = { time: number; rate: number };
export type Pair = {
  short: string; long: string; carryApr: number; corr: number;
  spreadSd: number; z: number; pricePnl30d: number;
  pctShortPaid: number; pctLongPaid: number;
};

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const annualPct = (rate: number) => rate * 24 * 365 * 100;

export function fundingStats(points: FundingPoint[]) {
  if (!points.length) throw new Error("Funding history is empty");
  const rates = points.map((point) => point.rate);
  return {
    meanRate: mean(rates),
    fundingApr30d: annualPct(mean(rates)),
    pctPositive: rates.filter((rate) => rate > 0).length / rates.length,
    pctNegative: rates.filter((rate) => rate < 0).length / rates.length,
    hours: rates.length,
  };
}

export function pearson(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) throw new Error("Correlation needs matching series");
  const ma = mean(a), mb = mean(b);
  let covariance = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    covariance += x * y; va += x * x; vb += y * y;
  }
  return va && vb ? covariance / Math.sqrt(va * vb) : 0;
}

export function spreadStats(short: PricePoint[], long: PricePoint[]) {
  const longByTime = new Map(long.map((point) => [point.time, point.close]));
  const shared = short.filter((point) => point.close > 0 && (longByTime.get(point.time) ?? 0) > 0)
    .sort((a, b) => a.time - b.time);
  if (shared.length < 2) throw new Error("Spread needs shared closes");
  const logRatios = shared.map((point) => Math.log(point.close / longByTime.get(point.time)!));
  const avg = mean(logRatios);
  const sd = Math.sqrt(mean(logRatios.map((value) => (value - avg) ** 2)));
  const shortReturns: number[] = [], longReturns: number[] = [];
  for (let i = 1; i < shared.length; i++) {
    shortReturns.push(Math.log(shared[i].close / shared[i - 1].close));
    longReturns.push(Math.log(longByTime.get(shared[i].time)! / longByTime.get(shared[i - 1].time)!));
  }
  return {
    shared: shared.length,
    corr: pearson(shortReturns, longReturns),
    spreadSd: sd * 100,
    z: sd ? (logRatios[logRatios.length - 1] - avg) / sd : 0,
    pricePnl30d: -(logRatios[logRatios.length - 1] - logRatios[0]) * 100,
    meanRatio: Math.exp(avg),
    upperRatio: Math.exp(avg + 2 * sd),
    lowerRatio: Math.exp(avg - 2 * sd),
    ratios: shared.map((point, i) => ({ time: point.time, value: Math.exp(logRatios[i]) })),
    worstMove: Math.max(...logRatios.map((value) => Math.abs(value - logRatios[0]))) * 100,
  };
}

export function makePair(a: string, b: string, pricesA: PricePoint[], pricesB: PricePoint[], fundingA: FundingPoint[], fundingB: FundingPoint[]): Pair | null {
  const fa = fundingStats(fundingA), fb = fundingStats(fundingB);
  const [short, long, shortPrices, longPrices, fs, fl] = fa.meanRate >= fb.meanRate
    ? [a, b, pricesA, pricesB, fa, fb] as const
    : [b, a, pricesB, pricesA, fb, fa] as const;
  const shared = new Set(longPrices.map((point) => point.time));
  if (shortPrices.filter((point) => shared.has(point.time)).length < 500) return null;
  const { corr, spreadSd, z, pricePnl30d } = spreadStats(shortPrices, longPrices);
  return { short, long, carryApr: annualPct(fs.meanRate - fl.meanRate), corr, spreadSd, z, pricePnl30d,
    pctShortPaid: fs.pctPositive, pctLongPaid: fl.pctNegative };
}

export function sizeLeg(notionalUsd: number, markPrice: number, stepSize: number, minQty: number, minNotional: number): { size: number } | { reason: string } {
  if (![notionalUsd, markPrice, stepSize, minQty, minNotional].every(Number.isFinite) || notionalUsd <= 0 || markPrice <= 0 || stepSize <= 0 || minQty < 0 || minNotional < 0)
    return { reason: "Enter valid positive market values" };
  const decimals = (stepSize.toString().split(".")[1] ?? "").length;
  const size = Number((Math.floor((notionalUsd / markPrice + stepSize * 1e-9) / stepSize) * stepSize).toFixed(decimals));
  if (size < minQty) return { reason: `Below minimum size ${minQty}` };
  if (size * markPrice < minNotional) return { reason: `Below minimum notional $${minNotional}` };
  return { size };
}
