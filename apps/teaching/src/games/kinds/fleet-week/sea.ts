/**
 * Fleet week, the rendered chart (spec §3.4, visuals paragraph; mockup
 * docs/mockups/games/fleet-week.js, whose painters this reuses).
 *
 * One 5 × 5 chart drawn on a canvas: an aerial sea with shallows and surf, a
 * gentle swell, small islands on grid corners (never inside a square), drawn
 * ships, shell arcs, splashes, fire and smoke on hits, and fog over unknown
 * squares that lifts for the reveal. The tap targets stay DOM buttons layered
 * over the canvas; this module only paints underneath them.
 *
 * Calm (the reduced-motion setting or the game's Calm toggle) draws still
 * frames only: no animation frames, no particles, every state set at once.
 * The loop pauses while the tab is hidden. When the browser gives no 2D
 * context (jsdom, a blocked canvas), the host is marked `fw-sea--css` and the
 * chart keeps its CSS look.
 */
import { calm } from '../../motion/motion';
import { fnv1a } from './rules';

export type SeaMode = 'own' | 'rival' | 'reveal';
export type SeaTone = 'own' | 'mate' | 'rival' | 'teamA' | 'teamB' | 'sunk';
export type SeaShip = { squares: number[]; tone?: SeaTone };
/** What the chart shows: ships (by square index, row * size + col) and resolved shots. */
export type SeaChart = { ships?: SeaShip[]; marks?: Record<string | number, 'hit' | 'miss' | undefined> };
export type SeaOptions = { seed: string; mode: SeaMode; size?: number };
export type Sea = {
  /** False when there is no 2D context and the CSS look stays. */
  readonly live: boolean;
  update(chart: SeaChart): void;
  /** Reveal: the fog lifts, then the ships appear. Resolves when done. */
  lift(): Promise<void>;
  destroy(): void;
};

export type SeaIsland = { i: number; j: number; r: number; pts: number[]; tree: boolean };
export type SeaLayout = {
  islands: SeaIsland[];
  glints: Array<{ x: number; y: number; l: number; ph: number; sp: number }>;
  fog: Array<{ x: number; y: number; r: number; sp: number; d: boolean }>;
  paintSeed: number;
};

type Particle = { t: 'f' | 's' | 'd'; x: number; y: number; vx: number; vy: number; g?: number; life: number; max: number; r: number };
type Shell = { fx: number; fy: number; tx: number; ty: number; life: number; max: number; sq: number; hit: boolean };
type Ring = { x: number; y: number; life: number; max: number; r0: number; r1: number };
type Ctx = CanvasRenderingContext2D;

/** A small seeded source (mulberry32), the same as the mockup's. */
export function seaRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The seeded layout of one chart. Islands sit on grid corners only (i and j
 * are whole grid-line numbers, 0..size) and are small enough to stay out of
 * every square's middle; most are on inner corners, sometimes one on an edge.
 */
export function seaLayout(seed: string, size = 5): SeaLayout {
  const n = fnv1a(`fleet-sea:${seed}`);
  const R = seaRandom(n);
  const pool: Array<[number, number]> = [];
  for (let i = 1; i < size; i++) for (let j = 1; j < size; j++) pool.push([i, j]);
  const count = 3 + Math.floor(R() * 2);
  const corners: Array<[number, number]> = [];
  for (let k = 0; k < count && pool.length; k++) corners.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  if (R() < 0.6) {
    const edge = R() < 0.5 ? 0 : size;
    const along = 1 + Math.floor(R() * (size - 1));
    corners.push(R() < 0.5 ? [edge, along] : [along, edge]);
  }
  const islands = corners.map(([i, j]) => ({
    i,
    j,
    r: 0.095 + R() * 0.035, // in cells: sand reaches ~0.17 of a square, clear of its middle
    pts: Array.from({ length: 9 }, () => 0.78 + R() * 0.3),
    tree: R() < 0.6
  }));
  const glints = Array.from({ length: 46 }, () => ({ x: R(), y: R(), l: 0.012 + R() * 0.02, ph: R() * 6.28, sp: 0.6 + R() * 1.3 }));
  const fog = Array.from({ length: 16 }, () => ({ x: R(), y: R(), r: 0.18 + R() * 0.22, sp: 0.006 + R() * 0.01, d: R() < 0.3 }));
  return { islands, glints, fog, paintSeed: (n ^ 0x9e3779b9) >>> 0 };
}

