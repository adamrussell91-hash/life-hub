/**
 * Habitat / sea / sandbar / shoal drawing — ported from
 * docs/professional-hub/network-ecology/mockups/miniworld.html
 */

import type { HabitatType } from '@/domain/types';

export type TerrainHabitat = HabitatType;

export interface TexItem {
  fr: number;
  a: number;
  s: number;
  v: number;
}

export interface RegionDrawState {
  cx: number;
  cy: number;
  rCur: number;
  habitat: TerrainHabitat;
  s1: number;
  s2: number;
  s3: number;
  tex: TexItem[];
  reefTex: TexItem[];
}

export interface CrownPalette {
  shadow: string;
  base: string;
  mid: string;
  light: string;
}

export type SandbarStage = 'water' | 'land';

/** Shallow / beach paints from the mockup (intentional terrain hexes). */
export const SEA = {
  lagoon: '#b7e5de',
  lagoonSand: '#cfeee6',
  wetSand: '#d6c59b',
  sand: '#ebdfbc',
  shallowFar: '#bcdad9',
  shallowNear: '#c8e7e2'
} as const;

/** Outer shallow-water scale per habitat (includes fringing reef for island). */
export const OUTER: Record<TerrainHabitat, number> = {
  forest: 1.32,
  savannah: 1.32,
  reef: 1.36,
  wetland: 1.28,
  island: 1.78,
  sandbank: 1.3
};

export const LABEL_AT: Record<TerrainHabitat, number> = {
  forest: 1.12,
  savannah: 1.12,
  reef: 1.24,
  wetland: 1.14,
  island: 1.58,
  sandbank: 1.14
};

/** Habitat chrome used for labels / shells (mockup HAB + sandbank). */
export const HAB_COLORS: Record<
  TerrainHabitat,
  { label: string; fill: string; edge: string; shell: string; ink: string }
> = {
  forest: { label: 'Forest', fill: '#6f8f69', edge: '#2f4a36', shell: '#f1e4c6', ink: '#6e5a38' },
  reef: { label: 'Coral Reef', fill: '#a2d7cf', edge: '#1f5a5a', shell: '#f2bda2', ink: '#8a4e36' },
  savannah: { label: 'Savannah', fill: '#d6c486', edge: '#5e4a18', shell: '#b8805a', ink: '#5a3a22' },
  wetland: { label: 'Wetland', fill: '#afcabd', edge: '#3d5650', shell: '#eee8da', ink: '#56606e' },
  island: { label: 'Island', fill: '#9fbc86', edge: '#4e4064', shell: '#cdbde3', ink: '#5d4e70' },
  sandbank: { label: 'Sandbank', fill: '#ebe2c4', edge: '#7a6f4a', shell: '#e8dcc0', ink: '#6e5a38' }
};

type Pt = [number, number];
type Circle = [number, number, number];
type Ellipse = [number, number, number, number, number?];

export function blobR(r: RegionDrawState, a: number): number {
  const amp = r.habitat === 'savannah' ? 0.13 : r.habitat === 'island' ? 0.07 : 0.09;
  return (
    1 +
    amp * (0.5 * Math.sin(3 * a + r.s1) + 0.35 * Math.sin(5 * a + r.s2) + 0.4 * Math.sin(2 * a + r.s3)) +
    0.02 * Math.sin(8 * a + r.s2 * 2) +
    0.008 * Math.sin(13 * a + r.s1 * 3)
  );
}

export function blobPath(c: CanvasRenderingContext2D, r: RegionDrawState, scale = 1): void {
  const R = r.rCur * scale;
  const N = 96;
  const pts: Pt[] = [];
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const rr = R * blobR(r, a);
    pts.push([r.cx + Math.cos(a) * rr, r.cy + Math.sin(a) * rr]);
  }
  c.beginPath();
  const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[N - 1], pts[0]);
  c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < N; i += 1) {
    const m = mid(pts[i], pts[(i + 1) % N]);
    c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  c.closePath();
}

export function fillBlob(
  c: CanvasRenderingContext2D,
  r: RegionDrawState,
  scale: number,
  color: string
): void {
  c.fillStyle = color;
  blobPath(c, r, scale);
  c.fill();
}

export function strokeBlob(
  c: CanvasRenderingContext2D,
  r: RegionDrawState,
  scale: number,
  color: string,
  lw: number
): void {
  c.strokeStyle = color;
  c.lineWidth = lw;
  blobPath(c, r, scale);
  c.stroke();
}

