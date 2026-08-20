import { animateAreaReveal } from './chart-kit/animate.js';
import { buildAreaLine, straightLinePath } from './chart-kit/area-line.js';
import {
  allowanceUsed,
  bandDomain,
  buildFbcRadial,
  buildGlucoseMap,
  buildLipidRings,
  compareChartPoints,
  glucoseZones,
  nextComparePins,
  pointHoverNote,
  pointStatus,
  rangeBarLayout
} from './bloods-charts-layout.js';
import { statusTone } from './bloods-model.js';
import { formatShortMonth } from '../core/time.js';

export {
  allowanceUsed,
  bandDomain,
  buildFbcRadial,
  buildGlucoseMap,
  buildLipidRings,
  compareChartPoints,
  glucoseZones,
  nextComparePins,
  pointHoverNote,
  pointStatus,
  rangeBarLayout
};

const SVG = 'http://www.w3.org/2000/svg';
const CHART_WIDTH = 320;
// A wide, shallow plot: cards sit side by side, so the chart gets its detail
// from width rather than from height it does not need.
const CHART_HEIGHT = 80;
const CHART_PADDING = 12;
const METER_WIDTH = 320;
const METER_HEIGHT = 16;
const MAX_TICKS = 5;
const COMBINED_WIDTH = 960;
const COMBINED_HEIGHT = 160;
const RADIAL_WIDTH = 720;
const RADIAL_HEIGHT = 640;
const GLUCOSE_WIDTH = 640;
const GLUCOSE_HEIGHT = 400;
const RINGS_WIDTH = 640;
const RINGS_HEIGHT = 420;

export function markerVisual(root, marker, { flareMarks = [], flareOn = false } = {}) {
  if (marker.qualitative || marker.chartKind === 'none') return null;
  if (marker.chartKind === 'meter') return meterSvg(root, marker);
  if (marker.chartKind === 'zoned') return zonedChartSvg(root, marker);
  return lineChartSvg(root, marker, { flareMarks, flareOn });
}

export function trendChartSvg(root, marker, { flareMarks = [], flareOn = false } = {}) {
  if (marker.qualitative || !(marker.series?.length > 1)) return null;
  return lineChartSvg(root, marker, { flareMarks, flareOn });
}

/**
 * A single reading placed on its reference band: enough to answer "is this
 * where it should be" in one row, without spending a whole card on two dots.
 */
export function meterSvg(root, marker) {
  const value = Number(marker.latest?.value);
  const refLow = marker.latest?.ref_low;
  const refHigh = marker.latest?.ref_high;
  const previous = previousSeriesValue(marker);
  const domain = bandDomain({
    values: [previous, value].filter(n => n != null && Number.isFinite(Number(n))),
    refLow,
    refHigh
  });
  const chart = svgRoot(root, `${marker.label} against its reference range`, 'bloods-meter', METER_HEIGHT, METER_WIDTH);
  const padX = 6;
  const y = METER_HEIGHT / 2;
  const xAt = n => padX + domain.fraction(n) * (METER_WIDTH - padX * 2);

  const track = el(root, 'line');
  track.setAttribute('data-role', 'meter-track');
  track.setAttribute('x1', String(padX));
  track.setAttribute('x2', String(METER_WIDTH - padX));
  track.setAttribute('y1', String(y));
  track.setAttribute('y2', String(y));
  chart.append(track);

  const band = el(root, 'line');
  band.setAttribute('data-role', 'meter-band');
  band.setAttribute('x1', String(xAt(domain.bandLow ?? domain.min)));
  band.setAttribute('x2', String(xAt(domain.bandHigh ?? domain.max)));
  band.setAttribute('y1', String(y));
  band.setAttribute('y2', String(y));
  chart.append(band);

  if (previous != null && Number.isFinite(previous)) {
    const ghost = el(root, 'circle');
    ghost.setAttribute('data-role', 'meter-ghost');
    ghost.setAttribute('cx', String(xAt(previous)));
    ghost.setAttribute('cy', String(y));
    ghost.setAttribute('r', '2.6');
    chart.append(ghost);
  }

  if (Number.isFinite(value)) {
    const halo = el(root, 'circle');
    halo.setAttribute('data-role', 'meter-halo');
    halo.setAttribute('cx', String(xAt(value)));
    halo.setAttribute('cy', String(y));
    halo.setAttribute('r', '5');
    const dot = el(root, 'circle');
    dot.setAttribute('data-role', 'meter-dot');
    dot.setAttribute('cx', String(xAt(value)));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', '3.6');
    chart.append(halo, dot);
  }
  return chart;
}

