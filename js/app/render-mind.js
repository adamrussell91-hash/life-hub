import { agentColour } from './agent-colour.js';
import { animateAreaReveal } from './chart-kit/animate.js';
import { applyRingTarget } from './chart-kit/apply-ring.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildBumpLines } from './chart-kit/bump.js';
import { buildChordLayout } from './chart-kit/chord-layout.js';
import { buildHorizonBands } from './chart-kit/horizon.js';
import { buildMoodRadial } from './chart-kit/mood-radial.js';
import { buildMoodMixDonut } from './chart-kit/mood-mix.js';
import { buildThemeOrbit, THEME_ARMS } from './chart-kit/theme-orbit.js';
import { packMasonry } from './chart-kit/masonry.js';
import { buildRadialYear } from './chart-kit/radial-year.js';
import { buildSankeyFlow } from './chart-kit/sankey-flow.js';
import { buildStreamPaths } from './chart-kit/stream.js';
import { entriesForTheme, MOOD_ORDER, displayThemeLabel } from './mind-model.js';
import { formatDisplayDate, isCalendarDate } from '../core/time.js';
import { openMindThreadSheet } from './mind-thread-sheet.js';

const STREAM_FILLS = [
  'color-mix(in srgb, var(--wave) 55%, transparent)',
  'color-mix(in srgb, var(--mood-good) 55%, transparent)',
  'color-mix(in srgb, var(--mood-neutral) 55%, transparent)',
  'color-mix(in srgb, var(--mood-low) 45%, transparent)',
  'color-mix(in srgb, var(--high-sea) 40%, transparent)',
  'color-mix(in srgb, var(--marine) 35%, transparent)'
];

const TILE_FALLBACK_HEIGHT = 160;

const MOOD_TOKEN = {
  great: 'var(--mood-great)',
  good: 'var(--mood-good)',
  neutral: 'var(--mood-neutral)',
  low: 'var(--mood-low)',
  bad: 'var(--mood-bad)'
};

const SHIFT_COPY = {
  improved: 'mood lifted',
  declined: 'mood eased',
  flat: 'mood held'
};

export function moodShiftRank(mood) {
  return MOOD_ORDER.indexOf(mood);
}

export function moodShiftDirection(moodAtOpen, moodAtClose) {
  const open = moodShiftRank(moodAtOpen);
  const close = moodShiftRank(moodAtClose);
  if (open < 0 || close < 0) return 'flat';
  if (close < open) return 'improved';
  if (close > open) return 'declined';
  return 'flat';
}

export function firstSentence(text, max = 140) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const match = raw.match(/^.+?[.!?](?=\s|$)/);
  let sentence = (match ? match[0] : raw).trim();
  if (sentence.length > max) sentence = `${sentence.slice(0, max - 1).trimEnd()}…`;
  return sentence;
}

export function renderMind(root, model, { onRangeChange, onOpenAgent, agentsConfig, onWatchlistChange, quiet = false } = {}) {
  const dashboard = root.querySelector('#mind-dashboard');
  if (!dashboard || !model) return;
  dashboard._onOpenAgent = onOpenAgent;
  dashboard._quiet = quiet;

  const ranges = root.querySelector('#mind-range-control');
  if (ranges && !ranges.dataset.bound) {
    ranges.dataset.bound = '1';
    ranges.addEventListener('click', event => {
      const button = event.target.closest?.('[data-mind-range]');
      if (!button) return;
      onRangeChange?.(button.dataset.mindRange);
    });
  }
  if (ranges) {
    for (const button of ranges.querySelectorAll?.('[data-mind-range]') ?? []) {
      const active = button.dataset.mindRange === model.range;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  const caption = root.querySelector('[data-mind="entry-count"]');
  if (caption) {
    caption.textContent = model.entryCount
      ? `${model.entryCount} entr${model.entryCount === 1 ? 'y' : 'ies'} in range`
      : 'No diary entries in this range';
  }

  const ambient = root.querySelector('[data-mind="ambient"]');
  if (ambient) {
    ambient.hidden = !model.ambient;
    ambient.textContent = model.ambient ?? '';
  }

  const veraColour = agentColour(agentsConfig, 'vera');
  const penelopeColour = agentColour(agentsConfig, 'penelope');
  dashboard.style?.setProperty?.('--vera-accent', veraColour);
  dashboard.style?.setProperty?.('--penelope-accent', penelopeColour);

  const empty = root.querySelector('#mind-empty');
  if (empty) empty.hidden = !model.empty;
  const hero = root.querySelector('#mind-hero');
  if (hero) hero.hidden = Boolean(model.empty);

  renderFactorPanel(root, model);
  renderStreak(root, model);
  renderConstellation(root, model);
  renderTension(root, model);

  if (!model.empty) {
    renderMoodChart(root, model.moodRadial ?? model.moodSeries, model.bounds, model.range);
    renderMoodMix(root, model);
    renderEnergyRings(root, model);
    renderThemeOrbit(root, model);
  }
  renderSilenceBanner(root, model);
  renderSessionList(root, model.sessions);
  renderInsightList(root, model.insights, model.resurfacing);
  renderCrossAgentStrip(root, model.crossAgentLines, { veraColour, penelopeColour });
  renderStreamTile(root, model);
  renderSankeyTile(root, model);
  renderBumpTile(root, model);
  renderChordTile(root, model);
  renderRadialTile(root, model);
  renderHorizonTile(root, model);
  renderButterflyTile(root, model);
  renderLexicalTile(root, model, onWatchlistChange);
  renderWaffleTile(root, model);

  for (const button of root.querySelectorAll?.('[data-mind-agent]') ?? []) {
    if (button.dataset.bound) continue;
    button.dataset.bound = '1';
    button.addEventListener('click', () => onOpenAgent?.(button.dataset.mindAgent));
  }

  packMindBoard(root);
  dashboard.removeAttribute('hidden');
}

function renderFactorPanel(root, model) {
  const host = root.querySelector('[data-role="factor-bars"]')
    ?? root.querySelector('#mind-tile-factors');
  if (!host) return;
  host.replaceChildren();
  const factors = model.factorEffects ?? [];
  const max = Math.max(0, ...factors.map(factor => Math.abs(Number(factor.effect) || 0)));
  for (const factor of factors) {
    const label = factor.label || displayThemeLabel(factor.key);
    const button = root.createElement('button');
    button.type = 'button';
    const name = root.createElement('span');
    name.textContent = label;
    const bar = root.createElement('span');
    const fill = root.createElement('span');
    fill.className = 'mind-factor-fill';
    const pct = max > 0 ? (Math.abs(Number(factor.effect) || 0) / max) * 100 : 0;
    fill.style.width = `${pct}%`;
    if (root.querySelector('#mind-dashboard')?._quiet) {
      fill.style.transform = 'scaleX(1)';
    } else {
      fill.style.transform = 'scaleX(0)';
    }
    bar.append(fill);
    button.append(name, bar);
    button.addEventListener('click', () => {
      openMindThreadSheet(root, {
        title: label,
        rows: entriesForTheme(model.diary ?? [], model.sessions ?? [], factor.key),
        continueAgent: 'vera',
        onContinue: slug => root.querySelector('#mind-dashboard')?._onOpenAgent?.(slug),
        anchor: button
      });
    });
    host.append(button);
    if (!root.querySelector('#mind-dashboard')?._quiet) {
      void fill.getBoundingClientRect?.();
      fill.style.transform = 'scaleX(1)';
    }
  }
}

function renderStreak(root, model) {
  const consistency = model.consistency ?? {};
  const daysWithEntry = Number(consistency.daysWithEntry) || 0;
  const windowDays = Number(consistency.windowDays) || 30;
  const streak = consistency.streak ?? 0;
  applyRingTarget(root.querySelector('#mind-streak-ring'), {
    value: daysWithEntry,
    target: windowDays
  }, { size: 56, strokeWidth: 6 });
  const caption = root.querySelector('[data-mind="streak"]');
  if (caption) {
    caption.textContent = String(streak);
    return;
  }
  const tile = root.querySelector('#mind-tile-streak');
  if (!tile) return;
  const label = root.createElement('p');
  label.dataset.mind = 'streak';
  label.textContent = String(streak);
  tile.append(label);
}

function moodTokenFromScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'var(--mood-neutral)';
  if (value <= 3) return 'var(--mood-bad)';
  if (value <= 5) return 'var(--mood-low)';
  if (value <= 6) return 'var(--mood-neutral)';
  if (value <= 8) return 'var(--mood-good)';
  return 'var(--mood-great)';
}

function themeNodeRadius(count, maxCount) {
  if (!(maxCount > 0)) return 6;
  return 6 + ((Number(count) || 0) / maxCount) * 10;
}

function renderConstellation(root, model) {
  const svg = root.querySelector('#mind-constellation');
  if (!svg) return;
  svg.replaceChildren();
  const nodes = model.themeNodes ?? [];
  if (!nodes.length) {
    paintLegend(root, svg.parentNode, []);
    return;
  }

  const width = 240;
  const height = 240;
  const cx = width / 2;
  const cy = height / 2;
  const orbit = 78;
  const maxCount = Math.max(...nodes.map(node => Number(node.count) || 0), 1);
  const placed = nodes.map((node, index) => {
    const angle = (2 * Math.PI * index) / nodes.length - Math.PI / 2;
    return {
      ...node,
      x: cx + orbit * Math.cos(angle),
      y: cy + orbit * Math.sin(angle),
      r: themeNodeRadius(node.count, maxCount)
    };
  });
  const byKey = new Map(placed.map(node => [node.key, node]));

  for (const edge of model.themeCooccurrence ?? []) {
    if ((edge.count ?? 0) < 2) continue;
    const a = byKey.get(edge.themeA);
    const b = byKey.get(edge.themeB);
    if (!a || !b) continue;
    const line = createSvg(root, 'line');
    line.setAttribute('x1', String(a.x));
    line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x));
    line.setAttribute('y2', String(b.y));
    line.setAttribute('stroke', 'var(--line)');
    svg.append(line);
  }

  for (const node of placed) {
    const circle = createSvg(root, 'circle');
    circle.setAttribute('cx', String(node.x));
    circle.setAttribute('cy', String(node.y));
    circle.setAttribute('r', String(node.r));
    circle.setAttribute('fill', moodTokenFromScore(node.meanMood));
    circle.setAttribute('data-theme', node.key);
    circle.setAttribute('title', displayThemeLabel(node.key));
    circle.style.cursor = 'pointer';
    circle.addEventListener('click', () => {
      openMindThreadSheet(root, {
        title: displayThemeLabel(node.key),
        rows: entriesForTheme(model.diary ?? [], model.sessions ?? [], node.key),
        continueAgent: 'vera',
        onContinue: slug => root.querySelector('#mind-dashboard')?._onOpenAgent?.(slug),
        anchor: circle
      });
    });
    svg.append(circle);
  }
  paintLegend(root, root.querySelector('#mind-tile-constellation') ?? svg.parentNode, placed.map(node => ({
    label: displayThemeLabel(node.key),
    swatch: moodTokenFromScore(node.meanMood)
  })));
}

