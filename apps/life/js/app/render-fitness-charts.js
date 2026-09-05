import { positionHubFloating } from '../../../../packages/design-kit/js/hub-floating.js';
import { animateAreaReveal, animateColumnGrow, prefersReducedMotion } from './chart-kit/animate.js';
import { buildAreaLine, straightLinePath } from './chart-kit/area-line.js';
import { buildBumpChart } from './chart-kit/bump.js';
import { CLINICAL_CHART_SLOTS } from './chart-kit/clinical-slots.js';
import { buildChordLayout } from './chart-kit/chord-layout.js';
import { buildColumns } from './chart-kit/columns.js';
import { buildEnergyOrbit } from './chart-kit/energy-orbit.js';
import { buildHorizonBands } from './chart-kit/horizon.js';
import { buildMoodMixDonut } from './chart-kit/mood-mix.js';
import { buildMoodRadial } from './chart-kit/mood-radial.js';
import { MONTHS, polar, thetaForDate, thetaForTime } from './chart-kit/polar-clock.js';
import { rangeBarLayout, rangeBarTick } from './chart-kit/range-bar.js';
import { buildRadialYear } from './chart-kit/radial-year.js';
import { REGION_COLOURS } from './fitness-charts-model.js';
import { REGION_LABELS } from './fitness-model.js';
import { buildSankeyFlow } from './chart-kit/sankey-flow.js';
import { buildStreamPaths } from './chart-kit/stream.js';
import { buildThemeConstellation } from './chart-kit/theme-constellation.js';
import { buildWatchlistHeat } from './chart-kit/watchlist-heat.js';
import { formatDisplayDate } from '../core/time.js';

const CLOCK_HOURS = [
  { time: '00:00', label: '00:00' },
  { time: '06:00', label: '06:00' },
  { time: '12:00', label: '12:00' },
  { time: '18:00', label: '18:00' }
];
const DAY_TYPE_LABELS = {
  movement: 'Movement',
  workout_30: '30 min',
  workout_45_60: '45–60 min',
  rest: 'Rest'
};

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

function paintLegend(root, host, items) {
  if (!host) return;
  const kids = [...(host.children ?? [])];
  let legend = kids.find(node => String(node.className || '').split(/\s+/).includes('mind-chart-legend'));
  if (!items?.length) {
    legend?.replaceChildren?.();
    return;
  }
  if (!legend) {
    legend = root.createElement('ul');
    legend.className = 'mind-chart-legend';
    host.append(legend);
  }
  legend.replaceChildren();
  for (const item of items) {
    const row = root.createElement('li');
    if (item.swatch) {
      const swatch = root.createElement('i');
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style?.setProperty?.('--swatch', item.swatch);
      row.append(swatch);
    }
    const label = root.createElement('span');
    label.textContent = item.label;
    row.append(label);
    legend.append(row);
  }
}

function ensureTip(root, host) {
  if (!host) return null;
  let tip = host.querySelector?.('[data-role="fitness-tip"]');
  if (tip) return tip;
  tip = root.createElement('div');
  tip.className = 'mind-bump__tooltip';
  tip.dataset.role = 'fitness-tip';
  tip.setAttribute('aria-live', 'polite');
  tip.hidden = true;
  host.append(tip);
  return tip;
}

function bindTip(node, tip, text) {
  if (!node || !tip || typeof node.addEventListener !== 'function') return;
  const show = event => {
    tip.hidden = false;
    tip.textContent = text;
    const mark = event.currentTarget || node;
    void positionHubFloating(mark, tip, {
      placement: 'top',
      strategy: 'fixed',
      offset: 8
    });
  };
  const hide = () => { tip.hidden = true; };
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'button');
  node.addEventListener('pointerenter', show);
  node.addEventListener('pointerleave', hide);
  node.addEventListener('focus', show);
  node.addEventListener('blur', hide);
}

function namedDot(root, { cx, cy, r, fill, delay, className = 'mind-mood-dot' }) {
  const dot = createSvg(root, 'circle');
  if (!dot) return null;
  dot.setAttribute('data-role', 'point');
  dot.setAttribute('cx', String(cx));
  dot.setAttribute('cy', String(cy));
  dot.setAttribute('r', String(r));
  dot.setAttribute('class', className);
  dot.setAttribute('fill', fill);
  if (delay != null && !prefersReducedMotion()) dot.style.animationDelay = delay;
  return dot;
}

