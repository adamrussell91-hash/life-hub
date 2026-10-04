/**
 * bullseye-rings — one ring per reading, closing in on a target band.
 * The band is the bullseye disc in the middle. Each reading is a ring whose
 * radius is its distance from the band: inside the disc when in range, further
 * out the further it strays. The worst ring is dashed, the latest is bold, and
 * the newer the ring the stronger its ink, so a run of tightening rings reads
 * as closing in. Promoted from design-kit future-charts `bullseye-rings`.
 */
import { formatDisplayDate } from '../../core/time.js';
import { formatNumber, fx, node, text } from './scene.js';

const DISPLAY_CAP = 4;

/**
 * Distance from a reference band in band units: 0 is the ideal centre, 1 is the
 * band edge, above 1 is out of range. Two limits measure from the midpoint, an
 * upper limit alone as a share of it, a lower limit alone inversely.
 */
export function bandDistance(value, { low = null, high = null } = {}) {
  const n = finite(value);
  const lo = finite(low);
  const hi = finite(high);
  if (n == null || (lo == null && hi == null)) return null;
  if (lo != null && hi != null && hi !== lo) return Math.abs(2 * ((n - lo) / (hi - lo)) - 1);
  if (hi != null && hi !== 0) return n / hi;
  if (lo != null && n !== 0) return lo / n;
  return null;
}

/** Which side of the band a reading sits on: 'in', 'high' or 'low'. */
export function bandSide(value, { low = null, high = null } = {}) {
  const n = finite(value);
  if (n == null) return null;
  if (finite(high) != null && n > finite(high)) return 'high';
  if (finite(low) != null && n < finite(low)) return 'low';
  return 'in';
}

/**
 * Ring radius for a distance: linear inside the disc, then out to the rim, so
 * the furthest reading always sits on the rim and the rings use the dial.
 */
export function bullseyeRadius(distance, { band, rim, maxDistance }) {
  const d = Math.min(DISPLAY_CAP, Math.max(0, distance));
  if (d <= 1) return Math.max(2.5, band * d);
  const top = Math.max(1.05, Math.min(DISPLAY_CAP, maxDistance));
  return band + (rim - band) * Math.min(1, (d - 1) / (top - 1));
}

export function bullseyeFrame(width, { sideAt = 400, maxDial = 232 } = {}) {
  const side = width >= sideAt;
  const size = side ? Math.min(maxDial, Math.round(width * 0.5)) : Math.min(maxDial, width);
  const cx = side ? size / 2 : width / 2;
  const cy = size / 2;
  const rim = size / 2 - 6;
  return { side, size, cx, cy, rim, band: Math.round(rim * 0.36) };
}

export function bandLabel({ low = null, high = null } = {}, digits = 1) {
  const lo = finite(low);
  const hi = finite(high);
  if (lo != null && hi != null) return `${formatNumber(lo, digits)}–${formatNumber(hi, digits)}`;
  if (hi != null) return `<${formatNumber(hi, digits)}`;
  if (lo != null) return `>${formatNumber(lo, digits)}`;
  return '';
}

function finite(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return null;
  return Number(value);
}

function amount(value, unit, digits) {
  return `${formatNumber(value, digits)}${unit ? ` ${unit}` : ''}`;
}

function positionLine(ring, band, unit, digits) {
  if (ring.side === 'high') return `${amount(ring.value - band.high, unit, digits)} above the range`;
  if (ring.side === 'low') return `${amount(band.low - ring.value, unit, digits)} below the range`;
  return 'Inside the range';
}

function trendLine(rings) {
  if (rings.length < 2) return '';
  const latest = rings.at(-1);
  const previous = rings.at(-2);
  const since = formatDisplayDate(previous.date);
  if (latest.d < previous.d - 0.02) return `Closing in since ${since}.`;
  if (latest.d > previous.d + 0.02) return `Drifting out since ${since}.`;
  return `Holding steady since ${since}.`;
}

