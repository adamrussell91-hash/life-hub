import type { AtlasModel } from "./atlasLayout";
import { BOOK_PALETTE } from "./palette";

/**
 * Paints the land: elevation is note gravity (every town is a hill, contested
 * notes are peaks), coloured by province, with contour lines, a navy coastline,
 * a sand fringe, shallows and sea ripples. Rendered once per book into an
 * offscreen canvas in world units; the view transforms it for pan and zoom.
 * The sea is left clear so the view's water shows through, and the surf along
 * each coast goes on its own half-resolution canvas so the view can let it breathe.
 */

export type TerrainCanvas = HTMLCanvasElement & { surf?: HTMLCanvasElement };

import { SEA_LEVEL } from "./islandShape";
import type { TerrainFrame } from "./atlasLayout";

const SEA = SEA_LEVEL;
const NO_FRAME: TerrainFrame = { unit: 1, ox: 0, oy: 0 };
const BAND = 0.17;
const PAPER: [number, number, number] = [251, 248, 242];
const NAVY: [number, number, number] = [23, 55, 94];
const WAVE: [number, number, number] = [55, 111, 183];
const UNEXPLORED: [number, number, number] = [234, 231, 218];
const LOOSE: [number, number, number] = [240, 207, 172];
const SAND: [number, number, number] = [236, 224, 198];
const SHALLOWS: [number, number, number] = [196, 220, 238];
// Kit pastels first (tokens.css --pastel-*), then the graph palette softened.
const PASTELS: Array<[number, number, number]> = [
  [220, 234, 250], [223, 233, 225], [241, 226, 182], [242, 223, 208], [232, 224, 241],
  ...BOOK_PALETTE.map(s => soften(s.fill)),
];

function soften(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number, p: number) => Math.round(c * 0.38 + p * 0.62);
  return [mix((n >> 16) & 255, PAPER[0]), mix((n >> 8) & 255, PAPER[1]), mix(n & 255, PAPER[2])];
}

function noise(seed: number) {
  const table = new Float32Array(512);
  let s = seed % 2147483647 || 11;
  for (let i = 0; i < 512; i += 1) {
    s = (s * 16807) % 2147483647;
    table[i] = s / 2147483647;
  }
  const at = (x: number, y: number) => table[(((x * 73 + y * 151) % 512) + 512) % 512]!;
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
}

/** Base hills shape the coast; relief (notes) only lifts land that is already land; seeds only claim colour. */
const BASE = 0;
const RELIEF = 1;
const SEED = 2;

/** `stretch` > 1 draws the hill out along `angle`; round when absent. */
type Source = { kind: number; vote: boolean; x: number; y: number; amp: number; sigma: number; region: number; cos: number; sin: number; along: number; across: number };

function source(kind: number, x: number, y: number, amp: number, sigma: number, region: number, vote: boolean, stretch = 1, angle = 0): Source {
  const k = Math.sqrt(Math.max(0.2, stretch));
  return { kind, vote, x, y, amp, sigma, region, cos: Math.cos(angle), sin: Math.sin(angle), along: 1 / (k * k), across: k * k };
}

function fade(c: [number, number, number]): [number, number, number] {
  return [0, 1, 2].map(i => Math.round(c[i]! * 0.4 + UNEXPLORED[i]! * 0.6)) as [number, number, number];
}

function sources(atlas: AtlasModel): { list: Source[]; colours: Array<[number, number, number]> } {
  const colours: Array<[number, number, number]> = [];
  const index = new Map<string, number>();
  atlas.provinces.forEach(p => {
    index.set(p.id, colours.length);
    const colour = PASTELS[p.colour % PASTELS.length]!;
    colours.push(!p.explored ? UNEXPLORED : p.neighbour ? fade(colour) : colour);
  });
  index.set("loose", colours.length);
  colours.push(LOOSE);
  const list: Source[] = atlas.towns.map(t =>
    source(RELIEF, t.x, t.y, (t.peak ? 1.5 : 1) * (0.62 + Math.min(0.5, t.size * 0.05)), t.peak ? 46 : 60, index.get(t.province) ?? -1, index.has(t.province)));
  // Every province is a seed: it colours the land nearest it. Equal reach, so regions split evenly between seeds.
  for (const p of atlas.provinces) list.push(source(SEED, p.x, p.y, 0, p.radius * 2, index.get(p.id)!, true));
  for (const l of atlas.land ?? []) {
    const region = index.get(l.province) ?? -1;
    list.push(source(BASE, l.x, l.y, l.amp, l.sigma, region, (l.vote ?? true) && region >= 0 && l.amp > 0, l.stretch, l.angle));
  }
  return { list, colours };
}

