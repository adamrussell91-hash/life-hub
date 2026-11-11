/**
 * A small seeded random source for the grid generators (mulberry32). Same seed,
 * same numbers, on the phone, in the editor and on the server, so a layout
 * the teacher sees is the layout students get. Pure, no imports.
 */
export type Rng = () => number;

export function seededRandom(seed: number): Rng {
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWith<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** A fresh seed for "Regenerate layout" (0 to 2^31 − 1, as the schema allows). */
export function newSeed(rng: Rng = Math.random): number {
  return Math.floor(rng() * 2147483646) + 1;
}