export function texPos(r: RegionDrawState, it: TexItem, k = 1): Pt {
  const rr = r.rCur * blobR(r, it.a) * it.fr * k;
  return [r.cx + Math.cos(it.a) * rr, r.cy + Math.sin(it.a) * rr];
}

function circles(c: CanvasRenderingContext2D, list: Circle[], color: string): void {
  if (!list.length) return;
  c.fillStyle = color;
  c.beginPath();
  for (const [x, y, s] of list) {
    c.moveTo(x + s, y);
    c.arc(x, y, s, 0, Math.PI * 2);
  }
  c.fill();
}

function ellipses(c: CanvasRenderingContext2D, list: Ellipse[], color: string): void {
  if (!list.length) return;
  c.fillStyle = color;
  c.beginPath();
  for (const [x, y, rx, ry, rot = 0] of list) {
    c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
    c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  }
  c.fill();
}

/** Tree crowns lit from the top left, soft shadow to the bottom right. */
export function crowns(c: CanvasRenderingContext2D, lobes: Circle[], pal: CrownPalette): void {
  ellipses(
    c,
    lobes.map(([x, y, s]) => [x + s * 0.4, y + s * 0.5, s * 1.05, s * 0.85]),
    pal.shadow
  );
  circles(c, lobes, pal.base);
  circles(
    c,
    lobes.map(([x, y, s]) => [x - s * 0.25, y - s * 0.28, s * 0.58]),
    pal.mid
  );
  circles(
    c,
    lobes.map(([x, y, s]) => [x - s * 0.38, y - s * 0.42, s * 0.26]),
    pal.light
  );
}

export function palms(c: CanvasRenderingContext2D, list: Circle[]): void {
  const fr: Ellipse[] = [];
  const sh: Ellipse[] = [];
  for (const [x, y, s] of list) {
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2 + s;
      const f: Ellipse = [x + Math.cos(a) * 4.6 * s, y + Math.sin(a) * 4.6 * s, 4.8 * s, 1.35 * s, a];
      fr.push(f);
      sh.push([f[0] + 3 * s, f[1] + 3.5 * s, f[2], f[3], a]);
    }
  }
  ellipses(c, sh, 'rgba(40,70,50,0.22)');
  ellipses(c, fr, '#6f9a5c');
  ellipses(
    c,
    fr.map(([x, y, rx, ry, a = 0]) => [
      x - Math.cos(a) * rx * 0.2,
      y - Math.sin(a) * rx * 0.2,
      rx * 0.55,
      ry * 0.45,
      a
    ]),
    '#8db577'
  );
  circles(
    c,
    list.map(([x, y, s]) => [x, y, 1.3 * s]),
    '#8a6f4a'
  );
}

function beach(c: CanvasRenderingContext2D, r: RegionDrawState): void {
  fillBlob(c, r, 1.065, SEA.wetSand);
  fillBlob(c, r, 1.03, SEA.sand);
}

export function surf(c: CanvasRenderingContext2D, r: RegionDrawState, scale: number): void {
  strokeBlob(c, r, scale, 'rgba(255,255,255,0.55)', 1.4);
}

type ColoredCircle = Circle & { col?: string };

function brainCorals(c: CanvasRenderingContext2D, list: ColoredCircle[], colors: string[]): void {
  ellipses(
    c,
    list.map(([x, y, s]) => [x + s * 0.3, y + s * 0.4, s, s * 0.8]),
    'rgba(40,110,110,0.18)'
  );
  list.forEach((it, i) => {
    it.col = colors[i % colors.length];
  });
  for (const col of colors) {
    circles(
      c,
      list.filter((it) => it.col === col),
      col
    );
  }
  c.strokeStyle = 'rgba(120,70,60,0.28)';
  c.lineWidth = 0.6;
  c.beginPath();
  for (const [x, y, s] of list) {
    c.moveTo(x + s * 0.55, y);
    c.arc(x, y, s * 0.55, 0, Math.PI * 2);
    c.moveTo(x - s * 0.6, y - s * 0.1);
    c.quadraticCurveTo(x, y + s * 0.4, x + s * 0.6, y - s * 0.1);
  }
  c.stroke();
}