function renderTension(root, model) {
  const tile = root.querySelector('#mind-tension');
  if (!tile) return;
  const tensions = model.tensions ?? [];
  tile.hidden = false;
  const tension = tensions[0];
  let svg = tile.querySelector('#mind-tension-chart') ?? tile.querySelector('svg');
  if (!svg) {
    svg = createSvg(root, 'svg');
    svg.id = 'mind-tension-chart';
    svg.setAttribute('viewBox', '0 0 240 120');
    tile.append(svg);
  }
  if (!paintChartOrEmpty(root, tile, svg, {
    need: 1,
    have: tensions.length,
    unit: 'stated/revealed split'
  })) return;
  svg.replaceChildren();
  const poles = [
    { x: 56, y: 56, label: 'Stated' },
    { x: 184, y: 56, label: 'Revealed' }
  ];
  const axis = createSvg(root, 'line');
  axis.setAttribute('x1', '56');
  axis.setAttribute('y1', '56');
  axis.setAttribute('x2', '184');
  axis.setAttribute('y2', '56');
  axis.setAttribute('stroke', 'var(--line)');
  svg.append(axis);
  for (const pole of poles) {
    const circle = createSvg(root, 'circle');
    circle.setAttribute('cx', String(pole.x));
    circle.setAttribute('cy', String(pole.y));
    circle.setAttribute('r', '10');
    circle.addEventListener('click', () => {
      openMindThreadSheet(root, {
        title: tension.title || '',
        rows: [{
          date: tension.dateKey || '',
          title: tension.title || '',
          excerpt: tension.body
        }],
        continueAgent: 'vera',
        anchor: circle
      });
    });
    svg.append(circle);
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(pole.x));
    label.setAttribute('y', '92');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'mind-chart-label');
    label.textContent = pole.label;
    svg.append(label);
  }
}

function packMindBoard(root) {
  const board = root.querySelector('#mind-board');
  if (!board) return;
  const width = board.getBoundingClientRect?.()?.width ?? 0;
  if (width <= 0) return;
  const tiles = [...(board.children ?? [])].filter(node =>
    String(node.className || '').split(/\s+/).includes('mind-tile')
  );
  if (!tiles.length) return;
  const gap = 16;
  const columns = width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const columnWidth = (width - gap * (columns - 1)) / columns;
  for (const tile of tiles) {
    if (!tile.style) continue;
    const span = Math.min(Math.max(1, Number(tile.dataset?.mindSpan) || 1), columns);
    tile.style.position = 'absolute';
    tile.style.width = `${columnWidth * span + gap * (span - 1)}px`;
  }
  let flowBottom = 0;
  for (const child of board.children ?? []) {
    if (tiles.includes(child)) continue;
    const top = Number(child.offsetTop) || 0;
    const height = Number(child.offsetHeight) || 0;
    flowBottom = Math.max(flowBottom, top + height);
  }
  if (flowBottom > 0) flowBottom += gap;
  const items = tiles.map(tile => ({
    id: tile.id,
    span: Number(tile.dataset?.mindSpan) || 1,
    height: tile.offsetHeight || TILE_FALLBACK_HEIGHT
  }));
  const packed = packMasonry(items, { columns, gap, columnWidth, flowOffset: flowBottom });
  let bottom = flowBottom;
  for (const item of packed) {
    const tile = tiles.find(node => node.id === item.id);
    if (!tile?.style) continue;
    tile.style.left = `${item.x}px`;
    tile.style.top = `${item.y}px`;
    tile.style.width = `${item.width}px`;
    bottom = Math.max(bottom, item.y + item.height);
  }
  if (board.style) board.style.minHeight = `${bottom}px`;
}

function createSvg(root, tag) {
  return root.createElementNS?.('http://www.w3.org/2000/svg', tag) ?? root.createElement(tag);
}

