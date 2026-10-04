import type { SavedConstellation } from "../stars/schema";
import { buildStarsLayout } from "../stars/templates";
import { mulberry, paintDot, type DotContext } from "./universeDraw";

/** Parallax sky: three star layers that drift at different rates as the camera pans, plus saved constellations far back. */

export const SKY_TILE = 2048;

export type SkyStar = { x: number; y: number; r: number; twinkle: number; brightness: number };
export type SkyLayer = { factor: number; stars: SkyStar[] };
export type SkyFigure = { points: Array<{ x: number; y: number }>; segments: Array<[number, number]> };

const LAYERS = [
  { factor: 0.025, count: 520, r: [0.3, 0.75] },
  { factor: 0.07, count: 260, r: [0.4, 1.0] },
  { factor: 0.16, count: 90, r: [0.55, 1.35] },
] as const;

/** Mostly scattered stars, some loosely clumped, with a steep brightness falloff (few bright, many faint). */
export function buildSkyLayers(seed = 9173): SkyLayer[] {
  return LAYERS.map((layer, li) => {
    const rnd = mulberry(seed + li * 7919);
    const clumps = Array.from({ length: 5 }, () => ({ x: rnd() * SKY_TILE, y: rnd() * SKY_TILE, s: 60 + rnd() * 220 }));
    const stars = Array.from({ length: layer.count }, (): SkyStar => {
      let x: number;
      let y: number;
      if (rnd() < 0.28) {
        const clump = clumps[Math.floor(rnd() * clumps.length)]!;
        const angle = rnd() * Math.PI * 2;
        const dist = Math.sqrt(-2 * Math.log(1 - rnd() * 0.999)) * clump.s * 0.5;
        x = (clump.x + Math.cos(angle) * dist + SKY_TILE) % SKY_TILE;
        y = (clump.y + Math.sin(angle) * dist + SKY_TILE) % SKY_TILE;
      } else {
        x = rnd() * SKY_TILE;
        y = rnd() * SKY_TILE;
      }
      const magnitude = Math.pow(rnd(), 2.6);
      return {
        x,
        y,
        r: layer.r[0] + magnitude * (layer.r[1] - layer.r[0]),
        twinkle: rnd() * Math.PI * 2,
        brightness: 0.35 + magnitude * 0.65,
      };
    });
    return { factor: layer.factor, stars };
  });
}

/** Small figures for saved constellations, placed in the farthest layer using each one's saved sky position. */
export function skyFigures(saved: SavedConstellation[]): SkyFigure[] {
  return saved.map((item, index) => {
    const layout = buildStarsLayout(item.symbol.templateId, item.notes.length);
    const size = 46 * item.sky.scale;
    const cx = (item.sky.x ?? ((index * 0.618034) % 1)) * SKY_TILE;
    const cy = item.sky.y * SKY_TILE;
    const cos = Math.cos(item.sky.rotation);
    const sin = Math.sin(item.sky.rotation);
    const points = layout.points.map(point => {
      const dx = (point.x - 0.5) * size;
      const dy = (point.y - 0.5) * size;
      return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    });
    const segments = layout.segments
      .filter(segment => segment.source < points.length && segment.target < points.length)
      .map(segment => [segment.source, segment.target] as [number, number]);
    return { points, segments };
  });
}

function wrapOffset(pan: number, factor: number) {
  return ((pan * factor) % SKY_TILE + SKY_TILE) % SKY_TILE;
}

export function drawSky(
  ctx: DotContext,
  layers: SkyLayer[],
  figures: SkyFigure[],
  view: { x: number; y: number },
  width: number,
  height: number,
  seconds: number,
  dark: boolean,
) {
  const color = dark ? "#ffffff" : "#17375e";
  const base = dark ? 0.75 : 0.22;
  layers.forEach((layer, li) => {
    const ox = wrapOffset(view.x, layer.factor);
    const oy = wrapOffset(view.y, layer.factor);
    for (let tx = -SKY_TILE; tx < width + SKY_TILE; tx += SKY_TILE) {
      for (let ty = -SKY_TILE; ty < height + SKY_TILE; ty += SKY_TILE) {
        const left = ox + tx - SKY_TILE;
        const top = oy + ty - SKY_TILE;
        if (left > width || top > height || left + SKY_TILE < 0 || top + SKY_TILE < 0) continue;
        for (const star of layer.stars) {
          const x = star.x + left;
          const y = star.y + top;
          if (x < -2 || y < -2 || x > width + 2 || y > height + 2) continue;
          const twinkle = dark ? 0.7 + 0.3 * Math.sin(seconds * (0.6 + star.twinkle * 0.25) + star.twinkle) : 1;
          paintDot(ctx, x, y, star.r, color, base * twinkle * star.brightness);
        }
        if (li !== 0) continue;
        const figureAlpha = dark ? 0.22 : 0.16;
        for (const figure of figures) {
          for (const [a, b] of figure.segments) {
            const p = figure.points[a]!;
            const q = figure.points[b]!;
            const steps = Math.max(2, Math.floor(Math.hypot(q.x - p.x, q.y - p.y) / 3.5));
            for (let s = 1; s < steps; s++) {
              paintDot(ctx, left + p.x + ((q.x - p.x) * s) / steps, top + p.y + ((q.y - p.y) * s) / steps, 0.35, color, figureAlpha * 0.7);
            }
          }
          for (const point of figure.points) paintDot(ctx, left + point.x, top + point.y, 0.95, color, figureAlpha * 2.6);
        }
      }
    }
  });
}
