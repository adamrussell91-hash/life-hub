import type { AtlasModel } from "./atlasLayout";
import { BOOK_PALETTE } from "./palette";

/**
 * Paints the land: elevation is note gravity (every town is a hill, contested
 * notes are peaks), coloured by province, with contour lines, a navy coastline
 * and sea ripples. Rendered once per book into an offscreen canvas in world
 * units; the view transforms it for pan and zoom.
 */

const SEA = 0.42;
const BAND = 0.17;
const PAPER: [number, number, number] = [251, 248, 242];
const NAVY: [number, number, number] = [23, 55, 94];
const WAVE: [number, number, number] = [55, 111, 183];
const UNEXPLORED: [number, number, number] = [234, 231, 218];
const LOOSE: [number, number, number] = [240, 207, 172];
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

type Source = { x: number; y: number; amp: number; sigma: number; region: number };

function sources(atlas: AtlasModel): { list: Source[]; colours: Array<[number, number, number]> } {
  const colours: Array<[number, number, number]> = [];
  const index = new Map<string, number>();
  atlas.provinces.forEach(p => {
    index.set(p.id, colours.length);
    colours.push(p.explored ? PASTELS[p.colour % PASTELS.length]! : UNEXPLORED);
  });
  index.set("loose", colours.length);
  colours.push(LOOSE);
  const list: Source[] = atlas.towns.map(t => ({
    x: t.x,
    y: t.y,
    amp: (t.peak ? 1.5 : 1) * (0.62 + Math.min(0.5, t.size * 0.05)),
    sigma: t.peak ? 46 : 60,
    region: index.get(t.province)!,
  }));
  for (const p of atlas.provinces) {
    // Every province is land; unexplored ones are low and wide, waiting under fog.
    list.push({ x: p.x, y: p.y, amp: p.explored ? 0.5 : 0.6, sigma: p.radius * (p.explored ? 1.25 : 1.05), region: index.get(p.id)! });
  }
  return { list, colours };
}

export function renderTerrain(atlas: AtlasModel, resolution = 1.25, seed = 7): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = Math.round(atlas.width * resolution);
  const h = Math.round(atlas.height * resolution);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { list, colours } = sources(atlas);
  const n1 = noise(seed);
  const n2 = noise(seed * 3 + 1);
  const elevation = new Float32Array(w * h);
  const region = new Int16Array(w * h).fill(-1);

  // Bin sources into blocks so each pixel only weighs the hills that can reach it.
  const BLOCK = 24;
  const bw = Math.ceil(w / BLOCK);
  const bh = Math.ceil(h / BLOCK);
  const bins: number[][] = Array.from({ length: bw * bh }, () => []);
  list.forEach((src, i) => {
    const reach = (src.sigma * 3 + 40) * resolution;
    const x0 = Math.max(0, Math.floor((src.x * resolution - reach) / BLOCK));
    const x1 = Math.min(bw - 1, Math.floor((src.x * resolution + reach) / BLOCK));
    const y0 = Math.max(0, Math.floor((src.y * resolution - reach) / BLOCK));
    const y1 = Math.min(bh - 1, Math.floor((src.y * resolution + reach) / BLOCK));
    for (let by = y0; by <= y1; by += 1) for (let bx = x0; bx <= x1; bx += 1) bins[by * bw + bx]!.push(i);
  });

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const x = i / resolution;
      const y = j / resolution;
      const wx = x + (n1(x / 70, y / 70) - 0.5) * 70;
      const wy = y + (n2(x / 70, y / 70) - 0.5) * 70;
      let e = 0;
      let best = Infinity;
      let reg = -1;
      for (const k of bins[Math.floor(j / BLOCK) * bw + Math.floor(i / BLOCK)]!) {
        const src = list[k]!;
        const dx = wx - src.x;
        const dy = wy - src.y;
        const d2 = dx * dx + dy * dy;
        e += src.amp * Math.exp(-d2 / (2 * src.sigma * src.sigma));
        const weighted = d2 / (src.sigma * src.sigma);
        if (weighted < best) {
          best = weighted;
          reg = src.region;
        }
      }
      e += (n1(x / 24, y / 24) - 0.5) * 0.14;
      elevation[j * w + i] = e;
      region[j * w + i] = reg;
    }
  }

  const image = ctx.createImageData(w, h);
  const data = image.data;
  const band = (e: number) => Math.floor((e - SEA) / BAND);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const k = j * w + i;
      const e = elevation[k]!;
      const r = i < w - 1 ? elevation[k + 1]! : e;
      const b = j < h - 1 ? elevation[k + w]! : e;
      let c: [number, number, number];
      if (e > SEA) {
        const base = colours[region[k]!] ?? UNEXPLORED;
        const unexplored = base === UNEXPLORED;
        const shade = Math.min(1, (e - SEA) * 0.2);
        c = [base[0] - shade * 26, base[1] - shade * 26, base[2] - shade * 22];
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
        c = [...PAPER];
        for (const [q, level] of [0.38, 0.33, 0.27, 0.2].entries()) {
          if ((e - level) * (r - level) < 0 || (e - level) * (b - level) < 0) {
            const a = 0.22 - q * 0.045;
            c = [c[0] * (1 - a) + WAVE[0] * a, c[1] * (1 - a) + WAVE[1] * a, c[2] * (1 - a) + WAVE[2] * a];
          }
        }
      }
      if ((e - SEA) * (r - SEA) < 0 || (e - SEA) * (b - SEA) < 0) c = [...NAVY];
      const p = k * 4;
      data[p] = c[0];
      data[p + 1] = c[1];
      data[p + 2] = c[2];
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
