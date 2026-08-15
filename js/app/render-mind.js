import { agentColour } from './agent-colour.js';
import { animateAreaReveal } from './chart-kit/animate.js';
import { applyRingTarget } from './chart-kit/apply-ring.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildHeatmapRow } from './chart-kit/heatmap.js';
import { packMasonry } from './chart-kit/masonry.js';
import { buildDistributionPie } from './chart-kit/pie.js';
import { MOOD_ORDER, rangeWindow } from './mind-model.js';

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

export function renderMind(root, model, { onRangeChange, onOpenAgent, agentsConfig } = {}) {
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

  if (!model.empty) {
    renderMoodChart(root, model.moodSeries);
    renderMoodMix(root, model.byMood);
    renderEnergyRings(root, model);
    renderCadenceHeatmap(root, model);
    renderThemeChips(root, model.themes);
  }
  renderSilenceBanner(root, model);
  renderSessionList(root, model.sessions);
  renderInsightList(root, model.insights);
  renderCrossAgentStrip(root, model.crossAgentLines, { veraColour, penelopeColour });

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

function renderInsightList(root, insights) {
  const host = root.querySelector('#mind-insights');
  if (!host) return;
  host.replaceChildren();
  if (!insights?.length) {
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
