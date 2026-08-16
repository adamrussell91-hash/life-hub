import { animateAreaReveal } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { compareChartPoints, glucoseZones, nextComparePins, rangeBarLayout, rangeTrackLayout } from './bloods-charts-layout.js';

export { compareChartPoints, glucoseZones, nextComparePins, rangeBarLayout, rangeTrackLayout };

const SVG = 'http://www.w3.org/2000/svg';
const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const CHART_PADDING = 12;
const TRACK_HEIGHT = 56;
const COMBINED_WIDTH = 960;
const COMBINED_HEIGHT = 160;

export function markerVisual(root, marker, { flareMarks = [], flareOn = false } = {}) {
  if (marker.qualitative || marker.chartKind === 'none') return null;
  if (marker.chartKind === 'range-bar') return rangeBarSvg(root, marker);
  if (marker.chartKind === 'zoned') return zonedChartSvg(root, marker);
  return lineChartSvg(root, marker, { flareMarks, flareOn });
}

export function combinedChartSvg(root, combined) {
  const series = (combined?.series ?? [])
    .map(entry => ({
      key: entry.key,
      label: entry.label || entry.key,
      points: (entry.points ?? []).filter(point => point.value != null && Number.isFinite(point.value))
    }))
    .filter(entry => entry.points.length);
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
    line.setAttribute('d', built.linePath || '');
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

function rangeBarSvg(root, marker) {
  const value = Number(marker.latest?.value);
  const low = marker.latest?.ref_low;
  const high = marker.latest?.ref_high;
  const prior = previousSeriesValue(marker);
  const chart = svgRoot(root, `${marker.label} range`, 'bloods-range-bar', TRACK_HEIGHT);
  const trackY = TRACK_HEIGHT / 2 - 4;
  const centreY = TRACK_HEIGHT / 2;
  const track = el(root, 'rect');
  track.setAttribute('data-role', 'range-track');
  track.setAttribute('x', '16');
  track.setAttribute('y', String(trackY));
  track.setAttribute('width', '288');
  track.setAttribute('height', '8');
  track.setAttribute('rx', '4');
  chart.append(track);

  const layout = rangeTrackLayout({
    value,
    previous: prior,
    refLow: low,
    refHigh: high,
    width: CHART_WIDTH,
    padding: 16
  });
  const band = el(root, 'rect');
  band.setAttribute('data-role', 'range-band');
  const bandX = Math.min(layout.bandStartX, layout.bandEndX);
  const bandW = Math.max(0, Math.abs(layout.bandEndX - layout.bandStartX));
  band.setAttribute('x', String(bandX));
  band.setAttribute('y', String(trackY));
  band.setAttribute('width', String(bandW));
  band.setAttribute('height', '8');
  band.setAttribute('rx', '4');
  chart.append(band);

  if (layout.previousX != null) {
    const ghost = el(root, 'circle');
    ghost.setAttribute('data-role', 'range-ghost');
    ghost.setAttribute('cx', String(layout.previousX));
    ghost.setAttribute('cy', String(centreY));
    ghost.setAttribute('r', '6');
    chart.append(ghost);
  }
  if (layout.arrow && layout.previousX != null) {
    const arrow = el(root, 'path');
    arrow.setAttribute('data-role', 'range-arrow');
    arrow.setAttribute('d', rangeArrowPath(layout.previousX, layout.latestX, centreY));
    chart.append(arrow);
  }
  if (Number.isFinite(value)) {
    const dot = el(root, 'circle');
    dot.setAttribute('data-role', 'range-dot');
    dot.setAttribute('cx', String(layout.latestX));
    dot.setAttribute('cy', String(centreY));
    dot.setAttribute('r', '7');
    chart.append(dot);
  }
  return chart;
}

function previousSeriesValue(marker) {
  const series = (marker.series ?? []).filter(point => point.value != null && Number.isFinite(Number(point.value)));
  if (series.length < 2) return null;
  return Number(series.at(-2).value);
}

function rangeArrowPath(fromX, toX, y) {
  const left = Math.min(fromX, toX) + 10;
  const right = Math.max(fromX, toX) - 10;
  if (right <= left) return `M ${fromX} ${y} L ${toX} ${y}`;
  const tip = toX > fromX ? right : left;
  const tail = toX > fromX ? left : right;
  const dir = toX > fromX ? 1 : -1;
  return `M ${tail} ${y} L ${tip} ${y} M ${tip} ${y} L ${tip - 5 * dir} ${y - 4} M ${tip} ${y} L ${tip - 5 * dir} ${y + 4}`;
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
    line.setAttribute('d', built.linePath || '');
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
  const area = el(root, 'path');
  area.setAttribute('data-role', 'area');
  const line = el(root, 'path');
  line.setAttribute('data-role', 'line');
  const points = el(root, 'g');
  points.setAttribute('data-role', 'points');
  const flares = el(root, 'g');
  flares.setAttribute('data-role', 'flare-ticks');
  chart.append(band, area, line, points, flares);

  const refLow = marker.latest?.ref_low;
  const refHigh = marker.latest?.ref_high;
  const series = (marker.series ?? []).map(point => ({ date: point.date, value: point.value }));
  const built = buildAreaLine(series, {
    height: CHART_HEIGHT,
    yDomain: 'padded',
    includeValues: nearbyRefs(series, [refLow, refHigh])
  });

  if (Number.isFinite(Number(refLow)) && Number.isFinite(Number(refHigh))) {
    const plotTop = CHART_PADDING;
    const plotBottom = CHART_HEIGHT - CHART_PADDING;
    const yHigh = built.scaleY(Number(refHigh));
    const yLow = built.scaleY(Number(refLow));
    const top = clamp(Math.min(yHigh, yLow), plotTop, plotBottom);
    const bottom = clamp(Math.max(yHigh, yLow), plotTop, plotBottom);
    band.setAttribute('x', String(CHART_PADDING));
    band.setAttribute('width', String(CHART_WIDTH - CHART_PADDING * 2));
    band.setAttribute('y', String(top));
    band.setAttribute('height', String(bottom - top));
  } else {
    band.setAttribute('height', '0');
  }

  area.setAttribute('d', built.areaPath || built.areaPoints || '');
  line.setAttribute('d', built.linePath || '');
  const lastIndex = built.points.length - 1;
  for (const [index, point] of built.points.entries()) {
    const circle = el(root, 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', index === lastIndex ? '4' : '2.5');
    circle.setAttribute('data-role', index === lastIndex ? 'latest-point' : 'point');
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
      tick.setAttribute('y2', String(CHART_HEIGHT - CHART_PADDING));
      tick.setAttribute('data-role', 'flare-tick');
      flares.append(tick);
    }
  }

  bindScrub(chart, built.points);
  bindCompare(root, wrap, chart, built.points);
  queueMicrotask(() => animateAreaReveal(chart));
  wrap.append(chart);
  return wrap;
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

/**
 * A reference limit only joins the y-scale when it sits near the readings. A
 * distant limit (vitamin D's upper 150 against readings in the 40s) would
 * otherwise squash the line flat; the band is clamped to the plot instead.
 */
export function nearbyRefs(series, refs) {
  const values = series.map(point => Number(point.value)).filter(Number.isFinite);
  const finite = refs.map(Number).filter(Number.isFinite);
  if (!values.length) return finite;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const reach = Math.max(max - min, Math.abs(max) * 0.1, Number.EPSILON);
  return finite.filter(ref => ref >= min - reach && ref <= max + reach);
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
