import { hashUnit } from "./solarModel";
import { clamp01, paintDot, quadPoint, TAU, type DotContext } from "./universeDraw";

/**
 * Light bridges. Selecting a note "dials" its connected notes: one chevron locks per connection
 * (up to seven), the gate bursts open at both ends, then a calm arc of dots carries one slow photon.
 */

export const CHEVRON_MS = 330;
export const CHEVRON_SLOTS = 9;
export const MAX_LOCKS = 7;
export const KAWOOSH_MS = 800;
export const PHOTON_MS = 9000;

export type DialPhase = {
  locked: number;
  /** -1 before the gate opens, then 0..1 through the burst, then 1. */
  kawoosh: number;
  bridgeAlpha: number;
};

export function dialPhase(elapsedMs: number, targets: number, instant = false): DialPhase {
  const locks = Math.min(MAX_LOCKS, targets);
  if (instant) return { locked: locks, kawoosh: 1, bridgeAlpha: 1 };
  const lockEnd = locks * CHEVRON_MS + 150;
  const locked = Math.min(locks, Math.max(0, Math.floor(elapsedMs / CHEVRON_MS)));
  if (elapsedMs < lockEnd) return { locked, kawoosh: -1, bridgeAlpha: 0 };
  return {
    locked: locks,
    kawoosh: clamp01((elapsedMs - lockEnd) / KAWOOSH_MS),
    bridgeAlpha: clamp01((elapsedMs - lockEnd) / 500),
  };
}

/** Body indices of a note's connected notes that exist in the model, without duplicates or itself. */
export function bridgeTargets(connected: string[] | undefined, self: number, bodyOfPage: Map<string, number>) {
  const out: number[] = [];
  for (const id of connected ?? []) {
    const body = bodyOfPage.get(id);
    if (body == null || body === self || out.includes(body)) continue;
    out.push(body);
  }
  return out;
}

export function drawChevrons(ctx: DotContext, x: number, y: number, locked: number, total: number, dark: boolean) {
  const R = 15;
  const on = dark ? "#ffd27a" : "#c47a12";
  const off = dark ? "#ffffff" : "#17375e";
  for (let c = 0; c < CHEVRON_SLOTS; c++) {
    const angle = -Math.PI / 2 + (c / CHEVRON_SLOTS) * TAU;
    const isOn = c < Math.min(locked, total);
    paintDot(ctx, x + Math.cos(angle) * R, y + Math.sin(angle) * R, isOn ? 2.2 : 1.2, isOn ? on : off, isOn ? 1 : 0.35);
  }
}

/** The gate opening: dots surge outward, then settle back to the rim. */
export function drawKawoosh(ctx: DotContext, x: number, y: number, u: number, color: string, radius: number, count = 18) {
  const surge = u < 0.45 ? (1 - Math.pow(1 - u / 0.45, 3)) * 2.3 : 2.3 - 1.3 * clamp01((u - 0.45) / 0.55);
  for (let s = 0; s < count; s++) {
    const angle = (s / count) * TAU + u * 0.6;
    paintDot(ctx, x + Math.cos(angle) * radius * surge, y + Math.sin(angle) * radius * surge, 1.5, color, (1 - u * 0.6) * 0.9);
  }
}

/** A calm dotted arc that breathes, with one slow photon and a long soft tail. */
export function drawBridge(
  ctx: DotContext,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  alpha: number,
  nowMs: number,
  seed: number,
  moving: boolean,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = 0.22 * (hashUnit(`bridge:${seed}`) < 0.5 ? 1 : -1);
  const qx = (from.x + to.x) / 2 - dy * bend;
  const qy = (from.y + to.y) / 2 + dx * bend;
  const steps = Math.max(8, Math.floor(len / 7));
  const breath = moving ? 0.8 + 0.2 * Math.sin(nowMs / 2600 + seed) : 1;
  for (let s = 1; s < steps; s++) {
    const p = quadPoint(from.x, from.y, qx, qy, to.x, to.y, s / steps);
    paintDot(ctx, p.x, p.y, 0.75, color, alpha * 0.32 * breath);
  }
  if (!moving) return;
  const t = (nowMs / PHOTON_MS + hashUnit(`photon:${seed}`)) % 1;
  const fadeEnds = Math.min(1, t / 0.12, (1 - t) / 0.12);
  for (let s = 0; s < 14; s++) {
    const p = quadPoint(from.x, from.y, qx, qy, to.x, to.y, Math.max(0, t - s * 0.008));
    paintDot(ctx, p.x, p.y, 1.7 - s * 0.09, color, alpha * 0.75 * fadeEnds * Math.pow(1 - s / 14, 1.6));
  }
}