export function buildBullseyeRings(chart, { width = 460, sideAt = 400 } = {}) {
  const name = chart?.label ?? 'Reading';
  const label = `${name} as rings closing in on its reference range, one ring per test.`;
  const band = { low: finite(chart?.band?.low), high: finite(chart?.band?.high) };
  const unit = chart?.unit ?? '';
  const digits = chart?.digits ?? 1;
  const rings = (chart?.rings ?? [])
    .map(point => ({ date: point.date, value: finite(point.value) }))
    .filter(point => point.date && point.value != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(point => ({ ...point, d: bandDistance(point.value, band), side: bandSide(point.value, band) }))
    .filter(point => point.d != null);

  if (chart?.status !== 'ready' || rings.length < 2) {
    const readout = chart?.reason ?? 'Two tests in this range are needed to draw rings.';
    return { width, height: 48, label, readout, nodes: [text(0, 28, readout, { size: 12, cls: 'hc-text hc-text--muted' })], hits: {} };
  }

  const frame = bullseyeFrame(width, { sideAt });
  const { side, size, cx, cy, rim } = frame;
  const maxDistance = Math.max(...rings.map(ring => ring.d));
  const radius = d => bullseyeRadius(d, { band: frame.band, rim, maxDistance });
  const latest = rings.at(-1);
  const worst = rings.reduce((a, b) => (b.d > a.d ? b : a));
  const showWorst = worst !== latest && worst.d > latest.d;
  const nodes = [];
  const hits = {};
  const spin = `rotate(-90 ${fx(cx)} ${fx(cy)})`;

  nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: fx(rim + 4) }, { cls: 'hc-bull-field' }));
  nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: fx(frame.band) }, { cls: 'hc-band' }));
  nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: fx(frame.band) }, { cls: 'hc-bull-edge' }));
  nodes.push(text(cx, cy + 4, bandLabel(band, digits), { size: 10.5, weight: 600, anchor: 'middle', cls: 'hc-text hc-text--band' }));

  const per = Math.min(110, 1300 / rings.length);
  const marks = rings.map((ring, index) => {
    const id = `ring-${index}`;
    const isLatest = ring === latest;
    const isWorst = showWorst && ring === worst;
    const age = rings.length > 1 ? index / (rings.length - 1) : 1;
    const title = formatDisplayDate(ring.date);
    const where = positionLine(ring, band, unit, digits);
    const tag = isLatest ? 'Latest test' : isWorst ? 'Furthest out' : '';
    hits[id] = {
      id,
      title,
      lines: [amount(ring.value, unit, digits), where, tag].filter(Boolean),
      detail: `${name} ${amount(ring.value, unit, digits)} on ${title}. ${where}.`
    };
    return { ring, id, isLatest, isWorst, age, r: radius(ring.d) };
  });

  // Older rings first so the latest ring and its hit pad sit on top.
  marks.forEach((mark, index) => {
    const cls = ['hc-bull-ring', `hc-bull-ring--${mark.ring.side}`];
    if (mark.isLatest) cls.push('hc-bull-ring--latest');
    if (mark.isWorst) cls.push('hc-bull-ring--worst');
    const attrs = { cx: fx(cx), cy: fx(cy), r: fx(mark.r), transform: spin };
    if (!mark.isLatest && !mark.isWorst) attrs['stroke-opacity'] = fx(0.3 + 0.55 * mark.age);
    if (!mark.isWorst) attrs.pathLength = 1;
    nodes.push(node('circle', attrs, {
      cls: cls.join(' '),
      hit: mark.id,
      // A dashed stroke cannot draw on, so the worst ring fades in instead.
      anim: mark.isWorst ? 'fade' : 'draw',
      delay: mark.isLatest ? Math.round(per * rings.length + 200) : Math.round(per * index),
      dur: mark.isLatest ? 900 : 520
    }));
  });
  for (const mark of marks) {
    const gaps = marks.filter(other => other !== mark).map(other => Math.abs(other.r - mark.r));
    const pad = Math.max(6, Math.min(12, gaps.length ? Math.min(...gaps) : 12));
    nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: fx(mark.r), 'stroke-width': fx(pad) }, {
      cls: 'hc-hitpad',
      hit: mark.id
    }));
  }

  const lx = side ? size + 22 : 0;
  let ly = side ? Math.max(20, cy - 54) : size + 22;
  const rows = [];
  if (showWorst) rows.push(['worst', amount(worst.value, unit, digits), `furthest out · ${formatDisplayDate(worst.date)}`]);
  rows.push(['latest', amount(latest.value, unit, digits), `latest · ${formatDisplayDate(latest.date)}`]);
  rows.push(['band', bandLabel(band, digits) + (unit ? ` ${unit}` : ''), 'the reference range']);
  for (const [kind, head, sub] of rows) {
    if (kind === 'band') {
      nodes.push(node('circle', { cx: fx(lx + 7), cy: fx(ly - 4), r: 6 }, { cls: 'hc-band hc-bull-key--band' }));
    } else {
      nodes.push(node('line', { x1: fx(lx), x2: fx(lx + 14), y1: fx(ly - 4), y2: fx(ly - 4) }, { cls: `hc-bull-key hc-bull-key--${kind}` }));
    }
    nodes.push(text(lx + 22, ly, head, { size: 12, weight: 600 }));
    nodes.push(text(lx + 22, ly + 14, sub, { size: 10, cls: 'hc-text hc-text--muted' }));
    ly += 38;
  }
  nodes.push(text(lx, ly, `${rings.length} rings · one per test`, { size: 10, cls: 'hc-text hc-text--faint' }));
  const height = side ? Math.max(size, ly + 8) : ly + 8;

  const where = latest.side === 'in' ? 'inside the range' : positionLine(latest, band, unit, digits);
  const readout = `${name} ${amount(latest.value, unit, digits)}: ${where}. ${trendLine(rings)}`.trim();
  return { width, height: Math.ceil(height), label, readout, nodes, hits };
}