/** Height and region at a point, from the given sources. Noise is sampled in the frame's space. */
function sampler(list: Source[], seed: number, frame: TerrainFrame) {
  const n1 = noise(seed);
  const n2 = noise(seed * 3 + 1);
  const { unit, ox, oy } = frame;
  return (candidates: Iterable<number>, x: number, y: number) => {
    const nx = x / unit + ox;
    const ny = y / unit + oy;
    // Two octaves of warp: broad bends, then a craggier edge.
    const wx = x + ((n1(nx / 70, ny / 70) - 0.5) * 70 + (n2(nx / 19 + 40, ny / 19) - 0.5) * 16) * unit;
    const wy = y + ((n2(nx / 70, ny / 70) - 0.5) * 70 + (n1(nx / 19, ny / 19 + 40) - 0.5) * 16) * unit;
    let base = (n1(nx / 24, ny / 24) - 0.5) * 0.14;
    let relief = 0;
    let best = Infinity;
    let region = -1;
    for (const k of candidates) {
      const src = list[k]!;
      const ex = wx - src.x;
      const ey = wy - src.y;
      const u = ex * src.cos + ey * src.sin;
      const v = ey * src.cos - ex * src.sin;
      const d2 = u * u * src.along + v * v * src.across;
      if (src.kind !== SEED) {
        const h = src.amp * Math.exp(-d2 / (2 * src.sigma * src.sigma));
        if (src.kind === RELIEF) relief += h;
        else base += h;
      }
      if (src.vote) {
        const weighted = d2 / (src.sigma * src.sigma);
        if (weighted < best) {
          best = weighted;
          region = src.region;
        }
      }
    }
    // Notes raise hills inland but never move the shore.
    const t = Math.max(0, Math.min(1, (base - SEA) / 0.15));
    return { e: base + relief * t * t * (3 - 2 * t), region };
  };
}

/** The land as a function, for tests and anything that asks "is this land?" without a canvas. */
export function terrainField(atlas: AtlasModel, seed = 7) {
  const { list } = sources(atlas);
  const sample = sampler(list, seed, atlas.frame ?? NO_FRAME);
  const all = list.map((_, i) => i);
  return (x: number, y: number) => sample(all, x, y);
}

