import { agentColour } from './agent-colour.js';
import { animateAreaReveal } from './chart-kit/animate.js';
import { applyRingTarget } from './chart-kit/apply-ring.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildBumpLines } from './chart-kit/bump.js';
import { buildChordLayout } from './chart-kit/chord-layout.js';
import { buildHeatmapRow } from './chart-kit/heatmap.js';
import { buildHorizonBands } from './chart-kit/horizon.js';
import { packMasonry } from './chart-kit/masonry.js';
import { buildDistributionPie } from './chart-kit/pie.js';
import { buildRadialYear } from './chart-kit/radial-year.js';
import { buildSankeyFlow } from './chart-kit/sankey-flow.js';
import { buildStreamPaths } from './chart-kit/stream.js';
import { entriesForTheme, MOOD_ORDER, rangeWindow } from './mind-model.js';
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

export function renderMind(root, model, { onRangeChange, onOpenAgent, agentsConfig, onWatchlistChange } = {}) {
  const dashboard = root.querySelector('#mind-dashboard');
  if (!dashboard || !model) return;

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
  dashboard.style?.setProperty?.('--heatmap-vera-hit', veraColour);
  dashboard.style?.setProperty?.('--penelope-accent', penelopeColour);

  const empty = root.querySelector('#mind-empty');
  if (empty) empty.hidden = !model.empty;
  for (const selector of ['#mind-hero', '#mind-cadence']) {
    const row = root.querySelector(selector);
    if (row) row.hidden = Boolean(model.empty);
  }

  renderLaunchers(root, model);
  renderFactorPanel(root, model);
  renderStreak(root, model);
  renderConstellation(root, model);
  renderTension(root, model);

  if (!model.empty) {
    renderMoodChart(root, model.moodSeries);
    renderMoodMix(root, model.byMood);
    renderEnergyRings(root, model);
    renderCadenceHeatmap(root, model);
    renderThemeChips(root, model.themes);
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

function formatDaysAgo(daysAgo) {
  if (daysAgo == null || Number.isNaN(Number(daysAgo))) return '';
  const days = Number(daysAgo);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function launcherMeta(launcher) {
  if (!launcher) return '';
  return [launcher.title, formatDaysAgo(launcher.daysAgo), launcher.outcome].filter(Boolean).join(' · ');
}

function renderLaunchers(root, model) {
  const launchers = model.launchers ?? {};
  for (const [id, launcher] of [['#mind-launcher-vera', launchers.vera], ['#mind-launcher-penelope', launchers.penelope]]) {
    const button = root.querySelector(id);
    const meta = button?.querySelector?.('.mind-launcher__meta');
    if (meta) meta.textContent = launcherMeta(launcher);
  }
}

function renderFactorPanel(root, model) {
  const host = root.querySelector('[data-role="factor-bars"]')
    ?? root.querySelector('#mind-tile-factors');
  if (!host) return;
  host.replaceChildren();
  const factors = model.factorEffects ?? [];
  const max = Math.max(0, ...factors.map(factor => Math.abs(Number(factor.effect) || 0)));
  for (const factor of factors) {
    const label = factor.label || factor.key;
    const button = root.createElement('button');
    button.type = 'button';
    const name = root.createElement('span');
    name.textContent = label;
    const bar = root.createElement('span');
    const fill = root.createElement('span');
    fill.className = 'mind-factor-fill';
    const pct = max > 0 ? (Math.abs(Number(factor.effect) || 0) / max) * 100 : 0;
    fill.style.width = `${pct}%`;
    fill.style.transform = 'scaleX(0)';
    bar.append(fill);
    button.append(name, bar);
    button.addEventListener('click', () => {
      openMindThreadSheet(root, {
        title: label,
        rows: entriesForTheme(model.diary ?? [], model.sessions ?? [], factor.key),
        continueAgent: null
      });
    });
    host.append(button);
    void fill.getBoundingClientRect?.();
    fill.style.transform = 'scaleX(1)';
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
  if (!nodes.length) return;

  const width = 200;
  const height = 200;
  const cx = width / 2;
  const cy = height / 2;
  const orbit = 70;
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
    circle.addEventListener('click', () => {
      openMindThreadSheet(root, {
        title: node.key,
        rows: entriesForTheme(model.diary ?? [], model.sessions ?? [], node.key),
        continueAgent: 'vera'
      });
    });
    svg.append(circle);
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(node.x));
    label.setAttribute('y', String(node.y + node.r + 10));
    label.textContent = node.key;
    svg.append(label);
  }
}

function renderTension(root, model) {
  const tile = root.querySelector('#mind-tension');
  if (!tile) return;
  const tensions = model.tensions ?? [];
  if (!tensions.length) {
    tile.hidden = true;
    return;
  }
  tile.hidden = false;
  const tension = tensions[0];
  let svg = tile.querySelector('#mind-tension-chart') ?? tile.querySelector('svg');
  if (!svg) {
    svg = createSvg(root, 'svg');
    svg.id = 'mind-tension-chart';
    svg.setAttribute('viewBox', '0 0 160 80');
    tile.append(svg);
  }
  svg.replaceChildren();
  const poles = [
    { x: 40, y: 40 },
    { x: 120, y: 40 }
  ];
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
        continueAgent: 'vera'
      });
    });
    svg.append(circle);
  }
}

