export type PricePoint = { time: number; close: number };
export type FundingPoint = { time: number; rate: number };
export type Pair = {
  short: string; long: string; carryApr: number; corr: number;
  spreadSd: number; z: number; pricePnl30d: number;
  pctShortPaid: number; pctLongPaid: number;
  beta: number; hedgedVolApr: number; dollarVolApr: number; betaCarryApr: number;
  carryToRisk: number; ewmaCarryApr: number; flip7d: number; halfLifeHours: number;
};

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const annualPct = (rate: number) => rate * 24 * 365 * 100;
const std = (values: number[]) => {
  if (!values.length) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
};

export function logReturns(prices: PricePoint[]): number[] {
  const sorted = [...prices].sort((a, b) => a.time - b.time);
  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].time - sorted[i - 1].time === 3600000 && sorted[i - 1].close > 0 && sorted[i].close > 0)
      returns.push(Math.log(sorted[i].close / sorted[i - 1].close));
  }
  return returns;
}

export function sigmaHourly(prices: PricePoint[]): number { return std(logReturns(prices)); }

export function hedgeBeta(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) throw new Error("Beta needs matching returns");
  const ma = mean(a), mb = mean(b);
  let covariance = 0, variance = 0;
  for (let i = 0; i < a.length; i++) {
    covariance += (a[i] - ma) * (b[i] - mb);
    variance += (b[i] - mb) ** 2;
  }
  return variance ? covariance / variance : 1;
}

export function hedgedVolApr(a: number[], b: number[], beta: number): number {
  if (a.length !== b.length) throw new Error("Volatility needs matching returns");
  return std(a.map((value, i) => value - beta * b[i])) * Math.sqrt(8760) * 100;
}

export function betaCarryApr(meanA: number, meanB: number, beta: number): number {
  return annualPct(meanA - beta * meanB);
}

export function carryToRisk(carryApr: number, volApr: number): number {
  return volApr > 0 ? carryApr / volApr : NaN;
}

export function ewmaFunding(points: FundingPoint[]): number {
  if (!points.length) throw new Error("EWMA needs funding rates");
  const latest = Math.max(...points.map((point) => point.time));
  let weighted = 0, weights = 0;
  for (const point of points) {
    const weight = 0.5 ** ((latest - point.time) / 3600000 / 72);
    weighted += point.rate * weight;
    weights += weight;
  }
  return weighted / weights;
}

export function meanReversionHalfLife(logSpread: number[]): number {
  if (logSpread.length < 3) return Infinity;
  const x = logSpread.slice(0, -1), dx = logSpread.slice(1).map((value, i) => value - x[i]);
  const mx = mean(x), md = mean(dx);
  let covariance = 0, variance = 0;
  for (let i = 0; i < x.length; i++) {
    covariance += (x[i] - mx) * (dx[i] - md);
    variance += (x[i] - mx) ** 2;
  }
  const b = variance ? covariance / variance : 0;
  return b > -1 && b < 0 ? -Math.LN2 / Math.log1p(b) : Infinity;
}

export function firstPassageProb(distance: number, sigmaHourly: number, hours: number, side: "short" | "long"): number {
  if (!Number.isFinite(distance) || distance < 0 || (side === "long" && distance >= 1) ||
      !Number.isFinite(sigmaHourly) || sigmaHourly < 0 || !Number.isFinite(hours) || hours < 0) return NaN;
  const threshold = side === "short" ? Math.log1p(distance) : -Math.log1p(-distance);
  if (threshold === 0) return 1;
  if (!sigmaHourly || !hours) return 0;
  const z = threshold / (sigmaHourly * Math.sqrt(2 * hours));
  // Abramowitz-Stegun 7.1.26 erf approximation; max absolute error about 1.5e-7.
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-z * z);
  return Math.min(1, Math.max(0, 1 - erf));
}

export function breakEvenDays(feeRatePerSide: number, beta: number, hourlyCarry: number): number {
  return hourlyCarry > 0 ? (1 + beta) * 2 * feeRatePerSide / hourlyCarry / 24 : Infinity;
}

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
    if (shared[i].time - shared[i - 1].time === 3600000) {
      shortReturns.push(Math.log(shared[i].close / shared[i - 1].close));
      longReturns.push(Math.log(longByTime.get(shared[i].time)! / longByTime.get(shared[i - 1].time)!));
    }
  }
  const beta = hedgeBeta(shortReturns, longReturns);
  const logSpread = shared.map((point) => Math.log(point.close) - beta * Math.log(longByTime.get(point.time)!));
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
    beta, hedgedVolApr: hedgedVolApr(shortReturns, longReturns, beta),
    dollarVolApr: hedgedVolApr(shortReturns, longReturns, 1),
    halfLifeHours: meanReversionHalfLife(logSpread),
  };
}

export function makePair(a: string, b: string, pricesA: PricePoint[], pricesB: PricePoint[], fundingA: FundingPoint[], fundingB: FundingPoint[]): Pair | null {
  const fa = fundingStats(fundingA), fb = fundingStats(fundingB);
  const [short, long, shortPrices, longPrices, fs, fl] = fa.meanRate >= fb.meanRate
    ? [a, b, pricesA, pricesB, fa, fb] as const
    : [b, a, pricesB, pricesA, fb, fa] as const;
  const shared = new Set(longPrices.map((point) => point.time));
  if (shortPrices.filter((point) => shared.has(point.time)).length < 500) return null;
  const { corr, spreadSd, z, pricePnl30d, beta, hedgedVolApr: hedgedVol, dollarVolApr, halfLifeHours } = spreadStats(shortPrices, longPrices);
  const longFunding = new Map((fa.meanRate >= fb.meanRate ? fundingB : fundingA).map((point) => [point.time, point.rate]));
  const commonFunding = (fa.meanRate >= fb.meanRate ? fundingA : fundingB)
    .filter((point) => longFunding.has(point.time)).sort((x, y) => x.time - y.time);
  if (!commonFunding.length) return null;
  const betaCarry = betaCarryApr(fs.meanRate, fl.meanRate, beta);
  const lastTime = commonFunding[commonFunding.length - 1].time;
  const recent = commonFunding.filter((point) => point.time >= lastTime - 167 * 3600000);
  const flip7d = recent.filter((point) => point.rate - beta * longFunding.get(point.time)! < 0).length / recent.length;
  return { short, long, carryApr: annualPct(fs.meanRate - fl.meanRate), corr, spreadSd, z, pricePnl30d,
    pctShortPaid: fs.pctPositive, pctLongPaid: fl.pctNegative, beta, hedgedVolApr: hedgedVol,
    dollarVolApr, betaCarryApr: betaCarry, carryToRisk: carryToRisk(betaCarry, hedgedVol),
    ewmaCarryApr: betaCarryApr(ewmaFunding(commonFunding), ewmaFunding(commonFunding.map((point) => ({ time: point.time, rate: longFunding.get(point.time)! }))), beta),
    flip7d, halfLifeHours };
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
