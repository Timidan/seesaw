// Strike events: the funding tape and real fills call strike(); the storm shader flashes.
// One tiny bus so the shader never needs to know who fired.
type Listener = (power: number) => void;
const listeners = new Set<Listener>();

export function strike(power = 1) {
  for (const l of listeners) l(Math.max(0, Math.min(1.5, power)));
}

export function onStrike(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** One natural lightning flash: a main return stroke and one to three quick restrikes (about 40-220 ms apart),
 *  each a little weaker. Real flashes flicker like this; they do not strobe evenly. */
export function lightning(power = 1) {
  strike(power);
  let t = 0;
  const restrikes = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < restrikes; i++) {
    t += 40 + Math.random() * 180;
    const p = power * (0.35 + Math.random() * 0.45);
    window.setTimeout(() => strike(Math.min(p, 1.0)), t); // restrikes stay below the bolt-replay threshold
  }
}

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Cues: the hero tape announces when it starts printing so the footage intro starts with it.
const cues = new Set<(name: string) => void>();
export function cue(name: string) { for (const c of cues) c(name); }
export function onCue(c: (name: string) => void) { cues.add(c); return () => cues.delete(c); }