// ── Painters (from the mockup) ───────────────────────────────────

function blob(g: Ctx, x: number, y: number, r: number, pts: number[]): void {
  g.beginPath();
  pts.forEach((p, i) => {
    const a = (i / pts.length) * Math.PI * 2;
    const px = x + Math.cos(a) * r * p;
    const py = y + Math.sin(a) * r * p;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  });
  g.closePath();
}

/** Base water, shallows and islands. Drawn once per size into an offscreen canvas. */
function paintSea(g: Ctx, W: number, H: number, s: number, size: number, layout: SeaLayout): void {
  const R = seaRandom(layout.paintSeed);
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#15628a');
  gr.addColorStop(1, '#0b3a57');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 28; i++) {
    const x = R() * W;
    const y = R() * H;
    const r = (0.12 + R() * 0.3) * Math.max(W, H);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, R() < 0.5 ? 'rgba(40,130,170,.16)' : 'rgba(4,28,48,.2)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  }
  g.strokeStyle = 'rgba(255,255,255,.05)';
  g.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = R() * W;
    const y = R() * H;
    const l = 4 + R() * 10;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + l / 2, y - 1.5, x + l, y);
    g.stroke();
  }
  for (const is of layout.islands) {
    const x = is.i * (W / size);
    const y = is.j * (H / size);
    const r = is.r * s;
    const sh = g.createRadialGradient(x, y, r * 0.6, x, y, r * 3.3);
    sh.addColorStop(0, 'rgba(98,214,200,.62)');
    sh.addColorStop(0.45, 'rgba(63,184,176,.28)');
    sh.addColorStop(1, 'rgba(63,184,176,0)');
    g.fillStyle = sh;
    g.beginPath();
    g.arc(x, y, r * 3.3, 0, 7);
    g.fill();
    g.fillStyle = '#e6d5a2';
    blob(g, x, y, r * 1.28, is.pts);
    g.fill();
    g.fillStyle = '#5b8a4a';
    blob(g, x, y, r, is.pts);
    g.fill();
    g.fillStyle = '#719f58';
    blob(g, x - r * 0.18, y - r * 0.2, r * 0.55, is.pts);
    g.fill();
    if (is.tree) {
      g.fillStyle = '#3f6b37';
      g.beginPath();
      g.arc(x + r * 0.25, y + r * 0.1, r * 0.22, 0, 7);
      g.fill();
    }
  }
}

const TONES: Record<SeaTone, { hull: string; deck: string; trim: string; top: string }> = {
  own: { hull: '#efe6d2', deck: '#d9c9a6', trim: '#f68620', top: '#8a6b3d' },
  mate: { hull: '#d6dde7', deck: '#b8c4d4', trim: '#5b8fd6', top: '#4b5d78' },
  rival: { hull: '#ecd9d6', deck: '#d2b5b0', trim: '#c2473f', top: '#6b3a36' },
  teamA: { hull: '#d7e3f4', deck: '#b3c6e2', trim: '#5b8fd6', top: '#2f4a72' },
  teamB: { hull: '#dcebe1', deck: '#b7d2c1', trim: '#4f9a72', top: '#2f5a43' },
  sunk: { hull: '#5b5452', deck: '#3d3736', trim: '#1e1a1a', top: '#2a2524' }
};

