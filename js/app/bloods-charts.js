import { animateAreaReveal } from './chart-kit/animate.js';
import { buildAreaLine, straightLinePath } from './chart-kit/area-line.js';
import {
  bandDomain,
  compareChartPoints,
  glucoseZones,
  nextComparePins,
  pointStatus,
  rangeBarLayout
} from './bloods-charts-layout.js';
import { statusTone } from './bloods-model.js';
import { formatShortMonth } from '../core/time.js';

export {
  bandDomain,
  compareChartPoints,
  glucoseZones,
  nextComparePins,
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
    chart.append(line);
    bindScrub(chart, built.points);
    bindCompare(root, wrap, chart, built.points);
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
  const lastIndex = built.points.length - 1;
  for (const [index, point] of built.points.entries()) {
    const circle = el(root, 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', index === lastIndex ? '4.5' : '3');
    circle.setAttribute('data-role', index === lastIndex ? 'latest-point' : 'point');
    // Each draw is coloured by how it read on the day, so a run of flagged
    // results is visible without reading the numbers.
    circle.setAttribute('data-tone', statusTone(pointStatus(point.value, refLow, refHigh), marker.key));
    circle.dataset.date = point.date ?? '';
    circle.dataset.value = String(point.value ?? '');
    points.append(circle);
  }

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
