// packages/walkthrus/board/fused.ts
// A fused tile: the hexagon a fusion sits on, and the weld that joins it to a touching parent.
// Pure markup builders, no DOM. Same flat-topped geometry as hex.ts (corner k at 60·k degrees).
import { hexCorners, SQRT3, type Pt } from './hex';
import { isSafeSvg, parentCodes } from '../fusions.mjs';

export interface FusionStep {
  label: string;
  text: string;
  /** The parent step it started from; null for a step of Adam's own. */
  from: { id: string; n: number } | null;
  /** True once the heading or instruction differs from the book's. */
  edited: boolean;
  /** "↻ back to step N", 1-based, or null. */
  loop_to: number | null;
}

export interface FusionDrawing {
  status: 'none' | 'drawn' | 'failed';
  /** The kit calls Claude returned, [{ fn, args }]. */
  scene: Array<{ fn: string; args?: unknown[] }> | null;
  svg: string | null;
  note: string | null;
  at: string | null;
}

export interface Fusion {
  id: string;
  name: string;
  /** Two or three technique ids. */
  parents: string[];
  cluster_id: string | null;
  steps: FusionStep[];
  why: string;
  drawing: FusionDrawing;
  created_at: string;
}

export const FUSED_YELLOW = '#ffd400';
const INK = '#111';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const n = (v: number): string => (Math.round(v * 100) / 100).toString();
const points = (centre: Pt, r: number): string => hexCorners(centre, r).map((p) => `${n(p.x)},${n(p.y)}`).join(' ');

/** The name in heavy caps over at most `lines` lines of `max` characters, the last cut with an ellipsis. */
export function fitName(name: string, max: number, lines = 2): string[] {
  const words = name.toUpperCase().trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const w = words[i]!;
    const next = line ? `${line} ${w}` : w;
    if (next.length <= max) { line = next; continue; }
    if (out.length === lines - 1) break;
    if (line) out.push(line);
    line = w.length > max ? `${w.slice(0, max - 1)}…` : w;
  }
  if (i < words.length) line = line.length >= max ? `${line.slice(0, max - 1)}…` : `${line}…`;
  if (line) out.push(line);
  return out.slice(0, lines);
}

/** What sits inside the drawing's <svg> element, when it is safe to show. */
export function drawingBody(svg: string | null | undefined): string | null {
  if (!svg || !isSafeSvg(svg)) return null;
  const m = /^\s*<svg[^>]*>([\s\S]*)<\/svg>\s*$/i.exec(svg);
  return m ? m[1]! : null;
}

/** The figure a fusion shows until it is drawn: a dashed outline person, 120 × 90. */
export const PLACEHOLDER_FIGURE = [
  '<g class="wt-fused__placeholder" fill="none" stroke="currentColor" stroke-width="2"',
  ' stroke-dasharray="3 4" stroke-linecap="round" stroke-linejoin="round">',
  '<circle cx="60" cy="20" r="10"/>',
  '<path d="M48 76 V44 Q48 34 60 34 Q72 34 72 44 V76 M53 76 V86 M67 76 V86 M48 44 L40 62 M72 44 L80 62"/></g>'
].join('');

/**
 * Markup for a fused tile of corner radius `size`, centred on (0, 0): thick black edge, a yellow
 * band, two thin inner lines, "FUSED" over the parents' numbers ("90 + 98"), the drawing (or the
 * dashed placeholder) and the name in heavy caps. `standalone` wraps it in its own <svg>.
 */
export function fusedTileSvg(fusion: Pick<Fusion, 'id' | 'name' | 'parents' | 'drawing'>, { size = 60, standalone = true }: { size?: number; standalone?: boolean } = {}): string {
  const R = size;
  const half = (R * SQRT3) / 2;
  const o = { x: 0, y: 0 };
  const codes = (parentCodes(fusion) as string[]).join(' + ');
  const body = drawingBody(fusion.drawing?.svg);
  const name = fitName(fusion.name, 13);
  const nameSize = R * 0.12;
  const nameY = name.length > 1 ? [R * 0.38, R * 0.52] : [R * 0.45];
  const img = { w: R * 0.78, h: R * 0.585 };
  const imgY = -R * 0.33;
  const hex = (cls: string, r: number, fill: string, width: number): string =>
    `<polygon class="${cls}" points="${points(o, r)}" fill="${fill}"` +
    ` stroke="${INK}" stroke-width="${n(width)}" stroke-linejoin="round"/>`;
  const caption = (cls: string, y: number, fontSize: number, weight: number, extra: string, body: string): string =>
    `<text class="${cls}" x="0" y="${n(y)}" text-anchor="middle"` +
    ` font-size="${n(fontSize)}" font-weight="${weight}"${extra} fill="${INK}">${body}</text>`;
  const figure =
    `<svg class="wt-fused__figure" x="${n(-img.w / 2)}" y="${n(imgY)}"` +
    ` width="${n(img.w)}" height="${n(img.h)}" viewBox="0 0 120 90" color="${INK}" overflow="hidden">` +
    `${body ?? PLACEHOLDER_FIGURE}</svg>`;
  const nameLines = name.map((l, i) => `<tspan x="0" y="${n(nameY[i]!)}">${esc(l)}</tspan>`).join('');
  const parts = [
    hex('wt-fused__band', R, FUSED_YELLOW, R * 0.07),
    hex('wt-fused__face', R * 0.84, '#fff', R * 0.015),
    hex('wt-fused__line', R * 0.79, 'none', R * 0.015),
    caption('wt-fused__kicker', -R * 0.575, R * 0.08, 700, ` letter-spacing="${n(R * 0.03)}"`, 'FUSED'),
    caption('wt-fused__codes', -R * 0.38, R * 0.17, 800, '', esc(codes)),
    figure,
    `<text class="wt-fused__name" x="0" text-anchor="middle"` +
    ` font-size="${n(nameSize)}" font-weight="900" fill="${INK}">${nameLines}</text>`
  ].join('');
  const g = `<g class="wt-fused" data-fusion="${esc(fusion.id)}"` +
    ` font-family="var(--font-ui, Arial, sans-serif)">${parts}</g>`;
  if (!standalone) return g;
  const pad = R * 0.05;
  const box = `${n(-R - pad)} ${n(-half - pad)} ${n(2 * (R + pad))} ${n(2 * (half + pad))}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img"` +
    ` aria-label="${esc(`Fused: ${fusion.name}`)}">${g}</svg>`;
}

/**
 * A short black bar bridging the gap between two touching hexagons centred at a and b, each drawn
 * at corner radius `drawn`. Returns a closed path `d`; fill it black. It overlaps each edge a little.
 */
export function weldPath(a: Pt, b: Pt, { drawn, width }: { drawn: number; width?: number }): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (!dist) return '';
  const ux = dx / dist;
  const uy = dy / dist;
  const reach = Math.max(0, (drawn * SQRT3) / 2 - drawn * 0.08);
  const w = (width ?? drawn * 0.32) / 2;
  const p1 = { x: a.x + ux * reach, y: a.y + uy * reach };
  const p2 = { x: b.x - ux * reach, y: b.y - uy * reach };
  const px = -uy * w;
  const py = ux * w;
  const at = (p: Pt, sx: number, sy: number): string => `${n(p.x + sx)} ${n(p.y + sy)}`;
  return `M${at(p1, px, py)} L${at(p2, px, py)} L${at(p2, -px, -py)} L${at(p1, -px, -py)} Z`;
}
