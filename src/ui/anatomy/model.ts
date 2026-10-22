export type CarryMachineProps = {
  short: string;
  long: string;
  beta: number;
  carryApr: number;
  hoursPaid: number;
  hours: number;
  corr: number;
  hedgedVolApr: number;
  dollarVolApr: number;
};

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const smooth = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };

export function validSnapshot(p: CarryMachineProps) {
  return Boolean(p.short && p.long) &&
    [p.beta, p.carryApr, p.corr, p.hedgedVolApr, p.dollarVolApr].every(Number.isFinite) &&
    p.beta > 0 && p.corr >= -1 && p.corr <= 1 &&
    p.hedgedVolApr >= 0 && p.dollarVolApr >= 0 &&
    Number.isInteger(p.hours) && Number.isInteger(p.hoursPaid) &&
    p.hours > 0 && p.hoursPaid >= 0 && p.hoursPaid <= p.hours;
}

// An explanatory shock, not a forecast of P&L or volatility. With a beta-sized hedge the expected
// leftover of a shock to the short leg is 1 - corr² (same model as the hero scene); hedge 0..1 = lifted..on.
export const responseToShock = (shock: number, corr: number, hedge: number) =>
  shock * (1 - corr * corr * hedge);

// Illustration time is compressed: 100 percentage points APR = one coin/second.
export const coinsPerSecond = (carryApr: number) => Math.max(0, carryApr) / 100;

export function shockPulse(age: number) {
  if (age < 0 || age > 2.5) return 0;
  if (age < 0.2) return -0.09 * Math.sin(age / 0.2 * Math.PI);
  return smooth((age - 0.2) / 0.14) * Math.exp(-Math.max(0, age - 0.38) / 0.43);
}

export const apr = (n: number) => `${n.toFixed(1)}%`;