function paintLegend(root, host, items) {
  if (!host) return;
  const children = host.children ?? [];
  let legend = [...children].find(node => String(node.className || '').split(/\s+/).includes('mind-chart-legend'));
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

const CHART_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatChartDay(dateKey) {
  if (!isCalendarDate(dateKey)) return '';
  const [, month, day] = dateKey.split('-');
  return `${Number(day)} ${CHART_MONTHS[Number(month) - 1]}`;
}

function renderMoodChart(root, series, bounds, range) {
  const svg = root.querySelector('#mind-mood-chart');
  if (!svg) return;
  const chart = buildMoodRadial(series, { bounds, range: range ?? 'monthly' });
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  const nodes = [];

  for (const tick of chart.angleTicks) {
    const spoke = createSvg(root, 'line');
    spoke.setAttribute('data-role', 'spoke');
    spoke.setAttribute('x1', String(chart.cx));
    spoke.setAttribute('y1', String(chart.cy));
    spoke.setAttribute('x2', String(tick.x));
    spoke.setAttribute('y2', String(tick.y));
    nodes.push(spoke);
  }

  for (const ring of chart.rings) {
    const grid = createSvg(root, 'circle');
    grid.setAttribute('data-role', 'grid');
    grid.setAttribute('cx', String(chart.cx));
    grid.setAttribute('cy', String(chart.cy));
    grid.setAttribute('r', String(ring.radius));
    nodes.push(grid);
    const label = createSvg(root, 'text');
    label.setAttribute('data-role', 'grid-label');
    label.setAttribute('x', String(chart.cx - ring.radius));
    label.setAttribute('y', String(chart.cy - 4));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = ring.label;
    nodes.push(label);
  }

  for (const tick of chart.angleTicks) {
    const label = createSvg(root, 'text');
    label.setAttribute('data-role', 'angle-label');
    label.setAttribute('x', String(tick.labelX));
    label.setAttribute('y', String(tick.labelY + 4));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = tick.label;
    nodes.push(label);
  }

  if (chart.averageRadius != null) {
    const average = createSvg(root, 'circle');
    average.setAttribute('data-role', 'average');
    average.setAttribute('cx', String(chart.cx));
    average.setAttribute('cy', String(chart.cy));
    average.setAttribute('r', String(chart.averageRadius));
    const title = createSvg(root, 'title');
    title.textContent = `Average ${chart.averageScore.toFixed(1)}/10`;
    average.append(title);
    nodes.push(average);
  }

  if (!chart.points.length) {
    const empty = createSvg(root, 'text');
    empty.setAttribute('data-role', 'empty');
    empty.setAttribute('x', String(chart.cx));
    empty.setAttribute('y', String(chart.cy));
    empty.setAttribute('text-anchor', 'middle');
    empty.textContent = 'No mood score logged in this range';
    nodes.push(empty);
    svg.replaceChildren(...nodes);
    svg.classList?.remove?.('chart-animating', 'chart-static');
    paintLegend(root, svg.parentNode, []);
    return;
  }

  chart.points.forEach((point, index) => {
    const mood = point.mood && MOOD_TOKEN[point.mood] ? point.mood : null;
    const dot = createSvg(root, 'circle');
    dot.setAttribute('data-role', 'point');
    dot.setAttribute('cx', String(point.x));
    dot.setAttribute('cy', String(point.y));
    dot.setAttribute('r', String(point.r));
    dot.setAttribute('class', 'mind-mood-dot');
    dot.setAttribute('fill', mood ? MOOD_TOKEN[mood] : 'var(--mood-neutral)');
    if (mood) dot.setAttribute('data-mood', mood);
    dot.style.animationDelay = `${Math.min(index * 25, 400)}ms`;
    const title = createSvg(root, 'title');
    const energy = point.energy ? ` · ${point.energy} energy` : '';
    title.textContent = `${formatChartDay(point.date)} — ${point.mood ?? 'score'} ${point.value}/10${energy}`;
    dot.append(title);
    nodes.push(dot);
  });

  svg.replaceChildren(...nodes);
  animateAreaReveal(svg, quietMotion(root));

  const seen = new Set();
  const legend = [];
  for (const mood of Object.keys(MOOD_TOKEN)) {
    if (!chart.points.some(point => point.mood === mood) || seen.has(mood)) continue;
    seen.add(mood);
    legend.push({
      label: mood[0].toUpperCase() + mood.slice(1),
      swatch: MOOD_TOKEN[mood]
    });
  }
  if (chart.averageScore != null) {
    legend.push({ label: `Average ${chart.averageScore.toFixed(1)}/10` });
  }
  paintLegend(root, svg.parentNode, legend);
}

const MIX_RANGE_UNITS = {
  weekly: 'diary entries this week',
  monthly: 'diary entries this month',
  six_month: 'diary entries over 6 months',
  year: 'diary entries this year'
};

function setMoodMixCenter(root, segment, { sub } = {}) {
  const count = root.querySelector('[data-mind="mood-mix-count"]');
  const label = root.querySelector('[data-mind="mood-mix-label"]');
  const subEl = root.querySelector('[data-mind="mood-mix-sub"]');
  if (count) count.textContent = segment ? String(segment.value) : '—';
  if (label) {
    label.textContent = segment?.label ?? 'No mood entries yet';
    if (segment?.colour) label.style?.setProperty?.('--label-color', segment.colour);
    else label.style?.removeProperty?.('--label-color');
  }
  if (subEl) subEl.textContent = sub ?? '';
}

function hoverMoodMix(root, host, moodKey) {
  const donut = host._moodMix;
  if (!donut) return;
  const hovered = moodKey
    ? donut.segments.find(segment => segment.key === moodKey)
    : null;
  for (const node of host.querySelectorAll?.('[data-mood]') ?? []) {
    const isHovered = moodKey && node.dataset.mood === moodKey;
    const dim = Boolean(moodKey) && !isHovered;
    if (node.tagName === 'CIRCLE' || node.getAttribute?.('data-role') === 'slice') {
      node.style.opacity = dim ? '0.32' : '1';
      if (node.tagName === 'CIRCLE' || node.getAttribute?.('r')) {
        node.setAttribute('stroke-width', String(isHovered ? 30 : 26));
      }
    }
    if (String(node.className || '').includes('mind-mood-mix__legend-row')) {
      node.classList?.toggle?.('is-active', Boolean(isHovered));
      if (isHovered && hovered?.colour) node.style?.setProperty?.('--row-wash', hovered.colour);
      else node.style?.removeProperty?.('--row-wash');
    }
  }
  if (hovered) {
    setMoodMixCenter(root, hovered, { sub: `${hovered.pct}% of entries` });
    return;
  }
  setMoodMixCenter(root, donut.dominant, {
    sub: donut.dominant ? 'largest share' : ''
  });
}

function bindMoodMixHover(root, host, node, moodKey) {
  node.addEventListener('pointerenter', () => hoverMoodMix(root, host, moodKey));
  node.addEventListener('pointerleave', () => hoverMoodMix(root, host, null));
  node.addEventListener('focus', () => hoverMoodMix(root, host, moodKey));
  node.addEventListener('blur', () => hoverMoodMix(root, host, null));
}

function renderMoodMix(root, model) {
  const host = root.querySelector('#mind-mood-mix');
  const slicesHost = root.querySelector('#mind-mood-pie [data-role="slices"]')
    ?? root.querySelector('#mind-mood-pie')?.querySelector?.('[data-role="slices"]');
  if (!host && !slicesHost) return;

  const items = (model.byMood ?? []).map(item => ({
    ...item,
    colour: MOOD_TOKEN[item.key] ?? 'var(--mood-neutral)'
  }));
  const donut = buildMoodMixDonut(items);
  host._moodMix = donut;
  slicesHost?.replaceChildren?.();
  const legend = root.querySelector('[data-role="mood-mix-legend"]');
  legend?.replaceChildren?.();
  const tableBody = root.querySelector('[data-role="mood-mix-table-body"]');
  tableBody?.replaceChildren?.();
  const total = root.querySelector('[data-mind="mood-mix-total"]');
  if (total) total.textContent = String(donut.total);
  const unit = root.querySelector('[data-mind="mood-mix-unit"]');
  if (unit) unit.textContent = MIX_RANGE_UNITS[model.range] ?? 'diary entries in this range';

  if (donut.empty) {
    setMoodMixCenter(root, null);
    return;
  }

  setMoodMixCenter(root, donut.dominant, { sub: 'largest share' });
  const quiet = Boolean(root.querySelector('#mind-dashboard')?._quiet);

  donut.segments.forEach((segment, index) => {
    if (segment.visible > 0 && slicesHost) {
      const circle = createSvg(root, 'circle');
      circle.setAttribute('data-role', 'slice');
      circle.setAttribute('class', 'mind-mood-mix__seg mind-pie-slice');
      circle.setAttribute('cx', String(donut.center));
      circle.setAttribute('cy', String(donut.center));
      circle.setAttribute('r', String(donut.radius));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', segment.colour);
      circle.setAttribute('stroke-width', '26');
      circle.setAttribute('stroke-linecap', 'round');
      circle.setAttribute('stroke-dasharray', segment.dasharray);
      circle.setAttribute('stroke-dashoffset', String(segment.dashoffset));
      circle.setAttribute('data-mood', segment.key);
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('aria-label', `${segment.label}, ${segment.value} entries, ${segment.pct}%`);
      const title = createSvg(root, 'title');
      title.textContent = `${segment.label} — ${segment.value} (${segment.pct}%)`;
      circle.append(title);
      if (!quiet) circle.style.animationDelay = `${index * 40}ms`;
      bindMoodMixHover(root, host, circle, segment.key);
      slicesHost.append(circle);
    }

    if (legend) {
      const row = root.createElement('li');
      row.className = 'mind-mood-mix__legend-row';
      row.dataset.mood = segment.key;
      row.tabIndex = 0;
      const swatch = root.createElement('span');
      swatch.className = 'mind-mood-mix__swatch';
      swatch.style.background = segment.colour;
      swatch.setAttribute('aria-hidden', 'true');
      const info = root.createElement('span');
      info.className = 'mind-mood-mix__info';
      const row1 = root.createElement('span');
      row1.className = 'mind-mood-mix__row1';
      const name = root.createElement('span');
      name.className = 'mind-mood-mix__name';
      name.textContent = segment.label;
      const pct = root.createElement('span');
      pct.className = 'mind-mood-mix__pct';
      pct.textContent = `${segment.pct}%`;
      row1.append(name, pct);
      const track = root.createElement('span');
      track.className = 'mind-mood-mix__bar-track';
      const fill = root.createElement('span');
      fill.className = 'mind-mood-mix__bar-fill';
      fill.style.background = segment.colour;
      fill.style.width = quiet ? `${segment.pct}%` : '0%';
      track.append(fill);
      info.append(row1, track);
      row.append(swatch, info);
      bindMoodMixHover(root, host, row, segment.key);
      legend.append(row);
      if (!quiet) {
        void fill.getBoundingClientRect?.();
        fill.style.width = `${segment.pct}%`;
      }
    }

    if (tableBody) {
      const tr = root.createElement('tr');
      const th = root.createElement('th');
      th.scope = 'row';
      const dot = root.createElement('span');
      dot.className = 'mind-mood-mix__dot';
      dot.style.background = segment.colour;
      dot.setAttribute('aria-hidden', 'true');
      const moodName = root.createElement('span');
      moodName.textContent = segment.label;
      th.append(dot, moodName);
      const tdCount = root.createElement('td');
      tdCount.textContent = String(segment.value);
      const tdPct = root.createElement('td');
      tdPct.textContent = `${segment.pct}%`;
      tr.append(th, tdCount, tdPct);
      tableBody.append(tr);
    }
  });

  const toggle = root.querySelector('[data-mind="mood-mix-table-toggle"]');
  const table = root.querySelector('[data-role="mood-mix-table"]');
  if (toggle && table && !toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.textContent = expanded ? 'View as table' : 'Hide table';
      table.hidden = expanded;
    });
  }
}