function packMindBoard(root) {
  const board = root.querySelector('#mind-board');
  if (!board) return;
  const width = board.getBoundingClientRect?.()?.width ?? 0;
  if (width <= 0) return;
  const tiles = [...(board.querySelectorAll?.('.mind-tile') ?? [])];
  if (!tiles.length) return;
  const gap = 16;
  const columns = width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const columnWidth = (width - gap * (columns - 1)) / columns;
  const items = tiles.map(tile => ({
    id: tile.id,
    span: Number(tile.dataset?.mindSpan) || 1,
    height: tile.offsetHeight || ((Number(tile.dataset?.mindSpan) || 1) * TILE_FALLBACK_HEIGHT)
  }));
  const packed = packMasonry(items, { columns, gap, columnWidth });
  for (const item of packed) {
    const tile = tiles.find(node => node.id === item.id);
    if (!tile?.style) continue;
    tile.style.position = 'absolute';
    tile.style.left = `${item.x}px`;
    tile.style.top = `${item.y}px`;
    tile.style.width = `${item.width}px`;
  }
}

function createSvg(root, tag) {
  return root.createElementNS?.('http://www.w3.org/2000/svg', tag) ?? root.createElement(tag);
}

function renderMoodChart(root, series) {
  const svg = root.querySelector('#mind-mood-chart');
  if (!svg) return;
  const area = svg.querySelector('[data-role="area"]');
  const line = svg.querySelector('[data-role="line"]');
  const dots = svg.querySelector('[data-role="dots"]');
  dots?.replaceChildren?.();
  if (!series.length) {
    if (area) area.setAttribute('d', '');
    if (line) line.setAttribute('d', '');
    svg.classList?.remove?.('chart-animating', 'chart-static');
    return;
  }
  const chart = buildAreaLine(series.map(point => ({ date: point.date, value: point.value })));
  if (area) area.setAttribute('d', chart.areaPath || '');
  if (line) line.setAttribute('d', chart.linePath || '');
  if (dots) {
    chart.points.forEach((point, index) => {
      const source = series[index] ?? {};
      const mood = source.mood && MOOD_TOKEN[source.mood] ? source.mood : null;
      const dot = createSvg(root, 'circle');
      dot.setAttribute('cx', String(point.x));
      dot.setAttribute('cy', String(point.y));
      dot.setAttribute('r', '3.5');
      dot.setAttribute('class', 'mind-mood-dot');
      if (mood) {
        dot.setAttribute('data-mood', mood);
        dot.setAttribute('fill', MOOD_TOKEN[mood]);
      } else {
        dot.setAttribute('fill', 'var(--mood-neutral)');
      }
      dot.style.animationDelay = `${Math.min(index * 25, 400)}ms`;
      dots.append(dot);
    });
  }
  animateAreaReveal(svg);
}

