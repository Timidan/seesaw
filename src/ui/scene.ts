// The hero scene: a beam on a pivot over a crowd, inside the storm.
// One mutable state object read every frame by the shader (StormField), the spark overlay and the labels.
// The Hero director writes it; nothing here schedules anything on its own.

export type Spark = { born: number; from: [number, number]; to: [number, number]; power: number; paid: boolean; seed: number };
export type Dust = { born: number; x: number; y: number; vx: number; vy: number };

export const scene = {
  tilt: 0.16,      // radians; + tips the short (left) end down
  drop: 0,         // 0..1 hedge weight fall (1 = resting on the beam)
  squash: 0,       // 0..1 impact squash on the hedge weight
  charge: 0,       // 0..1 funding collected, fills the short weight
  sparks: [] as Spark[],
  dust: [] as Dust[],
  active: false,   // scene drawn at all (false on narrow screens behind text)
  replayIndex: -1, // hour being replayed on the tape (-1 = none)
  introDone: false,
  paused: false,   // user paused motion (WCAG 2.2.2): storm, sparks and replay hold still
  // Interaction: push the short leg's price and watch the hedged spread. tilt follows a spring once `ready`.
  ready: false,    // intro finished; the spring controller owns tilt from here
  shock: 0,        // price move of the short leg, as a fraction (0.1 = +10%)
  hedged: true,    // hedge leg on the beam
  corr: 0.8,       // correlation of the two legs (from the snapshot)
  baseTilt: 0,     // resting tilt from the spread's stretch (z-score)
};

/** P&L of the spread per $1 of the short leg when the short leg's price moves by s.
 *  With a beta hedge the long leg is expected to move corr·σB/σA·s, so the spread keeps (1 − corr²) of the move. */
export const spreadPnl = (s: number) => -s * (scene.hedged ? 1 - scene.corr * scene.corr : 1);

/** Scene geometry in CSS pixels for a hero of size w×h (y measured from the top). */
export function layout(w: number, h: number) {
  const wide = w >= 900;
  const cx = wide ? w * 0.75 : w * 0.62;
  const ground = h - (wide ? 190 : 170);          // crowd stands here, just above the tape
  const pivotY = ground - Math.min(250, h * 0.3);  // apex of the fulcrum
  const half = Math.min(wide ? w * 0.17 : w * 0.34, 290);
  const thick = Math.max(12, Math.round(half * 0.065));
  const weight = { w: Math.round(half * 0.42), h: Math.round(half * 0.36) };
  return { cx, pivotY, half, thick, weight, ground, crowd: { x0: wide ? w * 0.53 : 0, x1: w } };
}

/** Where a point on the beam ends up after tilting (CSS px). t: -1 short end .. +1 hedge end; up: px above the beam's top face. */
export function onBeam(L: ReturnType<typeof layout>, t: number, up: number): [number, number] {
  const x = t * L.half * 0.8, y = -(L.thick / 2 + up);
  const c = Math.cos(-scene.tilt), s = Math.sin(-scene.tilt);
  // screen y grows downward; positive tilt lowers the short (left) end
  return [L.cx + x * c - y * s, L.pivotY - L.thick / 2 + (x * s + y * c)];
}

export const ease = {
  outQuint: (x: number) => 1 - Math.pow(1 - x, 5),
  inCubic: (x: number) => x * x * x,
  /** damped spring from 1 to 0: overshoot then settle (follow-through) */
  settle: (x: number) => Math.exp(-6 * x) * Math.cos(x * 14),
};