function renderEnergyRings(root, model) {
  const host = root.querySelector('#mind-energy-rings');
  if (!host) return;
  const target = model.entryCount || 0;
  const levels = model.energyByLevel ?? [];
  const hasValues = levels.some(item => item.value > 0);
  const empty = root.querySelector('[data-mind="energy-empty"]');
  if (empty) empty.hidden = hasValues;
  for (const item of levels) {
    const svg = root.querySelector(`[data-mind-energy-ring="${item.key}"]`);
    applyRingTarget(svg, { value: item.value, target }, { size: 56, strokeWidth: 6 });
    const count = svg?.parentNode?.querySelector?.('[data-mind-energy-count]');
    if (count) count.textContent = String(item.value);
  }
}

function paintChartOrEmpty(root, host, svg, { need, have, unit }) {
  const count = Number(have) || 0;
  const threshold = Number(need) || 0;
  const qualifies = count >= threshold;
  const children = [...(host?.children ?? [])];
  let empty = children.find(node => String(node.className || '').split(/\s+/).includes('mind-honest-empty'));
  if (svg) {
    svg.hidden = !qualifies;
    if (!qualifies) svg.replaceChildren?.();
    else svg.removeAttribute?.('hidden');
  }
  if (qualifies) {
    if (empty) {
      empty.hidden = true;
      empty.textContent = '';
    }
    return true;
  }
  if (!empty) {
    empty = root.createElement('p');
    empty.className = 'mind-honest-empty metric-caption';
    host.append(empty);
  }
  empty.hidden = false;
  empty.textContent = `Need ${threshold} ${unit}. ${count} so far.`;
  return false;
}

const THEME_RANGE_UNITS = {
  weekly: 'themes charted this week',
  monthly: 'themes charted this month',
  six_month: 'themes charted over 6 months',
  year: 'themes charted this year'
};

const THEME_PERIOD = {
  weekly: 'week',
  monthly: 'month',
  six_month: '6 months',
  year: 'year'
};

function setThemeOrbitFocus(host, chart, themeKey) {
  for (const node of host.querySelectorAll?.('[data-theme], [data-arm]') ?? []) {
    const isStar = node.dataset?.theme;
    const isArm = node.dataset?.arm;
    if (isStar) {
      const on = !themeKey || node.dataset.theme === themeKey;
      node.classList?.toggle?.('is-active', Boolean(themeKey) && on);
      node.classList?.toggle?.('is-dim', Boolean(themeKey) && !on);
    }
    if (isArm) {
      const star = chart.stars.find(item => item.key === themeKey);
      node.classList?.toggle?.('is-dim', Boolean(themeKey) && star?.arm !== node.dataset.arm);
    }
  }
  const caption = host.querySelector('[data-mind="themes-hover"]');
  if (!caption) return;
  const star = themeKey ? chart.stars.find(item => item.key === themeKey) : null;
  if (!star) {
    caption.textContent = '';
    caption.hidden = true;
    return;
  }
  const delta = star.delta >= 0 ? `+${star.delta}` : String(star.delta);
  caption.hidden = false;
  caption.textContent = `${star.label} · ${star.value} mentions · ${delta} vs last period · ${star.armLabel}`;
}