function renderClock(root, points) {
  const card = showCard(root, '#fitness-clock-card', points?.length >= 2);
  const svg = root.querySelector('#fitness-clock-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  clearSvg(svg);
  const size = 320;
  const cx = 160;
  const cy = 160;
  const rim = 118;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const tip = ensureTip(root, card);
  const nodes = [];
  for (const ring of [
    { r: 52, label: 'Older', x: 160, y: 116 },
    { r: 86, label: '', x: 0, y: 0 },
    { r: rim, label: 'Newer', x: 160, y: 36 }
  ]) {
    const grid = createSvg(root, 'circle');
    grid.setAttribute('data-role', 'grid');
    grid.setAttribute('cx', String(cx));
    grid.setAttribute('cy', String(cy));
    grid.setAttribute('r', String(ring.r));
    nodes.push(grid);
    if (ring.label) {
      const label = createSvg(root, 'text');
      label.setAttribute('data-role', 'grid-label');
      label.setAttribute('x', String(ring.x));
      label.setAttribute('y', String(ring.y));
      label.setAttribute('text-anchor', 'middle');
      label.textContent = ring.label;
      nodes.push(label);
    }
  }
  for (const hour of CLOCK_HOURS) {
    const theta = thetaForTime(hour.time);
    const tick = polar(cx, cy, rim, theta);
    const labelAt = polar(cx, cy, rim + 22, theta);
    const spoke = createSvg(root, 'line');
    spoke.setAttribute('data-role', 'spoke');
    spoke.setAttribute('x1', String(cx));
    spoke.setAttribute('y1', String(cy));
    spoke.setAttribute('x2', String(tick.x));
    spoke.setAttribute('y2', String(tick.y));
    const label = createSvg(root, 'text');
    label.setAttribute('data-role', 'angle-label');
    label.setAttribute('x', String(labelAt.x));
    label.setAttribute('y', String(labelAt.y + 4));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = hour.label;
    nodes.push(spoke, label);
  }
  points.forEach((point, index) => {
    const theta = thetaForTime(point.time);
    if (theta == null) return;
    const radius = 52 + point.recency * 66;
    const { x, y } = polar(cx, cy, radius, theta);
    const region = REGION_LABELS[point.region] ?? point.region ?? 'Session';
    const copy = `${point.title ?? 'Session'} · ${formatDisplayDate(point.date)} · ${point.time} · ${region}`;
    const dot = namedDot(root, {
      cx: x,
      cy: y,
      r: 7,
      fill: point.colour,
      delay: `${Math.min(index * 25, 400)}ms`
    });
    if (!dot) return;
    const title = createSvg(root, 'title');
    title.textContent = copy;
    dot.append(title);
    bindTip(dot, tip, copy);
    nodes.push(dot);
  });
  svg.replaceChildren(...nodes);
  animateAreaReveal(svg);
  const seen = new Set();
  paintLegend(root, card, (points ?? []).flatMap(point => {
    if (!point.region || seen.has(point.region)) return [];
    seen.add(point.region);
    return [{ label: REGION_LABELS[point.region] ?? point.region, swatch: point.colour }];
  }));
}

function renderOrbit(root, days) {
  const trained = (days ?? []).filter(day => day.volume > 0);
  const card = showCard(root, '#fitness-orbit-card', trained.length >= 2);
  const svg = root.querySelector('#fitness-orbit-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const from = days[0]?.date;
  const to = days.at(-1)?.date;
  const series = trained.map(day => ({ date: day.date, energy: 'medium' }));
  const chart = buildEnergyOrbit(series, { bounds: { from, to }, range: 'monthly' });
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('class', 'mind-energy-orbit__chart fitness-polar__svg');
  const tip = ensureTip(root, card);
  const nodes = [];
  for (const tick of chart.angleTicks ?? []) {
    const outer = Math.hypot(tick.x - chart.cx, tick.y - chart.cy) || chart.plotRadius;
    const inner = Math.max(outer - 14, 0);
    const ux = (tick.x - chart.cx) / outer;
    const uy = (tick.y - chart.cy) / outer;
    const spoke = createSvg(root, 'line');
    spoke.setAttribute('data-role', 'tick');
    spoke.setAttribute('x1', String(chart.cx + ux * inner));
    spoke.setAttribute('y1', String(chart.cy + uy * inner));
    spoke.setAttribute('x2', String(tick.x));
    spoke.setAttribute('y2', String(tick.y));
    const label = createSvg(root, 'text');
    label.setAttribute('data-role', 'angle-label');
    label.setAttribute('x', String(tick.labelX));
    label.setAttribute('y', String(tick.labelY + 4));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = tick.label;
    nodes.push(spoke, label);
  }
  const volumeRings = [
    { fraction: 0.44, label: 'Lighter', colour: 'var(--muted)' },
    { fraction: 0.66, label: 'Typical', colour: 'var(--marine)' },
    { fraction: 0.88, label: 'Heavier', colour: 'var(--wave)' }
  ];
  for (const ring of volumeRings) {
    const radius = ring.fraction * chart.plotRadius;
    const at = polar(chart.cx, chart.cy, radius, -8);
    const grid = createSvg(root, 'circle');
    grid.setAttribute('data-role', 'orbit');
    grid.setAttribute('cx', String(chart.cx));
    grid.setAttribute('cy', String(chart.cy));
    grid.setAttribute('r', String(radius));
    grid.setAttribute('stroke', ring.colour);
    const label = createSvg(root, 'text');
    label.setAttribute('data-role', 'orbit-label');
    label.setAttribute('x', String(at.x));
    label.setAttribute('y', String(at.y));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', ring.colour);
    label.textContent = ring.label;
    nodes.push(grid, label);
  }
  const maxVol = Math.max(1, ...trained.map(day => day.volume));
  trained.forEach((day, index) => {
    const theta = thetaForDate(day.date, { from, to }, 'monthly');
    const radius = chart.plotRadius * (0.44 + (day.volume / maxVol) * 0.44);
    const { x, y } = polar(chart.cx, chart.cy, radius, theta);
    const kind = DAY_TYPE_LABELS[day.dayType] ?? day.dayType;
    const copy = `${formatDisplayDate(day.date)} · ${formatKg(day.volume)} · ${kind}`;
    const dot = namedDot(root, {
      cx: x,
      cy: y,
      r: 6 + (day.volume / maxVol) * 5,
      fill: day.colour,
      className: 'mind-energy-dot',
      delay: `${Math.min(index * 18, 400)}ms`
    });
    if (!dot) return;
    const title = createSvg(root, 'title');
    title.textContent = copy;
    dot.append(title);
    bindTip(dot, tip, copy);
    nodes.push(dot);
  });
  svg.replaceChildren(...nodes);
  animateAreaReveal(svg);
  setText(root, '[data-fitness="orbit-status"]', `${trained.length} sessions`);
  setText(root, '[data-fitness="orbit-period"]', 'Past 30 days');
  const seen = new Set();
  paintLegend(root, card, trained.flatMap(day => {
    if (seen.has(day.dayType)) return [];
    seen.add(day.dayType);
    return [{ label: DAY_TYPE_LABELS[day.dayType] ?? day.dayType, swatch: day.colour }];
  }));
}

function renderE1rmRadial(root, points) {
  const card = showCard(root, '#fitness-e1rm-radial-card', points?.length >= 2);
  const svg = root.querySelector('#fitness-e1rm-radial-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const dates = points.map(point => point.date).sort();
  const chart = buildMoodRadial(
    points.map(point => ({ date: point.date, value: 5 })),
    { bounds: { from: dates[0], to: dates.at(-1) }, range: 'monthly' }
  );
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  const tip = ensureTip(root, card);
  const nodes = [];
  for (const tick of chart.angleTicks ?? []) {
    const spoke = createSvg(root, 'line');
    spoke.setAttribute('data-role', 'spoke');
    spoke.setAttribute('x1', String(chart.cx));
    spoke.setAttribute('y1', String(chart.cy));
    spoke.setAttribute('x2', String(tick.x));
    spoke.setAttribute('y2', String(tick.y));
    const label = createSvg(root, 'text');
    label.setAttribute('data-role', 'angle-label');
    label.setAttribute('x', String(tick.labelX));
    label.setAttribute('y', String(tick.labelY + 4));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = tick.label;
    nodes.push(spoke, label);
  }
  for (const pct of [50, 75, 100]) {
    const radius = (pct / 100) * chart.plotRadius;
    const grid = createSvg(root, 'circle');
    grid.setAttribute('data-role', 'grid');
    grid.setAttribute('cx', String(chart.cx));
    grid.setAttribute('cy', String(chart.cy));
    grid.setAttribute('r', String(radius));
    const label = createSvg(root, 'text');
    label.setAttribute('data-role', 'grid-label');
    label.setAttribute('x', String(chart.cx - radius));
    label.setAttribute('y', String(chart.cy - 6));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = `${pct}%`;
    nodes.push(grid, label);
  }
  points.forEach((source, index) => {
    const theta = thetaForDate(source.date, { from: dates[0], to: dates.at(-1) }, 'monthly');
    const radius = Math.max(28, (Math.min(source.pct, 110) / 100) * chart.plotRadius);
    const { x, y } = polar(chart.cx, chart.cy, radius, theta);
    const copy = `${source.name ?? 'Lift'} · ${formatDisplayDate(source.date)} · ${Math.round(source.pct ?? 0)}% of best`;
    const dot = namedDot(root, {
      cx: x,
      cy: y,
      r: 7,
      fill: source.colour ?? CLINICAL_CHART_SLOTS[0],
      delay: `${Math.min(index * 25, 400)}ms`
    });
    if (!dot) return;
    const title = createSvg(root, 'title');
    title.textContent = copy;
    dot.append(title);
    bindTip(dot, tip, copy);
    nodes.push(dot);
  });
  svg.replaceChildren(...nodes);
  animateAreaReveal(svg);
  const seen = new Set();
  paintLegend(root, card, (points ?? []).flatMap(point => {
    if (seen.has(point.name)) return [];
    seen.add(point.name);
    return [{ label: point.name, swatch: point.colour ?? CLINICAL_CHART_SLOTS[0] }];
  }));
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
  const tip = ensureTip(root, card);
  const colourByKey = new Map((layout.arcs ?? []).map((arc, index) => [
    arc.key,
    REGION_COLOURS[arc.key] ?? CLINICAL_CHART_SLOTS[index % CLINICAL_CHART_SLOTS.length]
  ]));
  for (const arc of layout.arcs ?? []) {
    const mid = ((arc.startAngle ?? 0) + (arc.endAngle ?? 0)) / 2;
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
    path.setAttribute('data-role', 'arc');
    const name = REGION_LABELS[arc.key] ?? arc.key;
    bindTip(path, tip, name);
    const label = createSvg(root, 'text');
    label.setAttribute('class', 'mind-chart-label');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('x', String(cx + 148 * Math.cos(mid - Math.PI / 2)));
    label.setAttribute('y', String(cy + 148 * Math.sin(mid - Math.PI / 2)));
    label.textContent = name;
    svg.append(path, label);
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
    path.setAttribute('data-role', 'ribbon');
    bindTip(path, tip, `${REGION_LABELS[ribbon.source?.key] ?? ribbon.source?.key ?? 'Region'} + ${REGION_LABELS[ribbon.target?.key] ?? ribbon.target?.key ?? 'region'} · ${ribbon.value ?? 1} sessions`);
    svg.append(path);
  }
  paintLegend(root, card, [...colourByKey.entries()].map(([key, swatch]) => ({
    label: REGION_LABELS[key] ?? key,
    swatch
  })));
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
  const tip = ensureTip(root, card);
  for (const tick of chart.ranks ?? []) {
    const label = createSvg(root, 'text');
    label.setAttribute('x', String((chart.pad?.left ?? 52) - 12));
    label.setAttribute('y', String(tick.y + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'mind-bump__week');
    label.textContent = String(tick.rank);
    svg.append(label);
  }
  for (const tick of chart.weeks ?? []) {
    if (!tick.show) continue;
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(tick.x));
    label.setAttribute('y', String(chart.height - 16));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'mind-bump__week');
    label.textContent = tick.label;
    svg.append(label);
  }
  for (const line of chart.lines ?? []) {
    const path = createSvg(root, 'path');
    path.setAttribute('d', line.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', line.colour);
    path.setAttribute('stroke-width', '2');
    svg.append(path);
    const last = line.points.at(-1);
    const label = createSvg(root, 'text');
    label.setAttribute('x', String((last?.x ?? 0) + 8));
    label.setAttribute('y', String(line.labelY));
    label.setAttribute('class', 'mind-bump__label');
    label.textContent = line.key;
    bindTip(path, tip, `${line.key} · rank ${last?.rank ?? ''}`);
    svg.append(label);
    for (const point of line.points ?? []) {
      const dot = namedDot(root, {
        cx: point.x,
        cy: point.y,
        r: 5,
        fill: line.colour,
        className: 'mind-bump__dot'
      });
      if (!dot) continue;
      bindTip(dot, tip, `${line.key} · ${formatDisplayDate(point.week ?? point.date ?? '')} · rank ${point.rank}`);
      svg.append(dot);
    }
  }
  animateAreaReveal(svg);
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
    bindTip(path, ensureTip(root, card), REGION_LABELS[band.key] ?? band.key);
    svg.append(path);
  });
  paintLegend(root, card, (chart.bands ?? []).map((band, index) => ({
    label: REGION_LABELS[band.key] ?? band.key,
    swatch: REGION_COLOURS[band.key] ?? CLINICAL_CHART_SLOTS[index]
  })));
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
      const mark = root.createElement('button');
      mark.type = 'button';
      mark.className = 'fitness-heat-cell mind-watchlist__cell';
      mark.dataset.spiked = cell.spiked ? 'true' : 'false';
      mark.style = mark.style ?? {};
      const mix = `${cell.mix ?? 0}%`;
      if (typeof mark.style.setProperty === 'function') mark.style.setProperty('--mix', mix);
      else mark.style['--mix'] = mix;
      bindTip(mark, ensureTip(root, card), `${row.term} · ${cell.date ?? ''} · ${cell.count ?? 0}${cell.spiked ? ' · volume spike' : ''}`);
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
      const point = metrics[0]?.points?.[index];
      if (point) {
        bindTip(node, ensureTip(root, card), `w/c ${formatDisplayDate(point.date)} · ${formatKg(point.value)} · ${Number.isFinite(point.ratio) ? `${point.ratio.toFixed(1)}×` : 'no baseline'}`);
      }
      svg.append(node);
    }
  }
}

