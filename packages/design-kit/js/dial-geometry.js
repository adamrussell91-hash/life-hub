/**
 * Day Dial geometry: the day as a 24-hour circle.
 *
 * Noon is at the top and time runs clockwise, so the morning rises up the left side,
 * the evening falls down the right, and midnight sits at the bottom. Pure math: views
 * pass a size (the dial's real width in CSS px — laid out, never scaled) and get back
 * radii, arc paths and label positions.
 *
 * Reference: docs/proposals/calendar-reference/day-dial/VISUAL-SPEC.md ("Geometry").
 */

const TAU = Math.PI * 2;

/** Angle in radians, clockwise from the top. Noon = 0, 6 pm = π/2, midnight = π, 6 am = 3π/2. */
export function angleForHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  return (((h - 12 + 24) % 24) / 24) * TAU;
}

/** Point at `hour` on a circle of radius r around (cx, cy). */
export function point(cx, cy, r, hour) {
  const a = angleForHour(hour);
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** Clockwise span in hours from h1 to h2, wrapping past midnight (22 → 6.25 is 8.25). */
export function spanHours(h1, h2) {
  const s = (((h2 - h1) % 24) + 24) % 24;
  return s === 0 && h1 !== h2 ? 24 : s;
}

const f = n => (Math.round(n * 100) / 100).toString();

/** An annular sector from h1 to h2 (clockwise) between radii r1 < r2. SVG path data. */
export function arcPath(cx, cy, r1, r2, h1, h2) {
  const span = spanHours(h1, h2);
  if (span <= 0) return '';
  const large = span > 12 ? 1 : 0;
  const a = point(cx, cy, r2, h1);
  const b = point(cx, cy, r2, h1 + span);
  const c = point(cx, cy, r1, h1 + span);
  const d = point(cx, cy, r1, h1);
  return `M${f(a.x)} ${f(a.y)} A${f(r2)} ${f(r2)} 0 ${large} 1 ${f(b.x)} ${f(b.y)} L${f(c.x)} ${f(c.y)} A${f(r1)} ${f(r1)} 0 ${large} 0 ${f(d.x)} ${f(d.y)} Z`;
}

/**
 * During the entrance the dial is revealed clockwise from noon. With `sweep` hours
 * revealed (0..24), the visible part of [h1, h2] is returned as [a, b], or null.
 */
export function visibleSpan(h1, h2, sweep) {
  if (sweep >= 24) return [h1, h1 + spanHours(h1, h2)];
  if (sweep <= 0) return null;
  const off = h => (((h - 12) % 24) + 24) % 24; // hours after noon
  const start = off(h1);
  const end = start + spanHours(h1, h2);
  const a = Math.max(start, 0);
  const b = Math.min(end, sweep);
  if (b <= a) return null;
  return [12 + a, 12 + b];
}

/**
 * Ring radii for a dial of `size` px. `margin` is kept outside the outer ring for
 * callout labels; below MIN_SIZE the callouts move into the list and margin shrinks.
 */
export const DIAL_RINGS = Object.freeze({
  margin: 132, // px each side for callouts (labels get calloutRoom(size) px and are fitted to it)
  compactMargin: 40, // phone: no callouts, but room for the 6 am / 6 pm hour labels
  verticalMargin: 40, // above and below: the noon and midnight labels
  log: 0.94, // log-dot ring, fraction of R
  ticksIn: 0.985,
  eventOuter: 0.88,
  eventInner: 0.7,
  contextOuter: 0.66,
  contextInner: 0.575,
  gauge: 0.43,
  gaugeWidth: 10
});
export const MIN_CALLOUT_SIZE = 460;

/** Callout geometry: the radius the callout column sits at, and the px a label may use. */
export function calloutRoom(size) {
  const { R, compact } = ringRadii(size);
  if (compact) return { r: R, width: 0 };
  const r = R + 26;
  const reach = 6;
  return { r, reach, width: Math.floor(size / 2 - r - reach - 8) };
}

export function ringRadii(size) {
  const compact = size < MIN_CALLOUT_SIZE;
  const margin = compact ? DIAL_RINGS.compactMargin : DIAL_RINGS.margin;
  const R = Math.max(40, size / 2 - margin);
  // Callouts only sit left and right, so vertically the dial needs room only for the
  // noon / midnight hour labels. The drawing is `size` wide and `height` tall.
  const vMargin = compact ? margin : DIAL_RINGS.verticalMargin;
  return {
    compact,
    cx: size / 2,
    cy: R + vMargin,
    height: Math.round(2 * (R + vMargin)),
    R,
    log: R * DIAL_RINGS.log,
    ticks: R * DIAL_RINGS.ticksIn,
    event: [R * DIAL_RINGS.eventInner, R * DIAL_RINGS.eventOuter],
    context: [R * DIAL_RINGS.contextInner, R * DIAL_RINGS.contextOuter],
    gauge: R * DIAL_RINGS.gauge,
    gaugeWidth: DIAL_RINGS.gaugeWidth
  };
}

/**
 * Callout labels outside the ring. Items on the evening side (noon → midnight) sit on the
 * right, the rest on the left. Each side is sorted by angle-height and pushed apart so no
 * two labels are closer than `minGap` vertically, then clamped inside [top, bottom].
 *
 * items: [{ id, hour, height }]  (height = label block height in px, e.g. 14 or 28)
 * Returns Map(id → { x, y, anchor: 'start'|'end', lead: { x1, y1, x2, y2 } }).
 */
export function layoutCallouts(items, { cx, cy, r, gap = 6, top = 8, bottom, reach = 14 }) {
  const out = new Map();
  const sides = { right: [], left: [] };
  for (const it of items) {
    const a = angleForHour(it.hour);
    const side = a > 0 && a < Math.PI ? 'right' : a === 0 ? 'right' : 'left';
    const p = point(cx, cy, r, it.hour);
    sides[side].push({ ...it, px: p.x, py: p.y, want: p.y });
  }
  for (const [side, list] of Object.entries(sides)) {
    list.sort((p, q) => p.want - q.want);
    // Forward pass: push down; backward pass: pull up if we overflow the bottom.
    let y = -Infinity;
    for (const it of list) {
      it.y = Math.max(it.want, y);
      y = it.y + it.height + gap;
    }
    const maxY = (bottom ?? cy * 2) - 8;
    let limit = maxY;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.y + it.height > limit) it.y = limit - it.height;
      limit = it.y - gap;
    }
    for (const it of list) {
      it.y = Math.max(top, it.y);
      const right = side === 'right';
      // Labels line up in one column beside the dial on each side, never over it.
      const edgeX = right ? cx + r + reach : cx - r - reach;
      out.set(it.id, {
        x: edgeX + (right ? 4 : -4),
        y: it.y,
        anchor: right ? 'start' : 'end',
        lead: { x1: it.px, y1: it.py, x2: edgeX, y2: it.y + Math.min(it.height, 14) / 2 }
      });
    }
  }
  return out;
}
