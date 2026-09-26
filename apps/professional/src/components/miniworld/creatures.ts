/**
 * Crab, plant, landmark drawing — ported from
 * docs/professional-hub/network-ecology/mockups/miniworld.html
 *
 * Shells are N pie-slices (one colour per community membership).
 */

export interface CrabDrawOpts {
  facing: number;
  walking?: boolean;
  dormant?: boolean;
  phase?: number;
  /** One shell colour per community the person belongs to. */
  shells: string[];
  /** Optional per-segment ink; falls back to first / default ink. */
  inks?: string[];
  /** Spiral colour override (e.g. You). */
  spiral?: string;
}

export interface PlantDrawOpts {
  badge?: boolean;
  opp?: boolean;
  reduceMotion?: boolean;
}

/** Mix two #rrggbb colours by t ∈ [0,1]. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

/**
 * Hermit crab from above. Body/legs when active; shell always.
 * N shells → N pie-slice segments around the spiral.
 */
export function drawCrab(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  o: CrabDrawOpts
): void {
  c.save();
  c.translate(x, y);
  if (o.facing < 0) c.scale(-1, 1);
  const body = '#e8a58a';
  const bodyInk = '#8a4e36';
  const phase = o.phase ?? 0;
  const bob = o.walking ? Math.sin(phase * 2) * 0.07 * s : 0;
  c.lineCap = 'round';
  if (!o.dormant) {
    c.strokeStyle = bodyInk;
    c.lineWidth = 0.17 * s;
    for (let i = 0; i < 3; i += 1) {
      const lx = s * (0.3 + 0.3 * i);
      const sw = o.walking ? Math.sin(phase + i * 2.1) * 0.2 * s : 0;
      c.beginPath();
      c.moveTo(lx, 0.45 * s);
      c.lineTo(lx + 0.22 * s + sw, 1.02 * s);
      c.stroke();
    }
    c.fillStyle = body;
    c.lineWidth = 0.11 * s;
    c.beginPath();
    c.ellipse(0.8 * s, 0.45 * s + bob, 0.55 * s, 0.36 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(1.36 * s, 0.55 * s + bob, 0.22 * s, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.lineWidth = 0.1 * s;
    c.beginPath();
    c.moveTo(0.95 * s, 0.2 * s + bob);
    c.lineTo(1.0 * s, -0.33 * s + bob);
    c.moveTo(1.15 * s, 0.22 * s + bob);
    c.lineTo(1.28 * s, -0.26 * s + bob);
    c.stroke();
    c.fillStyle = '#13233a';
    c.beginPath();
    c.arc(1.0 * s, -0.38 * s + bob, 0.13 * s, 0, Math.PI * 2);
    c.arc(1.28 * s, -0.31 * s + bob, 0.13 * s, 0, Math.PI * 2);
    c.fill();
  }

  // Shell
  c.translate(-0.05 * s, 0.02 * s + bob);
  if (o.dormant) c.rotate(0.5);

  const shells = o.shells.length ? o.shells : ['#cbc8bf'];
  const defaultInk = o.inks?.[0] ?? '#8f8c84';
  const ink = o.dormant ? '#8f8c84' : defaultInk;
  const n = shells.length;

  if (n === 1) {
    const shell = o.dormant ? mixHex(shells[0], '#cbc8bf', 0.65) : shells[0];
    c.fillStyle = shell;
    c.beginPath();
    c.arc(0, 0, s, 0, Math.PI * 2);
    c.fill();
  } else {
    // Pie-slice segments (bridge / multi-community).
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      const col = o.dormant ? mixHex(shells[i], '#cbc8bf', 0.65) : shells[i];
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, s, a0, a1);
      c.closePath();
      c.fill();
    }
  }

  c.strokeStyle = ink;
  c.lineWidth = 0.11 * s;
  c.beginPath();
  c.arc(0, 0, s, 0, Math.PI * 2);
  c.stroke();

  c.strokeStyle = o.spiral || ink;
  c.globalAlpha = o.spiral ? 1 : 0.6;
  c.lineWidth = 0.1 * s;
  c.beginPath();
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const a = t * Math.PI * 3.2;
    const rr = s * (0.82 - 0.72 * t);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.stroke();
  c.globalAlpha = 1;
  c.restore();
}

/** Quiet-crab "z" that drifts upward unless reduceMotion. */
export function drawSleep(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  reduceMotion = false
): void {
  const drift = reduceMotion ? 0 : (t / 1600) % 1;
  c.fillStyle = '#8f8c84';
  c.globalAlpha = reduceMotion ? 0.8 : 0.9 * (1 - drift);
  c.font = `600 ${s * 0.95}px Inter, sans-serif`;
  c.fillText('z', x + s * 0.7, y - s * (1.1 + drift * 0.9));
  c.globalAlpha = 1;
}