function paintDonut(root, svg, items, { radius, size = 160, gap = 4, opacity = 1, tip, prefix = '' }) {
  const donut = buildMoodMixDonut(items, { size, radius, gap });
  if (donut.empty) return donut;
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
    circle.setAttribute('data-role', 'slice');
    circle.setAttribute('class', 'mind-mood-mix__seg');
    bindTip(circle, tip, `${prefix}${segment.label ?? segment.key} · ${segment.value ?? ''}`.trim());
    svg.append(circle);
  }
  return donut;
}

function renderTwoRing(root, current, prior) {
  const card = showCard(root, '#fitness-region-vol-card', current?.length >= 1);
  const svg = root.querySelector('#fitness-region-donut');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const tip = ensureTip(root, card);
  clearSvg(svg);
  svg.setAttribute('viewBox', '0 0 160 160');
  paintDonut(root, svg, current, { radius: 62, tip, prefix: 'This month · ' });
  if (prior?.length) paintDonut(root, svg, prior, { radius: 42, opacity: 0.7, tip, prefix: 'Last month · ' });
  paintLegend(root, card, (current ?? []).map(item => ({
    label: item.label ?? REGION_LABELS[item.key] ?? item.key,
    swatch: item.colour ?? REGION_COLOURS[item.key]
  })));
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
  if (label) {
    setText(root, label.selector, label.text);
    bindTip(fill, ensureTip(root, card), label.text);
  }
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
      const tip = ensureTip(root, card);
      for (const point of chart.points ?? []) {
        const dot = namedDot(root, {
          cx: point.x,
          cy: point.y,
          r: 4,
          fill: lift.tone === 'up' ? 'var(--success)' : lift.tone === 'down' ? 'var(--danger)' : 'var(--wave)'
        });
        if (!dot) continue;
        bindTip(dot, tip, `${lift.name} · ${formatDisplayDate(point.date)} · ${Number(point.value).toFixed(1)} kg`);
        if (point.date) {
          dot.style.cursor = 'pointer';
          dot.setAttribute('role', 'button');
          dot.tabIndex = 0;
          const selectDay = () => {
            const recent = root.querySelector('#fitness-recent');
            recent?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            for (const row of root.querySelectorAll('.fitness-recent-row')) {
              const match = row.dataset.date === point.date;
              row.classList.toggle('is-focused', match);
            }
          };
          dot.addEventListener('click', selectDay);
          dot.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectDay();
            }
          });
        }
        svg.append(dot);
      }
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
  const copy = `${Math.round(gauge.pct)}% of your 4-week average`;
  setText(root, '[data-fitness="pill-read"]', copy);
  bindTip(fill, ensureTip(root, card), copy);
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
  const tip = ensureTip(root, card);
  const maxVol = Math.max(1, ...dots.map(dot => dot.volume));
  for (const ring of [48, 74, 100]) {
    const grid = createSvg(root, 'circle');
    grid.setAttribute('data-role', 'grid');
    grid.setAttribute('cx', String(cx));
    grid.setAttribute('cy', String(cy));
    grid.setAttribute('r', String(ring));
    svg.append(grid);
  }
  MONTHS.forEach((name, index) => {
    const angle = (2 * Math.PI * index) / 12 - Math.PI / 2;
    const label = createSvg(root, 'text');
    label.setAttribute('data-role', 'angle-label');
    label.setAttribute('x', String(cx + 112 * Math.cos(angle)));
    label.setAttribute('y', String(cy + 112 * Math.sin(angle) + 3));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = name;
    svg.append(label);
  });
  ticks.forEach((tick, index) => {
    const hit = tick.mood;
    if (!hit) return;
    const r = 48 + (hit.volume / maxVol) * 52;
    const x = cx + r * Math.cos(tick.angle);
    const y = cy + r * Math.sin(tick.angle);
    const copy = `${formatDisplayDate(hit.date ?? tick.date)} · ${formatKg(hit.volume)} · ${REGION_LABELS[hit.region] ?? hit.region ?? 'Session'}`;
    const dot = namedDot(root, {
      cx: x,
      cy: y,
      r: 2.8 + (hit.volume / maxVol) * 3,
      fill: hit.colour,
      delay: `${Math.min(index, 400)}ms`
    });
    if (!dot) return;
    bindTip(dot, tip, copy);
    svg.append(dot);
  });
  const seen = new Set();
  paintLegend(root, card, (dots ?? []).flatMap(dot => {
    if (!dot.region || seen.has(dot.region)) return [];
    seen.add(dot.region);
    return [{ label: REGION_LABELS[dot.region] ?? dot.region, swatch: dot.colour }];
  }));
}

