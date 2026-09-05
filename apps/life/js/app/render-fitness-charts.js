import { animateAreaReveal } from './chart-kit/animate.js';
import { buildAreaLine, straightLinePath } from './chart-kit/area-line.js';
import { buildBumpChart } from './chart-kit/bump.js';
import { CLINICAL_CHART_SLOTS } from './chart-kit/clinical-slots.js';
import { buildChordLayout } from './chart-kit/chord-layout.js';
import { buildColumns } from './chart-kit/columns.js';
import { buildEnergyOrbit } from './chart-kit/energy-orbit.js';
import { buildHorizonBands } from './chart-kit/horizon.js';
import { buildMoodMixDonut } from './chart-kit/mood-mix.js';
import { buildMoodRadial } from './chart-kit/mood-radial.js';
import { polar, thetaForDate, thetaForTime } from './chart-kit/polar-clock.js';
import { rangeBarLayout, rangeBarTick } from './chart-kit/range-bar.js';
import { buildRadialYear } from './chart-kit/radial-year.js';
import { REGION_COLOURS } from './fitness-charts-model.js';
import { buildSankeyFlow } from './chart-kit/sankey-flow.js';
import { buildStreamPaths } from './chart-kit/stream.js';
import { buildThemeConstellation } from './chart-kit/theme-constellation.js';
import { buildWatchlistHeat } from './chart-kit/watchlist-heat.js';
import { formatDisplayDate } from '../core/time.js';

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

function setHidden(element, hidden) {
  if (!element) return;
  if (hidden) element.setAttribute('hidden', '');
  else element.removeAttribute('hidden');
}

function showCard(root, selector, ready) {
  const card = root.querySelector(selector);
  setHidden(card, !ready);
  return ready ? card : null;
}

function createSvg(root, name) {
  if (typeof root.createElementNS === 'function') {
    return root.createElementNS('http://www.w3.org/2000/svg', name);
  }
  return null;
}

function clearSvg(svg) {
  svg?.replaceChildren?.();
}

function formatKg(kg) {
  if (kg == null || !Number.isFinite(kg)) return '—';
  const text = Number.isInteger(kg) ? kg.toLocaleString('en-AU') : kg.toFixed(1);
  return `${text} kg`;
}

function setWidth(el, pct) {
  if (!el) return;
  el.style = el.style ?? {};
  if (typeof el.style.setProperty === 'function') el.style.setProperty('--bar', `${pct}%`);
  else el.style['--bar'] = `${pct}%`;
}

function renderClock(root, points) {
  const card = showCard(root, '#fitness-clock-card', points?.length >= 2);
  const svg = root.querySelector('#fitness-clock-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  clearSvg(svg);
  const size = 220;
  const cx = 110;
  const cy = 110;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const rim = createSvg(root, 'circle');
  rim.setAttribute('cx', String(cx));
  rim.setAttribute('cy', String(cy));
  rim.setAttribute('r', '86');
  rim.setAttribute('class', 'fitness-viz__ring');
  svg.append(rim);
  for (const point of points) {
    const theta = thetaForTime(point.time);
    if (theta == null) continue;
    const radius = 36 + point.recency * 48;
    const { x, y } = polar(cx, cy, radius, theta);
    const dot = createSvg(root, 'circle');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', '5');
    dot.setAttribute('fill', point.colour);
    svg.append(dot);
  }
}

function renderOrbit(root, days) {
  const trained = (days ?? []).filter(day => day.volume > 0);
  const card = showCard(root, '#fitness-orbit-card', trained.length >= 2);
  const svg = root.querySelector('#fitness-orbit-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const series = trained.map(day => ({
    date: day.date,
    energy: day.volume > 0 ? 'medium' : 'low'
  }));
  const from = days[0]?.date;
  const to = days.at(-1)?.date;
  const chart = buildEnergyOrbit(series, { bounds: { from, to }, range: 'monthly' });
  clearSvg(svg);
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('class', 'fitness-viz__svg fitness-viz__svg--orbit');
  for (const ring of chart.rings ?? []) {
    const circle = createSvg(root, 'circle');
    circle.setAttribute('cx', String(chart.cx));
    circle.setAttribute('cy', String(chart.cy));
    circle.setAttribute('r', String(ring.radius));
    circle.setAttribute('class', 'fitness-viz__ring');
    svg.append(circle);
  }
  const maxVol = Math.max(1, ...days.map(day => day.volume));
  for (const day of trained) {
    const theta = thetaForDate(day.date, { from, to }, 'monthly');
    const radius = 40 + (day.volume / maxVol) * 90;
    const { x, y } = polar(chart.cx, chart.cy, radius, theta);
    const dot = createSvg(root, 'circle');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', String(4 + (day.volume / maxVol) * 4));
    dot.setAttribute('fill', day.colour);
    svg.append(dot);
  }
}

