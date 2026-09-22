/**
 * Declarative SVG scene helpers shared by the Home forecast charts.
 *
 * A scene is plain data: { width, height, label, nodes, hits, readout }.
 * Each node is { tag, attrs, cls?, text?, children?, hit?, anim?, delay?, origin? }.
 * - hit: id of an entry in scene.hits (makes the node hoverable, focusable, clickable)
 * - anim: 'draw' (stroke draws on; requires a solid stroke), 'grow' (scales from origin),
 *         'fade' (fades in). delay is ms. origin is [x, y] in viewBox units.
 * Geometry builders return scenes so they can be unit tested without a DOM.
 */

export const round1 = value => Math.round(value * 10) / 10;
export const fx = value => Number(Number(value).toFixed(2));

export function node(tag, attrs = {}, extra = {}) {
  return { tag, attrs, ...extra };
}

export function text(x, y, value, { size = 11, weight = 400, anchor = 'start', cls = 'hc-text', ...extra } = {}) {
  return node('text', {
    x: fx(x),
    y: fx(y),
    'font-size': size,
    'font-weight': weight,
    'text-anchor': anchor
  }, { cls, text: String(value), ...extra });
}

export function polar(cx, cy, r, degrees) {
  const a = (degrees * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** Clockwise arc from a0 to a1 (degrees, 0 = 3 o'clock, SVG y-down). */
export function arcPath(cx, cy, r, a0, a1) {
  let end = a1;
  if (end - a0 >= 359.99) end = a0 + 359.99;
  if (end <= a0) end = a0 + 0.01;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, end);
  const large = end - a0 > 180 ? 1 : 0;
  return `M${fx(x0)} ${fx(y0)} A${fx(r)} ${fx(r)} 0 ${large} 1 ${fx(x1)} ${fx(y1)}`;
}

/** Annular wedge (petal) between radii r0 and r1, clockwise from a0 to a1. */
export function wedgePath(cx, cy, r0, r1, a0, a1) {
  const [ax, ay] = polar(cx, cy, r0, a0);
  const [bx, by] = polar(cx, cy, r1, a0);
  const [cx1, cy1] = polar(cx, cy, r1, a1);
  const [dx, dy] = polar(cx, cy, r0, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return [
    `M${fx(ax)} ${fx(ay)}`,
    `L${fx(bx)} ${fx(by)}`,
    `A${fx(r1)} ${fx(r1)} 0 ${large} 1 ${fx(cx1)} ${fx(cy1)}`,
    `L${fx(dx)} ${fx(dy)}`,
    `A${fx(r0)} ${fx(r0)} 0 ${large} 0 ${fx(ax)} ${fx(ay)}`,
    'Z'
  ].join(' ');
}

export function points(list) {
  return list.map(([x, y]) => `${fx(x)},${fx(y)}`).join(' ');
}

export function linearScale([d0, d1], [r0, r1]) {
  const span = d1 - d0 || 1;
  return value => r0 + ((value - d0) / span) * (r1 - r0);
}

export function formatNumber(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-AU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function signed(value, digits = 1, unit = '') {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const v = Number(value);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '±';
  return `${sign}${formatNumber(Math.abs(v), digits)}${unit}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthShort(dateKey) {
  return MONTHS[Number(dateKey.slice(5, 7)) - 1];
}

/** Every first-of-month date key in [from, to]. */
export function monthStarts(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  if (Number(from.slice(8, 10)) > 1) m += 1;
  for (;;) {
    if (m > 12) { m = 1; y += 1; }
    const key = `${y}-${String(m).padStart(2, '0')}-01`;
    if (key > to) break;
    out.push(key);
    m += 1;
  }
  return out;
}

export function dayIndex(from, dateKey) {
  return Math.round((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/**
 * Swatch legend that wraps onto more rows when it runs out of width.
 * items: [[swatchClass, label], ...]. Returns { nodes, height }.
 */
export function legend(items, { x = 0, y = 0, width = 400, center = false, swatch = [14, 5], size = 10.5, gap = 16 } = {}) {
  const charW = size * 0.58;
  const itemW = label => swatch[0] + 6 + label.length * charW;
  const rows = [[]];
  let used = 0;
  for (const item of items) {
    const w = itemW(item[1]);
    if (rows.at(-1).length && used + gap + w > width) {
      rows.push([]);
      used = 0;
    }
    used += (rows.at(-1).length ? gap : 0) + w;
    rows.at(-1).push(item);
  }
  const nodes = [];
  const lineH = size + 8;
  rows.forEach((row, r) => {
    const rowW = row.reduce((sum, item, i) => sum + itemW(item[1]) + (i ? gap : 0), 0);
    let lx = center ? x + (width - rowW) / 2 : x;
    const ly = y + r * lineH;
    for (const [cls, label] of row) {
      nodes.push(node('rect', { x: fx(lx), y: fx(ly - swatch[1] - 1), width: swatch[0], height: swatch[1], rx: swatch[1] / 2 }, { cls }));
      nodes.push(text(lx + swatch[0] + 6, ly, label, { size, cls: 'hc-text hc-text--muted' }));
      lx += itemW(label) + gap;
    }
  });
  return { nodes, height: rows.length * lineH };
}