function renderRepMix(root, items, read) {
  const card = showCard(root, '#fitness-rep-card', items?.length >= 1);
  const svg = root.querySelector('#fitness-rep-mix');
  if (!card) return;
  setText(root, '[data-fitness="rep-read"]', read ?? '');
  if (!svg || typeof root.createElementNS !== 'function') return;
  const tip = ensureTip(root, card);
  clearSvg(svg);
  svg.setAttribute('viewBox', '0 0 160 160');
  paintDonut(root, svg, items, { radius: 58, tip });
  paintLegend(root, card, (items ?? []).map(item => ({
    label: item.label ?? item.key,
    swatch: item.colour
  })));
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
  const tip = ensureTip(root, card);
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
    const source = link.source?.id ?? link.source ?? 'From';
    const target = link.target?.id ?? link.target ?? 'to';
    bindTip(path, tip, `${source} → ${target} · ${link.value ?? 0}`);
    svg.append(path);
  }
  for (const node of chart.nodes) {
    const rect = createSvg(root, 'rect');
    rect.setAttribute('x', String(node.x0));
    rect.setAttribute('y', String(node.y0));
    rect.setAttribute('width', String(Math.max(4, node.x1 - node.x0)));
    rect.setAttribute('height', String(Math.max(8, node.y1 - node.y0)));
    rect.setAttribute('fill', 'var(--marine)');
    const label = createSvg(root, 'text');
    const left = node.x0 < 80;
    label.setAttribute('x', String(left ? node.x1 + 6 : node.x0 - 6));
    label.setAttribute('y', String((node.y0 + node.y1) / 2 + 3));
    label.setAttribute('text-anchor', left ? 'start' : 'end');
    label.setAttribute('class', 'fitness-viz__label');
    label.textContent = node.id ?? node.name ?? '';
    bindTip(rect, tip, node.id ?? node.name ?? 'Step');
    svg.append(rect, label);
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
  svg.setAttribute('class', 'mind-constellation__chart fitness-viz__svg');
  const tip = ensureTip(root, card);
  for (const edge of chart.edges ?? []) {
    const path = createSvg(root, 'path');
    path.setAttribute('class', 'mind-constellation__edge is-up');
    path.setAttribute('data-role', 'edge');
    path.setAttribute('d', edge.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', String(edge.strokeWidth ?? 1.5));
    path.setAttribute('opacity', String(edge.opacity ?? 0.4));
    bindTip(path, tip, `${edge.themeA ?? edge.a ?? 'Lift'} + ${edge.themeB ?? edge.b ?? 'lift'} · ${edge.count ?? 1} sessions`);
    svg.append(path);
  }
  for (const node of chart.nodes ?? []) {
    const group = createSvg(root, 'g');
    group.setAttribute('class', 'mind-constellation__star');
    group.setAttribute('data-role', 'star');
    const halo = createSvg(root, 'circle');
    halo.setAttribute('class', 'mind-constellation__halo');
    halo.setAttribute('cx', String(node.x));
    halo.setAttribute('cy', String(node.y));
    halo.setAttribute('r', String((node.r ?? 6) + 6));
    halo.setAttribute('pointer-events', 'none');
    const dot = createSvg(root, 'circle');
    dot.setAttribute('class', 'mind-constellation__dot');
    dot.setAttribute('cx', String(node.x));
    dot.setAttribute('cy', String(node.y));
    dot.setAttribute('r', String(node.r ?? 6));
    dot.setAttribute('fill', node.colour ?? CLINICAL_CHART_SLOTS[0]);
    dot.setAttribute('pointer-events', 'none');
    const glyph = createSvg(root, 'text');
    glyph.setAttribute('class', 'mind-constellation__glyph');
    glyph.setAttribute('x', String(node.x));
    glyph.setAttribute('y', String(node.y + 4));
    glyph.setAttribute('text-anchor', 'middle');
    glyph.setAttribute('pointer-events', 'none');
    glyph.textContent = String(node.key ?? '?').charAt(0);
    const hit = createSvg(root, 'circle');
    hit.setAttribute('class', 'mind-constellation__hit');
    hit.setAttribute('cx', String(node.x));
    hit.setAttribute('cy', String(node.y));
    hit.setAttribute('r', String(Math.max((node.r ?? 6) + 10, 18)));
    const label = createSvg(root, 'text');
    label.setAttribute('class', 'mind-constellation__label');
    label.setAttribute('x', String(node.x));
    label.setAttribute('y', String(node.y + (node.r ?? 6) + 18));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('pointer-events', 'none');
    label.textContent = node.key;
    group.append(halo, dot, glyph, hit, label);
    bindTip(group, tip, `${node.key} · ${node.count ?? 0} session${(node.count ?? 0) === 1 ? '' : 's'}`);
    svg.append(group);
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
      bindTip(svg, ensureTip(root, card), `${row.label} · ${value.textContent} · avg ${Number.isInteger(avg) ? avg : avg.toFixed(1)} ${row.unit}`);
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
    animateColumnGrow(fill, bar.heightPct);
    bindTip(row, ensureTip(root, card), `${bar.label} · ${bar.value.toFixed(1)} kg/set${bar.value >= avg ? ' · above average' : ''}`);
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
