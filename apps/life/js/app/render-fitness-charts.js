import { animateAreaReveal, animateColumnGrow, prefersReducedMotion } from './chart-kit/animate.js';
import { buildAreaLine, straightLinePath } from './chart-kit/area-line.js';
import { buildBumpChart } from './chart-kit/bump.js';
import { CLINICAL_CHART_SLOTS } from './chart-kit/clinical-slots.js';
import { buildColumns } from './chart-kit/columns.js';
import { buildHorizonBands } from './chart-kit/horizon.js';
import { buildMoodMixDonut } from './chart-kit/mood-mix.js';
import { rangeBarLayout, rangeBarTick } from './chart-kit/range-bar.js';
import { REGION_COLOURS } from './fitness-charts-model.js';
import { REGION_LABELS } from './fitness-model.js';
import { buildStreamPaths } from './chart-kit/stream.js';
import { buildWatchlistHeat } from './chart-kit/watchlist-heat.js';
import { formatDisplayDate } from '../core/time.js';
import { matchFitnessRecentRows } from './fitness-recent-focus.js';

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

function hideFitnessTips(root, keep) {
  const tips = root.querySelectorAll?.('[data-role="fitness-tip"]');
  if (!tips) return;
  for (const node of tips) {
    if (node !== keep) node.hidden = true;
  }
}

function placeTip(mark, tip, event) {
  const rect = typeof mark.getBoundingClientRect === 'function' ? mark.getBoundingClientRect() : null;
  const wide = Boolean(rect && (rect.width || rect.height));
  const x = wide ? rect.left + rect.width / 2 : Number(event?.clientX) || 0;
  const y = wide ? rect.top : Number(event?.clientY) || 0;
  tip.style.position = 'fixed';
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
  tip.style.right = 'auto';
  tip.style.bottom = 'auto';
  tip.style.transform = 'translate(-50%, calc(-100% - 8px))';
}

