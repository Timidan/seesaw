import { writeFile } from "node:fs/promises";
import { getAllHistories, getExchangeInfo, getPremiumIndex } from "../src/carry/data";
import { fundingStats, makePair, sigmaHourly } from "../src/carry/math";
import type { Snapshot } from "../src/carry/snapshot";

const [exchange, premium] = await Promise.all([getExchangeInfo(), getPremiumIndex()]);
const current = new Map(premium.map((row) => [row.symbol, Number(row.fundingRate)]));
const symbols = exchange.filter((row) => row.status.toUpperCase() === "TRADING").map((row) => row.symbol);
const histories = await getAllHistories(symbols);
const snapshot: Snapshot = { asOf: new Date().toISOString(), symbols: {}, pairs: [] };

for (const symbol of symbols) {
  const stats = fundingStats(histories[symbol].funding);
  snapshot.symbols[symbol] = {
    fundingApr30d: stats.fundingApr30d,
    pctPositive: stats.pctPositive,
    currentFundingApr: (current.get(symbol) ?? 0) * 24 * 365 * 100,
    hours: stats.hours,
    sigmaHourly: sigmaHourly(histories[symbol].prices),
    // 120 bins of 6 hours: mean hourly funding rate, oldest first (board mini tapes)
    bins: Array.from({ length: 120 }, (_, b) => {
      const rows = histories[symbol].funding.slice(-720).slice(b * 6, b * 6 + 6);
      return rows.length ? Number((rows.reduce((a, r) => a + r.rate, 0) / rows.length).toPrecision(4)) : 0;
    }),
  };
}
for (let i = 0; i < symbols.length; i++) {
  for (let j = i + 1; j < symbols.length; j++) {
    const a = symbols[i], b = symbols[j];
    const pair = makePair(a, b, histories[a].prices, histories[b].prices, histories[a].funding, histories[b].funding);
    if (pair) snapshot.pairs.push(pair);
  }
}
snapshot.pairs.sort((a, b) => b.carryApr - a.carryApr);
await writeFile("public/snapshot.json", `${JSON.stringify(snapshot, (_, value) =>
  typeof value === "number" ? (Number.isFinite(value) ? Number(value.toPrecision(4)) : null) : value)}\n`);
console.log(`Snapshot: ${symbols.length} symbols, ${snapshot.pairs.length} pairs at ${snapshot.asOf}`);