function staghorn(c: CanvasRenderingContext2D, list: Circle[]): void {
  c.strokeStyle = '#e8c3a2';
  c.lineWidth = 1.5;
  c.lineCap = 'round';
  c.beginPath();
  for (const [x, y, s] of list) {
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i - 2) * 0.55;
      const l = s * (0.8 + (i % 2) * 0.4);
      const ex = x + Math.cos(a) * l;
      const ey = y + Math.sin(a) * l;
      c.moveTo(x, y);
      c.lineTo(ex, ey);
      c.moveTo(ex - Math.cos(a) * l * 0.4, ey - Math.sin(a) * l * 0.4);
      c.lineTo(
        ex - Math.cos(a) * l * 0.4 + Math.cos(a + 0.8) * l * 0.35,
        ey - Math.sin(a) * l * 0.4 + Math.sin(a + 0.8) * l * 0.35
      );
    }
  }
  c.stroke();
}

function seaFans(c: CanvasRenderingContext2D, list: Circle[]): void {
  c.strokeStyle = 'rgba(160,125,190,0.8)';
  c.lineWidth = 0.7;
  c.beginPath();
  for (const [x, y, s] of list) {
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI / 2 + (i - 3) * 0.28;
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
    }
  }
  c.stroke();
  c.beginPath();
  for (const [x, y, s] of list) {
    c.moveTo(x + Math.cos(-Math.PI / 2 - 0.9) * s * 0.7, y + Math.sin(-Math.PI / 2 - 0.9) * s * 0.7);
    c.arc(x, y, s * 0.7, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9);
  }
  c.stroke();
}

function caustics(
  c: CanvasRenderingContext2D,
  list: [number, number, number, number][],
  t: number,
  reduceMotion: boolean
): void {
  if (reduceMotion) return;
  c.strokeStyle = 'rgba(255,255,255,0.3)';
  c.lineWidth = 0.8;
  c.beginPath();
  for (const [x, y, s, ph] of list) {
    const w = Math.sin(t / 1400 + ph) * 2;
    c.moveTo(x - 7 * s, y + w * 0.3);
    c.quadraticCurveTo(x - 2 * s, y - 3 * s + w, x + 3 * s, y);
    c.quadraticCurveTo(x + 6 * s, y + 2 * s - w, x + 9 * s, y - w * 0.3);
  }
  c.stroke();
}

export function drawForest(c: CanvasRenderingContext2D, r: RegionDrawState): void {
  beach(c, r);
  fillBlob(c, r, 0.97, '#b9c99a');
  fillBlob(c, r, 0.86, '#6f8f69');
  c.save();
  blobPath(c, r, 0.97);
  c.clip();
  const deep: Circle[] = [];
  const young: Circle[] = [];
  for (const it of r.tex) {
    const [x, y] = texPos(r, it);
    const inner = it.fr < 0.8;
    const s = (inner ? 7.2 : 3.8) * it.s;
    (inner ? deep : young).push(
      [x, y, s],
      [x + s * 0.62, y + s * 0.22, s * 0.72],
      [x - s * 0.5, y + s * 0.36, s * 0.64]
    );
  }
  crowns(c, young, {
    shadow: 'rgba(30,55,38,0.22)',
    base: '#89a97d',
    mid: '#9fbc8f',
    light: '#bcd3a8'
  });
  crowns(c, deep, {
    shadow: 'rgba(24,46,32,0.32)',
    base: '#5f8663',
    mid: '#739a72',
    light: '#94b88c'
  });
  c.restore();
}

