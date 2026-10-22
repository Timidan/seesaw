import assert from "node:assert/strict";
import { fundingStats, makePair, pearson, sizeLeg, spreadStats } from "../src/carry/math";

const prices = (values: number[]) => values.map((close, i) => ({ time: i * 3600000, close }));
const funding = (rate: number) => Array.from({ length: 600 }, (_, i) => ({ time: i * 3600000, rate }));
assert.ok(Math.abs(fundingStats(funding(0.001)).fundingApr30d - 876) < 1e-9);
assert.equal(pearson([1, 2, 4], [1, 2, 4]), 1);
const pair = makePair("A", "B", prices(Array.from({ length: 600 }, (_, i) => i + 100)), prices(Array.from({ length: 600 }, (_, i) => i + 200)), funding(0.001), funding(-0.001));
assert.equal(pair?.short, "A");
assert.equal(pair?.long, "B");
assert.ok((pair?.carryApr ?? 0) > 0);
const z = spreadStats(prices([1, 2, 4]), prices([1, 1, 1])).z;
assert.ok(Math.abs(z - Math.sqrt(1.5)) < 1e-12);
assert.deepEqual(sizeLeg(20, 3, 0.1, 0.1, 10), { size: 6.6 });
const tooSmall = sizeLeg(2, 3, 0.1, 0.1, 10);
assert.ok("reason" in tooSmall);
assert.match(tooSmall.reason, /notional/);
console.log("Math checks passed");
