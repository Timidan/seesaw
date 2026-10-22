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

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Cues: the hero tape announces when it starts printing so the footage intro starts with it.
const cues = new Set<(name: string) => void>();
export function cue(name: string) { for (const c of cues) c(name); }
export function onCue(c: (name: string) => void) { cues.add(c); return () => cues.delete(c); }