export function drawSavannah(c: CanvasRenderingContext2D, r: RegionDrawState): void {
  beach(c, r);
  fillBlob(c, r, 0.97, '#d6c486');
  c.save();
  blobPath(c, r, 0.97);
  c.clip();
  const light: Ellipse[] = [];
  const dark: Ellipse[] = [];
  const earth: Ellipse[] = [];
  const tufts: Circle[] = [];
  const bushes: Circle[] = [];
  const acacia: Circle[] = [];
  for (const it of r.tex) {
    const [x, y] = texPos(r, it);
    if (it.v < 0.08) light.push([x, y, 22 * it.s, 12 * it.s, it.a]);
    else if (it.v < 0.15) dark.push([x, y, 18 * it.s, 10 * it.s, it.a]);
    else if (it.v < 0.18) earth.push([x, y, 8 * it.s, 5 * it.s, it.a]);
    else if (it.v < 0.25) acacia.push([x, y, it.s]);
    else if (it.v < 0.42) bushes.push([x, y, 2.4 * it.s]);
    else tufts.push([x, y, it.s]);
  }
  ellipses(c, light, 'rgba(230,216,162,0.8)');
  ellipses(c, dark, 'rgba(188,166,104,0.5)');
  ellipses(c, earth, 'rgba(196,160,112,0.55)');
  c.strokeStyle = 'rgba(150,126,62,0.5)';
  c.lineWidth = 0.8;
  c.lineCap = 'round';
  c.beginPath();
  for (const [x, y, s] of tufts) {
    c.moveTo(x - 1.8 * s, y + 1);
    c.lineTo(x - 0.9 * s, y - 2.4 * s);
    c.moveTo(x, y + 1);
    c.lineTo(x + 0.1 * s, y - 3 * s);
    c.moveTo(x + 1.8 * s, y + 1);
    c.lineTo(x + 0.9 * s, y - 2.2 * s);
  }
  c.stroke();
  ellipses(
    c,
    bushes.map(([x, y, s]) => [x + s * 0.6, y + s * 0.7, s * 1.1, s * 0.8]),
    'rgba(80,66,24,0.25)'
  );
  circles(c, bushes, '#7f8c50');
  circles(
    c,
    bushes.map(([x, y, s]) => [x - s * 0.3, y - s * 0.3, s * 0.5]),
    '#98a462'
  );
  ellipses(
    c,
    acacia.map(([x, y, s]) => [x + 7 * s, y + 6 * s, 15 * s, 7.5 * s]),
    'rgba(80,64,24,0.22)'
  );
  const lobes: Ellipse[] = [];
  for (const [x, y, s] of acacia) {
    lobes.push(
      [x, y, 8.5 * s, 5.2 * s],
      [x - 7 * s, y + 1 * s, 6 * s, 4 * s],
      [x + 7 * s, y + 0.6 * s, 6.4 * s, 4.1 * s],
      [x + 1 * s, y - 3 * s, 6 * s, 3.6 * s]
    );
  }
  ellipses(c, lobes, '#76874a');
  ellipses(
    c,
    lobes.map(([x, y, a, b]) => [x - a * 0.2, y - b * 0.3, a * 0.6, b * 0.5]),
    '#8e9f5c'
  );
  ellipses(
    c,
    lobes.map(([x, y, a, b]) => [x - a * 0.35, y - b * 0.45, a * 0.28, b * 0.22]),
    '#a8b774'
  );
  c.restore();
}

export function drawReef(
  c: CanvasRenderingContext2D,
  r: RegionDrawState,
  t: number,
  reduceMotion: boolean
): void {
  fillBlob(c, r, 1.2, '#a2d7cf');
  fillBlob(c, r, 1.08, '#93d0c9');
  fillBlob(c, r, 1.0, SEA.lagoon);
  fillBlob(c, r, 0.58, SEA.lagoonSand);
  c.save();
  blobPath(c, r, 1.2);
  c.clip();
  const brain: ColoredCircle[] = [];
  const stag: Circle[] = [];
  const fans: Circle[] = [];
  const caus: [number, number, number, number][] = [];
  for (const it of r.tex) {
    const [x, y] = texPos(r, it, 1.22);
    if (it.v < 0.45) brain.push([x, y, (3 + it.fr * 3) * it.s]);
    else if (it.v < 0.75) stag.push([x, y, 6 * it.s]);
    else fans.push([x, y, 5.5 * it.s]);
    if (it.v > 0.6) caus.push([x + 8, y + 6, it.s, it.a * 5]);
  }
  brainCorals(c, brain, ['#e2b49e', '#d9a9b8', '#cdb682', '#e8c9a8']);
  staghorn(c, stag);
  seaFans(c, fans);
  fillBlob(c, r, 1.2, 'rgba(150,212,210,0.24)');
  caustics(c, caus, t, reduceMotion);
  c.restore();
  strokeBlob(c, r, 1.15, 'rgba(236,220,196,0.9)', 4.5);
  surf(c, r, 1.22);
  fillBlob(c, r, 0.2, SEA.wetSand);
  fillBlob(c, r, 0.17, SEA.sand);
  palms(c, [
    [r.cx - 5, r.cy - 3, 0.9],
    [r.cx + 7, r.cy + 4, 0.75]
  ]);
}