export function combinedChartSvg(root, combined) {
  const series = (combined?.series ?? [])
    .map(entry => ({
      key: entry.key,
      label: entry.label || entry.key,
      points: (entry.points ?? []).filter(point => point.value != null && Number.isFinite(point.value))
    }))
    // A single draw has no line to compare, and its lone dot on the left edge
    // reads as a stray mark rather than a trend.
    .filter(entry => entry.points.length > 1);
  if (!series.length) return null;

  const wrap = root.createElement('div');
  wrap.className = 'bloods-combined-chart';
  const chart = svgRoot(root, 'Markers against their own reference ranges', 'bloods-combined-strip', COMBINED_HEIGHT, COMBINED_WIDTH);

  // The model expresses every point as its position inside that marker's own
  // reference range (0 = lower limit, 1 = upper), so one shared scale is what
  // makes the lines comparable. Scaling each series on its own turned this into
  // four unrelated squiggles.
  const values = series.flatMap(entry => entry.points.map(point => point.value));
  const domain = [Math.min(...values, 0), Math.max(...values, 1)];
  const scale = buildAreaLine([{ value: domain[0] }, { value: domain[1] }], {
    width: COMBINED_WIDTH,
    height: COMBINED_HEIGHT,
    yDomain: 'padded',
    includeValues: domain
  }).scaleY;

  const band = el(root, 'rect');
  band.setAttribute('data-role', 'ref-band');
  band.setAttribute('x', String(CHART_PADDING));
  band.setAttribute('width', String(COMBINED_WIDTH - CHART_PADDING * 2));
  band.setAttribute('y', String(scale(1)));
  band.setAttribute('height', String(Math.max(0, scale(0) - scale(1))));
  chart.append(band);

  series.forEach((entry, index) => {
    const built = buildAreaLine(entry.points, {
      width: COMBINED_WIDTH,
      height: COMBINED_HEIGHT,
      yDomain: 'padded',
      includeValues: domain
    });
    const line = el(root, 'path');
    line.setAttribute('data-role', 'line');
    line.setAttribute('data-series', String(index % 4));
    line.setAttribute('data-marker', entry.key);
    line.setAttribute('d', straightLinePath(built.points));
    line.setAttribute('fill', 'none');
    chart.append(line);
    const last = built.points.at(-1);
    if (!last) return;
    const dot = el(root, 'circle');
    dot.setAttribute('data-role', 'latest-point');
    dot.setAttribute('data-series', String(index % 4));
    dot.setAttribute('cx', String(last.x));
    dot.setAttribute('cy', String(last.y));
    dot.setAttribute('r', '4');
    chart.append(dot);
  });

  wrap.append(chart);

  const legend = root.createElement('ul');
  legend.className = 'bloods-combined-legend';
  series.forEach((entry, index) => {
    const item = root.createElement('li');
    item.dataset.series = String(index % 4);
    item.textContent = entry.label;
    legend.append(item);
  });
  wrap.append(legend);

  const note = root.createElement('p');
  note.className = 'metric-caption bloods-combined-note';
  note.textContent = 'Each line is that marker’s position in its own reference range. Inside the sage band is in range.';
  wrap.append(note);

  queueMicrotask(() => animateAreaReveal(chart));
  return wrap;
}