export function renderTerrain(atlas: AtlasModel, resolution = 1.25, seed = 7): TerrainCanvas {
  const canvas: TerrainCanvas = document.createElement("canvas");
  const w = Math.round(atlas.width * resolution);
  const h = Math.round(atlas.height * resolution);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { list, colours } = sources(atlas);
  const frame = atlas.frame ?? NO_FRAME;
  const sample = sampler(list, seed, frame);
  const elevation = new Float32Array(w * h);
  const region = new Int16Array(w * h).fill(-1);

  // Bin sources into blocks so each pixel only weighs the hills that can reach it.
  const BLOCK = 24;
  const bw = Math.ceil(w / BLOCK);
  const bh = Math.ceil(h / BLOCK);
  const bins: number[][] = Array.from({ length: bw * bh }, () => []);
  list.forEach((src, i) => {
    const reach = (src.sigma * 3 * Math.sqrt(Math.max(src.along, src.across)) + 60 * frame.unit) * resolution;
    const x0 = Math.max(0, Math.floor((src.x * resolution - reach) / BLOCK));
    const x1 = Math.min(bw - 1, Math.floor((src.x * resolution + reach) / BLOCK));
    const y0 = Math.max(0, Math.floor((src.y * resolution - reach) / BLOCK));
    const y1 = Math.min(bh - 1, Math.floor((src.y * resolution + reach) / BLOCK));
    for (let by = y0; by <= y1; by += 1) for (let bx = x0; bx <= x1; bx += 1) bins[by * bw + bx]!.push(i);
  });

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const at = sample(bins[Math.floor(j / BLOCK) * bw + Math.floor(i / BLOCK)]!, i / resolution, j / resolution);
      elevation[j * w + i] = at.e;
      region[j * w + i] = at.region;
    }
  }

  const image = ctx.createImageData(w, h);
  const data = image.data;
  const sw = Math.ceil(w / 2);
  const sh = Math.ceil(h / 2);
  const surfCanvas = document.createElement("canvas");
  surfCanvas.width = sw;
  surfCanvas.height = sh;
  const surfImage = new ImageData(sw, sh);
  const band = (e: number) => Math.floor((e - SEA) / BAND);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const k = j * w + i;
      const e = elevation[k]!;
      const r = i < w - 1 ? elevation[k + 1]! : e;
      const b = j < h - 1 ? elevation[k + w]! : e;
      let c: [number, number, number];
      let alpha = 255;
      if (e > SEA) {
        const base = colours[region[k]!] ?? UNEXPLORED;
        const unexplored = base === UNEXPLORED;
        const shade = Math.min(1, (e - SEA) * 0.2);
        c = [base[0] - shade * 26, base[1] - shade * 26, base[2] - shade * 22];
        // A beach where the land meets the water.
        if (!unexplored && e < SEA + 0.07) {
          const a = 0.7 * (1 - (e - SEA) / 0.07);
          c = [c[0] * (1 - a) + SAND[0] * a, c[1] * (1 - a) + SAND[1] * a, c[2] * (1 - a) + SAND[2] * a];
        }
        if (!unexplored && (band(e) !== band(r) || band(e) !== band(b))) {
          const a = 0.15 + Math.min(0.22, (e - SEA) * 0.08);
          c = [c[0] * (1 - a) + NAVY[0] * a, c[1] * (1 - a) + NAVY[1] * a, c[2] * (1 - a) + NAVY[2] * a];
        }
        const right = i < w - 1 ? region[k + 1]! : region[k]!;
        const below = j < h - 1 ? region[k + w]! : region[k]!;
        if ((right !== region[k] || below !== region[k]) && r > SEA && b > SEA && (i + j) % 7 < 4) {
          c = [c[0] * 0.55 + NAVY[0] * 0.45, c[1] * 0.55 + NAVY[1] * 0.45, c[2] * 0.55 + NAVY[2] * 0.45];
        }
      } else {
        // Clear water, tinted toward the shallows near a coast, with ripple lines.
        const depth = Math.max(0, Math.min(1, (e - 0.12) / (SEA - 0.12)));
        c = [...SHALLOWS];
        alpha = Math.round(depth * depth * 150);
        for (const [q, level] of [0.38, 0.33, 0.27, 0.2].entries()) {
          if ((e - level) * (r - level) < 0 || (e - level) * (b - level) < 0) {
            const a = 0.22 - q * 0.045;
            const under = alpha / 255;
            const total = a + under * (1 - a);
            c = [0, 1, 2].map(n => (WAVE[n]! * a + c[n]! * under * (1 - a)) / total) as [number, number, number];
            alpha = Math.round(total * 255);
          }
        }
        // Surf: a soft band just off the coast, on the half-size layer.
        if (e > SEA - 0.09 && i % 2 === 0 && j % 2 === 0) {
          const s = ((j / 2) * sw + i / 2) * 4;
          const f = 1 - (SEA - e) / 0.09;
          surfImage.data[s] = 255;
          surfImage.data[s + 1] = 255;
          surfImage.data[s + 2] = 255;
          surfImage.data[s + 3] = Math.round(f * f * 210);
        }
      }
      if ((e - SEA) * (r - SEA) < 0 || (e - SEA) * (b - SEA) < 0) {
        c = [...NAVY];
        alpha = 255;
      }
      const p = k * 4;
      data[p] = c[0];
      data[p + 1] = c[1];
      data[p + 2] = c[2];
      data[p + 3] = alpha;
    }
  }
  ctx.putImageData(image, 0, 0);
  surfCanvas.getContext("2d")?.putImageData(surfImage, 0, 0);
  canvas.surf = surfCanvas;
  return canvas;
}