export function drawWetland(
  c: CanvasRenderingContext2D,
  r: RegionDrawState,
  t: number,
  reduceMotion: boolean
): void {
  fillBlob(c, r, 1.12, '#bddad3');
  fillBlob(c, r, 1.02, '#afcabd');
  c.save();
  blobPath(c, r, 1.02);
  c.clip();
  const mud: Ellipse[] = [];
  const reeds: Circle[] = [];
  const pads: Circle[] = [];
  const rip: [number, number, number, number][] = [];
  for (const it of r.tex) {
    const [x, y] = texPos(r, it);
    if (it.v < 0.28) mud.push([x, y, 15 * it.s, 8 * it.s, it.a]);
    else if (it.v < 0.72) reeds.push([x, y, it.s]);
    else if (it.v < 0.85) pads.push([x, y, 2.4 * it.s]);
    else rip.push([x, y, it.s, it.a]);
  }
  ellipses(c, mud, 'rgba(200,188,150,0.9)');
  ellipses(
    c,
    mud.map(([x, y, a, b, rot]) => [x - a * 0.15, y - b * 0.2, a * 0.6, b * 0.5, rot]),
    'rgba(214,204,170,0.9)'
  );
  c.strokeStyle = '#9dbdb9';
  c.lineWidth = 3.2;
  c.lineCap = 'round';
  c.beginPath();
  const R = r.rCur;
  c.moveTo(r.cx - R, r.cy - R * 0.2);
  c.bezierCurveTo(r.cx - R * 0.4, r.cy + R * 0.3, r.cx + R * 0.1, r.cy - R * 0.4, r.cx + R, r.cy + R * 0.15);
  c.moveTo(r.cx - R * 0.2, r.cy + R);
  c.quadraticCurveTo(r.cx + R * 0.05, r.cy + R * 0.2, r.cx - R * 0.15, r.cy - R * 0.1);
  c.stroke();
  c.strokeStyle = '#6f8150';
  c.lineWidth = 0.8;
  c.beginPath();
  for (const [x, y, s] of reeds) {
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI / 2 + (i - 3) * 0.3;
      const l = (5 + (i % 3)) * s;
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
  }
  c.stroke();
  ellipses(
    c,
    reeds.flatMap(([x, y, s]) => [
      [x - 2 * s, y - 5.5 * s, 0.7 * s, 1.5 * s],
      [x + 1.6 * s, y - 6.2 * s, 0.7 * s, 1.5 * s]
    ]),
    '#8d7254'
  );
  c.fillStyle = '#7aa36d';
  c.beginPath();
  for (const [x, y, s] of pads) {
    c.moveTo(x, y);
    c.arc(x, y, s, 0.35, Math.PI * 2 - 0.1);
    c.closePath();
  }
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.4)';
  c.lineWidth = 0.9;
  c.beginPath();
  for (const [x, y, s, ph] of rip) {
    const g = reduceMotion ? 0 : (t / 3000 + ph) % 1;
    c.moveTo(x + (4 + g * 6) * s, y);
    c.ellipse(x, y, (4 + g * 6) * s, (1.6 + g * 2.2) * s, 0, 0, Math.PI * 2);
  }
  c.stroke();
  c.restore();
}

export function drawIsland(c: CanvasRenderingContext2D, r: RegionDrawState, _t: number): void {
  fillBlob(c, r, 1.5, '#a5dad2');
  fillBlob(c, r, 1.3, '#b9e6de');
  c.save();
  blobPath(c, r, 1.5);
  c.clip();
  const coral: ColoredCircle[] = [];
  const stag: Circle[] = [];
  for (const it of r.reefTex) {
    const [x, y] = texPos(r, it);
    (it.v < 0.6 ? coral : stag).push([x, y, (it.v < 0.6 ? 2.6 : 4.5) * it.s]);
  }
  brainCorals(c, coral, ['#e2b49e', '#d9a9b8', '#cdb682']);
  staghorn(c, stag);
  fillBlob(c, r, 1.5, 'rgba(150,212,210,0.22)');
  c.restore();
  strokeBlob(c, r, 1.44, 'rgba(236,220,196,0.9)', 4);
  surf(c, r, 1.52);
  beach(c, r);
  fillBlob(c, r, 0.9, '#9fbc86');
  c.save();
  blobPath(c, r, 0.9);
  c.clip();
  const shrubs: Circle[] = [];
  const flowers: Circle[] = [];
  const palmList: Circle[] = [];
  for (const it of r.tex) {
    const [x, y] = texPos(r, it);
    if (it.v < 0.3) palmList.push([x, y, 0.8 + it.s * 0.3]);
    else if (it.v < 0.7) shrubs.push([x, y, 3 * it.s]);
    else flowers.push([x, y, 1.3 * it.s]);
  }
  crowns(c, shrubs, {
    shadow: 'rgba(30,55,38,0.22)',
    base: '#7da36e',
    mid: '#92b67f',
    light: '#b1cc98'
  });
  circles(c, flowers, '#cdbde3');
  c.restore();
  palms(c, palmList);
}

