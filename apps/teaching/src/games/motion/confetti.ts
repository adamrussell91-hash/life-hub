import { calm } from './motion';

/** Token names the confetti reads its colours from (games.css), with the mockup palette as fallback. */
const COLOUR_TOKENS: Array<[string, string]> = [
  ['--game-gold', '#f2c14e'],
  ['--game-team-1', '#5b8fd6'],
  ['--game-team-2', '#4f9a72'],
  ['--game-team-3', '#e0894a'],
  ['--game-team-4', '#a585cf'],
  ['--game-confetti-light', '#ffffff']
];

export const CONFETTI_MAX = 150;
export const CONFETTI_MS = 1800;

function colours(host: HTMLElement): string[] {
  let style: CSSStyleDeclaration | null = null;
  try {
    style = getComputedStyle(host);
  } catch {
    style = null;
  }
  return COLOUR_TOKENS.map(([name, fallback]) => style?.getPropertyValue(name).trim() || fallback);
}

/**
 * One confetti burst (spec §5.2): a single canvas over `host`, at most 150
 * pieces, 1.8 s, then the canvas is removed. Nothing at all in calm.
 * Resolves when the canvas is gone.
 */
export function confetti(host: HTMLElement, options: { pieces?: number; ms?: number } = {}): Promise<void> {
  if (calm()) return Promise.resolve();
  const count = Math.min(CONFETTI_MAX, Math.max(0, options.pieces ?? CONFETTI_MAX));
  const ms = Math.min(CONFETTI_MS, options.ms ?? CONFETTI_MS);
  const canvas = document.createElement('canvas');
  canvas.className = 'gm-confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const w = host.clientWidth || 390;
  const h = host.clientHeight || 640;
  canvas.width = w;
  canvas.height = h;
  host.append(canvas);
  let g: CanvasRenderingContext2D | null = null;
  try {
    g = canvas.getContext('2d');
  } catch {
    g = null;
  }
  if (!g || typeof requestAnimationFrame !== 'function') {
    canvas.remove();
    return Promise.resolve();
  }
  const ctx = g;
  const cols = colours(host);
  // Pieces scale with the host so a phone gets a phone-sized burst.
  const k = Math.max(0.35, Math.min(1, w / 1920));
  const ps = Array.from({ length: count }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 300 * k,
    y: h * 0.55,
    vx: (Math.random() - 0.5) * 26 * k,
    vy: (-Math.random() * 30 - 12) * Math.sqrt(k),
    r: Math.random() * 6.28,
    vr: (Math.random() - 0.5) * 0.4,
    w: (10 + Math.random() * 12) * k,
    h: (6 + Math.random() * 8) * k,
    c: cols[Math.floor(Math.random() * cols.length)]
  }));
  const gravity = 0.9 * Math.sqrt(k);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (t: number) => {
      const p = (t - t0) / ms;
      ctx.clearRect(0, 0, w, h);
      for (const q of ps) {
        q.vy += gravity;
        q.vx *= 0.99;
        q.x += q.vx;
        q.y += q.vy;
        q.r += q.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p * p);
        ctx.translate(q.x, q.y);
        ctx.rotate(q.r);
        ctx.fillStyle = q.c;
        ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
        ctx.restore();
      }
      if (p < 1 && canvas.isConnected) requestAnimationFrame(frame);
      else {
        canvas.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