function renderMoodMix(root, byMood) {
  const host = root.querySelector('#mind-mood-mix');
  const slicesHost = root.querySelector('#mind-mood-pie [data-role="slices"]')
    ?? root.querySelector('#mind-mood-pie')?.querySelector?.('[data-role="slices"]');
  const label = root.querySelector('[data-mind="mood-mix-label"]');
  if (!host && !slicesHost) return;
  slicesHost?.replaceChildren?.();
  const items = (byMood ?? []).map(item => ({
    ...item,
    colour: MOOD_TOKEN[item.key] ?? 'var(--mood-neutral)'
  }));
  const pie = buildDistributionPie(items);
  if (pie.empty) {
    if (label) label.textContent = 'No mood entries yet';
    return;
  }
  pie.slices.forEach((slice, index) => {
    const path = createSvg(root, 'path');
    path.setAttribute('d', slice.path);
    path.setAttribute('fill', slice.colour);
    path.setAttribute('class', 'mind-pie-slice');
    path.setAttribute('data-mood', slice.key);
    path.style.animationDelay = `${index * 40}ms`;
    slicesHost?.append(path);
  });
  const dominant = pie.slices.reduce((best, slice) => slice.value > best.value ? slice : best);
  if (label) label.textContent = `${dominant.label} · ${pie.total}`;
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

function renderCadenceHeatmap(root, model) {
  let bounds;
  try {
    bounds = rangeWindow(model.date, model.range);
  } catch {
    return;
  }
  const diaryHits = [...new Set((model.moodSeries ?? []).map(point => point.date))];
  const sessionHits = [...new Set((model.sessions ?? []).map(session => session.date))];
  paintHeatmapRow(root, '#mind-heatmap-diary', buildHeatmapRow({
    from: bounds.from,
    to: bounds.to,
    today: model.date,
    hitDates: diaryHits
  }), 'diary');
  paintHeatmapRow(root, '#mind-heatmap-vera', buildHeatmapRow({
    from: bounds.from,
    to: bounds.to,
    today: model.date,
    hitDates: sessionHits
  }), 'vera');
  paintHeatmapRow(root, '#mind-heatmap-penelope', buildHeatmapRow({
    from: bounds.from,
    to: bounds.to,
    today: model.date,
    hitDates: model.cadence?.penelope ?? diaryHits
  }), 'penelope');
}

function paintHeatmapRow(root, selector, tiles, kind) {
  const grid = root.querySelector(selector);
  if (!grid) return;
  grid.replaceChildren();
  for (const tile of tiles) {
    const node = root.createElement('span');
    node.className = `heatmap-tile heatmap-tile--${kind}`;
    node.dataset.hit = String(tile.hit);
    if (tile.today) node.dataset.today = 'true';
    node.title = tile.date;
    grid.append(node);
  }
}

function renderThemeChips(root, themes) {
  const host = root.querySelector('#mind-themes');
  if (!host) return;
  host.replaceChildren();
  if (!themes?.length) {
    const caption = root.createElement('p');
    caption.className = 'metric-caption';
    caption.textContent = 'No recurring themes in this range yet.';
    host.append(caption);
    return;
  }
  const max = Math.max(...themes.map(theme => theme.value));
  themes.forEach((theme, index) => {
    const chip = root.createElement('span');
    chip.className = 'mind-theme-chip';
    const weight = max > 0 ? theme.value / max : 0;
    chip.style.fontSize = weight > 0.66 ? 'var(--text-md)' : weight > 0.33 ? 'var(--text-base)' : 'var(--text-sm)';
    chip.style.background = `color-mix(in srgb, var(--glass) ${Math.round(70 + weight * 30)}%, var(--wave))`;
    chip.style.animationDelay = `${Math.min(index, 5) * 40}ms`;
    if (index >= 6) chip.classList.add('mind-theme-chip--group');
    chip.textContent = `${theme.label} · ${theme.value}`;
    host.append(chip);
  });
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
  for (const session of sessions) {
    const card = root.createElement('article');
    card.className = 'mind-session-card';
    const date = root.createElement('p');
    date.className = 'mind-session-card__date';
    date.textContent = session.date;
    const title = root.createElement('h3');
    title.className = 'mind-session-card__theme';
    title.textContent = session.theme || 'Vera session';
    card.append(date, title);
    if (session.closingQuestion) {
      const question = root.createElement('p');
      question.className = 'mind-session-card__question';
      question.textContent = session.closingQuestion;
      card.append(question);
    }
    if (session.insight) {
      const insight = root.createElement('p');
      insight.className = 'mind-session-card__insight';
      insight.textContent = session.insight;
      card.append(insight);
    }
    const shift = renderMoodShift(root, session);
    if (shift) card.append(shift);
    host.append(card);
  }
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
  animateAreaReveal(svg);
  return wrap;
}

function bindMark(node, root, payload) {
  if (payload.title != null) node.setAttribute('title', payload.title);
  node.setAttribute('tabindex', '0');
  const open = () => openMindThreadSheet(root, payload);
  node.addEventListener('click', open);
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter') open();
  });
}

function sparseCaption(root, host, count, noun) {
  if (count) return;
  const caption = root.createElement('p');
  caption.className = 'metric-caption';
  caption.textContent = `${count} ${noun} in this range`;
  host.append(caption);
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
  svg.replaceChildren();
  const weekly = model.themeWeekly ?? { weeks: [], series: [] };
  const paths = buildStreamPaths(weekly, { width: 320, height: 80 });
  paths.forEach((band, index) => {
    const path = createSvg(root, 'path');
    path.setAttribute('d', band.d);
    path.setAttribute('fill', STREAM_FILLS[index % STREAM_FILLS.length]);
    if (index === 0) path.setAttribute('data-role', 'line');
    bindMark(path, root, {
      title: band.key,
      rows: themeRows(model, band.key),
      continueAgent: 'vera'
    });
    svg.append(path);
  });
  sparseCaption(root, svg.parentNode ?? svg, paths.length, 'themes');
  animateAreaReveal(svg);
}

