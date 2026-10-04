/** Shared canvas helpers for the Universe effects. Everything is drawn as filled dots — no strokes, no text. */

export const TAU = Math.PI * 2;

export type DotContext = Pick<CanvasRenderingContext2D, "beginPath" | "arc" | "fill"> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  globalAlpha: number;
};

export function paintDot(ctx: DotContext, x: number, y: number, r: number, color: string, alpha: number) {
  if (alpha <= 0.003 || r <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Seeded PRNG. FNV hashes of near-identical keys correlate and draw visible lines, so scatter uses this instead. */
export function mulberry(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function quadPoint(x0: number, y0: number, qx: number, qy: number, x1: number, y1: number, t: number) {
  const u = 1 - t;
  return { x: u * u * x0 + 2 * u * t * qx + t * t * x1, y: u * u * y0 + 2 * u * t * qy + t * t * y1 };
}
