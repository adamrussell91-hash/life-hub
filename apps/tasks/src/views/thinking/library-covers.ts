// apps/tasks/src/views/thinking/library-covers.ts
// Small inline SVG covers for the Browse all cards. A tiny vocabulary (circles, arcs, rectangles,
// arrows, dotted paths, tick marks) in the page palette. Three cards are drawn by hand; every other
// card gets its family's mark, varied by a stable hash of its id. Covers are decorative.
export type CoverFamily = 'action' | 'insight' | 'frame' | 'snare';
export type Cover = { recipe: string; svg: string };

const INK = '#142338';
const BLUE = '#133CC4';
const RED = '#DE3822';
const GOLD = '#F4AD14';
const PAPER = '#FAF3E6';
const ACCENTS = [BLUE, RED, GOLD] as const;

/** A small stable number from a string (FNV-1a), the same on every load. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const circle = (cx: number, cy: number, r: number, fill: string, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const ring = (cx: number, cy: number, r: number, stroke: string, w = 3) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${w}"/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" ${extra}/>`;
const dotted = (d: string, stroke = INK) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0.1 7"/>`;
const arrow = (x1: number, y1: number, x2: number, y2: number, stroke = INK) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/><path d="M${x2 - 7} ${y2 - 5}L${x2} ${y2}L${x2 - 7} ${y2 + 5}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
const tick = (x: number, y: number, stroke = INK) => `<path d="M${x} ${y}l6 6l12 -13" fill="none" stroke="${stroke}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const arc = (d: string, stroke: string, w = 4) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;

const wrap = (inner: string) => `<svg viewBox="0 0 160 100" width="160" height="100" focusable="false" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="100" fill="${PAPER}"/>${inner}</svg>`;

function impactEffort(): string {
  const cells = [rect(14, 10, 64, 38, 'rgba(244,173,20,0.35)'), rect(82, 10, 64, 38, 'rgba(19,60,196,0.12)'), rect(14, 52, 64, 38, 'rgba(20,35,56,0.07)'), rect(82, 52, 64, 38, 'rgba(222,56,34,0.12)')];
  return wrap(
    cells.join('') +
      circle(32, 28, 11, BLUE) +
      circle(54, 36, 7, RED) +
      circle(112, 26, 13, INK) +
      circle(40, 72, 6, GOLD) +
      circle(118, 72, 8, BLUE) +
      dotted('M118 62C110 50 90 52 76 44C66 38 58 34 46 31', RED) +
      tick(26, 22, PAPER)
  );
}

function secondOrder(): string {
  return wrap(
    circle(26, 40, 14, BLUE) +
      arrow(42, 40, 62, 40) +
      rect(66, 26, 28, 28, GOLD) +
      arc('M96 40C112 40 118 52 114 66', INK, 3) +
      `<path d="M108 62L114 70L121 62" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M120 74l16 -4l-6 16z" fill="${RED}"/>` +
      dotted('M26 58C40 86 80 90 108 80', INK)
  );
}

function confirmation(): string {
  const inside = [circle(74, 44, 5, BLUE), circle(86, 54, 5, BLUE), circle(80, 38, 4, BLUE)];
  const outside = [[24, 22], [40, 70], [128, 24], [134, 66], [110, 84], [20, 50], [58, 88], [102, 14], [142, 44]].map(([x, y], i) => circle(x, y, 4 + (i % 2), i % 3 === 0 ? RED : INK, 'opacity="0.75"'));
  return wrap(`<circle cx="80" cy="46" r="26" fill="rgba(19,60,196,0.1)"/>` + ring(80, 46, 26, BLUE, 5) + inside.join('') + outside.join(''));
}

/** The family mark, nudged by the id's hash: position, rotation and the order of the accents. */
function familyMark(id: string, family: CoverFamily): string {
  const h = hashId(id);
  const order = [...ACCENTS];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = ((h >>> (i * 3)) & 0xff) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const [a, b, c] = order;
  const rot = (h % 60) - 30;
  const dx = ((h >>> 8) % 31) - 15;
  const dy = ((h >>> 13) % 17) - 8;
  const g = (inner: string) => `<g transform="translate(${dx} ${dy}) rotate(${rot} 80 50)">${inner}</g>`;
  switch (family) {
    case 'action':
      return wrap(g(arrow(24, 62, 100, 40, a) + circle(30, 62, 9, b) + rect(104, 24, 28, 28, c) + dotted('M30 80C60 92 100 88 128 70', INK) + tick(112, 34, PAPER)));
    case 'insight':
      return wrap(g(ring(80, 50, 30, a, 4) + circle(80, 50, 10, b) + arc('M80 12A38 38 0 0 1 118 50', c, 5) + dotted('M36 78C54 90 72 92 90 90', INK) + circle(38, 30, 5, INK)));
    case 'frame':
      return wrap(g(rect(34, 22, 92, 56, 'none', `stroke="${a}" stroke-width="4"`) + rect(52, 36, 56, 28, b, 'opacity="0.85"') + circle(124, 24, 7, c) + dotted('M20 88L140 88', INK)));
    default:
      return wrap(g(ring(80, 50, 28, a, 5) + circle(80, 50, 6, b) + circle(30, 30, 5, INK) + circle(130, 72, 5, c) + circle(122, 24, 4, INK) + dotted('M30 80C50 92 70 94 96 86', RED)));
  }
}

/** The cover for a card: a hand-drawn recipe for three ids, else the family mark varied by id. */
export function coverFor(id: string, family: CoverFamily): Cover {
  if (id === 'impact_effort') return { recipe: 'impact_effort', svg: impactEffort() };
  if (id === 'rb_second_order') return { recipe: 'rb_second_order', svg: secondOrder() };
  if (id === 'sn_confirmation') return { recipe: 'sn_confirmation', svg: confirmation() };
  return { recipe: `${family}-mark`, svg: familyMark(id, family) };
}
