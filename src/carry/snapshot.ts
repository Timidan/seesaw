import type { Pair } from "./math";

export type Snapshot = {
  asOf: string | null;
  symbols: Record<string, { fundingApr30d: number; pctPositive: number; currentFundingApr: number; hours: number; bins: number[]; sigmaHourly: number }>;
  pairs: Pair[];
};