/**
 * New community landform (plan adds; mockup lacks it).
 * Pale sand island with small seedling dots.
 */
export function drawSandbank(c: CanvasRenderingContext2D, r: RegionDrawState): void {
  beach(c, r);
  fillBlob(c, r, 0.97, '#ebe2c4');
  fillBlob(c, r, 0.88, '#f3ead0');
  c.save();
  blobPath(c, r, 0.97);
  c.clip();
  const seedlings: Circle[] = [];
  const pale: Ellipse[] = [];
  for (const it of r.tex) {
    const [x, y] = texPos(r, it);
    if (it.v < 0.2) pale.push([x, y, 14 * it.s, 8 * it.s, it.a]);
    else if (it.v < 0.55) seedlings.push([x, y, 1.1 + it.s * 0.9]);
  }
  ellipses(c, pale, 'rgba(250,244,226,0.85)');
  // Seedling dots: tiny green sprouts on pale sand.
  circles(c, seedlings, '#9bb57a');
  circles(
    c,
    seedlings.map(([x, y, s]) => [x - s * 0.15, y - s * 0.35, s * 0.45]),
    '#b5cc94'
  );
  c.strokeStyle = 'rgba(110,130,80,0.55)';
  c.lineWidth = 0.7;
  c.lineCap = 'round';
  c.beginPath();
  for (const [x, y, s] of seedlings) {
    c.moveTo(x, y + s * 0.2);
    c.lineTo(x + s * 0.05, y - s * 1.6);
    c.moveTo(x + s * 0.05, y - s * 0.9);
    c.lineTo(x - s * 0.7, y - s * 1.3);
    c.moveTo(x + s * 0.05, y - s * 0.9);
    c.lineTo(x + s * 0.75, y - s * 1.2);
  }
  c.stroke();
  c.restore();
  surf(c, r, 1.09);
}

export function drawRegionBody(
  c: CanvasRenderingContext2D,
  r: RegionDrawState,
  t: number,
  reduceMotion: boolean
): void {
  if (r.habitat === 'forest') {
    drawForest(c, r);
    surf(c, r, 1.09);
  } else if (r.habitat === 'savannah') {
    drawSavannah(c, r);
    surf(c, r, 1.09);
  } else if (r.habitat === 'reef') drawReef(c, r, t, reduceMotion);
  else if (r.habitat === 'wetland') drawWetland(c, r, t, reduceMotion);
  else if (r.habitat === 'island') drawIsland(c, r, t);
  else if (r.habitat === 'sandbank') drawSandbank(c, r);
}

function frac(n: number): number {
  return n - Math.floor(n);
}

interface Route {
  len: number;
  at: (t: number) => [number, number, number, number];
  path: (c: CanvasRenderingContext2D) => void;
}

function route(A: RegionDrawState, B: RegionDrawState, kA: number, kB: number): Route {
  const dx = B.cx - A.cx;
  const dy = B.cy - A.cy;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const x0 = A.cx + ux * A.rCur * kA;
  const y0 = A.cy + uy * A.rCur * kA;
  const x1 = B.cx - ux * B.rCur * kB;
  const y1 = B.cy - uy * B.rCur * kB;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const bow =
    (frac(Math.sin(A.cx * 0.13 + B.cy * 0.07) * 43758.5) < 0.5 ? -1 : 1) * len * 0.14;
  const cx = (x0 + x1) / 2 - uy * bow;
  const cy = (y0 + y1) / 2 + ux * bow;
  const at = (t: number): [number, number, number, number] => {
    const m = 1 - t;
    const x = m * m * x0 + 2 * m * t * cx + t * t * x1;
    const y = m * m * y0 + 2 * m * t * cy + t * t * y1;
    let tx = 2 * m * (cx - x0) + 2 * t * (x1 - cx);
    let ty = 2 * m * (cy - y0) + 2 * t * (y1 - cy);
    const tl = Math.hypot(tx, ty) || 1;
    return [x, y, tx / tl, ty / tl];
  };
  const path = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(cx, cy, x1, y1);
  };
  return { len, at, path };
}

const landEdge = (r: RegionDrawState): number =>
  r.habitat === 'island' ? 1.0 : r.habitat === 'reef' ? 1.1 : 0.95;

const shoalEdge = (r: RegionDrawState): number =>
  r.habitat === 'island' ? 1.4 : r.habitat === 'reef' ? 1.15 : 1.05;