function roundRect(g: Ctx, x: number, y: number, w: number, hh: number, r: number): void {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A ship seen from above, centred on (cx, cy), n squares long. */
function drawShip(g: Ctx, cx: number, cy: number, n: number, horiz: boolean, s: number, tone: SeaTone, alpha: number): void {
  const T = TONES[tone] ?? TONES.mate;
  const L = n * s - s * 0.24;
  const w = s * (n === 1 ? 0.4 : 0.48);
  g.save();
  g.globalAlpha *= alpha;
  g.translate(cx, cy);
  if (!horiz) g.rotate(Math.PI / 2);
  const hull = (k: number) => {
    const l = L * k;
    const ww = w * k;
    g.beginPath();
    g.moveTo(-l / 2, -ww * 0.42);
    g.lineTo(l / 2 - ww * 0.95, -ww / 2);
    g.quadraticCurveTo(l / 2 - ww * 0.15, -ww * 0.42, l / 2, 0);
    g.quadraticCurveTo(l / 2 - ww * 0.15, ww * 0.42, l / 2 - ww * 0.95, ww / 2);
    g.lineTo(-l / 2, ww * 0.42);
    g.quadraticCurveTo(-l / 2 - ww * 0.14, 0, -l / 2, -ww * 0.42);
    g.closePath();
  };
  g.save();
  g.translate(s * 0.05, s * 0.07);
  hull(1);
  g.fillStyle = 'rgba(0,10,25,.32)';
  g.fill();
  g.restore();
  hull(1.08);
  g.strokeStyle = 'rgba(255,255,255,.28)';
  g.lineWidth = Math.max(1, s * 0.03);
  g.stroke();
  hull(1);
  g.fillStyle = T.hull;
  g.fill();
  g.strokeStyle = T.trim;
  g.lineWidth = Math.max(1.2, s * 0.035);
  g.stroke();
  hull(0.72);
  g.fillStyle = T.deck;
  g.fill();
  const sw = Math.min(L * 0.32, s * 0.7);
  g.fillStyle = T.top;
  g.beginPath();
  roundRect(g, -sw / 2 - s * 0.05, -w * 0.2, sw, w * 0.4, w * 0.08);
  g.fill();
  g.fillStyle = T.hull;
  g.beginPath();
  g.arc(-s * 0.05, 0, w * 0.1, 0, 7);
  g.fill();
  const tur = (x: number, dir: number) => {
    g.fillStyle = T.top;
    g.beginPath();
    g.arc(x, 0, w * 0.17, 0, 7);
    g.fill();
    g.strokeStyle = T.top;
    g.lineWidth = w * 0.08;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + dir * w * 0.42, 0);
    g.stroke();
  };
  if (n >= 2) {
    tur(L / 2 - w * 1.1, 1);
    tur(-L / 2 + w * 0.55, -1);
  }
  if (n >= 3) tur(L / 2 - w * 1.65, 1);
  g.restore();
}

function emitFire(P: Particle[], x: number, y: number, s: number, dt: number): void {
  const nF = (Math.random() < dt * 34 ? 1 : 0) + (Math.random() < dt * 20 ? 1 : 0);
  const nS = Math.random() < dt * 7 ? 1 : 0;
  for (let i = 0; i < nF; i++) P.push({ t: 'f', x: x + (Math.random() - 0.5) * s * 0.26, y: y + (Math.random() - 0.5) * s * 0.18, vx: (Math.random() - 0.5) * s * 0.12, vy: -s * (0.35 + Math.random() * 0.45), life: 0, max: 0.45 + Math.random() * 0.35, r: s * (0.05 + Math.random() * 0.05) });
  for (let i = 0; i < nS; i++) P.push({ t: 's', x: x + (Math.random() - 0.5) * s * 0.2, y: y - s * 0.1, vx: s * (0.12 + Math.random() * 0.1), vy: -s * (0.22 + Math.random() * 0.15), life: 0, max: 2 + Math.random() * 1.2, r: s * (0.06 + Math.random() * 0.04) });
}

function stepParticles(P: Particle[], dt: number): void {
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.life += dt;
    if (p.life > p.max) {
      P.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.t === 'd') p.vy += (p.g ?? 0) * dt;
  }
  if (P.length > 500) P.splice(0, P.length - 500);
}

function drawParticles(g: Ctx, P: Particle[]): void {
  for (const p of P) {
    if (p.t !== 's') continue;
    const k = p.life / p.max;
    const r = p.r * (1 + k * 2.6);
    g.fillStyle = `rgba(${(70 + k * 60) | 0},${(74 + k * 60) | 0},${(82 + k * 60) | 0},${0.5 * (1 - k)})`;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, 7);
    g.fill();
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const p of P) {
    if (p.t !== 'f') continue;
    const k = p.life / p.max;
    g.fillStyle = k < 0.3 ? `rgba(255,240,180,${0.9 - k})` : k < 0.65 ? `rgba(255,160,60,${0.85 - k * 0.6})` : `rgba(220,70,40,${0.6 * (1 - k)})`;
    g.beginPath();
    g.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, 7);
    g.fill();
  }
  g.restore();
  for (const p of P) {
    if (p.t !== 'd') continue;
    const k = p.life / p.max;
    g.fillStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
    g.beginPath();
    g.arc(p.x, p.y, p.r, 0, 7);
    g.fill();
  }
}

