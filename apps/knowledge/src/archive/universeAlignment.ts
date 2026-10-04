import { orbitOffset, type Body } from "./solarModel";
import { paintDot, TAU, type DotContext } from "./universeDraw";

/** Rare alignment: three planets on one line through the Hub (either side). Gilded and quiet when it happens. */

export const ALIGNMENT_TOLERANCE = 0.012;
export const ALIGNMENT_MS = 7500;

export function alignedTriple(planets: Body[], clock: number, tolerance = ALIGNMENT_TOLERANCE): number[] | null {
  if (planets.length < 3) return null;
  const angles = planets.map(planet => {
    const o = orbitOffset(planet, clock);
    return { idx: planet.idx, a: ((Math.atan2(o.y, o.x) % Math.PI) + Math.PI) % Math.PI };
  });
  angles.sort((p, q) => p.a - q.a);
  const n = angles.length;
  for (let s = 0; s < n; s++) {
    const first = angles[s]!;
    const third = angles[(s + 2) % n]!;
    let span = third.a - first.a;
    if (span < 0) span += Math.PI;
    if (span < tolerance) return [first.idx, angles[(s + 1) % n]!.idx, third.idx];
  }
  return null;
}

export function drawAlignment(
  ctx: DotContext,
  hub: { x: number; y: number },
  planets: Array<{ x: number; y: number; r: number }>,
  u: number,
  dark: boolean,
) {
  const fade = Math.sin(Math.PI * Math.max(0, Math.min(1, u))) ** 1.5;
  const gold = dark ? "#e9cf8a" : "#b08a2e";
  let far = 0;
  let fx = 0;
  let fy = 0;
  for (const p of planets) {
    const d = Math.hypot(p.x - hub.x, p.y - hub.y);
    if (d > far) {
      far = d;
      fx = p.x;
      fy = p.y;
    }
    const R = p.r + 3.5;
    for (let s = 0; s < 40; s++) {
      const a = (s / 40) * TAU;
      paintDot(ctx, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 0.55, gold, fade * 0.75);
    }
  }
  if (far <= 0) return;
  const dx = (fx - hub.x) / far;
  const dy = (fy - hub.y) / far;
  const span = far * 1.08;
  const shimmer = -span + 2 * span * u;
  for (let d = -span; d < span; d += 4) {
    const edge = 1 - Math.pow(Math.abs(d) / span, 3);
    const glow = Math.exp(-((d - shimmer) ** 2) / (2 * 40 * 40));
    paintDot(ctx, hub.x + dx * d, hub.y + dy * d, 0.5 + glow * 0.6, gold, fade * edge * (0.28 + glow * 0.6));
  }
}
