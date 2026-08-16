import { animateAreaReveal } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { compareChartPoints, glucoseZones, nextComparePins, rangeBarLayout, rangeTrackLayout } from './bloods-charts-layout.js';

export { compareChartPoints, glucoseZones, nextComparePins, rangeBarLayout, rangeTrackLayout };

const SVG = 'http://www.w3.org/2000/svg';

export function markerVisual(root, marker, { flareMarks = [], flareOn = false } = {}) {
  if (marker.qualitative || marker.chartKind === 'none') return null;
  if (marker.chartKind === 'range-bar') return rangeBarSvg(root, marker);
  if (marker.chartKind === 'zoned') return zonedChartSvg(root, marker);
  return lineChartSvg(root, marker, { flareMarks, flareOn });
}

export function combinedChartSvg(root, combined) {
  if (!combined?.series?.length) return null;
  const chart = svgRoot(root, 'Combined marker trends');
  const palette = ['#376fb7', '#142b51', '#a85a0c', '#2f7a4f'];
  combined.series.forEach((series, index) => {
    const points = series.points
      .filter(point => point.value != null && Number.isFinite(point.value))
      .map(point => ({ date: point.date, value: point.value }));
    if (!points.length) return;
    const built = buildAreaLine(points, { height: 168, yDomain: 'padded', includeValues: [0, 1] });
    const line = el(root, 'path');
    line.setAttribute('data-role', 'line');
    line.setAttribute('data-series', series.key);
    line.setAttribute('d', built.linePath || '');
    line.setAttribute('stroke', palette[index % palette.length]);
    line.setAttribute('fill', 'none');
    chart.append(line);
  });
  queueMicrotask(() => animateAreaReveal(chart));
  return chart;
}

function rangeBarSvg(root, marker) {
  const value = Number(marker.latest?.value);
  const low = marker.latest?.ref_low;
  const high = marker.latest?.ref_high;
  const prior = previousSeriesValue(marker);
  const chart = svgRoot(root, `${marker.label} range`, 'bloods-range-bar');
  const track = el(root, 'rect');
  track.setAttribute('data-role', 'range-track');
  track.setAttribute('x', '16');
  track.setAttribute('y', '72');
  track.setAttribute('width', '288');
  track.setAttribute('height', '8');
  track.setAttribute('rx', '4');
  chart.append(track);

  const layout = rangeTrackLayout({
    value,
    previous: prior,
    refLow: low,
    refHigh: high,
    width: 320,
    padding: 16
  });
  const band = el(root, 'rect');
  band.setAttribute('data-role', 'range-band');
  const bandX = Math.min(layout.bandStartX, layout.bandEndX);
  const bandW = Math.max(0, Math.abs(layout.bandEndX - layout.bandStartX));
  band.setAttribute('x', String(bandX));
  band.setAttribute('y', '72');
  band.setAttribute('width', String(bandW));
  band.setAttribute('height', '8');
  band.setAttribute('rx', '4');
  chart.append(band);

  if (layout.previousX != null) {
    const ghost = el(root, 'circle');
    ghost.setAttribute('data-role', 'range-ghost');
    ghost.setAttribute('cx', String(layout.previousX));
    ghost.setAttribute('cy', '76');
    ghost.setAttribute('r', '6');
    chart.append(ghost);
  }
  if (layout.arrow && layout.previousX != null) {
    const arrow = el(root, 'path');
    arrow.setAttribute('data-role', 'range-arrow');
    arrow.setAttribute('d', rangeArrowPath(layout.previousX, layout.latestX, 76));
    chart.append(arrow);
  }
  if (Number.isFinite(value)) {
    const dot = el(root, 'circle');
    dot.setAttribute('data-role', 'range-dot');
    dot.setAttribute('cx', String(layout.latestX));
    dot.setAttribute('cy', '76');
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
  const y = value => 156 - (value / max) * 132;
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
    label.setAttribute('y', String(Math.min(y0, y1) + 14));
    label.textContent = zone.label;
    chart.append(label);
  }
  if (marker.series?.length) {
    const include = zones.flatMap(zone => [zone.from, zone.to]);
    const built = buildAreaLine(marker.series.map(point => ({ date: point.date, value: point.value })), {
      height: 168,
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
  const includeValues = [refLow, refHigh].filter(value => value != null && Number.isFinite(Number(value)));
  const built = buildAreaLine((marker.series ?? []).map(point => ({
    date: point.date,
    value: point.value
  })), { height: 168, yDomain: 'padded', includeValues });

  if (Number.isFinite(Number(refLow)) && Number.isFinite(Number(refHigh))) {
    const yHigh = built.scaleY(Number(refHigh));
    const yLow = built.scaleY(Number(refLow));
    band.setAttribute('x', String(built.points[0]?.x ?? 12));
    band.setAttribute('width', String(Math.max(0, 320 - 24)));
    band.setAttribute('y', String(Math.min(yHigh, yLow)));
    band.setAttribute('height', String(Math.abs(yLow - yHigh)));
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
      tick.setAttribute('y1', '12');
      tick.setAttribute('y2', '156');
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

function svgRoot(root, label, extraClass = '') {
  const chart = root.createElementNS(SVG, 'svg');
  chart.setAttribute('class', `line-chart body-chart ${extraClass}`.trim());
  chart.setAttribute('viewBox', '0 0 320 168');
  chart.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', label);
  return chart;
}

function el(root, tag) {
  return root.createElementNS(SVG, tag);
}