function bindTip(node, tip, text) {
  if (!node || !tip || typeof node.addEventListener !== 'function') return;
  const show = event => {
    hideFitnessTips(node.getRootNode?.() ?? tip.parentNode, tip);
    tip.hidden = false;
    tip.textContent = text;
    placeTip(event.currentTarget || node, tip, event);
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

function paintShareList(root, host, rows, tip) {
  host.replaceChildren();
  for (const item of rows) {
    const row = root.createElement('div');
    row.className = 'fitness-share-row';
    const label = root.createElement('strong');
    label.textContent = item.label;
    const track = root.createElement('span');
    track.className = 'fitness-share-row__track';
    const fill = root.createElement('i');
    fill.dataset.tone = item.tone ?? 'same';
    setWidth(fill, item.widthPct);
    track.append(fill);
    const value = root.createElement('span');
    value.textContent = item.display;
    bindTip(row, tip, item.copy);
    row.append(label, track, value);
    host.append(row);
  }
}

function shareRowsFromColumns(items, copyFor) {
  const chart = buildColumns(items);
  const peak = Math.max(0, ...chart.bars.map(bar => bar.value));
  return chart.bars.map(bar => ({
    label: bar.label,
    display: String(bar.value),
    widthPct: bar.heightPct,
    tone: bar.value === peak && bar.value > 0 ? 'up' : 'same',
    copy: copyFor(bar)
  }));
}

function renderWhen(root, when) {
  const ready = Number(when?.count) >= 2 && when?.buckets?.length;
  const card = showCard(root, '#fitness-clock-card', ready);
  const host = root.querySelector('#fitness-clock-chart');
  setText(root, '[data-fitness="when-read"]', when?.read ?? '');
  if (!card || !host) return;
  paintShareList(root, host, shareRowsFromColumns(when.buckets, bar => (
    `${bar.label} · ${bar.value} session${bar.value === 1 ? '' : 's'}`
  )), ensureTip(root, card));
}

function renderRhythm(root, rhythm) {
  const ready = Number(rhythm?.count) >= 2 && rhythm?.weeks?.length;
  const card = showCard(root, '#fitness-orbit-card', ready);
  const host = root.querySelector('#fitness-orbit-chart');
  setText(root, '[data-fitness="orbit-read"]', rhythm?.read ?? '');
  if (!card || !host) return;
  const items = rhythm.weeks.map(week => ({
    key: week.key,
    label: formatDisplayDate(week.key).slice(0, 5),
    value: week.value
  }));
  paintShareList(root, host, shareRowsFromColumns(items, bar => (
    `w/c ${formatDisplayDate(bar.key)} · ${bar.value} session${bar.value === 1 ? '' : 's'}`
  )), ensureTip(root, card));
}

function renderE1rmBest(root, best) {
  const ready = best?.lifts?.length >= 1;
  const card = showCard(root, '#fitness-e1rm-radial-card', ready);
  const host = root.querySelector('#fitness-e1rm-radial-chart');
  setText(root, '[data-fitness="e1rm-best-read"]', best?.read ?? '');
  if (!card || !host) return;
  paintShareList(root, host, best.lifts.map(lift => ({
    label: lift.label,
    display: `${lift.value}%`,
    widthPct: Math.max(0, Math.min(100, lift.value)),
    tone: lift.value >= 90 ? 'up' : 'same',
    copy: `${lift.label} · ${lift.value}% of best · ${Number(lift.kg).toFixed(1)} kg on ${formatDisplayDate(lift.date)}`
  })), ensureTip(root, card));
}

function rankTickShown(tick, ranks) {
  const last = ranks.at(-1)?.rank;
  if (tick.rank === 1 || tick.rank === last) return true;
  return tick.rank === Math.round((1 + last) / 2);
}

function renderBump(root, ranks) {
  const card = showCard(root, '#fitness-bump-card', ranks?.length >= 2);
  const svg = root.querySelector('#fitness-bump-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const themes = [...new Set(ranks.flatMap(row => Object.keys(row.rankByTheme)))];
  const chart = buildBumpChart({
    ranks,
    themes,
    width: 320,
    height: 200,
    pad: { top: 12, right: 16, bottom: 28, left: 24 }
  });
  if (chart.empty) {
    setHidden(card, true);
    return;
  }
  clearSvg(svg);
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  const tip = ensureTip(root, card);
  for (const tick of chart.ranks ?? []) {
    if (!rankTickShown(tick, chart.ranks)) continue;
    const label = createSvg(root, 'text');
    label.setAttribute('x', String((chart.pad?.left ?? 24) - 8));
    label.setAttribute('y', String(tick.y + 3));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'fitness-viz__label');
    label.textContent = String(tick.rank);
    svg.append(label);
  }
  for (const tick of chart.weeks ?? []) {
    if (!tick.show) continue;
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(tick.x));
    label.setAttribute('y', String(chart.height - 10));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'fitness-viz__label');
    label.textContent = formatDisplayDate(tick.week).slice(0, 5);
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
    bindTip(path, tip, `${line.key} · rank ${last?.rank ?? ''}`);
    for (const point of line.points ?? []) {
      const dot = namedDot(root, {
        cx: point.x,
        cy: point.y,
        r: 4,
        fill: line.colour,
        className: 'mind-bump__dot'
      });
      if (!dot) continue;
      bindTip(dot, tip, `${line.key} · ${formatDisplayDate(point.week ?? point.date ?? '')} · rank ${point.rank}`);
      svg.append(dot);
    }
  }
  paintLegend(root, card, (chart.lines ?? []).map(line => ({
    label: line.key,
    swatch: line.colour
  })));
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

function focusRecentDay(root, date) {
  const recent = root.querySelector('#fitness-recent');
  recent?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const rows = [...root.querySelectorAll('.fitness-recent-row')];
  const matches = matchFitnessRecentRows(
    rows.map((row) => ({ date: row.dataset.date })),
    date
  );
  rows.forEach((row, index) => row.classList.toggle('is-focused', matches[index] === true));
}

function bindRecentFocus(dot, root, date) {
  if (!dot || !date) return;
  dot.style.cursor = 'pointer';
  dot.setAttribute('role', 'button');
  dot.tabIndex = 0;
  const selectDay = () => focusRecentDay(root, date);
  dot.addEventListener('click', selectDay);
  dot.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDay();
    }
  });
}