/** Sparkle for people new this year. */
export function drawSparkle(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  reduceMotion = false
): void {
  const k = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(t / 300);
  const r = s * 0.42 * k;
  c.fillStyle = '#d9a82e';
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

/** Opportunity flag (attending an upcoming event). */
export function drawFlag(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.strokeStyle = '#a85a0c';
  c.lineWidth = 0.12 * s;
  c.beginPath();
  c.moveTo(x, y - 0.9 * s);
  c.lineTo(x, y - 2.0 * s);
  c.stroke();
  c.fillStyle = '#f68620';
  c.beginPath();
  c.moveTo(x, y - 2.0 * s);
  c.lineTo(x + 0.75 * s, y - 1.75 * s);
  c.lineTo(x, y - 1.5 * s);
  c.fill();
}

/**
 * Mangrove ecotone plant + optional badge count.
 * Returns plant height (world units) for hit-testing / labels.
 */
export function drawPlant(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  sf: number,
  t: number,
  o: PlantDrawOpts = {}
): number {
  const h = (9 + 5 * Math.min(count, 5)) * sf;
  const sway = o.reduceMotion ? 0 : Math.sin(t / 1300) * 0.07;
  c.fillStyle = '#d9d0b8';
  c.beginPath();
  c.ellipse(x, y + 1 * sf, 7 * sf, 2.4 * sf, 0, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.translate(x, y);
  c.rotate(sway);
  c.strokeStyle = '#5f8a6a';
  c.lineWidth = 1.3 * sf;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(-1.5 * sf, -h * 0.5, 0, -h);
  c.stroke();
  const leaves = Math.min(count, 4) + 1;
  c.fillStyle = '#8fb59a';
  for (let i = 0; i < leaves; i += 1) {
    const side = i % 2 ? 1 : -1;
    const yy = -h * (0.22 + 0.16 * i);
    c.beginPath();
    c.ellipse(side * 3.4 * sf, yy, 3.4 * sf, 1.6 * sf, side * -0.5, 0, Math.PI * 2);
    c.fill();
  }
  if (count >= 3) {
    c.fillStyle = '#d7c9ea';
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      c.beginPath();
      c.arc(Math.cos(a) * 2.2 * sf, -h + Math.sin(a) * 2.2 * sf, 1.8 * sf, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = o.opp ? '#f68620' : '#e3c77f';
    c.beginPath();
    c.arc(0, -h, 1.4 * sf, 0, Math.PI * 2);
    c.fill();
  } else {
    c.fillStyle = o.opp ? '#f68620' : '#8fb59a';
    c.beginPath();
    c.ellipse(0, -h - 1 * sf, 1.8 * sf, 2.4 * sf, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  if (o.badge !== false) {
    const bx = x + 6 * sf;
    const by = y - h - 4 * sf;
    c.fillStyle = '#17375e';
    c.beginPath();
    c.arc(bx, by, 5.2 * sf, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = `700 ${6.6 * sf}px Inter, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(count), bx, by + 0.3 * sf);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
  }
  return h;
}

/** Stacked stone cairn — organisation landmark on land. */
export function drawCairn(c: CanvasRenderingContext2D, x: number, y: number, sf: number): void {
  c.strokeStyle = '#a99c7c';
  c.lineWidth = 0.6 * sf;
  (
    [
      [0, 6.5, 2.7, '#c9bd9d'],
      [-3.6, 4.8, 2.3, '#d6cbad'],
      [-6.6, 3.2, 1.8, '#e3d9bf']
    ] as const
  ).forEach(([dy, rx, ry, fill]) => {
    c.fillStyle = fill;
    c.beginPath();
    c.ellipse(x, y + dy * sf, rx * sf, ry * sf, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  });
}

/**
 * Buoy landmark for an open-sea organisation with exactly one known person.
 * Floats beside that drifter.
 */
export function drawBuoy(c: CanvasRenderingContext2D, x: number, y: number, sf: number): void {
  // Soft water shadow
  c.fillStyle = 'rgba(40,70,90,0.18)';
  c.beginPath();
  c.ellipse(x + 0.8 * sf, y + 2.2 * sf, 4.5 * sf, 1.6 * sf, 0, 0, Math.PI * 2);
  c.fill();
  // Stem
  c.strokeStyle = '#6b7788';
  c.lineWidth = 1.1 * sf;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y + 2 * sf);
  c.lineTo(x, y - 8 * sf);
  c.stroke();
  // Float body
  c.fillStyle = '#f68620';
  c.strokeStyle = '#a85a0c';
  c.lineWidth = 0.7 * sf;
  c.beginPath();
  c.ellipse(x, y - 2 * sf, 3.4 * sf, 4.2 * sf, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // Stripe
  c.fillStyle = '#fbf8f2';
  c.beginPath();
  c.ellipse(x, y - 2 * sf, 3.4 * sf, 1.1 * sf, 0, 0, Math.PI * 2);
  c.fill();
  // Cap
  c.fillStyle = '#17375e';
  c.beginPath();
  c.arc(x, y - 8.4 * sf, 1.6 * sf, 0, Math.PI * 2);
  c.fill();
}

/** Simple shell-only crab for far zoom (LOD). */
export function drawCrabLod(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  shells: string[],
  dormant = false
): void {
  const cols = shells.length ? shells : ['#cbc8bf'];
  const n = cols.length;
  if (n === 1) {
    c.fillStyle = dormant ? mixHex(cols[0], '#cbc8bf', 0.65) : cols[0];
    c.beginPath();
    c.arc(x, y, s, 0, Math.PI * 2);
    c.fill();
  } else {
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      c.fillStyle = dormant ? mixHex(cols[i], '#cbc8bf', 0.65) : cols[i];
      c.beginPath();
      c.moveTo(x, y);
      c.arc(x, y, s, a0, a1);
      c.closePath();
      c.fill();
    }
  }
  c.strokeStyle = dormant ? '#8f8c84' : 'rgba(80,70,55,0.45)';
  c.lineWidth = 0.08 * s;
  c.beginPath();
  c.arc(x, y, s, 0, Math.PI * 2);
  c.stroke();
}