function renderThemeOrbit(root, model) {
  const host = root.querySelector('#mind-themes');
  if (!host) return;
  host.replaceChildren();
  const themes = model.themes ?? [];
  if (!themes.length) {
    const caption = root.createElement('p');
    caption.className = 'metric-caption';
    caption.textContent = 'No recurring themes in this range yet.';
    host.append(caption);
    return;
  }

  const chart = buildThemeOrbit(themes);
  const quiet = Boolean(root.querySelector('#mind-dashboard')?._quiet);
  const stage = root.createElement('div');
  stage.className = 'mind-theme-orbit__stage';

  const svg = createSvg(root, 'svg');
  svg.id = 'mind-theme-orbit';
  svg.setAttribute('class', 'mind-theme-orbit__svg');
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Constellation of recurring themes. Closer to the centre and larger means mentioned more.');

  const defs = createSvg(root, 'defs');
  const glow = createSvg(root, 'filter');
  glow.id = 'mind-theme-glow';
  glow.setAttribute('x', '-80%');
  glow.setAttribute('y', '-80%');
  glow.setAttribute('width', '260%');
  glow.setAttribute('height', '260%');
  const blur = createSvg(root, 'feGaussianBlur');
  blur.setAttribute('stdDeviation', '3.2');
  blur.setAttribute('result', 'blur');
  const merge = createSvg(root, 'feMerge');
  const blurNode = createSvg(root, 'feMergeNode');
  blurNode.setAttribute('in', 'blur');
  const sourceNode = createSvg(root, 'feMergeNode');
  sourceNode.setAttribute('in', 'SourceGraphic');
  merge.append(blurNode, sourceNode);
  glow.append(blur, merge);
  const coreGrad = createSvg(root, 'radialGradient');
  coreGrad.id = 'mind-theme-core';
  coreGrad.setAttribute('cx', '50%');
  coreGrad.setAttribute('cy', '50%');
  coreGrad.setAttribute('r', '50%');
  const stop0 = createSvg(root, 'stop');
  stop0.setAttribute('offset', '0%');
  stop0.setAttribute('stop-color', 'var(--warm-white)');
  stop0.setAttribute('stop-opacity', '0.95');
  const stop1 = createSvg(root, 'stop');
  stop1.setAttribute('offset', '45%');
  stop1.setAttribute('stop-color', 'var(--wave)');
  stop1.setAttribute('stop-opacity', '0.35');
  const stop2 = createSvg(root, 'stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', 'var(--wave)');
  stop2.setAttribute('stop-opacity', '0');
  coreGrad.append(stop0, stop1, stop2);
  defs.append(glow, coreGrad);
  svg.append(defs);

  for (const radius of chart.rings) {
    const ring = createSvg(root, 'circle');
    ring.setAttribute('class', 'mind-theme-orbit__ring');
    ring.setAttribute('cx', String(chart.cx));
    ring.setAttribute('cy', String(chart.cy));
    ring.setAttribute('r', String(radius));
    svg.append(ring);
  }

  const core = createSvg(root, 'circle');
  core.setAttribute('class', 'mind-theme-orbit__core-glow');
  core.setAttribute('cx', String(chart.cx));
  core.setAttribute('cy', String(chart.cy));
  core.setAttribute('r', '46');
  core.setAttribute('fill', 'url(#mind-theme-core)');
  svg.append(core);

  for (const arm of chart.arms) {
    const armGroup = createSvg(root, 'g');
    armGroup.setAttribute('class', 'mind-theme-orbit__arm');
    armGroup.dataset.arm = arm.key;
    const rot = createSvg(root, 'g');
    if (quiet) {
      rot.setAttribute('transform', `rotate(${arm.staticRotate} ${chart.cx} ${chart.cy})`);
    } else {
      const spin = createSvg(root, 'animateTransform');
      spin.setAttribute('attributeName', 'transform');
      spin.setAttribute('type', 'rotate');
      spin.setAttribute('from', `${arm.staticRotate} ${chart.cx} ${chart.cy}`);
      spin.setAttribute('to', `${arm.staticRotate + 360} ${chart.cx} ${chart.cy}`);
      spin.setAttribute('dur', arm.period);
      spin.setAttribute('repeatCount', 'indefinite');
      rot.append(spin);
    }
    const path = createSvg(root, 'path');
    path.setAttribute('class', 'mind-theme-orbit__arm-line');
    path.setAttribute('d', arm.d);
    path.setAttribute('stroke', arm.colour);
    rot.append(path);

    for (const star of chart.stars.filter(item => item.arm === arm.key)) {
      const group = createSvg(root, 'g');
      group.setAttribute('class', `mind-theme-orbit__star${star.rising ? ' is-rising' : ''}${star.falling ? ' is-falling' : ''}`);
      group.dataset.theme = star.key;
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'img');
      group.setAttribute('aria-label', `${star.label}, ${star.armLabel}, ${star.value} mentions`);
      const pulse = createSvg(root, 'circle');
      pulse.setAttribute('class', 'mind-theme-orbit__pulse');
      pulse.setAttribute('cx', String(star.x));
      pulse.setAttribute('cy', String(star.y));
      pulse.setAttribute('r', String(star.r + 4));
      pulse.setAttribute('stroke', star.colour);
      const dot = createSvg(root, 'circle');
      dot.setAttribute('class', 'mind-theme-orbit__core');
      dot.setAttribute('cx', String(star.x));
      dot.setAttribute('cy', String(star.y));
      dot.setAttribute('r', String(star.r));
      dot.setAttribute('fill', star.colour);
      dot.setAttribute('filter', 'url(#mind-theme-glow)');
      const hit = createSvg(root, 'circle');
      hit.setAttribute('class', 'mind-theme-orbit__hit');
      hit.setAttribute('cx', String(star.x));
      hit.setAttribute('cy', String(star.y));
      hit.setAttribute('r', '16');
      const title = createSvg(root, 'title');
      title.textContent = star.label;
      group.append(title, pulse, dot, hit);
      rot.append(group);
    }
    armGroup.append(rot);
    svg.append(armGroup);
  }

  const coreLabel = root.createElement('div');
  coreLabel.className = 'mind-theme-orbit__core-label';
  const rangeName = root.createElement('span');
  rangeName.dataset.mind = 'themes-range';
  rangeName.textContent = model.rangeLabel ?? '';
  const total = root.createElement('span');
  total.dataset.mind = 'themes-total';
  total.textContent = String(chart.total);
  coreLabel.append(rangeName, total);
  stage.append(svg, coreLabel);

  const legend = root.createElement('ul');
  legend.className = 'mind-theme-orbit__legend';
  for (const arm of THEME_ARMS) {
    const item = root.createElement('li');
    const swatch = root.createElement('i');
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.background = arm.colour;
    const name = root.createElement('span');
    name.textContent = arm.label;
    item.append(swatch, name);
    legend.append(item);
  }

  const note = root.createElement('p');
  note.className = 'mind-tile__legend';
  note.textContent = 'Closer to the centre and larger — mentioned more. A pulse means it’s rising; a dimmer star is fading.';

  const hover = root.createElement('p');
  hover.className = 'metric-caption';
  hover.dataset.mind = 'themes-hover';
  hover.hidden = true;

  const narrative = root.createElement('p');
  narrative.className = 'metric-caption';
  narrative.dataset.mind = 'themes-narrative';
  if (chart.top) {
    const trendWord = chart.top.rising ? 'still climbing' : chart.top.falling ? 'easing off' : 'holding steady';
    narrative.textContent = `This ${THEME_PERIOD[model.range] ?? 'range'}, ${chart.top.label} pulls hardest — ${chart.top.value} mentions, ${trendWord}.`;
  }

  const foot = root.createElement('div');
  foot.className = 'mind-theme-orbit__foot';
  const countLine = root.createElement('p');
  countLine.className = 'metric-caption';
  const strong = root.createElement('strong');
  strong.textContent = String(chart.stars.length);
  const unit = root.createElement('span');
  unit.textContent = ` ${THEME_RANGE_UNITS[model.range] ?? 'themes in this range'}`;
  countLine.append(strong, unit);
  const toggle = root.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mind-theme-orbit__table-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = 'View as data';
  foot.append(countLine, toggle);

  const tableWrap = root.createElement('div');
  tableWrap.className = 'mind-theme-orbit__table';
  tableWrap.hidden = true;
  const table = root.createElement('table');
  const caption = root.createElement('caption');
  caption.className = 'visually-hidden';
  caption.textContent = 'Recurring themes, exact counts for this range';
  const thead = root.createElement('thead');
  const headRow = root.createElement('tr');
  for (const heading of ['Theme', 'Category', 'Mentions', 'Vs. last period']) {
    const th = root.createElement('th');
    th.scope = 'col';
    th.textContent = heading;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = root.createElement('tbody');
  for (const star of chart.stars.slice().sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))) {
    const tr = root.createElement('tr');
    const th = root.createElement('th');
    th.scope = 'row';
    th.textContent = star.label;
    const tdArm = root.createElement('td');
    tdArm.textContent = star.armLabel;
    const tdCount = root.createElement('td');
    tdCount.textContent = String(star.value);
    const tdDelta = root.createElement('td');
    tdDelta.textContent = star.delta >= 0 ? `+${star.delta}` : String(star.delta);
    tr.append(th, tdArm, tdCount, tdDelta);
    tbody.append(tr);
  }
  table.append(caption, thead, tbody);
  tableWrap.append(table);

  toggle.addEventListener('click', event => {
    event.stopPropagation();
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.textContent = expanded ? 'View as data' : 'Hide data';
    tableWrap.hidden = expanded;
  });

  host.append(narrative, stage, legend, note, hover, foot, tableWrap);

  for (const group of svg.querySelectorAll?.('[data-theme]') ?? []) {
    const key = group.dataset.theme;
    group.addEventListener('pointerenter', () => {
      svg.pauseAnimations?.();
      setThemeOrbitFocus(host, chart, key);
    });
    group.addEventListener('pointerleave', () => {
      if (!quiet) svg.unpauseAnimations?.();
      setThemeOrbitFocus(host, chart, null);
    });
    group.addEventListener('focus', () => setThemeOrbitFocus(host, chart, key));
    group.addEventListener('blur', () => setThemeOrbitFocus(host, chart, null));
    group.addEventListener('click', () => {
      openMindThreadSheet(root, {
        title: displayThemeLabel(key),
        rows: themeRows(model, key),
        continueAgent: 'vera',
        onContinue: slug => root.querySelector('#mind-dashboard')?._onOpenAgent?.(slug),
        anchor: group
      });
    });
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter') group.dispatchEvent?.(new Event('click'));
    });
  }
}

