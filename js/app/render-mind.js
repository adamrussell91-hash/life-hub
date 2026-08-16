import { agentColour } from './agent-colour.js';
import { animateAreaReveal } from './chart-kit/animate.js';
import { applyRingTarget } from './chart-kit/apply-ring.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildBumpLines } from './chart-kit/bump.js';
import { buildChordLayout } from './chart-kit/chord-layout.js';
import { buildHorizonBands } from './chart-kit/horizon.js';
import { packMasonry } from './chart-kit/masonry.js';
import { buildDistributionPie } from './chart-kit/pie.js';
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
    renderMoodChart(root, model.moodSeries);
    renderMoodMix(root, model.byMood);
    renderEnergyRings(root, model);
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
  animateAreaReveal(svg, quietMotion(root));
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
  const caption = root.createElement('p');
  caption.className = 'metric-caption';
  caption.textContent = `${themes.length} in this range`;
  host.append(caption);
  themes.forEach((theme, index) => {
    const chip = root.createElement('span');
    chip.className = 'mind-theme-chip';
    chip.style.animationDelay = root.querySelector('#mind-dashboard')?._quiet
      ? '0ms'
      : `${Math.min(index, 5) * 40}ms`;
    if (index >= 6) chip.classList.add('mind-theme-chip--group');
    chip.textContent = theme.label;
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
