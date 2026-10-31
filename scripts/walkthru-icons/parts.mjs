// Shared drawing parts for the WalkThrus symbol icons. Every series file builds its symbols from
// these, so stroke weight and the one-filled-focus rule stay the same across the set.
// Symbols: 100 × 100 frame, the idea with no people, read at 28px.
export const r1 = (n) => Math.round(n * 10) / 10;
export const P = (...pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join(' ');

// ── parts ──
export const FILL = 'fill="currentColor"';
export const circle = (x, y, r, fill = false) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}"${fill ? ` ${FILL}` : ''}/>`;
export const path = (d, extra = '') => `<path d="${d}"${extra ? ` ${extra}` : ''}/>`;
export const rect = (x, y, w, h, rx = 3, fill = false) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}"${fill ? ` ${FILL}` : ''}/>`;
export const dashed = (d) => path(d, 'stroke-width="2.2" stroke-dasharray="2 5"');
export const thin = (d) => path(d, 'stroke-width="2.2"');

/** A speech bubble with its tail ending at `tail`. */
export function bubble(x, y, w, h, tail, { fill = false, lines = 0, rx = 5 } = {}) {
  const bx = Math.min(Math.max(tail[0], x + 6), x + w - 12);
  const below = tail[1] > y + h;
  const base = below ? y + h : y;
  const tailPath = path(P([bx, base], tail, [bx + 7, base]), fill ? FILL : 'stroke-linejoin="round"');
  const rows = Array.from({ length: lines }, (_, i) => {
    const ly = y + (h / (lines + 1)) * (i + 1);
    const lw = (w - 12) * (i === lines - 1 && lines > 1 ? 0.6 : 1);
    return thin(`M${r1(x + 6)} ${r1(ly)}h${r1(lw)}`);
  }).join('');
  return rect(x, y, w, h, rx, fill) + tailPath + rows;
}

/** A question mark centred on (x, y), about 16·s tall. */
export const q = (x, y, s = 1) =>
  path(`M${r1(x - 4 * s)} ${r1(y - 4 * s)}C${r1(x - 4 * s)} ${r1(y - 10 * s)} ${r1(x + 5 * s)} ${r1(y - 10 * s)} ${r1(x + 4.5 * s)} ${r1(y - 4 * s)}C${r1(x + 4 * s)} ${r1(y - 0.5 * s)} ${r1(x)} ${r1(y - 0.5 * s)} ${r1(x)} ${r1(y + 3 * s)}`, 'stroke-width="2.6"') +
  circle(x, y + 7.5 * s, 1.5 * s, true);

export const tick = (x, y, s = 1) => path(P([x - 5 * s, y], [x - 1.5 * s, y + 4 * s], [x + 6 * s, y - 5 * s]));
export const cross = (x, y, s = 1) => path(`M${r1(x - 4 * s)} ${r1(y - 4 * s)}l${r1(8 * s)} ${r1(8 * s)}m0 ${r1(-8 * s)}l${r1(-8 * s)} ${r1(8 * s)}`);

/** A line from a to b, curving through c if given, with an open chevron at b. */
export function arrow(a, b, c = null, { dash = false } = {}) {
  const from = c ?? a;
  const ang = Math.atan2(b[1] - from[1], b[0] - from[0]);
  const head = [-0.55, 0.55].map((d) => [b[0] - 7 * Math.cos(ang + d), b[1] - 7 * Math.sin(ang + d)]);
  const d = c ? `M${r1(a[0])} ${r1(a[1])}Q${r1(c[0])} ${r1(c[1])} ${r1(b[0])} ${r1(b[1])}` : P(a, b);
  return (dash ? dashed(d) : path(d)) + path(P(head[0], b, head[1]));
}

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${body}</svg>\n`;
export const symbol = (body) => svg(100, 100, body);