function renderSilenceBanner(root, model) {
  const host = root.querySelector('#mind-silence');
  if (!host) return;
  host.replaceChildren();
  if (!model.silence) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const chip = root.createElement('span');
  chip.className = 'body-tape-chip bloods-flag';
  chip.dataset.colour = 'neutral';
  chip.textContent = `${model.daysSinceLastDiary} days since diary · ${model.daysSinceLastMindSession} days since a Vera session.`;
  host.append(chip);
}

function renderSessionList(root, sessions) {
  const host = root.querySelector('#mind-sessions');
  if (!host) return;
  host.replaceChildren();
  if (!sessions?.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No sessions logged yet.';
    host.append(empty);
    return;
  }
  const latest = [...sessions].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const card = root.createElement('article');
  card.className = 'mind-session-card';
  const date = root.createElement('p');
  date.className = 'mind-session-card__date';
  date.textContent = formatDisplayDate(latest.date);
  const title = root.createElement('h3');
  title.className = 'mind-session-card__theme';
  title.textContent = latest.theme || 'Vera session';
  card.append(date, title);
  const line = firstSentence(latest.insight || latest.observation);
  if (line) {
    const insight = root.createElement('p');
    insight.className = 'mind-session-card__insight';
    insight.textContent = line;
    card.append(insight);
  }
  const shift = renderMoodShift(root, latest);
  if (shift) card.append(shift);
  bindMark(card, root, {
    title: latest.theme || 'Vera session',
    rows: [{
      date: latest.date,
      title: latest.theme || 'Vera session',
      excerpt: [latest.insight, latest.observation, latest.closingQuestion].filter(Boolean).join('\n\n')
    }],
    continueAgent: 'vera'
  });
  host.append(card);
}

function renderMoodShift(root, session) {
  const direction = moodShiftDirection(session.moodAtOpen, session.moodAtClose);
  const openRank = moodShiftRank(session.moodAtOpen);
  const closeRank = moodShiftRank(session.moodAtClose);
  if (openRank < 0 && closeRank < 0) return null;
  const wrap = root.createElement('div');
  wrap.className = 'mind-session-shift';
  wrap.dataset.shift = direction;
  const svg = createSvg(root, 'svg');
  svg.setAttribute('class', 'line-chart mind-shift-chart');
  svg.setAttribute('viewBox', '0 0 120 36');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${SHIFT_COPY[direction]} from ${session.moodAtOpen ?? 'unknown'} to ${session.moodAtClose ?? 'unknown'}`);
  const line = createSvg(root, 'path');
  line.setAttribute('data-role', 'line');
  const series = [
    { date: 'open', value: openRank < 0 ? 2 : (MOOD_ORDER.length - 1 - openRank) },
    { date: 'close', value: closeRank < 0 ? 2 : (MOOD_ORDER.length - 1 - closeRank) }
  ];
  const chart = buildAreaLine(series, { width: 120, height: 36, padding: 6 });
  line.setAttribute('d', chart.linePath || '');
  svg.append(line);
  const caption = root.createElement('p');
  caption.className = 'metric-caption';
  const openLabel = session.moodAtOpen ?? '—';
  const closeLabel = session.moodAtClose ?? '—';
  caption.textContent = `${SHIFT_COPY[direction]} · ${openLabel} → ${closeLabel}`;
  wrap.append(svg, caption);
  animateAreaReveal(svg, quietMotion(root));
  return wrap;
}

function displayMarkTitle(value) {
  if (value == null || value === '') return value;
  const text = String(value);
  if (isCalendarDate(text)) return formatDisplayDate(text);
  return text.replace(/\d{4}-\d{2}-\d{2}/g, match => (
    isCalendarDate(match) ? formatDisplayDate(match) : match
  ));
}

function bindMark(node, root, payload) {
  const title = payload.title != null ? displayMarkTitle(payload.title) : payload.title;
  if (title != null) node.setAttribute('title', title);
  node.setAttribute('tabindex', '0');
  node.style.cursor = 'pointer';
  const open = () => openMindThreadSheet(root, {
    ...payload,
    title,
    anchor: node,
    onContinue: payload.onContinue ?? (slug => root.querySelector('#mind-dashboard')?._onOpenAgent?.(slug))
  });
  node.addEventListener('click', open);
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter') open();
  });
}

function quietMotion(root) {
  return { quiet: Boolean(root.querySelector('#mind-dashboard')?._quiet) };
}

function themeRows(model, theme) {
  return entriesForTheme(model.diary ?? [], model.sessions ?? [], theme);
}

function dateRows(model, date) {
  const rows = [];
  for (const entry of model.diary ?? []) {
    if (entry.date !== date) continue;
    rows.push({
      date: entry.date,
      title: entry.title ?? 'Diary',
      excerpt: String(entry.body || '').slice(0, 140)
    });
  }
  for (const session of model.sessions ?? []) {
    if (session.date !== date) continue;
    rows.push({
      date: session.date,
      title: session.theme || session.title || 'Vera session',
      excerpt: String(session.insight || session.observation || '').slice(0, 140)
    });
  }
  return rows;
}

function renderStreamTile(root, model) {
  const svg = root.querySelector('#mind-stream');
  if (!svg) return;
  const tile = root.querySelector('#mind-tile-stream') ?? svg.parentNode;
  const weekly = model.themeWeekly ?? { weeks: [], series: [] };
  const paths = buildStreamPaths(weekly, { width: 320, height: 168 });
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: paths.length, unit: 'weekly theme bands' })) {
    paintLegend(root, tile, []);
    return;
  }
  svg.replaceChildren();
  paths.forEach((band, index) => {
    const path = createSvg(root, 'path');
    path.setAttribute('d', band.d);
    path.setAttribute('fill', STREAM_FILLS[index % STREAM_FILLS.length]);
    bindMark(path, root, {
      title: band.key,
      rows: themeRows(model, band.key),
      continueAgent: 'vera'
    });
    svg.append(path);
  });
  paintLegend(root, root.querySelector('#mind-tile-stream') ?? svg.parentNode, paths.map((band, index) => ({
    label: displayThemeLabel(band.key),
    swatch: STREAM_FILLS[index % STREAM_FILLS.length]
  })));
  animateAreaReveal(svg, quietMotion(root));
}

function renderSankeyTile(root, model) {
  const svg = root.querySelector('#mind-sankey');
  if (!svg) return;
  const tile = root.querySelector('#mind-tile-transitions') ?? svg.parentNode;
  const transitions = model.moodTransitions ?? [];
  if (!paintChartOrEmpty(root, tile, svg, { need: 3, have: transitions.length, unit: 'transitions' })) return;
  svg.replaceChildren();
  const chart = buildSankeyFlow(transitions, { width: 320, height: 200 });
  for (const link of chart.links) {
    const mark = createSvg(root, 'path');
    const x0 = link.x0 ?? 20;
    const x1 = link.x1 ?? 300;
    const y0 = link.y0 ?? 20;
    const y1 = link.y1 ?? 40;
    mark.setAttribute('d', `M${x0},${y0} C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`);
    mark.setAttribute('fill', 'none');
    mark.setAttribute('stroke', 'color-mix(in srgb, var(--wave) 45%, transparent)');
    mark.setAttribute('stroke-width', String(Math.max(2, link.width)));
    bindMark(mark, root, {
      title: `${link.source} → ${link.target}`,
      rows: [{ date: '', title: `${link.source} → ${link.target}`, excerpt: `${link.value ?? ''} transitions` }]
    });
    svg.append(mark);
  }
  for (const node of chart.nodes ?? []) {
    const label = createSvg(root, 'text');
    const left = (node.x0 ?? 0) < 80;
    label.setAttribute('x', String(left ? (node.x1 ?? 12) + 4 : (node.x0 ?? 308) - 4));
    label.setAttribute('y', String(((node.y0 ?? 0) + (node.y1 ?? 0)) / 2 + 3));
    label.setAttribute('text-anchor', left ? 'start' : 'end');
    label.setAttribute('class', 'mind-chart-label');
    label.setAttribute('pointer-events', 'none');
    label.textContent = displayThemeLabel(node.id);
    svg.append(label);
  }
}

function renderBumpTile(root, model) {
  const svg = root.querySelector('#mind-bump');
  if (!svg) return;
  const tile = root.querySelector('#mind-tile-bump') ?? svg.parentNode;
  const ranks = model.themeRanks ?? [];
  const themes = model.themeWeekly?.themes ?? Object.keys(ranks[0]?.rankByTheme ?? {});
  const lines = buildBumpLines(ranks, themes, { width: 320, height: 168 });
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: lines.length, unit: 'rank lines' })) {
    paintLegend(root, tile, []);
    return;
  }
  svg.replaceChildren();
  lines.forEach((line, index) => {
    const path = createSvg(root, 'path');
    path.setAttribute('d', line.linePath || '');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', STREAM_FILLS[index % STREAM_FILLS.length]);
    path.setAttribute('stroke-width', '2.5');
    bindMark(path, root, {
      title: line.key,
      rows: themeRows(model, line.key),
      continueAgent: 'vera'
    });
    svg.append(path);
  });
  paintLegend(root, root.querySelector('#mind-tile-bump') ?? svg.parentNode, lines.map((line, index) => ({
    label: displayThemeLabel(line.key),
    swatch: STREAM_FILLS[index % STREAM_FILLS.length]
  })));
  animateAreaReveal(svg, quietMotion(root));
}

function renderChordTile(root, model) {
  const svg = root.querySelector('#mind-chord');
  if (!svg) return;
  const tile = root.querySelector('#mind-tile-chord') ?? svg.parentNode;
  const pairs = model.themeCooccurrence ?? [];
  if (!paintChartOrEmpty(root, tile, svg, { need: 3, have: pairs.length, unit: 'paired themes' })) {
    paintLegend(root, tile, []);
    return;
  }
  svg.replaceChildren();
  const layout = buildChordLayout(pairs);
  const cx = 120;
  const cy = 120;
  const radius = 78;
  for (const arc of layout.arcs) {
    const path = createSvg(root, 'path');
    const x0 = cx + radius * Math.cos(arc.startAngle - Math.PI / 2);
    const y0 = cy + radius * Math.sin(arc.startAngle - Math.PI / 2);
    const x1 = cx + radius * Math.cos(arc.endAngle - Math.PI / 2);
    const y1 = cy + radius * Math.sin(arc.endAngle - Math.PI / 2);
    const large = arc.endAngle - arc.startAngle > Math.PI ? 1 : 0;
    path.setAttribute('d', `M${x0},${y0} A${radius},${radius},0,${large},1,${x1},${y1}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--wave)');
    path.setAttribute('stroke-width', '10');
    path.setAttribute('title', displayThemeLabel(arc.key));
    bindMark(path, root, {
      title: arc.key,
      rows: themeRows(model, arc.key),
      continueAgent: 'vera'
    });
    svg.append(path);
  }
  paintLegend(root, root.querySelector('#mind-tile-chord') ?? svg.parentNode, (layout.arcs ?? []).map(arc => ({
    label: displayThemeLabel(arc.key),
    swatch: 'var(--wave)'
  })));
}