export function fbcRadialSvg(root, layout) {
  const spokes = layout?.spokes ?? [];
  if (!spokes.length) return null;
  const wrap = root.createElement('div');
  wrap.className = 'bloods-fbc-radial';
  const chart = svgRoot(root, 'Full blood count by how much of each marker’s allowance is used', 'bloods-fbc-radial__chart', RADIAL_HEIGHT, RADIAL_WIDTH);
  const cx = RADIAL_WIDTH / 2;
  const cy = RADIAL_HEIGHT / 2 + 8;
  const R = 208;
  const inner = 0.055;

  for (const frac of [0.25, 0.5, 0.75]) {
    const ring = el(root, 'circle');
    ring.setAttribute('data-role', 'fbc-guide');
    ring.setAttribute('cx', String(cx));
    ring.setAttribute('cy', String(cy));
    ring.setAttribute('r', String(R * frac));
    chart.append(ring);
  }
  const limit = el(root, 'circle');
  limit.setAttribute('data-role', 'fbc-limit');
  limit.setAttribute('cx', String(cx));
  limit.setAttribute('cy', String(cy));
  limit.setAttribute('r', String(R));
  chart.append(limit);

  const radiusAt = used => R * (inner + Math.min(used ?? 0, 1.13) * (1 - inner));
  for (const spoke of spokes) {
    const g = el(root, 'g');
    g.setAttribute('data-role', 'fbc-spoke');
    g.setAttribute('data-marker', spoke.key);
    g.setAttribute('data-tone', spoke.tone);
    const [sx, sy] = polar(cx, cy, R * 1.08, spoke.angle);
    const ray = el(root, 'line');
    ray.setAttribute('data-role', 'fbc-ray');
    ray.setAttribute('x1', String(cx));
    ray.setAttribute('y1', String(cy));
    ray.setAttribute('x2', String(sx));
    ray.setAttribute('y2', String(sy));
    g.append(ray);
    const rNow = radiusAt(spoke.used);
    if (spoke.prevUsed != null && Math.abs(spoke.prevUsed - spoke.used) > 0.02) {
      const rPrev = radiusAt(spoke.prevUsed);
      const [ax, ay] = polar(cx, cy, rPrev, spoke.angle);
      const [bx, by] = polar(cx, cy, rNow, spoke.angle);
      const tail = el(root, 'line');
      tail.setAttribute('data-role', 'fbc-tail');
      tail.setAttribute('x1', String(ax));
      tail.setAttribute('y1', String(ay));
      tail.setAttribute('x2', String(bx));
      tail.setAttribute('y2', String(by));
      const ghost = el(root, 'circle');
      ghost.setAttribute('data-role', 'fbc-ghost');
      ghost.setAttribute('cx', String(ax));
      ghost.setAttribute('cy', String(ay));
      ghost.setAttribute('r', '3.5');
      g.append(tail, ghost);
    }
    const [px, py] = polar(cx, cy, rNow, spoke.angle);
    const dot = el(root, 'circle');
    dot.setAttribute('data-role', 'fbc-dot');
    dot.setAttribute('cx', String(px));
    dot.setAttribute('cy', String(py));
    dot.setAttribute('r', '6');
    g.append(dot);
    const [tx, ty] = polar(cx, cy, R * 1.16, spoke.angle);
    const flip = spoke.angle > 180;
    const lab = el(root, 'text');
    lab.setAttribute('data-role', 'fbc-label');
    lab.setAttribute('x', String(tx));
    lab.setAttribute('y', String(ty));
    lab.setAttribute('text-anchor', flip ? 'end' : 'start');
    lab.setAttribute('transform', `rotate(${flip ? spoke.angle + 90 : spoke.angle - 90} ${tx} ${ty})`);
    lab.textContent = spoke.label;
    g.append(lab);
    g.setAttribute('aria-label', `${spoke.label} ${Math.round(spoke.used * 100)}% of allowance`);
    chart.append(g);
  }
  wrap.append(chart);
  return wrap;
}