function routeFor(
  A: RegionDrawState,
  B: RegionDrawState,
  kA: (r: RegionDrawState) => number,
  kB: (r: RegionDrawState) => number
): Route {
  return A.cx < B.cx || (A.cx === B.cx && A.cy < B.cy)
    ? route(A, B, kA(A), kB(B))
    : route(B, A, kA(B), kB(A));
}

/** Mangrove sandbar between two communities that share people. */
export function drawSandbar(
  c: CanvasRenderingContext2D,
  A: RegionDrawState,
  B: RegionDrawState,
  count: number,
  stage: SandbarStage
): void {
  const R = routeFor(A, B, landEdge, landEdge);
  c.lineCap = 'round';
  const stroke = (color: string, w: number) => {
    c.strokeStyle = color;
    c.lineWidth = w;
    R.path(c);
    c.stroke();
  };
  if (stage === 'water') {
    stroke('rgba(188,218,217,0.55)', 90 + 14 * count);
    stroke(SEA.shallowFar, 62 + 12 * count);
    stroke(SEA.shallowNear, 38 + 8 * count);
    return;
  }
  const w = 9 + 4 * count;
  stroke(SEA.wetSand, w + 5);
  stroke(SEA.sand, w);
  const steps = Math.floor(R.len / 10);
  const mang: Circle[] = [];
  const roots: [number, number, number, number, number][] = [];
  for (let i = 1; i < steps; i += 1) {
    const j = frac(Math.sin(i * 12.9898 + A.cx + B.cx) * 43758.5);
    if (j < 0.3) continue;
    const [px, py, tx, ty] = R.at(i / steps);
    const side = i % 2 ? 1 : -1;
    const off = w / 2 + 2 + j * 4;
    const nx = -ty * side;
    const ny = tx * side;
    const mx = px + nx * off;
    const my = py + ny * off;
    const s = 3 + j * 2.4;
    mang.push([mx, my, s], [mx + tx * s * 0.7, my + ty * s * 0.7, s * 0.72]);
    roots.push([mx + nx * s * 0.9, my + ny * s * 0.9, s, nx, ny]);
  }
  c.strokeStyle = 'rgba(120,98,66,0.35)';
  c.lineWidth = 0.6;
  c.beginPath();
  for (const [x, y, s, nx, ny] of roots) {
    for (let k = -1; k <= 1; k += 1) {
      const bx = x - ny * k * s * 0.5;
      const by = y + nx * k * s * 0.5;
      c.moveTo(bx, by);
      c.quadraticCurveTo(
        bx + nx * s * 0.5,
        by + ny * s * 0.5,
        bx + nx * s * 0.9 - ny * k * s * 0.3,
        by + ny * s * 0.9 + nx * k * s * 0.3
      );
    }
  }
  c.stroke();
  crowns(c, mang, {
    shadow: 'rgba(24,46,32,0.24)',
    base: '#4f7a55',
    mid: '#62906a',
    light: '#82ab82'
  });
}

/** Stepping stones where links cross without shared membership. */
export function drawShoal(
  c: CanvasRenderingContext2D,
  A: RegionDrawState,
  B: RegionDrawState,
  n: number,
  stage: SandbarStage
): void {
  const R = routeFor(A, B, shoalEdge, shoalEdge);
  if (stage === 'water') {
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(200,231,226,0.45)';
    c.lineWidth = 10 + 3 * n;
    R.path(c);
    c.stroke();
    return;
  }
  const steps = Math.floor(R.len / 26);
  const rocks: Circle[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const j = frac(Math.sin(i * 78.233 + A.cy + B.cx) * 43758.5);
    const [x, y, tx, ty] = R.at(i / steps);
    const o = (j - 0.5) * 7;
    rocks.push([x - ty * o, y + tx * o, 1.6 + j * 1.6]);
    if (j > 0.55) rocks.push([x - ty * o + 3.5, y + tx * o + 1.5, 1 + j]);
  }
  ellipses(
    c,
    rocks.map(([x, y, s]) => [x + 0.8, y + 1, s, s * 0.8]),
    'rgba(60,80,80,0.2)'
  );
  circles(c, rocks, '#b8ad92');
  circles(
    c,
    rocks.map(([x, y, s]) => [x - s * 0.3, y - s * 0.3, s * 0.45]),
    '#d2c8ae'
  );
}