function renderRadialTile(root, model) {
  const svg = root.querySelector('#mind-radial-year');
  if (!svg) return;
  const tile = root.querySelector('#mind-tile-radial') ?? svg.parentNode;
  const moodDays = (model.moodSeries ?? []).filter(point => point.mood || Number.isFinite(Number(point.value))).length;
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: moodDays, unit: 'mood days this year' })) return;
  svg.replaceChildren();
  const year = Number(String(model.date ?? '').slice(0, 4)) || 2026;
  const byDate = {};
  for (const point of model.moodSeries ?? []) {
    if (point.date) byDate[point.date] = point.mood ?? null;
  }
  const ticks = buildRadialYear({ year, byDate });
  const cx = 120;
  const cy = 120;
  const inner = 42;
  const outer = 96;
  for (const tick of ticks) {
    if (!tick.mood) continue;
    const line = createSvg(root, 'line');
    line.setAttribute('x1', String(cx + inner * Math.cos(tick.angle)));
    line.setAttribute('y1', String(cy + inner * Math.sin(tick.angle)));
    line.setAttribute('x2', String(cx + outer * Math.cos(tick.angle)));
    line.setAttribute('y2', String(cy + outer * Math.sin(tick.angle)));
    line.setAttribute('stroke', MOOD_TOKEN[tick.mood] ?? 'var(--line)');
    line.setAttribute('stroke-width', '2.4');
    line.setAttribute('stroke-linecap', 'round');
    bindMark(line, root, {
      title: tick.date,
      rows: dateRows(model, tick.date)
    });
    svg.append(line);
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  months.forEach((month, index) => {
    const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(cx + 110 * Math.cos(angle)));
    label.setAttribute('y', String(cy + 110 * Math.sin(angle) + 3));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'mind-chart-label');
    label.textContent = month;
    svg.append(label);
  });
}

function renderHorizonTile(root, model) {
  const host = root.querySelector('#mind-horizon');
  if (!host) return;
  const tile = root.querySelector('#mind-tile-horizon') ?? host;
  const energyMap = { high: 3, medium: 2, low: 1 };
  const metrics = [
    { key: 'mood', points: (model.moodSeries ?? []).map(point => ({ date: point.date, value: point.value })) }
  ];
  const energyPoints = (model.diary ?? [])
    .filter(entry => entry.energy)
    .map(entry => ({ date: entry.date, value: energyMap[entry.energy] ?? 0 }));
  if (energyPoints.length) metrics.push({ key: 'energy', points: energyPoints });
  const bands = buildHorizonBands(metrics, { width: 320, height: 18 });
  if (!paintChartOrEmpty(root, tile, null, { need: 1, have: bands.length, unit: 'metrics' })) {
    host.replaceChildren();
    return;
  }
  host.replaceChildren();
  for (const band of bands) {
    const row = root.createElement('div');
    row.className = 'mind-horizon-row';
    const caption = root.createElement('p');
    caption.className = 'metric-caption';
    caption.textContent = band.key;
    const svg = createSvg(root, 'svg');
    svg.setAttribute('viewBox', '0 0 320 18');
    svg.setAttribute('class', 'mind-horizon-band');
    for (const rect of band.rects) {
      const node = createSvg(root, 'rect');
      node.setAttribute('x', String(rect.x));
      node.setAttribute('y', String(rect.y));
      node.setAttribute('width', String(rect.width));
      node.setAttribute('height', String(Math.max(rect.height, 14)));
      node.setAttribute('fill', 'var(--wave)');
      node.setAttribute('opacity', String(rect.opacity));
      bindMark(node, root, {
        title: `${band.key} ${rect.date}`,
        rows: dateRows(model, rect.date)
      });
      svg.append(node);
    }
    bindMark(svg, root, {
      title: band.key,
      rows: (band.rects ?? []).map(rect => ({ date: rect.date, title: band.key, excerpt: String(rect.value) }))
    });
    row.append(caption, svg);
    host.append(row);
  }
}