export function glucoseMapSvg(root, layout) {
  const points = layout?.points ?? [];
  const wrap = root.createElement('div');
  wrap.className = 'bloods-glucose-map';
  const chart = svgRoot(root, 'Fasting glucose against HbA1c', 'bloods-glucose-map__chart', GLUCOSE_HEIGHT, GLUCOSE_WIDTH);
  const L = 52, Rr = 24, T = 36, B = 48;
  const x0 = L, x1 = GLUCOSE_WIDTH - Rr, y0 = T, y1 = GLUCOSE_HEIGHT - B;
  const XD = [4.2, 7.4], YD = [4.6, 6.9];
  const X = v => x0 + ((v - XD[0]) / (XD[1] - XD[0])) * (x1 - x0);
  const Y = v => y1 - ((v - YD[0]) / (YD[1] - YD[0])) * (y1 - y0);
  const FN = 5.5, FR = 7.0, AN = 5.7, AR = 6.5;

  const diabetic = el(root, 'rect');
  diabetic.setAttribute('data-role', 'glucose-zone');
  diabetic.setAttribute('data-zone', 'diabetes');
  diabetic.setAttribute('x', String(x0));
  diabetic.setAttribute('y', String(y0));
  diabetic.setAttribute('width', String(x1 - x0));
  diabetic.setAttribute('height', String(y1 - y0));
  chart.append(diabetic);

  const risk = el(root, 'rect');
  risk.setAttribute('data-role', 'glucose-zone');
  risk.setAttribute('data-zone', 'risk');
  risk.setAttribute('x', String(x0));
  risk.setAttribute('y', String(Y(AR)));
  risk.setAttribute('width', String(X(FR) - x0));
  risk.setAttribute('height', String(y1 - Y(AR)));
  chart.append(risk);

  const normal = el(root, 'rect');
  normal.setAttribute('data-role', 'glucose-zone');
  normal.setAttribute('data-zone', 'normal');
  normal.setAttribute('x', String(x0));
  normal.setAttribute('y', String(Y(AN)));
  normal.setAttribute('width', String(X(FN) - x0));
  normal.setAttribute('height', String(y1 - Y(AN)));
  chart.append(normal);

  for (const [label, x, y, zone] of [
    ['NORMAL', x0 + 8, y1 - 10, 'normal'],
    ['AT RISK', X(FN) + 8, Y(AR) + 16, 'risk'],
    ['DIABETIC', x1 - 8, y0 + 16, 'diabetes']
  ]) {
    const text = el(root, 'text');
    text.setAttribute('data-role', 'glucose-zone-label');
    text.setAttribute('data-zone', zone);
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('text-anchor', zone === 'diabetes' ? 'end' : 'start');
    text.textContent = label;
    chart.append(text);
  }

  if (points.length) {
    const d = points.map((point, i) => `${i ? 'L' : 'M'}${X(point.fasting)},${Y(point.hba1c)}`).join(' ');
    const path = el(root, 'path');
    path.setAttribute('data-role', 'glucose-path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    chart.append(path);
    if (points.length > 1) {
      const a = points.at(-2), b = points.at(-1);
      const ang = Math.atan2(Y(b.hba1c) - Y(a.hba1c), X(b.fasting) - X(a.fasting));
      const arrow = el(root, 'path');
      arrow.setAttribute('data-role', 'glucose-arrow');
      arrow.setAttribute('d', 'M0,0 L-9,-4.2 L-9,4.2 Z');
      arrow.setAttribute('transform', `translate(${X(b.fasting) - Math.cos(ang) * 7},${Y(b.hba1c) - Math.sin(ang) * 7}) rotate(${ang * 180 / Math.PI})`);
      chart.append(arrow);
    }
    points.forEach((point, i) => {
      const last = i === points.length - 1;
      const dot = el(root, 'circle');
      dot.setAttribute('data-role', last ? 'glucose-latest' : 'glucose-point');
      dot.setAttribute('cx', String(X(point.fasting)));
      dot.setAttribute('cy', String(Y(point.hba1c)));
      dot.setAttribute('r', last ? '6.5' : '4.5');
      chart.append(dot);
    });
  }
  const xTitle = el(root, 'text');
  xTitle.setAttribute('x', String((x0 + x1) / 2));
  xTitle.setAttribute('y', String(GLUCOSE_HEIGHT - 10));
  xTitle.setAttribute('text-anchor', 'middle');
  xTitle.textContent = 'fasting glucose  mmol/L';
  const yTitle = el(root, 'text');
  yTitle.setAttribute('x', '14');
  yTitle.setAttribute('y', String((y0 + y1) / 2));
  yTitle.setAttribute('text-anchor', 'middle');
  yTitle.setAttribute('transform', `rotate(-90 14 ${(y0 + y1) / 2})`);
  yTitle.textContent = 'HbA1c  %';
  chart.append(xTitle, yTitle);

  wrap.append(chart);
  if (layout?.insulin?.caption) {
    const caption = root.createElement('p');
    caption.className = 'metric-caption bloods-glucose-map__insulin';
    caption.textContent = layout.insulin.caption;
    wrap.append(caption);
  }
  return wrap;
}

export function lipidRingsSvg(root, layout) {
  const rings = layout?.rings ?? [];
  if (!rings.length) return null;
  const wrap = root.createElement('div');
  wrap.className = 'bloods-lipid-rings';
  const chart = svgRoot(root, 'Lipids as nested allowances', 'bloods-lipid-rings__chart', RINGS_HEIGHT, RINGS_WIDTH);
  const CX = 420, CY = 188, SWEEP = 286, START = -143;
  const radii = [126, 94, 62];

  rings.forEach((ring, index) => {
    const r = radii[index] ?? 62;
    const g = el(root, 'g');
    g.setAttribute('data-role', 'lipid-ring');
    g.setAttribute('data-ring', ring.id);
    const track = el(root, 'path');
    track.setAttribute('data-role', 'lipid-track');
    track.setAttribute('d', arcPath(CX, CY, r, START, START + SWEEP));
    track.setAttribute('fill', 'none');
    g.append(track);
    if (ring.prevUsed != null) {
      const ghost = el(root, 'path');
      ghost.setAttribute('data-role', 'lipid-ghost');
      ghost.setAttribute('d', arcPath(CX, CY, r, START, START + Math.min(ring.prevUsed, 1) * SWEEP));
      ghost.setAttribute('fill', 'none');
      g.append(ghost);
    }
    if (ring.segs) {
      let a = START;
      ring.segs.forEach(seg => {
        const sweep = (seg.value / ring.limit) * SWEEP;
        if (!(sweep > 0)) return;
        const slice = el(root, 'path');
        slice.setAttribute('data-role', 'lipid-seg');
        slice.setAttribute('data-seg', seg.id);
        slice.setAttribute('d', arcPath(CX, CY, r, a, a + sweep));
        slice.setAttribute('fill', 'none');
        g.append(slice);
        a += sweep;
      });
    } else {
      const fill = el(root, 'path');
      fill.setAttribute('data-role', 'lipid-fill');
      fill.setAttribute('d', arcPath(CX, CY, r, START, START + Math.min(ring.used, 1) * SWEEP));
      fill.setAttribute('fill', 'none');
      g.append(fill);
    }
    if (ring.direction && ring.direction !== 'flat') {
      const tip = START + Math.min(ring.used, 1) * SWEEP;
      const [tx, ty] = polar(CX, CY, r, tip);
      const tangent = (tip + (ring.direction === 'out' ? 90 : -90));
      const arrow = el(root, 'path');
      arrow.setAttribute('data-role', 'lipid-arrow');
      arrow.setAttribute('data-dir', ring.direction);
      arrow.setAttribute('d', 'M0,0 L-8,-3.6 L-8,3.6 Z');
      arrow.setAttribute('transform', `translate(${tx},${ty}) rotate(${tangent})`);
      g.append(arrow);
    }
    chart.append(g);
  });

  const total = rings.find(ring => ring.id === 'total');
  if (total) {
    const centre = el(root, 'text');
    centre.setAttribute('data-role', 'lipid-centre');
    centre.setAttribute('x', String(CX));
    centre.setAttribute('y', String(CY + 4));
    centre.setAttribute('text-anchor', 'middle');
    centre.textContent = Number.isInteger(total.value) ? String(total.value) : total.value.toFixed(1);
    chart.append(centre);
  }

  rings.forEach((ring, index) => {
    const y = 70 + index * 52;
    const name = el(root, 'text');
    name.setAttribute('x', '16');
    name.setAttribute('y', String(y));
    name.textContent = `${ring.label} · ${Math.round(ring.used * 100)}% spent`;
    chart.append(name);
  });

  wrap.append(chart);
  return wrap;
}

function polar(cx, cy, r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, r, a0, a1) {
  const [sx, sy] = polar(cx, cy, r, a0);
  const [ex, ey] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${sx},${sy} A${r},${r} 0 ${large} 1 ${ex},${ey}`;
}

function previousSeriesValue(marker) {
  const series = (marker.series ?? []).filter(point => point.value != null && Number.isFinite(Number(point.value)));
  if (series.length < 2) return null;
  return Number(series.at(-2).value);
}

function zonedChartSvg(root, marker) {
  const wrap = root.createElement('div');
  wrap.className = 'bloods-line-wrap';
  const chart = svgRoot(root, `${marker.label} zones`);
  const unit = marker.latest?.unit || 'mmol/mol';
  const zones = glucoseZones(unit);
  const max = zones.at(-1)?.to || 1;
  const plotBottom = CHART_HEIGHT - CHART_PADDING;
  const y = value => plotBottom - (value / max) * (plotBottom - CHART_PADDING);
  for (const zone of zones) {
    const band = el(root, 'rect');
    band.setAttribute('data-role', 'zone');
    band.setAttribute('data-zone', zone.id);
    const y1 = y(zone.to);
    const y0 = y(zone.from);
    band.setAttribute('x', '12');
    band.setAttribute('width', '296');
    band.setAttribute('y', String(Math.min(y0, y1)));
    band.setAttribute('height', String(Math.abs(y0 - y1)));
    chart.append(band);
    const label = el(root, 'text');
    label.setAttribute('x', '18');
    label.setAttribute('y', String(Math.min(y0, y1) + 11));
    label.textContent = zone.label;
    chart.append(label);
  }
  if (marker.series?.length) {
    const include = zones.flatMap(zone => [zone.from, zone.to]);
    const built = buildAreaLine(marker.series.map(point => ({ date: point.date, value: point.value })), {
      height: CHART_HEIGHT,
      yDomain: 'padded',
      includeValues: include
    });
    const line = el(root, 'path');
    line.setAttribute('data-role', 'line');
    line.setAttribute('d', straightLinePath(built.points));
    const points = el(root, 'g');
    points.setAttribute('data-role', 'points');
    chart.append(line, points);
    const drawn = paintPoints(root, points, built.points);
    bindScrub(chart, built.points);
    bindCompare(root, wrap, chart, built.points);
    wrap.append(chart);
    bindPointNotes(root, wrap, chart, built.points, drawn, { unit: marker.latest?.unit });
    return wrap;
  }
  wrap.append(chart);
  return wrap;
}

function lineChartSvg(root, marker, { flareMarks, flareOn }) {
  const wrap = root.createElement('div');
  wrap.className = 'bloods-line-wrap';
  const chart = svgRoot(root, `${marker.label} trend`);
  const band = el(root, 'rect');
  band.setAttribute('data-role', 'ref-band');
  const axis = el(root, 'line');
  axis.setAttribute('data-role', 'axis');
  const area = el(root, 'path');
  area.setAttribute('data-role', 'area');
  const line = el(root, 'path');
  line.setAttribute('data-role', 'line');
  const points = el(root, 'g');
  points.setAttribute('data-role', 'points');
  const flares = el(root, 'g');
  flares.setAttribute('data-role', 'flare-ticks');
  chart.append(band, axis, area, line, points, flares);

  const refLow = marker.latest?.ref_low;
  const refHigh = marker.latest?.ref_high;
  const series = (marker.series ?? []).map(point => ({ date: point.date, value: point.value }));
  const plotBottom = CHART_HEIGHT - CHART_PADDING;
  const domain = bandDomain({ values: series.map(point => point.value), refLow, refHigh });
  const built = buildAreaLine(series, {
    height: plotBottom,
    yDomain: 'fixed',
    min: domain.min,
    max: domain.max,
    includeValues: [domain.min, domain.max]
  });

  const top = built.scaleY(domain.bandHigh ?? domain.max);
  const bottom = built.scaleY(domain.bandLow ?? domain.min);
  if (domain.bandLow != null || domain.bandHigh != null) {
    band.setAttribute('x', String(CHART_PADDING));
    band.setAttribute('width', String(CHART_WIDTH - CHART_PADDING * 2));
    band.setAttribute('y', String(clamp(Math.min(top, bottom), CHART_PADDING, plotBottom)));
    band.setAttribute('height', String(Math.abs(bottom - top)));
    band.setAttribute('rx', '4');
  } else {
    band.setAttribute('height', '0');
  }

  axis.setAttribute('x1', String(CHART_PADDING));
  axis.setAttribute('x2', String(CHART_WIDTH - CHART_PADDING));
  axis.setAttribute('y1', String(plotBottom));
  axis.setAttribute('y2', String(plotBottom));

  area.setAttribute('d', built.areaPath || built.areaPoints || '');
  line.setAttribute('d', straightLinePath(built.points));
  const drawn = paintPoints(root, points, built.points, {
    toneFor: point => statusTone(pointStatus(point.value, refLow, refHigh), marker.key)
  });

  if (flareOn) {
    for (const mark of flareMarks) {
      const match = built.points.find(point => point.date === mark.date);
      if (!match) continue;
      const tick = el(root, 'line');
      tick.setAttribute('x1', String(match.x));
      tick.setAttribute('x2', String(match.x));
      tick.setAttribute('y1', String(CHART_PADDING));
      tick.setAttribute('y2', String(plotBottom));
      tick.setAttribute('data-role', 'flare-tick');
      flares.append(tick);
    }
  }

  bindScrub(chart, built.points);
  bindCompare(root, wrap, chart, built.points);
  queueMicrotask(() => animateAreaReveal(chart));
  wrap.append(chart);
  bindPointNotes(root, wrap, chart, built.points, drawn, { unit: marker.latest?.unit });
  const ticks = tickRow(root, built.points);
  if (ticks) wrap.append(ticks);
  return wrap;
}

/**
 * Dates live in HTML rather than SVG text: the chart scales to the card width,
 * and scaled type would drift away from the rest of the page.
 */
function tickRow(root, points) {
  const chosen = tickPoints(points);
  if (chosen.length < 2) return null;
  const row = root.createElement('div');
  row.className = 'bloods-ticks';
  for (const point of chosen) {
    const tick = root.createElement('span');
    tick.className = 'bloods-ticks__item';
    tick.dataset.anchor = point.anchor;
    tick.style.left = `${(point.x / CHART_WIDTH) * 100}%`;
    tick.textContent = formatShortMonth(point.date);
    row.append(tick);
  }
  return row;
}

/**
 * Labels the first and last draw plus a thinned selection between them, so a
 * long history keeps readable dates instead of a smear of overlapping text.
 */
function tickPoints(points) {
  if (!points?.length) return [];
  if (points.length === 1) return [{ ...points[0], anchor: 'middle' }];
  const step = Math.ceil(points.length / MAX_TICKS);
  const chosen = [];
  for (let index = 0; index < points.length; index += 1) {
    const last = index === points.length - 1;
    if (index !== 0 && !last && index % step !== 0) continue;
    chosen.push({
      ...points[index],
      anchor: index === 0 ? 'start' : last ? 'end' : 'middle'
    });
  }
  return chosen;
}

function paintPoints(root, host, points, { toneFor } = {}) {
  const lastIndex = points.length - 1;
  const drawn = [];
  for (const [index, point] of points.entries()) {
    const circle = el(root, 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', index === lastIndex ? '4.5' : '3');
    circle.setAttribute('data-role', index === lastIndex ? 'latest-point' : 'point');
    if (toneFor) circle.setAttribute('data-tone', toneFor(point));
    circle.dataset.date = point.date ?? '';
    circle.dataset.value = String(point.value ?? '');
    host.append(circle);
    drawn.push({ point, circle });
  }
  return drawn;
}

function bindPointNotes(root, wrap, chart, points, drawn, { unit, width = CHART_WIDTH, height = CHART_HEIGHT } = {}) {
  if (!points?.length) return;
  const note = root.createElement('div');
  note.className = 'bloods-point-note';
  note.dataset.role = 'point-note';
  note.hidden = true;
  note.setAttribute('aria-live', 'polite');
  wrap.append(note);

  const show = point => {
    const index = points.findIndex(item =>
      item === point || (item.date === point.date && item.value === point.value)
    );
    const payload = pointHoverNote(point, index > 0 ? points[index - 1] : null, { unit });
    if (!payload) {
      note.hidden = true;
      return;
    }
    note.replaceChildren();
    const date = root.createElement('span');
    date.className = 'bloods-point-note__date';
    date.textContent = payload.date;
    const amount = root.createElement('span');
    amount.className = 'bloods-point-note__amount';
    amount.textContent = payload.amount;
    note.append(date, amount);
    if (payload.change) {
      const change = root.createElement('span');
      change.className = 'bloods-point-note__change';
      change.dataset.dir = payload.dir;
      change.textContent = payload.change;
      note.append(change);
    }
    if (note.style) {
      note.style.left = `${(point.x / width) * 100}%`;
      note.style.top = `${(point.y / height) * 100}%`;
    }
    note.hidden = false;
    chart.dataset.scrubDate = point.date ?? '';
    chart.dataset.scrubValue = String(point.value ?? '');
  };
  const hide = () => {
    note.hidden = true;
  };

  for (const { point, circle } of drawn ?? []) {
    const index = points.findIndex(item => item === point);
    const payload = pointHoverNote(point, index > 0 ? points[index - 1] : null, { unit });
    circle.setAttribute('tabindex', '0');
    if (payload) circle.setAttribute('aria-label', payload.label);
    circle.addEventListener?.('pointerenter', () => show(point));
    circle.addEventListener?.('pointerleave', hide);
    circle.addEventListener?.('focus', () => show(point));
    circle.addEventListener?.('blur', hide);
  }

  chart.addEventListener?.('pointermove', event => {
    const nearest = nearestPoint(chart, points, event);
    if (nearest) show(nearest);
  });
  chart.addEventListener?.('pointerleave', hide);
}

function bindScrub(chart, points) {
  if (!points?.length) return;
  chart.addEventListener?.('pointermove', event => {
    const rect = chart.getBoundingClientRect?.() || { width: 320, left: 0 };
    const x = ((event.clientX - rect.left) / (rect.width || 1)) * 320;
    let nearest = points[0];
    let best = Infinity;
    for (const point of points) {
      const d = Math.abs(point.x - x);
      if (d < best) {
        best = d;
        nearest = point;
      }
    }
    chart.dataset.scrubDate = nearest.date ?? '';
    chart.dataset.scrubValue = String(nearest.value ?? '');
  });
}

function bindCompare(root, host, chart, points) {
  if (!points?.length) return;
  let pins = [];
  let callout = null;
  const ensureCallout = () => {
    if (callout) return callout;
    callout = root.createElement('p');
    callout.className = 'bloods-compare metric-caption';
    callout.hidden = true;
    host.append(callout);
    return callout;
  };
  chart.addEventListener?.('pointerdown', event => {
    const nearest = nearestPoint(chart, points, event);
    if (!nearest) return;
    pins = nextComparePins(pins, nearest);
    const note = ensureCallout();
    if (pins.length < 2) {
      note.hidden = true;
      note.textContent = '';
      chart.dataset.compareLabel = '';
      return;
    }
    const cmp = compareChartPoints(pins[0], pins[1]);
    if (!cmp) return;
    note.hidden = false;
    note.textContent = cmp.label;
    chart.dataset.compareLabel = cmp.label;
  });
}

function nearestPoint(chart, points, event) {
  const rect = chart.getBoundingClientRect?.() || { width: 320, left: 0 };
  const x = ((event.clientX - (rect.left || 0)) / (rect.width || 1)) * 320;
  let nearest = points[0];
  let best = Infinity;
  for (const point of points) {
    const d = Math.abs(point.x - x);
    if (d < best) {
      best = d;
      nearest = point;
    }
  }
  return nearest;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function svgRoot(root, label, extraClass = '', height = CHART_HEIGHT, width = CHART_WIDTH) {
  const chart = root.createElementNS(SVG, 'svg');
  chart.setAttribute('class', `line-chart body-chart ${extraClass}`.trim());
  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', label);
  return chart;
}

function el(root, tag) {
  return root.createElementNS(SVG, tag);
}