export type SeaGlint = [number, number, number, number];

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded open-water glints (mockup rng(99)). */
export function makeSeaGlints(seed = 99, count = 220): SeaGlint[] {
  const R = mulberry32(seed);
  const glints: SeaGlint[] = [];
  for (let i = 0; i < count; i += 1) {
    glints.push([-300 + R() * 2200, -250 + R() * 1600, 0.6 + R() * 0.8, R() * 6]);
  }
  return glints;
}

const DEFAULT_GLINTS = makeSeaGlints();

/** Open-water glints and depth shimmer. */
export function drawSea(
  c: CanvasRenderingContext2D,
  t: number,
  reduceMotion: boolean,
  glints: SeaGlint[] = DEFAULT_GLINTS
): void {
  const buckets: SeaGlint[][] = [[], [], []];
  for (const g of glints) {
    const v = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t / 2600 + g[3]);
    buckets[Math.min(2, Math.floor(v * 3))].push(g);
  }
  buckets.forEach((list, i) => {
    c.strokeStyle = `rgba(255,255,255,${0.1 + i * 0.12})`;
    c.lineWidth = 1;
    c.beginPath();
    for (const [x, y, s] of list) {
      c.moveTo(x - 6 * s, y);
      c.quadraticCurveTo(x, y - 2.5 * s, x + 6 * s, y);
    }
    c.stroke();
  });
}

/**
 * Driftwood for open-sea people — a pale log cluster under a crab.
 * Scale `sf` is the world size factor (same as creature drawing).
 */
export function drawDriftwood(c: CanvasRenderingContext2D, x: number, y: number, sf: number): void {
  c.fillStyle = 'rgba(60,80,80,0.18)';
  c.beginPath();
  c.ellipse(x + 1.2 * sf, y + 1.4 * sf, 11 * sf, 4.2 * sf, -0.2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#c9b896';
  c.strokeStyle = '#9a8a68';
  c.lineWidth = 0.7 * sf;
  c.beginPath();
  c.ellipse(x, y, 10 * sf, 3.2 * sf, -0.25, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#d6c8a8';
  c.beginPath();
  c.ellipse(x + 3 * sf, y - 1.2 * sf, 6 * sf, 2.2 * sf, 0.35, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.strokeStyle = 'rgba(120,98,66,0.4)';
  c.lineWidth = 0.5 * sf;
  c.beginPath();
  c.moveTo(x - 6 * sf, y - 0.4 * sf);
  c.lineTo(x + 5 * sf, y + 0.6 * sf);
  c.moveTo(x - 2 * sf, y + 0.8 * sf);
  c.lineTo(x + 7 * sf, y - 0.2 * sf);
  c.stroke();
}

/** Small shoal patch under an open-sea person when not using driftwood. */
export function drawOpenSeaShoal(c: CanvasRenderingContext2D, x: number, y: number, sf: number): void {
  const rocks: Circle[] = [
    [x - 4 * sf, y + 1 * sf, 2.2 * sf],
    [x + 1 * sf, y - 0.5 * sf, 1.8 * sf],
    [x + 5 * sf, y + 1.5 * sf, 1.5 * sf]
  ];
  ellipses(
    c,
    rocks.map(([rx, ry, s]) => [rx + 0.6, ry + 0.8, s, s * 0.75]),
    'rgba(60,80,80,0.18)'
  );
  circles(c, rocks, '#b8ad92');
  circles(
    c,
    rocks.map(([rx, ry, s]) => [rx - s * 0.3, ry - s * 0.3, s * 0.4]),
    '#d2c8ae'
  );
}

/** Seeded texture points for a region (count matches mockup habitat tables). */
export function seedRegionTexture(
  habitat: TerrainHabitat,
  rng: () => number
): { tex: TexItem[]; reefTex: TexItem[] } {
  const count =
    habitat === 'forest' || habitat === 'savannah'
      ? 170
      : habitat === 'reef'
        ? 90
        : habitat === 'wetland'
          ? 70
          : habitat === 'island'
            ? 26
            : 50; // sandbank
  const tex: TexItem[] = [];
  for (let j = 0; j < count; j += 1) {
    tex.push({
      fr: Math.sqrt(rng()) * 0.94,
      a: rng() * Math.PI * 2,
      s: 0.7 + rng() * 0.6,
      v: rng()
    });
  }
  const reefTex: TexItem[] = [];
  if (habitat === 'island') {
    for (let j = 0; j < 70; j += 1) {
      reefTex.push({
        fr: 1.1 + rng() * 0.34,
        a: rng() * Math.PI * 2,
        s: 0.7 + rng() * 0.6,
        v: rng()
      });
    }
  }
  return { tex, reefTex };
}