function renderSankeyTile(root, model) {
  const svg = root.querySelector('#mind-sankey');
  if (!svg) return;
  svg.replaceChildren();
  const chart = buildSankeyFlow(model.moodTransitions ?? [], { width: 320, height: 80 });
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
  sparseCaption(root, svg.parentNode ?? svg, chart.links.length, 'transitions');
}

function renderBumpTile(root, model) {
  const svg = root.querySelector('#mind-bump');
  if (!svg) return;
  svg.replaceChildren();
  const ranks = model.themeRanks ?? [];
  const themes = model.themeWeekly?.themes ?? Object.keys(ranks[0]?.rankByTheme ?? {});
  const lines = buildBumpLines(ranks, themes, { width: 320, height: 80 });
  lines.forEach((line, index) => {
    const path = createSvg(root, 'path');
    path.setAttribute('d', line.linePath || '');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', STREAM_FILLS[index % STREAM_FILLS.length]);
    path.setAttribute('stroke-width', '2');
    if (index === 0) path.setAttribute('data-role', 'line');
    bindMark(path, root, {
      title: line.key,
      rows: themeRows(model, line.key),
      continueAgent: 'vera'
    });
    svg.append(path);
  });
  sparseCaption(root, svg.parentNode ?? svg, lines.length, 'rank lines');
  animateAreaReveal(svg);
}

function renderChordTile(root, model) {
  const svg = root.querySelector('#mind-chord');
  if (!svg) return;
  svg.replaceChildren();
  const layout = buildChordLayout(model.themeCooccurrence ?? []);
  const cx = 80;
  const cy = 80;
  const radius = 60;
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
    path.setAttribute('stroke-width', '8');
    bindMark(path, root, {
      title: arc.key,
      rows: themeRows(model, arc.key),
      continueAgent: 'vera'
    });
    svg.append(path);
  }
  sparseCaption(root, svg.parentNode ?? svg, layout.arcs.length, 'themes');
}

function renderRadialTile(root, model) {
  const svg = root.querySelector('#mind-radial-year');
  if (!svg) return;
  svg.replaceChildren();
  const year = Number(String(model.date ?? '').slice(0, 4)) || 2026;
  const byDate = {};
  for (const point of model.moodSeries ?? []) {
    if (point.date) byDate[point.date] = point.mood ?? null;
  }
  const ticks = buildRadialYear({ year, byDate });
  const cx = 80;
  const cy = 80;
  const inner = 28;
  const outer = 70;
  for (const tick of ticks) {
    const line = createSvg(root, 'line');
    line.setAttribute('x1', String(cx + inner * Math.cos(tick.angle)));
    line.setAttribute('y1', String(cy + inner * Math.sin(tick.angle)));
    line.setAttribute('x2', String(cx + outer * Math.cos(tick.angle)));
    line.setAttribute('y2', String(cy + outer * Math.sin(tick.angle)));
    line.setAttribute('stroke', tick.mood && MOOD_TOKEN[tick.mood] ? MOOD_TOKEN[tick.mood] : 'var(--line)');
    line.setAttribute('stroke-width', tick.mood ? '1.4' : '0.6');
    bindMark(line, root, {
      title: tick.date,
      rows: dateRows(model, tick.date)
    });
    svg.append(line);
  }
}