/** A still flame and smoke, for calm. */
function staticFire(g: Ctx, x: number, y: number, s: number): void {
  for (const [dx, dy, r] of [[0.2, -0.32, 0.17], [0.32, -0.55, 0.2], [0.08, -0.2, 0.13]]) {
    g.fillStyle = 'rgba(80,84,92,.42)';
    g.beginPath();
    g.arc(x + dx * s, y + dy * s, r * s, 0, 7);
    g.fill();
  }
  const rg = g.createRadialGradient(x, y, 0, x, y, s * 0.36);
  rg.addColorStop(0, 'rgba(255,230,150,.95)');
  rg.addColorStop(0.4, 'rgba(255,140,50,.7)');
  rg.addColorStop(1, 'rgba(229,72,47,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.arc(x, y, s * 0.36, 0, 7);
  g.fill();
}

function context(canvas: HTMLCanvasElement): Ctx | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

function marksOf(chart: SeaChart): Map<number, 'hit' | 'miss'> {
  const out = new Map<number, 'hit' | 'miss'>();
  for (const [k, v] of Object.entries(chart.marks ?? {})) if (v === 'hit' || v === 'miss') out.set(Number(k), v);
  return out;
}

// ── The sea ──────────────────────────────────────────────────────

export function createSea(host: HTMLElement, options: SeaOptions): Sea {
  const size = options.size ?? 5;
  const mode = options.mode;
  const canvas = document.createElement('canvas');
  canvas.className = 'fw-sea-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const g = context(canvas);
  if (!g) {
    host.classList.add('fw-sea--css');
    return { live: false, update() {}, lift: () => Promise.resolve(), destroy() { host.classList.remove('fw-sea--css'); } };
  }
  host.classList.add('fw-sea--canvas');
  host.append(canvas);

  const layout = seaLayout(options.seed, size);
  let ships: SeaShip[] = [];
  let marks = new Map<number, 'hit' | 'miss'>();
  let first = true;
  let fog = mode === 'own' ? 0 : 1;
  let shipAlpha = mode === 'reveal' ? 0 : 1;
  let lifting: { t0: number; done: () => void } | null = null;
  const pendingFire = new Set<number>(); // hits whose shell is still in the air
  const P: Particle[] = [];
  let shells: Shell[] = [];
  let rings: Ring[] = [];

  let W = 0;
  let H = 0;
  let s = 0;
  let dpr = 1;
  let base: HTMLCanvasElement | null = null;
  let fogC: HTMLCanvasElement | null = null;
  let raf = 0;
  let lastT = 0;
  let destroyed = false;

  const still = () => calm();
  const center = (sq: number) => ({ x: ((sq % size) + 0.5) * (W / size), y: (Math.floor(sq / size) + 0.5) * (H / size) });

  function resize(): void {
    const w = host.clientWidth;
    const h = host.clientHeight || w;
    if (!w || !h) return;
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (w === W && h === H && d === dpr && base) return;
    W = w;
    H = h;
    dpr = d;
    s = Math.min(W, H) / size;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    base = document.createElement('canvas');
    base.width = canvas.width;
    base.height = canvas.height;
    const bg = context(base);
    if (bg) {
      bg.scale(dpr, dpr);
      paintSea(bg, W, H, s, size, layout);
    }
    fogC = document.createElement('canvas');
    fogC.width = canvas.width;
    fogC.height = canvas.height;
    draw(still() ? 0 : performance.now() / 1000);
  }

  function step(dt: number): void {
    if (lifting) {
      const k = Math.min(1, (performance.now() - lifting.t0) / 2600);
      fog = 1 - (1 - Math.pow(1 - k, 3));
      shipAlpha = Math.max(0, Math.min(1, (k - 0.35) / 0.5));
      if (k >= 1) {
        const done = lifting.done;
        lifting = null;
        done();
      }
    }
    for (const [sq, m] of marks) {
      if (m !== 'hit' || pendingFire.has(sq)) continue;
      const c = center(sq);
      emitFire(P, c.x, c.y, s, dt);
    }
    stepParticles(P, dt);
    for (const sh of shells) {
      sh.life += dt;
      if (sh.life >= sh.max) splash(sh);
    }
    shells = shells.filter((sh) => sh.life < sh.max);
    for (const r of rings) r.life += dt;
    rings = rings.filter((r) => r.life < r.max);
  }

  function splash(sh: Shell): void {
    pendingFire.delete(sh.sq);
    const { tx: x, ty: y } = sh;
    rings.push({ x, y, life: 0, max: 0.8, r0: s * 0.08, r1: s * 0.5 });
    const n = sh.hit ? 10 : 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const v = s * (0.6 + Math.random() * 0.9);
      P.push({ t: 'd', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - s * 0.8, g: s * 3.2, life: 0, max: 0.55 + Math.random() * 0.3, r: s * (0.018 + Math.random() * 0.02) });
    }
    if (sh.hit) for (let i = 0; i < 14; i++) P.push({ t: 'f', x: x + (Math.random() - 0.5) * s * 0.3, y: y + (Math.random() - 0.5) * s * 0.3, vx: (Math.random() - 0.5) * s * 1.2, vy: -s * (0.3 + Math.random() * 0.9), life: 0, max: 0.35 + Math.random() * 0.3, r: s * (0.06 + Math.random() * 0.06) });
  }

  function draw(t: number): void {
    if (!W || !base || !g) return;
    const calmNow = still();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(base, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Swell: broad soft bands drifting across the water.
    for (let k = 0; k < 4; k++) {
      const y = ((k / 4 + (calmNow ? 0 : t * 0.018)) % 1) * (H + s * 2) - s;
      const gr = g.createLinearGradient(0, y - s * 0.7, 0, y + s * 0.7);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(160,220,240,.07)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, y - s * 0.7, W, s * 1.4);
    }
    // Glints.
    for (const p of layout.glints) {
      const a = calmNow ? 0.18 : Math.pow(Math.max(0, Math.sin(t * p.sp + p.ph)), 3) * 0.5;
      if (a < 0.02) continue;
      const x = (p.x * W + (calmNow ? 0 : t * 4)) % W;
      const y = p.y * H;
      g.strokeStyle = `rgba(255,255,255,${a})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + p.l * W, y);
      g.stroke();
    }
    // Surf around each island.
    layout.islands.forEach((is, i) => {
      const x = is.i * (W / size);
      const y = is.j * (H / size);
      const r = is.r * s;
      g.save();
      g.setLineDash([s * 0.06, s * 0.045]);
      g.lineDashOffset = calmNow ? 0 : -t * 12 - i * 5;
      g.strokeStyle = 'rgba(255,255,255,.7)';
      g.lineWidth = Math.max(1.2, s * 0.025);
      g.beginPath();
      g.arc(x, y, r * 1.55, 0, 7);
      g.stroke();
      g.restore();
      const br = r * (1.95 + (calmNow ? 0 : Math.sin(t * 1.4 + i) * 0.16));
      g.strokeStyle = 'rgba(255,255,255,.28)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, br, 0, 7);
      g.stroke();
    });
    // Ships.
    if (shipAlpha > 0) {
      for (const sh of ships) {
        const sq = [...sh.squares].sort((a, b) => a - b);
        if (!sq.length) continue;
        const a = center(sq[0]);
        const b = center(sq[sq.length - 1]);
        const horiz = sq.length === 1 || sq[1] - sq[0] === 1;
        drawShip(g, (a.x + b.x) / 2, (a.y + b.y) / 2, sq.length, horiz, s, sh.tone ?? (mode === 'own' ? 'own' : 'teamA'), shipAlpha);
      }
    }
    // Fog, with clear holes over squares already known.
    if (fog > 0.001 && fogC) {
      const f = context(fogC);
      if (f) {
        f.setTransform(1, 0, 0, 1, 0, 0);
        f.clearRect(0, 0, fogC.width, fogC.height);
        f.setTransform(dpr, 0, 0, dpr, 0, 0);
        f.fillStyle = 'rgba(206,216,226,.62)';
        f.fillRect(0, 0, W, H);
        for (const b of layout.fog) {
          const r = b.r * W;
          const span = W + 2 * r;
          const x = ((b.x * span + (calmNow ? 0 : t * b.sp * W)) % span) - r;
          const y = b.y * H;
          const rg = f.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, b.d ? 'rgba(150,164,182,.4)' : 'rgba(244,247,250,.7)');
          rg.addColorStop(1, 'rgba(244,247,250,0)');
          f.fillStyle = rg;
          f.beginPath();
          f.arc(x, y, r, 0, 7);
          f.fill();
        }
        f.globalCompositeOperation = 'destination-out';
        for (const sq of marks.keys()) {
          const c = center(sq);
          const rg = f.createRadialGradient(c.x, c.y, s * 0.15, c.x, c.y, s * 0.68);
          rg.addColorStop(0, 'rgba(0,0,0,1)');
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          f.fillStyle = rg;
          f.beginPath();
          f.arc(c.x, c.y, s * 0.68, 0, 7);
          f.fill();
        }
        f.globalCompositeOperation = 'source-over';
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = fog;
        g.drawImage(fogC, 0, 0);
        g.restore();
      }
    }
    // Fire and smoke.
    if (calmNow) {
      for (const [sq, m] of marks) {
        if (m !== 'hit') continue;
        const c = center(sq);
        staticFire(g, c.x, c.y, s);
      }
    } else drawParticles(g, P);
    // Splash rings.
    for (const r of rings) {
      const k = r.life / r.max;
      g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
      g.lineWidth = Math.max(1.5, s * 0.04 * (1 - k));
      g.beginPath();
      g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2)), 0, 7);
      g.stroke();
    }
    // Shells in flight: a shadow on the water, a trail and the shell.
    for (const sh of shells) {
      const pos = (k: number) => ({ x: sh.fx + (sh.tx - sh.fx) * k, y: sh.fy + (sh.ty - sh.fy) * k - 4 * k * (1 - k) * H * 0.42 });
      const k = Math.min(1, sh.life / sh.max);
      const ground = { x: sh.fx + (sh.tx - sh.fx) * k, y: sh.fy + (sh.ty - sh.fy) * k };
      g.fillStyle = 'rgba(0,10,25,.35)';
      g.beginPath();
      g.ellipse(ground.x, ground.y, s * 0.08, s * 0.045, 0, 0, 7);
      g.fill();
      for (let j = 1; j <= 10; j++) {
        const p = pos(Math.max(0, k - j * 0.018));
        g.fillStyle = `rgba(255,236,190,${0.5 * (1 - j / 10)})`;
        g.beginPath();
        g.arc(p.x, p.y, s * 0.045 * (1 - j / 14), 0, 7);
        g.fill();
      }
      const p = pos(k);
      const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 0.16);
      rg.addColorStop(0, 'rgba(255,240,200,.9)');
      rg.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(p.x, p.y, s * 0.16, 0, 7);
      g.fill();
      g.fillStyle = '#fff6dc';
      g.beginPath();
      g.arc(p.x, p.y, s * 0.05, 0, 7);
      g.fill();
    }
  }

  // ── Loop: runs only when moving is allowed, the tab shows and the host is in the page.
  function tick(now: number): void {
    raf = 0;
    if (destroyed || still() || document.visibilityState === 'hidden') return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    if (host.isConnected) {
      if (!W) resize();
      step(dt);
      draw(now / 1000);
    }
    raf = requestAnimationFrame(tick);
  }
  function kick(): void {
    if (destroyed) return;
    if (still()) {
      draw(0);
      return;
    }
    if (!raf && document.visibilityState !== 'hidden' && typeof requestAnimationFrame === 'function') {
      lastT = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  const onVisibility = () => (document.visibilityState === 'hidden' ? stop() : kick());
  document.addEventListener('visibilitychange', onVisibility);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(host);
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  resize();
  kick();

  return {
    live: true,
    update(chart: SeaChart): void {
      if (destroyed) return;
      ships = chart.ships ?? [];
      const next = marksOf(chart);
      if (!first && !still() && W) {
        for (const [sq, m] of next) {
          if (marks.get(sq) === m) continue;
          const to = center(sq);
          // Our shells rise from the bottom edge; theirs come in over the top.
          const fy = mode === 'own' ? -s * 0.6 : H + s * 0.6;
          shells.push({ fx: W / 2, fy, tx: to.x, ty: to.y, life: 0, max: 1.05, sq, hit: m === 'hit' });
          if (m === 'hit') pendingFire.add(sq);
        }
      }
      marks = next;
      first = false;
      if (still()) draw(0);
      else kick();
    },
    lift(): Promise<void> {
      if (destroyed) return Promise.resolve();
      if (still() || document.visibilityState === 'hidden') {
        fog = 0;
        shipAlpha = 1;
        draw(0);
        return Promise.resolve();
      }
      return new Promise<void>((done) => {
        lifting = { t0: performance.now(), done };
        kick();
      });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      stop();
      ro?.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      lifting?.done();
      canvas.remove();
      host.classList.remove('fw-sea--canvas');
    }
  };
}