function renderE1rmRadial(root, points) {
  const card = showCard(root, '#fitness-e1rm-radial-card', points?.length >= 2);
  const svg = root.querySelector('#fitness-e1rm-radial-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const series = points.map(point => ({ date: point.date, value: Math.max(1, Math.round(point.pct / 10)) }));
  const dates = points.map(point => point.date).sort();
  const chart = buildMoodRadial(series, { bounds: { from: dates[0], to: dates.at(-1) }, range: 'monthly' });
  clearSvg(svg);
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  for (const ring of chart.rings ?? []) {
    const circle = createSvg(root, 'circle');
    circle.setAttribute('cx', String(chart.cx));
    circle.setAttribute('cy', String(chart.cy));
    circle.setAttribute('r', String(ring.radius));
    circle.setAttribute('class', 'fitness-viz__ring');
    svg.append(circle);
  }
  chart.points.forEach((point, index) => {
    const source = points[index];
    const dot = createSvg(root, 'circle');
    dot.setAttribute('cx', String(point.x));
    dot.setAttribute('cy', String(point.y));
    dot.setAttribute('r', '5');
    dot.setAttribute('fill', source?.colour ?? CLINICAL_CHART_SLOTS[0]);
    svg.append(dot);
  });
}

function renderChord(root, edges) {
  const card = showCard(root, '#fitness-chord-card', edges?.length >= 1);
  const svg = root.querySelector('#fitness-chord-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const layout = buildChordLayout(edges);
  clearSvg(svg);
  svg.setAttribute('viewBox', '0 0 360 360');
  const cx = 180;
  const cy = 180;
  const radius = 120;
  const colourByKey = new Map((layout.arcs ?? []).map((arc, index) => [
    arc.key,
    REGION_COLOURS[arc.key] ?? CLINICAL_CHART_SLOTS[index % CLINICAL_CHART_SLOTS.length]
  ]));
  for (const arc of layout.arcs ?? []) {
    const path = createSvg(root, 'path');
    const x0 = cx + radius * Math.cos(arc.startAngle - Math.PI / 2);
    const y0 = cy + radius * Math.sin(arc.startAngle - Math.PI / 2);
    const x1 = cx + radius * Math.cos(arc.endAngle - Math.PI / 2);
    const y1 = cy + radius * Math.sin(arc.endAngle - Math.PI / 2);
    const large = arc.endAngle - arc.startAngle > Math.PI ? 1 : 0;
    path.setAttribute('d', `M${x0},${y0} A${radius},${radius},0,${large},1,${x1},${y1}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colourByKey.get(arc.key));
    path.setAttribute('stroke-width', '10');
    svg.append(path);
  }
  for (const ribbon of layout.ribbons ?? []) {
    const source = ribbon.source ?? {};
    const target = ribbon.target ?? {};
    const start = ((source.startAngle ?? 0) + (source.endAngle ?? 0)) / 2;
    const end = ((target.startAngle ?? 0) + (target.endAngle ?? 0)) / 2;
    const path = createSvg(root, 'path');
    path.setAttribute('d', `M${cx + 110 * Math.cos(start - Math.PI / 2)},${cy + 110 * Math.sin(start - Math.PI / 2)} Q${cx},${cy} ${cx + 110 * Math.cos(end - Math.PI / 2)},${cy + 110 * Math.sin(end - Math.PI / 2)}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--wave)');
    path.setAttribute('stroke-width', String(Math.max(2, Number(ribbon.value) || 2)));
    path.setAttribute('opacity', '0.45');
    svg.append(path);
  }
}

function renderBump(root, ranks) {
  const card = showCard(root, '#fitness-bump-card', ranks?.length >= 2);
  const svg = root.querySelector('#fitness-bump-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const themes = [...new Set(ranks.flatMap(row => Object.keys(row.rankByTheme)))];
  const chart = buildBumpChart({ ranks, themes });
  if (chart.empty) {
    setHidden(card, true);
    return;
  }
  clearSvg(svg);
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  for (const line of chart.lines ?? []) {
    const path = createSvg(root, 'path');
    path.setAttribute('d', line.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', line.colour);
    path.setAttribute('stroke-width', '2');
    svg.append(path);
    const label = createSvg(root, 'text');
    const last = line.points.at(-1);
    label.setAttribute('x', String((last?.x ?? 0) + 8));
    label.setAttribute('y', String(line.labelY));
    label.setAttribute('class', 'fitness-viz__label');
    label.textContent = line.key;
    svg.append(label);
  }
}

function renderStream(root, weekly) {
  const card = showCard(root, '#fitness-stream-card', Boolean(weekly?.series?.length >= 2));
  const svg = root.querySelector('#fitness-stream-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const chart = buildStreamPaths(weekly, { width: 320, height: 120, padding: 8 });
  if (chart.empty) {
    setHidden(card, true);
    return;
  }
  clearSvg(svg);
  svg.setAttribute('viewBox', `0 0 ${chart.width ?? 320} ${chart.height ?? 120}`);
  (chart.bands ?? []).forEach((band, index) => {
    const path = createSvg(root, 'path');
    path.setAttribute('d', band.d);
    path.setAttribute('fill', REGION_COLOURS[band.key] ?? CLINICAL_CHART_SLOTS[index]);
    path.setAttribute('opacity', '0.7');
    svg.append(path);
  });
}

function renderPainHeat(root, series) {
  const card = showCard(root, '#fitness-pain-card', series?.length >= 1);
  const host = root.querySelector('#fitness-pain-heat');
  if (!card || !host) return;
  const heat = buildWatchlistHeat(series);
  host.replaceChildren();
  if (heat.empty) {
    setHidden(card, true);
    return;
  }
  for (const row of heat.rows) {
    const line = root.createElement('div');
    line.className = 'fitness-heat-row';
    const name = root.createElement('strong');
    name.textContent = row.term;
    line.append(name);
    for (const cell of row.cells) {
      const mark = root.createElement('span');
      mark.className = 'fitness-heat-cell';
      mark.dataset.spiked = cell.spiked ? 'true' : 'false';
      mark.style = mark.style ?? {};
      const mix = `${cell.mix ?? 0}%`;
      if (typeof mark.style.setProperty === 'function') mark.style.setProperty('--mix', mix);
      else mark.style['--mix'] = mix;
      line.append(mark);
    }
    host.append(line);
  }
}

function bandFill(band) {
  if (band === 'high') return 'var(--danger)';
  if (band === 'low') return 'var(--muted)';
  return 'var(--wave)';
}

function renderHorizon(root, metrics) {
  const card = showCard(root, '#fitness-horizon-card', metrics?.length >= 1);
  const latest = metrics?.[0]?.points?.at(-1);
  setText(root, '[data-fitness="load-read"]', Number.isFinite(latest?.ratio)
    ? `${latest.ratio.toFixed(1)}× your 4-week average`
    : '');
  const svg = root.querySelector('#fitness-horizon-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const chart = buildHorizonBands(metrics, { width: 320, height: 28 });
  clearSvg(svg);
  svg.setAttribute('viewBox', '0 0 320 28');
  for (const band of chart) {
    for (const [index, rect] of band.rects.entries()) {
      const node = createSvg(root, 'rect');
      node.setAttribute('x', String(rect.x));
      node.setAttribute('y', String(rect.y));
      node.setAttribute('width', String(rect.width));
      node.setAttribute('height', String(rect.height));
      node.setAttribute('fill', bandFill(metrics[0]?.points?.[index]?.band));
      node.setAttribute('opacity', String(Math.max(0.18, rect.opacity)));
      svg.append(node);
    }
  }
}

function paintDonut(root, svg, items, { radius, size = 160, gap = 4, opacity = 1 }) {
  const donut = buildMoodMixDonut(items, { size, radius, gap });
  if (donut.empty) return;
  for (const segment of donut.segments) {
    if (!segment.visible) continue;
    const circle = createSvg(root, 'circle');
    circle.setAttribute('cx', String(donut.center));
    circle.setAttribute('cy', String(donut.center));
    circle.setAttribute('r', String(donut.radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', segment.colour);
    circle.setAttribute('stroke-width', '12');
    circle.setAttribute('stroke-dasharray', segment.dasharray);
    circle.setAttribute('stroke-dashoffset', String(segment.dashoffset));
    circle.setAttribute('transform', `rotate(-90 ${donut.center} ${donut.center})`);
    circle.setAttribute('opacity', String(opacity));
    svg.append(circle);
  }
}

function renderTwoRing(root, current, prior) {
  const card = showCard(root, '#fitness-region-vol-card', current?.length >= 1);
  const svg = root.querySelector('#fitness-region-donut');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  clearSvg(svg);
  svg.setAttribute('viewBox', '0 0 160 160');
  paintDonut(root, svg, current, { radius: 62 });
  if (prior?.length) paintDonut(root, svg, prior, { radius: 42, opacity: 0.7 });
}

function renderGauge(root, cardSelector, svgSelector, value, target, label) {
  const ready = Number.isFinite(value);
  const card = showCard(root, cardSelector, ready);
  if (label) setText(root, label.selector, ready ? label.text : '');
  const svg = root.querySelector(svgSelector);
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const layout = rangeBarLayout(value, 0, 1, { width: 240, padding: 12 });
  const tick = rangeBarTick(target, { width: 240, padding: 12 });
  clearSvg(svg);
  svg.setAttribute('viewBox', '0 0 240 28');
  const track = createSvg(root, 'rect');
  track.setAttribute('x', '12');
  track.setAttribute('y', '10');
  track.setAttribute('width', '216');
  track.setAttribute('height', '8');
  track.setAttribute('rx', '4');
  track.setAttribute('class', 'fitness-viz__track');
  const fill = createSvg(root, 'rect');
  fill.setAttribute('x', '12');
  fill.setAttribute('y', '10');
  fill.setAttribute('width', String(Math.max(4, layout.fraction * 216)));
  fill.setAttribute('height', '8');
  fill.setAttribute('rx', '4');
  fill.setAttribute('fill', 'var(--wave)');
  const mark = createSvg(root, 'line');
  mark.setAttribute('x1', String(tick));
  mark.setAttribute('x2', String(tick));
  mark.setAttribute('y1', '6');
  mark.setAttribute('y2', '22');
  mark.setAttribute('stroke', 'var(--high-sea-ink)');
  mark.setAttribute('stroke-width', '2');
  svg.append(track, fill, mark);
  if (label) setText(root, label.selector, label.text);
}

function renderE1rmBands(root, lifts) {
  const card = showCard(root, '#fitness-e1rm-card', lifts?.length >= 1);
  const host = root.querySelector('#fitness-e1rm-list');
  if (!card || !host) return;
  host.replaceChildren();
  for (const lift of lifts) {
    const block = root.createElement('div');
    block.className = 'fitness-e1rm-band';
    const title = root.createElement('p');
    title.className = 'metric-caption';
    title.textContent = `${lift.name} · ${lift.current.toFixed(1)} kg`;
    block.append(title);
    if (typeof root.createElementNS === 'function') {
      const svg = createSvg(root, 'svg');
      svg.setAttribute('class', 'line-chart line-chart--dense');
      const chart = buildAreaLine(lift.series, {
        width: 320,
        height: 56,
        padding: 10,
        paddingBottom: 8,
        yDomain: 'fixed',
        min: lift.bandLow,
        max: lift.bandHigh
      });
      svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
      const band = createSvg(root, 'rect');
      band.setAttribute('x', '10');
      band.setAttribute('y', String(chart.scaleY(lift.bandHigh)));
      band.setAttribute('width', '300');
      band.setAttribute('height', String(Math.max(4, chart.scaleY(lift.bandLow) - chart.scaleY(lift.bandHigh))));
      band.setAttribute('class', 'fitness-viz__band');
      const line = createSvg(root, 'path');
      line.setAttribute('data-role', 'line');
      line.setAttribute('d', straightLinePath(chart.points));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', lift.tone === 'up' ? 'var(--success)' : lift.tone === 'down' ? 'var(--danger)' : 'var(--wave)');
      svg.append(band, line);
      block.append(svg);
      animateAreaReveal(svg);
    }
    host.append(block);
  }
}

function renderPill(root, gauge) {
  const card = showCard(root, '#fitness-pill-card', Boolean(gauge));
  const svg = root.querySelector('#fitness-pill-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const pct = Math.min(1.6, Math.max(0, gauge.pct / 100));
  clearSvg(svg);
  svg.setAttribute('viewBox', '0 0 48 120');
  const track = createSvg(root, 'rect');
  track.setAttribute('x', '16');
  track.setAttribute('y', '8');
  track.setAttribute('width', '16');
  track.setAttribute('height', '104');
  track.setAttribute('rx', '8');
  track.setAttribute('class', 'fitness-viz__track');
  const fillH = Math.min(104, pct * 65);
  const fill = createSvg(root, 'rect');
  fill.setAttribute('x', '16');
  fill.setAttribute('y', String(112 - fillH));
  fill.setAttribute('width', '16');
  fill.setAttribute('height', String(fillH));
  fill.setAttribute('rx', '8');
  fill.setAttribute('fill', pct > 1 ? 'var(--success)' : 'var(--wave)');
  const tick = createSvg(root, 'line');
  tick.setAttribute('x1', '12');
  tick.setAttribute('x2', '36');
  tick.setAttribute('y1', '47');
  tick.setAttribute('y2', '47');
  tick.setAttribute('stroke', 'var(--high-sea-ink)');
  svg.append(track, fill, tick);
  setText(root, '[data-fitness="pill-read"]', `${Math.round(gauge.pct)}% of your 4-week average`);
}

function renderYear(root, { year, dots }) {
  const card = showCard(root, '#fitness-year-card', dots?.length >= 2);
  const svg = root.querySelector('#fitness-year-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const ticks = buildRadialYear({ year, byDate: Object.fromEntries(dots.map(dot => [dot.date, dot])) });
  clearSvg(svg);
  svg.setAttribute('viewBox', '0 0 240 240');
  const cx = 120;
  const cy = 120;
  const maxVol = Math.max(1, ...dots.map(dot => dot.volume));
  for (const tick of ticks) {
    const hit = tick.mood;
    if (!hit) continue;
    const r = 48 + (hit.volume / maxVol) * 52;
    const x = cx + r * Math.cos(tick.angle);
    const y = cy + r * Math.sin(tick.angle);
    const dot = createSvg(root, 'circle');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', String(2.4 + (hit.volume / maxVol) * 2.6));
    dot.setAttribute('fill', hit.colour);
    svg.append(dot);
  }
}

function renderRepMix(root, items, read) {
  const card = showCard(root, '#fitness-rep-card', items?.length >= 1);
  const svg = root.querySelector('#fitness-rep-mix');
  if (!card) return;
  const donut = buildMoodMixDonut(items, { size: 160, radius: 58, gap: 5 });
  setText(root, '[data-fitness="rep-read"]', read ?? '');
  if (!svg || typeof root.createElementNS !== 'function') return;
  clearSvg(svg);
  svg.setAttribute('viewBox', `0 0 ${donut.size} ${donut.size}`);
  for (const segment of donut.segments) {
    if (!segment.visible) continue;
    const circle = createSvg(root, 'circle');
    circle.setAttribute('cx', String(donut.center));
    circle.setAttribute('cy', String(donut.center));
    circle.setAttribute('r', String(donut.radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', segment.colour);
    circle.setAttribute('stroke-width', '14');
    circle.setAttribute('stroke-dasharray', segment.dasharray);
    circle.setAttribute('stroke-dashoffset', String(segment.dashoffset));
    circle.setAttribute('transform', `rotate(-90 ${donut.center} ${donut.center})`);
    svg.append(circle);
  }
}

function renderSankey(root, flows) {
  const card = showCard(root, '#fitness-sankey-card', flows?.length >= 1);
  const svg = root.querySelector('#fitness-sankey-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const chart = buildSankeyFlow(flows, { width: 320, height: 140 });
  if (!chart.nodes.length) {
    setHidden(card, true);
    return;
  }
  clearSvg(svg);
  svg.setAttribute('viewBox', '0 0 320 140');
  for (const link of chart.links) {
    const path = createSvg(root, 'path');
    const x0 = link.x0 ?? 20;
    const x1 = link.x1 ?? 300;
    const y0 = link.y0 ?? 20;
    const y1 = link.y1 ?? 20;
    path.setAttribute('d', `M${x0},${y0} C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--wave)');
    path.setAttribute('stroke-width', String(Math.max(2, link.width ?? 4)));
    path.setAttribute('opacity', '0.45');
    svg.append(path);
  }
  for (const node of chart.nodes) {
    const rect = createSvg(root, 'rect');
    rect.setAttribute('x', String(node.x0));
    rect.setAttribute('y', String(node.y0));
    rect.setAttribute('width', String(Math.max(4, node.x1 - node.x0)));
    rect.setAttribute('height', String(Math.max(8, node.y1 - node.y0)));
    rect.setAttribute('fill', 'var(--marine)');
    svg.append(rect);
  }
}

function constellationViewBox(chart) {
  const nodes = chart.nodes ?? [];
  if (!nodes.length) return `0 0 ${chart.width} ${chart.height}`;
  const xs = nodes.map(node => node.x);
  const ys = nodes.map(node => node.y);
  const controlYs = (chart.edges ?? []).map(edge => edge.controlY).filter(Number.isFinite);
  const padX = 90;
  const padY = 36;
  const minX = Math.min(...xs) - padX;
  const maxX = Math.max(...xs) + padX;
  const minY = Math.min(...ys, ...controlYs) - padY;
  const maxY = Math.max(...ys, ...controlYs) + padY + 20;
  return `${minX} ${minY} ${Math.max(160, maxX - minX)} ${Math.max(100, maxY - minY)}`;
}

function renderLibrary(root, map) {
  const card = showCard(root, '#fitness-library-card', Boolean(map?.nodes?.length >= 2));
  const svg = root.querySelector('#fitness-library-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const chart = buildThemeConstellation({
    nodes: map.nodes,
    edges: map.edges,
    minEdgeCount: 1
  });
  if (chart.empty) {
    setHidden(card, true);
    return;
  }
  clearSvg(svg);
  svg.setAttribute('viewBox', constellationViewBox(chart));
  for (const edge of chart.edges ?? []) {
    const path = createSvg(root, 'path');
    path.setAttribute('d', edge.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--wave)');
    path.setAttribute('stroke-width', String(edge.strokeWidth ?? 1.5));
    path.setAttribute('opacity', String(edge.opacity ?? 0.4));
    svg.append(path);
  }
  for (const node of chart.nodes ?? []) {
    const dot = createSvg(root, 'circle');
    dot.setAttribute('cx', String(node.x));
    dot.setAttribute('cy', String(node.y));
    dot.setAttribute('r', String(node.r ?? 6));
    dot.setAttribute('fill', node.colour ?? CLINICAL_CHART_SLOTS[0]);
    svg.append(dot);
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(node.x));
    label.setAttribute('y', String(node.y + (node.r ?? 6) + 12));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'fitness-viz__label');
    label.textContent = node.key;
    svg.append(label);
  }
}

function renderSparks(root, readings, seriesMap) {
  const rows = (readings ?? []).filter(row => seriesMap[row.key]?.length >= 2);
  const card = showCard(root, '#fitness-readings-card', rows.length >= 1);
  const host = root.querySelector('#fitness-readings');
  if (!card || !host) return;
  host.replaceChildren();
  for (const row of rows) {
    const series = seriesMap[row.key];
    const avg = series.reduce((sum, point) => sum + point.value, 0) / series.length;
    const item = root.createElement('div');
    item.className = 'fitness-spark-row';
    const name = root.createElement('strong');
    name.textContent = row.label;
    const value = root.createElement('span');
    value.textContent = `${Number.isInteger(row.current) ? row.current : row.current.toFixed(1)} ${row.unit}`;
    item.append(name, value);
    if (typeof root.createElementNS === 'function') {
      const svg = createSvg(root, 'svg');
      const chart = buildAreaLine(series, {
        width: 160,
        height: 28,
        padding: 4,
        paddingBottom: 4,
        yDomain: 'padded',
        guideValue: avg
      });
      svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
      svg.setAttribute('class', 'fitness-spark');
      const line = createSvg(root, 'path');
      line.setAttribute('data-role', 'line');
      line.setAttribute('d', chart.linePath);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', 'var(--wave)');
      if (chart.guideY != null) {
        const tick = createSvg(root, 'line');
        tick.setAttribute('x1', '4');
        tick.setAttribute('x2', '156');
        tick.setAttribute('y1', String(chart.guideY));
        tick.setAttribute('y2', String(chart.guideY));
        tick.setAttribute('stroke', 'var(--high-sea-ink)');
        tick.setAttribute('stroke-dasharray', '3 3');
        svg.append(tick);
      }
      svg.append(line);
      item.append(svg);
      animateAreaReveal(svg);
    }
    host.append(item);
  }
}

function renderEfficiency(root, weeks) {
  const card = showCard(root, '#fitness-efficiency-card', weeks?.length >= 2);
  const host = root.querySelector('#fitness-efficiency-bars');
  if (!card || !host) return;
  host.replaceChildren();
  const avg = weeks.reduce((sum, week) => sum + week.value, 0) / weeks.length;
  const chart = buildColumns(weeks.map(week => ({
    key: week.weekStart,
    label: `w/c ${formatDisplayDate(week.weekStart)}`,
    value: week.value
  })));
  for (const bar of chart.bars) {
    const row = root.createElement('div');
    row.className = 'fitness-share-row';
    const label = root.createElement('strong');
    label.textContent = bar.label;
    const track = root.createElement('span');
    track.className = 'fitness-share-row__track';
    const fill = root.createElement('i');
    fill.dataset.tone = bar.value >= avg ? 'up' : 'same';
    setWidth(fill, bar.heightPct);
    track.append(fill);
    const value = root.createElement('span');
    value.textContent = `${bar.value.toFixed(1)} kg/set`;
    row.append(label, track, value);
    host.append(row);
  }
}

export function renderFitnessCharts(root, charts = {}) {
  setText(root, '[data-fitness="longest-streak"]', String(charts.longestStreak ?? 0));

  renderClock(root, charts.clockPoints);
  renderOrbit(root, charts.orbitDays);
  renderE1rmRadial(root, charts.e1rmRadial);
  renderChord(root, charts.focusChord);
  renderBump(root, charts.bumpRanks);
  renderStream(root, charts.regionStream);
  renderPainHeat(root, charts.painHeat);
  renderHorizon(root, charts.loadHorizon);
  renderTwoRing(root, charts.regionVolume, charts.regionVolumePrior);
  const push = charts.pushPull?.find(item => item.key === 'push')?.value ?? 0;
  const pull = charts.pushPull?.find(item => item.key === 'pull')?.value ?? 0;
  const pushTotal = push + pull;
  renderGauge(root, '#fitness-push-pull-card', '#fitness-push-gauge', pushTotal ? push / pushTotal : null, 0.5, {
    selector: '[data-fitness="push-read"]',
    text: pushTotal ? `${formatKg(push)} push · ${formatKg(pull)} pull` : ''
  });
  const trained = charts.restCounts?.trained;
  const days = charts.restCounts?.days || 30;
  const weekTarget = charts.weekTarget ?? 4;
  renderGauge(root, '#fitness-rest-card', '#fitness-rest-gauge', Number.isFinite(trained) && trained > 0 ? trained / days : null, weekTarget / 7, {
    selector: '[data-fitness="rest-read"]',
    text: Number.isFinite(trained) ? `${trained} trained / ${days} days` : ''
  });
  renderE1rmBands(root, charts.e1rmBands);
  renderPill(root, charts.sessionGauge);
  renderYear(root, { year: charts.year, dots: charts.yearDots });
  renderRepMix(root, charts.repRanges, charts.repRead);
  renderSankey(root, charts.sankeyFlows);
  renderLibrary(root, charts.libraryMap);
  renderSparks(root, charts.sessionReadings, {
    duration: charts.durationSeries,
    distance: charts.distanceSeries,
    pace: charts.paceSeries,
    hr: charts.hrSeries
  });
  renderEfficiency(root, charts.volumePerSetWeeks);
}