function renderHorizonTile(root, model) {
  const host = root.querySelector('#mind-horizon');
  if (!host) return;
  host.replaceChildren();
  const energyMap = { high: 3, medium: 2, low: 1 };
  const metrics = [
    { key: 'mood', points: (model.moodSeries ?? []).map(point => ({ date: point.date, value: point.value })) }
  ];
  const energyPoints = (model.diary ?? [])
    .filter(entry => entry.energy)
    .map(entry => ({ date: entry.date, value: energyMap[entry.energy] ?? 0 }));
  if (energyPoints.length) metrics.push({ key: 'energy', points: energyPoints });
  const bands = buildHorizonBands(metrics, { width: 320, height: 12 });
  for (const band of bands) {
    const svg = createSvg(root, 'svg');
    svg.setAttribute('viewBox', '0 0 320 12');
    svg.setAttribute('class', 'mind-horizon-band');
    for (const rect of band.rects) {
      const node = createSvg(root, 'rect');
      node.setAttribute('x', String(rect.x));
      node.setAttribute('y', String(rect.y));
      node.setAttribute('width', String(rect.width));
      node.setAttribute('height', String(rect.height));
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
    host.append(svg);
  }
  sparseCaption(root, host, bands.length, 'metrics');
}

function renderButterflyTile(root, model) {
  const host = root.querySelector('#mind-butterfly');
  if (!host) return;
  host.replaceChildren();
  const rows = model.butterfly ?? [];
  const max = Math.max(1, ...rows.flatMap(row => [row.veraCount, row.penelopeCount]));
  for (const row of rows) {
    const wrap = root.createElement('div');
    wrap.className = 'mind-butterfly-row';
    const vera = root.createElement('div');
    vera.className = 'mind-butterfly-bar mind-butterfly-bar--vera';
    vera.style.width = `${((Number(row.veraCount) || 0) / max) * 100}%`;
    vera.setAttribute('title', `Vera ${row.theme}`);
    const label = root.createElement('span');
    label.textContent = row.theme;
    const penelope = root.createElement('div');
    penelope.className = 'mind-butterfly-bar mind-butterfly-bar--penelope';
    penelope.style.width = `${((Number(row.penelopeCount) || 0) / max) * 100}%`;
    penelope.setAttribute('title', `Penelope ${row.theme}`);
    bindMark(wrap, root, {
      title: row.theme,
      rows: themeRows(model, row.theme)
    });
    wrap.append(vera, label, penelope);
    host.append(wrap);
  }
  sparseCaption(root, host, rows.length, 'themes');
}

function renderLexicalTile(root, model, onWatchlistChange) {
  const host = root.querySelector('#mind-lexical');
  if (!host) return;
  host.replaceChildren();
  const series = model.lexical ?? [];
  const svg = createSvg(root, 'svg');
  svg.setAttribute('viewBox', '0 0 320 80');
  svg.setAttribute('class', 'line-chart');
  series.forEach((item, index) => {
    const chart = buildAreaLine(
      (item.points ?? []).map(point => ({ date: point.date, value: point.count })),
      { width: 320, height: 80, padding: 8 }
    );
    const path = createSvg(root, 'path');
    path.setAttribute('d', chart.linePath || '');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', STREAM_FILLS[index % STREAM_FILLS.length]);
    path.setAttribute('stroke-width', '2');
    if (index === 0) path.setAttribute('data-role', 'line');
    bindMark(path, root, {
      title: item.term,
      rows: [{ date: '', title: item.term, excerpt: 'Language watchlist' }]
    });
    svg.append(path);
  });
  host.append(svg);
  animateAreaReveal(svg);
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
  sparseCaption(root, host, series.length, 'terms');
}

function renderWaffleTile(root, model) {
  const host = root.querySelector('#mind-waffle');
  if (!host) return;
  host.replaceChildren();
  const cells = model.waffle ?? [];
  for (const cell of cells) {
    const button = root.createElement('button');
    button.type = 'button';
    if (cell.mood) button.setAttribute('data-mood', cell.mood);
    button.setAttribute('title', `${cell.date} ${cell.mood ?? ''}`.trim());
    bindMark(button, root, {
      title: cell.date,
      rows: dateRows(model, cell.date)
    });
    host.append(button);
  }
  sparseCaption(root, host, cells.length, 'entries');
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
    copy.textContent = `${resurfacing.theme} came up again. Last time was ${resurfacing.priorDate}: ${resurfacing.excerpt ?? ''}`;
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
  insights.forEach((entry, index) => {
    const block = root.createElement('article');
    block.className = 'governance-entry mind-insight';
    if (index === 0) block.dataset.current = 'true';
    block.style.animationDelay = `${index * 40}ms`;
    const heading = root.createElement('p');
    heading.className = 'governance-entry-heading';
    heading.textContent = [entry.dateKey, entry.entryType].filter(Boolean).join(' — ');
    block.append(heading);
    if (entry.title) {
      const title = root.createElement('p');
      title.className = 'governance-entry-title';
      title.textContent = entry.title;
      block.append(title);
    }
    if (entry.status) {
      const status = root.createElement('p');
      status.className = 'governance-entry-status';
      status.textContent = entry.status;
      block.append(status);
    }
    if (entry.body) {
      const body = root.createElement('p');
      body.className = 'governance-entry-body';
      body.textContent = entry.body;
      block.append(body);
    }
    host.append(block);
  });
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
