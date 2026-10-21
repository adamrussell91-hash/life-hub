// packages/decision-book/curves.mjs
// Conceptual curve shapes for the curve family. Each maps t in [0, 1] (left to right) to a
// height in [0, 1] (bottom to top). They carry no data and no numbers: the kit's rule is that
// a curve shows an idea (a U, a rise, a tail), never a measurement.
const clamp = (v) => Math.min(1, Math.max(0, v));

export const CURVE_SHAPES = Object.freeze({
  /** Both extremes bad, a middle that is better (choice overload). */
  u: (t) => 0.15 + 0.75 * (2 * t - 1) ** 2,
  /** Steady rise (consequences over time). */
  rise: (t) => 0.1 + 0.8 * t,
  /** Steady fall. */
  fall: (t) => 0.9 - 0.8 * t,
  /** Slow start, steep middle, plateau (adoption, potential). */
  s: (t) => 0.08 + 0.84 / (1 + Math.exp(-10 * (t - 0.5))),
  /** A bell (diffusion of adopters). */
  bell: (t) => 0.08 + 0.84 * Math.exp(-((t - 0.5) ** 2) / 0.045),
  /** A high head falling into a long, low tail. */
  tail: (t) => 0.06 + 0.86 * Math.exp(-6 * t),
  /** Calm, then one sudden spike near the end (a black swan). */
  spike: (t) => 0.12 + 0.03 * Math.sin(t * 18) + 0.8 * Math.exp(-((t - 0.82) ** 2) / 0.0016),
  /** A bell with a gap cut after the early adopters (the chasm); the gap is drawn by the renderer. */
  chasm: (t) => 0.08 + 0.84 * Math.exp(-((t - 0.5) ** 2) / 0.045),
  /** Expectation running ahead, then reality catching up below it. */
  lag: (t) => 0.08 + 0.7 * t ** 2
});

export const CURVE_IDS = Object.freeze(Object.keys(CURVE_SHAPES));

/** Where the chasm's gap sits along t, for the shape and its renderer. */
export const CHASM_GAP = Object.freeze([0.3, 0.36]);

/** `n + 1` evenly spaced points [t, height] for a shape, heights clamped to [0, 1]. */
export function curvePoints(shape, n = 48) {
  const f = CURVE_SHAPES[shape];
  if (!f) throw new Error(`Unknown curve shape: ${shape}`);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [t, clamp(f(t))];
  });
}

/** Height of a shape at t (clamped). */
export function curveAt(shape, t) {
  return clamp(CURVE_SHAPES[shape](t));
}
