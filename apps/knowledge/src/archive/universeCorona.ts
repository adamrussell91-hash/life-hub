import { hashUnit } from "./solarModel";
import { easeInOut, mulberry, paintDot, quadPoint, TAU, type DotContext } from "./universeDraw";

/**
 * Corona: a flickering limb of fine particles plus one prominence loop per note added this week.
 * A capture makes one loop swell, snap, and release its plasma as a drifting flare.
 */

export const FLARE_MS = 5200;

const LIMB = Array.from({ length: 140 }, (_, k) => ({
  angle: (k / 140) * TAU + hashUnit(`limb:${k}`) * 0.05,
  rate: 1.1 + hashUnit(`limb-f:${k}`) * 1.8,
  height: hashUnit(`limb-h:${k}`),
}));

export type CoronaColors = { hot: string; white: string };

export function coronaColors(dark: boolean): CoronaColors {
  return dark ? { hot: "#ffd38a", white: "#fff3d6" } : { hot: "#e08a1e", white: "#f0a640" };
}

function drawLoop(
  ctx: DotContext,
  x: number,
  y: number,
  r: number,
  angle: number,
  width: number,
  height: number,
  seconds: number,
  seed: number,
  alpha: number,
  color: string,
) {
  const a0 = angle - width;
  const a1 = angle + width;
  const top = r * (1 + height) * 1.15;
  const fx0 = x + Math.cos(a0) * r;
  const fy0 = y + Math.sin(a0) * r;
  const fx1 = x + Math.cos(a1) * r;
  const fy1 = y + Math.sin(a1) * r;
  const cx = x + Math.cos(angle) * top;
  const cy = y + Math.sin(angle) * top;
  const N = 48;
  for (let s = 0; s <= N; s++) {
    const t = s / N;
    const p = quadPoint(fx0, fy0, cx, cy, fx1, fy1, t);
    const flow = 0.5 + 0.5 * Math.sin(t * 14 - seconds * 1.2 + seed);
    paintDot(ctx, p.x, p.y, Math.max(0.4, r * (0.012 + 0.012 * flow)), color, alpha * (0.18 + 0.4 * flow) * (0.5 + 0.5 * Math.sin(Math.PI * t)));
  }
}

export function drawCorona(
  ctx: DotContext,
  x: number,
  y: number,
  r: number,
  loops: number,
  seconds: number,
  flare: { u: number; angle: number } | null,
  dark: boolean,
) {
  const { hot, white } = coronaColors(dark);
  for (let k = 0; k < LIMB.length; k++) {
    const limb = LIMB[k]!;
    const a = limb.angle;
    const flick = 0.5 + 0.5 * Math.sin(seconds * limb.rate + k);
    const h = r * (0.04 + 0.22 * limb.height * flick);
    paintDot(ctx, x + Math.cos(a) * (r + h), y + Math.sin(a) * (r + h), Math.max(0.4, r * 0.035), hot, 0.18 + 0.32 * flick * (1 - h / (r * 0.3)));
  }
  const rnd = mulberry(4242);
  const base = rnd() * TAU;
  for (let k = 0; k < loops; k++) {
    const angle = base + (k / Math.max(loops, 1)) * TAU + (rnd() - 0.5) * 1.1 + seconds * 0.008;
    const width = 0.2 + rnd() * 0.18;
    const height = 0.22 + rnd() * 0.3 + 0.04 * Math.sin(seconds * 0.45 + k * 2.1);
    drawLoop(ctx, x, y, r, angle, width, height, seconds, k, 0.85, hot);
  }
  if (!flare) return;
  const u = flare.u;
  const swell = u < 0.4 ? 0.6 + 1.8 * easeInOut(u / 0.4) : 2.4;
  if (u < 0.45) drawLoop(ctx, x, y, r, flare.angle, 0.24, swell, seconds, 99, 1 - Math.max(0, (u - 0.35) / 0.1), white);
  const brighten = Math.sin(Math.PI * Math.min(1, u * 1.6));
  for (let s = 0; s < 30; s++) {
    const a = flare.angle + (s / 30 - 0.5) * 0.7;
    paintDot(ctx, x + Math.cos(a) * r * 1.02, y + Math.sin(a) * r * 1.02, r * 0.05, white, 0.55 * brighten);
  }
  if (u <= 0.35) return;
  const v = (u - 0.35) / 0.65;
  const fr = mulberry(777);
  for (let s = 0; s < 110; s++) {
    const spread = (fr() - 0.5) * 0.55;
    const kick = fr();
    const size = fr();
    const a = flare.angle + spread * (1 + v * 0.8);
    const d = r * (1.15 + kick * 1.4 + v * (1.5 + 4 * kick));
    paintDot(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.012 + 0.016 * size), hot, 0.6 * (1 - v) ** 1.4 * (0.4 + 0.6 * (1 - kick)));
  }
}