function overlayLayout(lifts) {
  const dates = [...new Set(lifts.flatMap(lift => (lift.pctSeries ?? []).map(point => point.date)))].sort();
  const pcts = lifts.flatMap(lift => (lift.pctSeries ?? []).map(point => point.value)).filter(Number.isFinite);
  const width = 320;
  const height = 160;
  const pad = { top: 12, right: 12, bottom: 24, left: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const rawMin = pcts.length ? Math.min(...pcts) : 0;
  const rawMax = pcts.length ? Math.max(...pcts) : 100;
  const padY = Math.max((rawMax - rawMin) * 0.15, rawMax === rawMin ? 4 : 0);
  const min = rawMin - padY;
  const max = rawMax + padY;
  const span = max - min || 1;
  return {
    width,
    height,
    pad,
    dates,
    pctMin: rawMin,
    pctMax: rawMax,
    xAt: date => (
      dates.length <= 1
        ? pad.left + plotW / 2
        : pad.left + (dates.indexOf(date) / (dates.length - 1)) * plotW
    ),
    yAt: value => pad.top + ((max - value) / span) * plotH
  };
}

function renderE1rmBands(root, lifts) {
  const card = showCard(root, '#fitness-e1rm-card', lifts?.length >= 1);
  const svg = root.querySelector('#fitness-e1rm-chart');
  if (!card || !svg || typeof root.createElementNS !== 'function') return;
  const layout = overlayLayout(lifts);
  if (!layout.dates.length) {
    setHidden(card, true);
    return;
  }
  clearSvg(svg);
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  const tip = ensureTip(root, card);
  const axis = [
    { x: layout.pad.left - 6, y: layout.yAt(layout.pctMax) + 3, anchor: 'end', text: `${layout.pctMax}%` },
    { x: layout.pad.left - 6, y: layout.yAt(layout.pctMin) + 3, anchor: 'end', text: `${layout.pctMin}%` },
    { x: layout.xAt(layout.dates[0]), y: layout.height - 8, anchor: 'start', text: formatDisplayDate(layout.dates[0]).slice(0, 5) },
    { x: layout.xAt(layout.dates.at(-1)), y: layout.height - 8, anchor: 'end', text: formatDisplayDate(layout.dates.at(-1)).slice(0, 5) }
  ];
  if (layout.dates.length > 2) {
    const mid = layout.dates[Math.floor(layout.dates.length / 2)];
    axis.push({
      x: layout.xAt(mid),
      y: layout.height - 8,
      anchor: 'middle',
      text: formatDisplayDate(mid).slice(0, 5)
    });
  }
  for (const tick of axis) {
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(tick.x));
    label.setAttribute('y', String(tick.y));
    label.setAttribute('text-anchor', tick.anchor);
    label.setAttribute('class', 'fitness-viz__label');
    label.textContent = tick.text;
    svg.append(label);
  }
  for (const [index, lift] of lifts.entries()) {
    const colour = CLINICAL_CHART_SLOTS[index % CLINICAL_CHART_SLOTS.length];
    const points = (lift.pctSeries ?? []).map(point => ({
      x: layout.xAt(point.date),
      y: layout.yAt(point.value),
      date: point.date,
      value: point.value,
      kg: point.kg
    }));
    const line = createSvg(root, 'path');
    line.setAttribute('data-role', 'line');
    line.setAttribute('d', straightLinePath(points));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', colour);
    line.setAttribute('stroke-width', '2');
    svg.append(line);
    for (const point of points) {
      const dot = namedDot(root, { cx: point.x, cy: point.y, r: 4, fill: colour });
      if (!dot) continue;
      bindTip(dot, tip, `${lift.name} · ${formatDisplayDate(point.date)} · ${Number(point.kg).toFixed(1)} kg · ${point.value}% of best`);
      bindRecentFocus(dot, root, point.date);
      svg.append(dot);
    }
  }
  paintLegend(root, card, lifts.map((lift, index) => ({
    label: lift.name,
    swatch: CLINICAL_CHART_SLOTS[index % CLINICAL_CHART_SLOTS.length]
  })));
  animateAreaReveal(svg);
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

function renderYear(root, yearMonths) {
  const ready = Number(yearMonths?.count) >= 2 && yearMonths?.months?.length;
  const card = showCard(root, '#fitness-year-card', ready);
  const host = root.querySelector('#fitness-year-chart');
  setText(root, '[data-fitness="year-read"]', yearMonths?.read ?? '');
  if (!card || !host) return;
  paintShareList(root, host, shareRowsFromColumns(yearMonths.months, bar => (
    `${bar.label} · ${bar.value} session${bar.value === 1 ? '' : 's'}`
  )), ensureTip(root, card));
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

  renderWhen(root, charts.trainWhen);
  renderRhythm(root, charts.monthRhythm);
  renderE1rmBest(root, charts.e1rmVsBest);
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
  renderYear(root, charts.yearMonths);
  renderRepMix(root, charts.repRanges, charts.repRead);
  renderSparks(root, charts.sessionReadings, {
    duration: charts.durationSeries,
    distance: charts.distanceSeries,
    pace: charts.paceSeries,
    hr: charts.hrSeries
  });
  renderEfficiency(root, charts.volumePerSetWeeks);
}
