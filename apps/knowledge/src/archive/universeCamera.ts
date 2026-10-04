import { easeInOut } from "./universeDraw";

/** Camera motion: glide between framings (with a small pull-back on long hops), flick momentum, and the cursor lens. */

export type Glide = { k0: number; k1: number; c0: [number, number]; c1: [number, number]; t0: number; dur: number; hop: number };

export function startGlide(
  from: { k: number; cx: number; cy: number },
  to: { k: number; cx: number; cy: number },
  now: number,
  width: number,
  dur = 1100,
): Glide {
  const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy) * Math.min(from.k, to.k);
  return { k0: from.k, k1: to.k, c0: [from.cx, from.cy], c1: [to.cx, to.cy], t0: now, dur, hop: Math.min(0.55, dist / (Math.max(width, 1) * 2.5)) };
}

/** Zoom interpolates in log space, dipping out mid-flight on long hops so the trip stays legible. */
export function glideAt(glide: Glide, now: number) {
  const u = Math.min(1, Math.max(0, (now - glide.t0) / glide.dur));
  const e = easeInOut(u);
  const k = Math.exp(Math.log(glide.k0) + (Math.log(glide.k1) - Math.log(glide.k0)) * e) * (1 - glide.hop * Math.sin(Math.PI * e));
  return {
    k,
    cx: glide.c0[0] + (glide.c1[0] - glide.c0[0]) * e,
    cy: glide.c0[1] + (glide.c1[1] - glide.c0[1]) * e,
    done: u >= 1,
  };
}

export function decayInertia(v: { vx: number; vy: number }, dtMs: number) {
  const d = Math.pow(0.93, dtMs / 16);
  return { vx: v.vx * d, vy: v.vy * d };
}

export const LENS_RADIUS = 150;
export const LENS_POWER = 2.4;

/** Fisheye around the pointer: positions push outward, sizes grow, and the rim maps to itself so nothing jumps. */
export function lensMap(x: number, y: number, pointer: { x: number; y: number } | null): [number, number, number] {
  if (!pointer) return [x, y, 1];
  const dx = x - pointer.x;
  const dy = y - pointer.y;
  const d = Math.hypot(dx, dy);
  if (d >= LENS_RADIUS) return [x, y, 1];
  if (d < 1e-3) return [x, y, lensSize(LENS_POWER + 1)];
  const f = (LENS_POWER + 1) / ((LENS_POWER * d) / LENS_RADIUS + 1);
  return [pointer.x + dx * f, pointer.y + dy * f, lensSize(f)];
}

function lensSize(f: number) {
  return Math.min(3, 1 + (f - 1) * 0.45);
}