function renderButterflyTile(root, model) {
  const host = root.querySelector('#mind-butterfly');
  if (!host) return;
  const tile = root.querySelector('#mind-tile-butterfly') ?? host;
  const rows = model.butterfly ?? [];
  if (!paintChartOrEmpty(root, tile, null, { need: 1, have: rows.length, unit: 'themes' })) {
    host.replaceChildren();
    return;
  }
  host.replaceChildren();
  const max = Math.max(1, ...rows.flatMap(row => [row.veraCount, row.penelopeCount]));
  for (const row of rows) {
    const wrap = root.createElement('div');
    wrap.className = 'mind-butterfly-row';
    const vera = root.createElement('div');
    vera.className = 'mind-butterfly-bar mind-butterfly-bar--vera';
    vera.style.width = `${((Number(row.veraCount) || 0) / max) * 100}%`;
    vera.setAttribute('title', `Vera ${displayThemeLabel(row.theme)}`);
    const label = root.createElement('span');
    label.textContent = displayThemeLabel(row.theme);
    const penelope = root.createElement('div');
    penelope.className = 'mind-butterfly-bar mind-butterfly-bar--penelope';
    penelope.style.width = `${((Number(row.penelopeCount) || 0) / max) * 100}%`;
    penelope.setAttribute('title', `Penelope ${displayThemeLabel(row.theme)}`);
    bindMark(wrap, root, {
      title: row.theme,
      rows: themeRows(model, row.theme)
    });
    wrap.append(vera, label, penelope);
    host.append(wrap);
  }
}

function renderLexicalTile(root, model, onWatchlistChange) {
  const host = root.querySelector('#mind-lexical');
  if (!host) return;
  host.replaceChildren();
  const series = model.lexical ?? [];
  const tile = root.querySelector('#mind-tile-lexical') ?? host;
  const svg = createSvg(root, 'svg');
  svg.setAttribute('viewBox', '0 0 320 160');
  svg.setAttribute('class', 'mind-chart mind-chart--lexical');
  if (paintChartOrEmpty(root, tile, svg, { need: 1, have: series.length, unit: 'watchlist terms' })) {
    series.forEach((item, index) => {
      const chart = buildAreaLine(
        (item.points ?? []).map(point => ({ date: point.date, value: point.count })),
        { width: 320, height: 160, padding: 16 }
      );
      const path = createSvg(root, 'path');
      path.setAttribute('d', chart.linePath || '');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', STREAM_FILLS[index % STREAM_FILLS.length]);
      path.setAttribute('stroke-width', '2.5');
      bindMark(path, root, {
        title: item.term,
        rows: [{ date: '', title: item.term, excerpt: 'Language watchlist' }]
      });
      svg.append(path);
    });
    paintLegend(root, host, series.map((item, index) => ({
      label: item.term,
      swatch: STREAM_FILLS[index % STREAM_FILLS.length]
    })));
    animateAreaReveal(svg, quietMotion(root));
  }
  host.append(svg);
  const form = root.createElement('div');
  form.className = 'mind-lexical-form';
  const input = root.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-label', 'Add watchlist term');
  const button = root.createElement('button');
  button.type = 'button';
  button.textContent = 'Watch';
  button.addEventListener('click', () => {
    const term = String(input.value ?? '').trim();
    if (!term) return;
    onWatchlistChange?.([...new Set([...series.map(item => item.term), term])]);
  });
  form.append(input, button);
  host.append(form);
}

function renderWaffleTile(root, model) {
  const host = root.querySelector('#mind-waffle');
  if (!host) return;
  const tile = root.querySelector('#mind-tile-waffle') ?? host;
  const cells = model.waffle ?? [];
  if (!paintChartOrEmpty(root, tile, null, { need: 1, have: cells.length, unit: 'entries' })) {
    host.replaceChildren();
    return;
  }
  host.replaceChildren();
  for (const cell of cells) {
    const button = root.createElement('button');
    button.type = 'button';
    if (cell.mood) button.setAttribute('data-mood', cell.mood);
    button.setAttribute('title', `${formatDisplayDate(cell.date)} ${cell.mood ?? ''}`.trim());
    bindMark(button, root, {
      title: cell.date,
      rows: dateRows(model, cell.date)
    });
    host.append(button);
  }
}

const RESURFACING_DISMISS_KEY = 'life-hub-mind-resurfacing-dismissed';

function resurfacingId(resurfacing) {
  return resurfacing.id || `${resurfacing.theme}-${resurfacing.priorDate}`;
}

function dismissedResurfacingIds() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(RESURFACING_DISMISS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isResurfacingDismissed(resurfacing) {
  if (!resurfacing) return true;
  return dismissedResurfacingIds().includes(resurfacingId(resurfacing));
}

function dismissResurfacing(resurfacing) {
  const next = [...new Set([...dismissedResurfacingIds(), resurfacingId(resurfacing)])];
  try {
    globalThis.localStorage?.setItem(RESURFACING_DISMISS_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode write failures.
  }
}

function renderInsightList(root, insights, resurfacing) {
  const host = root.querySelector('#mind-insights');
  if (!host) return;
  host.replaceChildren();
  const showResurfacing = Boolean(resurfacing) && !isResurfacingDismissed(resurfacing);
  if (showResurfacing) {
    const card = root.createElement('article');
    card.className = 'mind-resurfacing';
    const copy = root.createElement('p');
    copy.textContent = `${displayThemeLabel(resurfacing.theme)} came up again. Last time was ${formatDisplayDate(resurfacing.priorDate)}: ${resurfacing.excerpt ?? ''}`;
    const dismiss = root.createElement('button');
    dismiss.type = 'button';
    dismiss.setAttribute('data-mind-resurfacing-dismiss', '');
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => dismissResurfacing(resurfacing));
    card.append(copy, dismiss);
    host.append(card);
  }
  if (!insights?.length) {
    if (showResurfacing) return;
    const empty = root.createElement('p');
    empty.className = 'governance-empty';
    empty.textContent = 'No governance entries yet.';
    host.append(empty);
    return;
  }
  const visible = insights.slice(0, 3);
  visible.forEach((entry, index) => {
    const block = root.createElement('article');
    block.className = 'governance-entry mind-insight';
    if (index === 0) block.dataset.current = 'true';
    block.style.animationDelay = `${index * 40}ms`;
    const heading = root.createElement('p');
    heading.className = 'governance-entry-heading';
    heading.textContent = [formatDisplayDate(entry.dateKey), entry.entryType].filter(Boolean).join(' — ');
    block.append(heading);
    if (entry.title) {
      const title = root.createElement('p');
      title.className = 'governance-entry-title';
      title.textContent = entry.title;
      block.append(title);
    }
    const line = firstSentence(entry.body);
    if (line) {
      const body = root.createElement('p');
      body.className = 'governance-entry-body';
      body.textContent = line;
      block.append(body);
    }
    bindMark(block, root, {
      title: entry.title || 'Mind Insight',
      rows: [{
        date: entry.dateKey,
        title: entry.title || entry.entryType || 'Mind Insight',
        excerpt: entry.body || ''
      }]
    });
    host.append(block);
  });
  if (insights.length > 3) {
    const more = root.createElement('p');
    more.className = 'metric-caption';
    more.textContent = 'more in sheet';
    host.append(more);
  }
}

function renderCrossAgentStrip(root, lines, { veraColour, penelopeColour } = {}) {
  const host = root.querySelector('#mind-cross-agent');
  if (!host) return;
  host.replaceChildren();
  if (!lines?.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No Vera or Penelope coordination lines yet.';
    host.append(empty);
    return;
  }
  const list = root.createElement('ul');
  list.className = 'mind-cross-agent';
  for (const line of lines) {
    const item = root.createElement('li');
    item.className = 'mind-cross-agent__line';
    if (line.includes('Vera')) {
      item.dataset.agent = 'vera';
      item.style.borderLeftColor = veraColour;
    } else if (line.includes('Penelope')) {
      item.dataset.agent = 'penelope';
      item.style.borderLeftColor = penelopeColour;
    }
    item.textContent = line;
    list.append(item);
  }
  host.append(list);
}
