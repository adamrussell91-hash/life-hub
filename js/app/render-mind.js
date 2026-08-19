import { agentColour } from './agent-colour.js';
import { animateAreaReveal } from './chart-kit/animate.js';
import { applyRingTarget } from './chart-kit/apply-ring.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildBumpChart } from './chart-kit/bump.js';
import { buildChordLayout } from './chart-kit/chord-layout.js';
import { buildMetricStrip } from './chart-kit/horizon.js';
import { buildMoodRadial } from './chart-kit/mood-radial.js';
import { buildEnergyOrbit } from './chart-kit/energy-orbit.js';
import { buildMoodMixDonut } from './chart-kit/mood-mix.js';
import { buildThemeOrbit, THEME_ARMS } from './chart-kit/theme-orbit.js';
import { buildThemeConstellation, arcFor } from './chart-kit/theme-constellation.js';
import { buildWatchlistHeat } from './chart-kit/watchlist-heat.js';
import { packMasonry } from './chart-kit/masonry.js';
import { buildRadialYear } from './chart-kit/radial-year.js';
import { buildSankeyFlow } from './chart-kit/sankey-flow.js';
import { buildThemeTopography } from './chart-kit/stream.js';
import { entriesForTheme, entriesForThemePair, entriesForThemeWeek, entriesForWatchlistTerm, MOOD_ORDER, displayThemeLabel, previousRangeWindow } from './mind-model.js';
import { addCalendarDays, formatDisplayDate, isCalendarDate } from '../core/time.js';
import { openMindThreadSheet } from './mind-thread-sheet.js';

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

  renderEnergyOrbit(root, model);

  if (!model.empty) {
    renderMoodChart(root, model.moodRadial ?? model.moodSeries, model.bounds, model.range);
    renderMoodMix(root, model);
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

function renderConstellation(root, model) {
  const svg = root.querySelector('#mind-constellation');
  if (!svg) return;
  const tile = root.querySelector('#mind-tile-constellation') ?? svg.parentNode;
  const state = svg._map ?? { focus: null, hops: null, compare: false };
  svg._map = { ...state, root, model };
  const compareBtn = tile.querySelector?.('[data-mind="constellation-compare"]');
  if (compareBtn && !compareBtn.dataset.bound) {
    compareBtn.dataset.bound = '1';
    compareBtn.addEventListener('click', () => {
      const on = compareBtn.getAttribute('aria-pressed') !== 'true';
      compareBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      svg._map.compare = on;
      paintThemeConstellation(root, svg, buildThemeConstellation(constellationArgs(svg)), svg._map.model);
    });
  }
  const chart = buildThemeConstellation(constellationArgs(svg));
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: chart.nodes.length, unit: 'themes' })) return;
  paintThemeConstellation(root, svg, chart, model);
}

function constellationArgs(svg) {
  const state = svg._map ?? {};
  const model = state.model ?? {};
  return {
    nodes: model.themeNodes ?? [],
    edges: model.themeCooccurrence ?? [],
    previousEdges: model.previousThemeCooccurrence ?? [],
    focus: state.focus,
    hops: state.hops,
    compare: Boolean(state.compare)
  };
}

function setSvgClass(node, className) {
  node.setAttribute('class', className);
}

function svgClassName(node) {
  return String(node.getAttribute?.('class') || '');
}

function paintThemeConstellation(root, svg, chart, model) {
  const host = svg.parentNode;
  const prevX = svg._nodeX ?? {};
  const quiet = Boolean(root.querySelector('#mind-dashboard')?._quiet);
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('class', 'mind-constellation__chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Themes that showed up together');

  let tooltip = host?.querySelector?.('[data-role="constellation-tooltip"]');
  if (host && !tooltip) {
    tooltip = root.createElement('div');
    tooltip.className = 'mind-constellation__tooltip';
    tooltip.dataset.role = 'constellation-tooltip';
    tooltip.setAttribute('aria-live', 'polite');
    tooltip.hidden = true;
    host.append(tooltip);
  }

  const axis = createSvg(root, 'line');
  setSvgClass(axis, 'mind-constellation__axis');
  axis.setAttribute('data-role', 'axis');
  axis.setAttribute('x1', String(chart.pad.left));
  axis.setAttribute('x2', String(chart.width - chart.pad.right));
  axis.setAttribute('y1', String(chart.axisY));
  axis.setAttribute('y2', String(chart.axisY));
  svg.append(axis);

  const edgeLayer = createSvg(root, 'g');
  edgeLayer.setAttribute('data-role', 'edges');
  for (const edge of chart.ghosts ?? []) {
    const path = createSvg(root, 'path');
    setSvgClass(path, 'mind-constellation__edge is-ghost');
    path.setAttribute('d', edge.d);
    path.setAttribute('stroke-width', String(Math.max(1, edge.strokeWidth * 0.7)));
    path.setAttribute('pointer-events', 'none');
    edgeLayer.append(path);
  }
  for (const edge of chart.edges) {
    const path = createSvg(root, 'path');
    setSvgClass(path, `mind-constellation__edge is-${edge.change}`);
    path.setAttribute('data-role', 'edge');
    path.setAttribute('data-a', edge.themeA);
    path.setAttribute('data-b', edge.themeB);
    path.setAttribute('d', edge.d);
    path.setAttribute('stroke-width', String(edge.strokeWidth));
    path.setAttribute('opacity', String(edge.change === 'down' ? Math.min(edge.opacity, 0.32) : edge.opacity));
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'button');
    path.setAttribute('aria-label', `${displayThemeLabel(edge.themeA)} and ${displayThemeLabel(edge.themeB)}`);
    bindMark(path, root, {
      title: `${displayThemeLabel(edge.themeA)} · ${displayThemeLabel(edge.themeB)}`,
      rows: entriesForThemePair(model.diary ?? [], model.sessions ?? [], edge.themeA, edge.themeB),
      continueAgent: 'vera'
    });
    path.removeAttribute('title');
    edgeLayer.append(path);
  }
  svg.append(edgeLayer);

  const nodeLayer = createSvg(root, 'g');
  nodeLayer.setAttribute('data-role', 'stars');
  for (const node of chart.nodes) {
    const group = createSvg(root, 'g');
    setSvgClass(group, `mind-constellation__star${node.rising ? ' is-new' : ''}${chart.focus === node.key ? ' is-focus' : ''}`);
    group.setAttribute('data-role', 'star');
    group.setAttribute('data-theme', node.key);
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute(
      'aria-label',
      `${displayThemeLabel(node.key)}. Click to centre. Double-click for nearby themes.`
    );
    const dx = Number(prevX[node.key]) - node.x;
    if (!quiet && Number.isFinite(dx) && Math.abs(dx) > 1) {
      group.setAttribute('transform', `translate(${dx},0)`);
      group.dataset.drift = '1';
    }
    const halo = createSvg(root, 'circle');
    setSvgClass(halo, 'mind-constellation__halo');
    halo.setAttribute('cx', String(node.x));
    halo.setAttribute('cy', String(node.y));
    halo.setAttribute('r', String(node.r + 6));
    halo.setAttribute('pointer-events', 'none');
    const dot = createSvg(root, 'circle');
    setSvgClass(dot, 'mind-constellation__dot');
    dot.setAttribute('cx', String(node.x));
    dot.setAttribute('cy', String(node.y));
    dot.setAttribute('r', String(node.r));
    dot.setAttribute('fill', node.colour);
    dot.setAttribute('pointer-events', 'none');
    const glyph = createSvg(root, 'text');
    setSvgClass(glyph, 'mind-constellation__glyph');
    glyph.setAttribute('x', String(node.x));
    glyph.setAttribute('y', String(node.y + 4));
    glyph.setAttribute('text-anchor', 'middle');
    glyph.setAttribute('pointer-events', 'none');
    glyph.textContent = displayThemeLabel(node.key).charAt(0);
    const hit = createSvg(root, 'circle');
    setSvgClass(hit, 'mind-constellation__hit');
    hit.setAttribute('cx', String(node.x));
    hit.setAttribute('cy', String(node.y));
    hit.setAttribute('r', String(Math.max(node.r + 10, 18)));
    const label = createSvg(root, 'text');
    setSvgClass(label, 'mind-constellation__label');
    label.setAttribute('data-theme', node.key);
    label.setAttribute('x', String(node.x));
    label.setAttribute('y', String(node.y + node.r + 18));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('transform', `rotate(-32 ${node.x} ${node.y + node.r + 18})`);
    label.setAttribute('pointer-events', 'none');
    label.textContent = displayThemeLabel(node.key);
    group.append(halo, dot, glyph, hit, label);
    nodeLayer.append(group);
  }
  svg.append(nodeLayer);
  svg._constellation = chart;
  svg._nodeX = Object.fromEntries(chart.nodes.map(node => [node.key, node.x]));
  bindConstellationMap(svg, host);
  if (!quiet) {
    const drifting = [...(svg.querySelectorAll?.('[data-drift="1"]') ?? [])];
    if (drifting.length) {
      requestAnimationFrame(() => {
        for (const group of drifting) group.setAttribute('transform', 'translate(0,0)');
      });
    }
  }
}

function constellationFocusKeys(chart, target) {
  const role = target?.getAttribute?.('data-role') || target?.dataset?.role;
  if (role === 'star') {
    const key = target.getAttribute?.('data-theme') || target.dataset?.theme;
    if (!key) return null;
    const keys = new Set([key]);
    const edges = [];
    for (const edge of chart.edges) {
      if (edge.themeA !== key && edge.themeB !== key) continue;
      keys.add(edge.themeA);
      keys.add(edge.themeB);
      edges.push(edge);
    }
    return { keys, edges, edge: null };
  }
  if (role === 'edge') {
    const a = target.getAttribute?.('data-a') || target.dataset?.a;
    const b = target.getAttribute?.('data-b') || target.dataset?.b;
    if (!a || !b) return null;
    const edges = chart.edges.filter(edge => edge.themeA === a && edge.themeB === b);
    return { keys: new Set([a, b]), edges, edge: edges[0] ?? null };
  }
  return null;
}

function applyConstellationFocus(svg, focus) {
  const chart = svg._constellation;
  if (!chart) return;
  const on = Boolean(focus);
  const classes = ['mind-constellation__chart'];
  if (on) classes.push('is-focusing');
  if (svg._map?.hops) classes.push('is-two-hop');
  if (svgClassName(svg).includes('is-dragging')) classes.push('is-dragging');
  setSvgClass(svg, classes.join(' '));
  for (const node of svg.querySelectorAll?.('[data-role="star"]') ?? []) {
    const key = node.getAttribute?.('data-theme') || node.dataset?.theme;
    const hit = Boolean(focus?.keys.has(key));
    const rising = svgClassName(node).includes('is-new');
    const isFocus = svgClassName(node).includes('is-focus');
    setSvgClass(node, [
      'mind-constellation__star',
      rising ? 'is-new' : '',
      isFocus ? 'is-focus' : '',
      on && hit ? 'is-hot' : '',
      on && !hit ? 'is-dim' : ''
    ].filter(Boolean).join(' '));
  }
  for (const edge of svg.querySelectorAll?.('[data-role="edge"]') ?? []) {
    const a = edge.getAttribute?.('data-a') || edge.dataset?.a;
    const b = edge.getAttribute?.('data-b') || edge.dataset?.b;
    const hit = Boolean(focus?.edges.some(item => item.themeA === a && item.themeB === b));
    const change = ['new', 'up', 'down', 'flat'].find(name => svgClassName(edge).includes(`is-${name}`)) || 'flat';
    setSvgClass(edge, [
      'mind-constellation__edge',
      `is-${change}`,
      on && hit ? 'is-hot' : '',
      on && !hit ? 'is-dim' : ''
    ].filter(Boolean).join(' '));
  }
}

function constellationTooltipCopy(edge) {
  const bits = [`${displayThemeLabel(edge.themeA)} + ${displayThemeLabel(edge.themeB)}`];
  bits.push(`${edge.count} co-occurrence${edge.count === 1 ? '' : 's'}`);
  if (edge.change === 'new') bits.push('new this period');
  else if (edge.prior > 0 && edge.count !== edge.prior) {
    const mark = edge.count > edge.prior ? 'up' : 'down';
    bits.push(`${mark} from ${edge.prior} last period`);
  }
  return bits.join('\n');
}

function relayoutConstellation(svg, patch = {}) {
  Object.assign(svg._map, patch);
  const root = svg._map.root;
  const model = svg._map.model;
  if (!root || !model) return;
  paintThemeConstellation(root, svg, buildThemeConstellation(constellationArgs(svg)), model);
}

function constellationPointerDx(svg, clientX, startClientX) {
  const width = Number(svg.getBoundingClientRect?.()?.width) || 0;
  const vb = svg._constellation?.width || 960;
  const scale = width > 0 ? width / vb : 1;
  return ((clientX ?? 0) - (startClientX ?? 0)) / scale;
}

function prefersQuietMotion() {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function bindConstellationMap(svg, host) {
  if (svg.dataset.mapBound) return;
  svg.dataset.mapBound = '1';
  const tooltip = () => host?.querySelector?.('[data-role="constellation-tooltip"]');
  let clickTimer = null;
  let drag = null;
  let ignoreClick = false;

  const showTip = (edge, node) => {
    const tip = tooltip();
    if (!tip) return;
    if (!edge) {
      tip.hidden = true;
      return;
    }
    tip.textContent = constellationTooltipCopy(edge);
    tip.hidden = false;
    if (node?.getBoundingClientRect && host?.getBoundingClientRect && tip.style) {
      const card = host.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      let left = rect.left - card.left + (rect.width || 0) / 2 - 80;
      left = Math.max(0, Math.min(left, (card.width || 300) - 160));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, rect.top - card.top - 56)}px`;
    }
  };

  const paintHover = target => {
    const chart = svg._constellation;
    if (!chart) return;
    const focus = target ? constellationFocusKeys(chart, target) : null;
    applyConstellationFocus(svg, focus);
    showTip(focus?.edge ?? null, target);
  };

  const liveArc = () => {
    const chart = svg._constellation;
    if (!chart) return;
    const byKey = new Map(chart.nodes.map(node => [node.key, node]));
    const maxCount = Math.max(1, ...chart.edges.map(edge => edge.count));
    for (const path of svg.querySelectorAll?.('[data-role="edge"]') ?? []) {
      const a = byKey.get(path.getAttribute?.('data-a') || path.dataset?.a);
      const b = byKey.get(path.getAttribute?.('data-b') || path.dataset?.b);
      if (!a || !b) continue;
      const edge = chart.edges.find(item => item.themeA === a.key && item.themeB === b.key);
      if (!edge) continue;
      const geom = arcFor(a, b, { count: edge.count, maxCount });
      path.setAttribute('d', geom.d);
    }
  };

  svg.addEventListener('pointerover', event => {
    const hit = event.target?.closest?.('[data-role="star"], [data-role="edge"]');
    if (!hit) return;
    paintHover(hit);
  });
  svg.addEventListener('pointerleave', () => paintHover(null));
  svg.addEventListener('focusin', event => {
    const hit = event.target?.closest?.('[data-role="star"], [data-role="edge"]');
    if (!hit) return;
    paintHover(hit);
  });
  svg.addEventListener('focusout', event => {
    if (!svg.contains?.(event.relatedTarget)) paintHover(null);
  });

  svg.addEventListener('click', event => {
    if (ignoreClick) {
      ignoreClick = false;
      return;
    }
    const star = event.target?.closest?.('[data-role="star"]');
    if (star) {
      event.stopPropagation();
      const key = star.getAttribute?.('data-theme') || star.dataset?.theme;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        relayoutConstellation(svg, { focus: key, hops: svg._map.hops });
      }, 220);
      return;
    }
    if (event.target?.closest?.('[data-role="edge"]')) return;
    if (event.target === svg || event.target?.getAttribute?.('data-role') === 'axis') {
      relayoutConstellation(svg, { focus: null, hops: null });
    }
  });
  svg.addEventListener('dblclick', event => {
    const star = event.target?.closest?.('[data-role="star"]');
    if (!star) return;
    event.preventDefault();
    clearTimeout(clickTimer);
    const key = star.getAttribute?.('data-theme') || star.dataset?.theme;
    relayoutConstellation(svg, { focus: key, hops: 2 });
  });
  svg.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      relayoutConstellation(svg, { focus: null, hops: null });
      return;
    }
    const star = event.target?.closest?.('[data-role="star"]');
    if (!star) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const key = star.getAttribute?.('data-theme') || star.dataset?.theme;
    relayoutConstellation(svg, { focus: key, hops: svg._map.hops });
  });

  svg.addEventListener('pointerdown', event => {
    const star = event.target?.closest?.('[data-role="star"]');
    if (!star) return;
    const key = star.getAttribute?.('data-theme') || star.dataset?.theme;
    const node = svg._constellation?.nodes.find(item => item.key === key);
    if (!node) return;
    star.setPointerCapture?.(event.pointerId);
    drag = { key, node, startX: event.clientX ?? 0, origin: node.x, moved: false, dx: 0 };
  });
  svg.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = constellationPointerDx(svg, event.clientX, drag.startX);
    if (Math.abs(dx) > 4) drag.moved = true;
    if (!drag.moved) return;
    drag.dx = dx;
    drag.node.x = drag.origin + dx;
    const group = svg.querySelector?.(`[data-theme="${drag.key}"]`);
    group?.removeAttribute?.('data-drift');
    group?.setAttribute('transform', `translate(${dx},0)`);
    svg.classList?.add?.('is-dragging');
    liveArc();
  });
  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    const { key, node, origin, moved, dx } = drag;
    drag = null;
    svg.classList?.remove?.('is-dragging');
    if (!moved) return;
    ignoreClick = true;
    const group = svg.querySelector?.(`[data-theme="${key}"]`);
    const finish = () => {
      node.x = origin;
      group?.setAttribute('transform', 'translate(0,0)');
      liveArc();
    };
    if (!group || prefersQuietMotion()) {
      finish();
      return;
    }
    const fromX = node.x;
    const fromDx = dx;
    const started = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - started) / 420);
      const ease = 1 - (1 - t) ** 3;
      node.x = fromX + (origin - fromX) * ease;
      group.setAttribute('transform', `translate(${fromDx * (1 - ease)},0)`);
      liveArc();
      if (t < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
  });
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

function renderEnergyOrbit(root, model) {
  const svg = root.querySelector('#mind-energy-orbit');
  if (!svg) return;
  const empty = root.querySelector('[data-mind="energy-empty"]');
  const center = root.querySelector('[data-mind="energy-center"]');
  const hint = root.querySelector('[data-mind="energy-hint"]');
  const legend = root.querySelector('[data-mind="energy-legend"]');
  const chart = buildEnergyOrbit(model.energyOrbit ?? [], {
    bounds: model.bounds,
    range: model.range ?? 'monthly',
    previous: model.previousEnergyOrbit ?? []
  });
  if (legend) legend.textContent = chart.legend;

  const hasPoints = chart.points.length > 0;
  if (empty) empty.hidden = hasPoints;
  if (hint) hint.hidden = !hasPoints;
  if (center) center.hidden = !hasPoints;
  if (!hasPoints) {
    svg.replaceChildren?.();
    svg.setAttribute?.('hidden', '');
    svg.hidden = true;
    setEnergyCenter(root, { status: null, period: '', trend: '' });
    return;
  }
  svg.hidden = false;
  svg.removeAttribute?.('hidden');
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);

  const statusEl = root.querySelector('[data-mind="energy-status"]');
  if (statusEl) {
    const dominant = chart.headline.status?.replace(/^Mostly\s+/i, '').toLowerCase();
    statusEl.dataset.energy = dominant || '';
  }
  setEnergyCenter(root, chart.headline);

  const nodes = [];
  for (const tick of chart.angleTicks) {
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
    nodes.push(spoke);
  }

  for (const ring of chart.rings) {
    const grid = createSvg(root, 'circle');
    grid.setAttribute('data-role', 'orbit');
    grid.setAttribute('cx', String(chart.cx));
    grid.setAttribute('cy', String(chart.cy));
    grid.setAttribute('r', String(ring.radius));
    grid.setAttribute('stroke', ring.colour);
    const label = createSvg(root, 'text');
    label.setAttribute('data-role', 'orbit-label');
    label.setAttribute('x', String(ring.labelX));
    label.setAttribute('y', String(ring.labelY));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', ring.colour);
    label.textContent = ring.label;
    nodes.push(grid, label);
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

  for (const callout of chart.callouts) {
    const line = createSvg(root, 'line');
    line.setAttribute('data-role', 'callout-line');
    line.setAttribute('x1', String(callout.x1));
    line.setAttribute('y1', String(callout.y1));
    line.setAttribute('x2', String(callout.x2));
    line.setAttribute('y2', String(callout.y2));
    line.setAttribute('stroke', callout.colour);
    const title = createSvg(root, 'text');
    title.setAttribute('data-role', 'callout-title');
    title.setAttribute('x', String(callout.labelX));
    title.setAttribute('y', String(callout.labelY - 6));
    title.setAttribute('text-anchor', callout.textAnchor);
    title.setAttribute('fill', callout.colour);
    title.textContent = callout.title;
    const when = createSvg(root, 'text');
    when.setAttribute('data-role', 'callout-when');
    when.setAttribute('x', String(callout.labelX));
    when.setAttribute('y', String(callout.labelY + 10));
    when.setAttribute('text-anchor', callout.textAnchor);
    when.setAttribute('fill', callout.colour);
    when.textContent = callout.when;
    nodes.push(line, title, when);
  }

  chart.points.forEach((point, index) => {
    const dot = createSvg(root, 'circle');
    dot.setAttribute('data-role', 'point');
    dot.setAttribute('cx', String(point.x));
    dot.setAttribute('cy', String(point.y));
    dot.setAttribute('r', String(point.r));
    dot.setAttribute('class', 'mind-energy-dot');
    dot.setAttribute('fill', point.colour);
    dot.setAttribute('data-energy', point.energy);
    dot.setAttribute('tabindex', '0');
    dot.setAttribute('role', 'button');
    dot.setAttribute('aria-label', `${formatChartDay(point.date)} — ${point.energy} energy`);
    if (!quietMotion(root)) dot.style.animationDelay = `${Math.min(index * 18, 400)}ms`;
    const title = createSvg(root, 'title');
    title.textContent = `${formatChartDay(point.date)} — ${point.energy} energy`;
    dot.append(title);
    const open = () => openMindThreadSheet(root, {
      title: `${formatChartDay(point.date)} · ${point.energy} energy`,
      rows: [{
        date: point.date,
        title: `${point.energy} energy`,
        excerpt: String(point.body || '').trim() || 'No notes for this day.'
      }],
      continueAgent: 'penelope',
      onContinue: slug => root.querySelector('#mind-dashboard')?._onOpenAgent?.(slug),
      anchor: svg
    });
    dot.addEventListener('click', open);
    dot.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault?.();
        open();
      }
    });
    nodes.push(dot);
  });

  svg.replaceChildren(...nodes);
  animateAreaReveal(svg, quietMotion(root));
}

function setEnergyCenter(root, headline) {
  const status = root.querySelector('[data-mind="energy-status"]');
  const period = root.querySelector('[data-mind="energy-period"]');
  const trend = root.querySelector('[data-mind="energy-trend"]');
  if (status) status.textContent = headline?.status ?? '—';
  if (period) period.textContent = headline?.period ?? '';
  if (trend) {
    trend.textContent = headline?.trend ?? '';
    trend.hidden = !headline?.trend;
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
  const chart = buildThemeTopography(weekly);
  const foot = tile.querySelector?.('[data-role="stream-foot"]');
  const hint = tile.querySelector?.('[data-mind="stream-hint"]');
  const legend = tile.querySelector?.('[data-role="stream-legend"]');
  if (!paintChartOrEmpty(root, tile, svg, {
    need: 1,
    have: chart.bands.length,
    unit: 'weekly theme bands'
  })) {
    if (foot) foot.hidden = true;
    if (hint) hint.hidden = true;
    if (legend) legend.replaceChildren?.();
    return;
  }
  if (foot) foot.hidden = false;
  if (hint) hint.hidden = false;
  paintThemeTopography(root, svg, chart, model);
  paintStreamLegend(root, legend, chart);
}

function paintStreamLegend(root, host, chart) {
  if (!host) return;
  host.replaceChildren();
  for (const band of chart.bands) {
    const item = root.createElement('li');
    const swatch = root.createElement('i');
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.background = band.colour;
    const name = root.createElement('span');
    name.textContent = displayThemeLabel(band.key);
    item.append(swatch, name);
    host.append(item);
  }
}

function paintThemeTopography(root, svg, chart, model) {
  const host = svg.parentNode;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('class', 'mind-stream__chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Theme volume over weeks');

  let tooltip = host?.querySelector?.('[data-role="stream-tooltip"]');
  if (host && !tooltip) {
    tooltip = root.createElement('div');
    tooltip.className = 'mind-stream__tooltip';
    tooltip.dataset.role = 'stream-tooltip';
    tooltip.setAttribute('aria-live', 'polite');
    tooltip.hidden = true;
    host.append(tooltip);
  }

  for (const tick of chart.weeks) {
    const grid = createSvg(root, 'line');
    setSvgClass(grid, `mind-stream__grid${tick.now ? ' is-now' : ''}`);
    grid.setAttribute('x1', String(tick.x));
    grid.setAttribute('x2', String(tick.x));
    grid.setAttribute('y1', String(chart.pad.top));
    grid.setAttribute('y2', String(chart.height - chart.pad.bottom));
    svg.append(grid);
    if (!tick.show) continue;
    const label = createSvg(root, 'text');
    setSvgClass(label, 'mind-stream__week');
    label.setAttribute('x', String(tick.x));
    label.setAttribute('y', String(chart.height - 22));
    label.setAttribute('text-anchor', tick.now ? 'end' : 'middle');
    label.textContent = tick.now ? `${tick.label} now` : tick.label;
    svg.append(label);
  }

  const weekHits = createSvg(root, 'g');
  weekHits.setAttribute('data-role', 'weeks');
  const colW = chart.weeks.length > 1
    ? (chart.width - chart.pad.left - chart.pad.right) / (chart.weeks.length - 1)
    : 48;
  for (const tick of chart.weeks) {
    const hit = createSvg(root, 'rect');
    hit.setAttribute('data-role', 'week');
    hit.setAttribute('data-week', tick.week);
    hit.setAttribute('x', String(tick.x - colW / 2));
    hit.setAttribute('y', String(chart.height - chart.pad.bottom));
    hit.setAttribute('width', String(Math.max(colW, 24)));
    hit.setAttribute('height', String(chart.pad.bottom));
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', `Notes week of ${tick.range}`);
    bindMark(hit, root, {
      title: tick.range,
      rows: weekRows(model, tick.week),
      continueAgent: 'vera'
    });
    weekHits.append(hit);
  }
  svg.append(weekHits);

  const territories = createSvg(root, 'g');
  territories.setAttribute('data-role', 'bands');
  for (const band of chart.bands) {
    const group = createSvg(root, 'g');
    setSvgClass(group, 'mind-stream__band');
    group.setAttribute('data-theme', band.key);
    const fill = createSvg(root, 'path');
    setSvgClass(fill, 'mind-stream__fill');
    fill.setAttribute('d', band.d);
    fill.setAttribute('fill', band.colour);
    fill.setAttribute('data-theme', band.key);
    fill.setAttribute('tabindex', '0');
    fill.setAttribute('role', 'button');
    fill.setAttribute('aria-label', displayThemeLabel(band.key));
    bindMark(fill, root, {
      title: displayThemeLabel(band.key),
      rows: themeRows(model, band.key),
      continueAgent: 'vera'
    });
    group.append(fill);
    for (const contour of band.contours) {
      const line = createSvg(root, 'path');
      setSvgClass(line, 'mind-stream__contour');
      line.setAttribute('d', contour.d);
      line.setAttribute('stroke', band.colour);
      line.setAttribute('fill', 'none');
      line.setAttribute('pointer-events', 'none');
      group.append(line);
    }
    for (const sample of band.samples) {
      const hit = createSvg(root, 'circle');
      setSvgClass(hit, 'mind-stream__sample');
      hit.setAttribute('data-role', 'sample');
      hit.setAttribute('data-theme', band.key);
      hit.setAttribute('data-week', sample.week);
      hit.setAttribute('cx', String(sample.x));
      hit.setAttribute('cy', String(sample.midY));
      hit.setAttribute('r', String(Math.max(10, Math.abs(sample.y1 - sample.y0) / 2)));
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button');
      hit.setAttribute('aria-label', `${displayThemeLabel(band.key)} ${sample.week}`);
      bindMark(hit, root, {
        title: `${displayThemeLabel(band.key)} · ${sample.week}`,
        rows: entriesForThemeWeek(model.diary ?? [], model.sessions ?? [], band.key, sample.week),
        continueAgent: 'vera'
      });
      group.append(hit);
    }
    const name = createSvg(root, 'text');
    setSvgClass(name, 'mind-stream__label');
    name.setAttribute('data-theme', band.key);
    name.setAttribute('x', String(band.labelX));
    name.setAttribute('y', String(band.labelY + 4));
    name.setAttribute('pointer-events', 'none');
    name.textContent = displayThemeLabel(band.key);
    group.append(name);
    if (band.end) {
      const end = createSvg(root, 'circle');
      setSvgClass(end, 'mind-stream__end');
      end.setAttribute('cx', String(band.end.x));
      end.setAttribute('cy', String(band.end.y));
      end.setAttribute('r', '4.5');
      end.setAttribute('fill', band.colour);
      end.setAttribute('pointer-events', 'none');
      group.append(end);
    }
    territories.append(group);
  }
  svg.append(territories);
  svg._topography = chart;
  bindStreamHover(svg, host);
}

function streamTooltipCopy(chart, theme, week) {
  const band = chart.bands.find(item => item.key === theme);
  if (!band) return displayThemeLabel(theme);
  const sample = week
    ? band.samples.find(item => item.week === week)
    : band.samples.at(-1);
  const bits = [displayThemeLabel(theme)];
  if (sample?.peak) bits.push('Peak this week');
  if (sample) bits.push(`${sample.count} mention${sample.count === 1 ? '' : 's'}`);
  if (sample?.dir === 'up') bits.push(`↑ ${Math.abs(sample.pct)}% from last week`);
  else if (sample?.dir === 'down') bits.push(`↓ ${Math.abs(sample.pct)}% from last week`);
  else if (sample) bits.push('Holding vs last week');
  return bits.join(' · ');
}

function bindStreamHover(svg, host) {
  if (svg.dataset.hoverBound) return;
  svg.dataset.hoverBound = '1';
  const tooltip = () => host?.querySelector?.('[data-role="stream-tooltip"]');
  const paint = (theme, week, node) => {
    const chart = svg._topography;
    const on = Boolean(theme);
    setSvgClass(svg, on ? 'mind-stream__chart is-focusing' : 'mind-stream__chart');
    for (const band of svg.querySelectorAll?.('.mind-stream__band') ?? []) {
      const key = band.getAttribute?.('data-theme') || band.dataset?.theme;
      const hit = key === theme;
      setSvgClass(band, [
        'mind-stream__band',
        on && hit ? 'is-hot' : '',
        on && !hit ? 'is-dim' : ''
      ].filter(Boolean).join(' '));
    }
    const tip = tooltip();
    if (!tip) return;
    if (!theme || !chart) {
      tip.hidden = true;
      return;
    }
    tip.textContent = streamTooltipCopy(chart, theme, week);
    tip.hidden = false;
    if (node?.getBoundingClientRect && host?.getBoundingClientRect && tip.style) {
      const card = host.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      let left = rect.left - card.left + (rect.width || 0) / 2 - 90;
      left = Math.max(0, Math.min(left, (card.width || 300) - 180));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, rect.top - card.top - 44)}px`;
    }
  };
  svg.addEventListener('pointerover', event => {
    const hit = event.target?.closest?.('[data-theme], [data-role="sample"]');
    if (!hit) return;
    paint(
      hit.getAttribute?.('data-theme') || hit.dataset?.theme,
      hit.getAttribute?.('data-week') || hit.dataset?.week,
      hit
    );
  });
  svg.addEventListener('pointerleave', () => paint(null));
  svg.addEventListener('focusin', event => {
    const hit = event.target?.closest?.('[data-theme], [data-role="sample"]');
    if (!hit) return;
    paint(
      hit.getAttribute?.('data-theme') || hit.dataset?.theme,
      hit.getAttribute?.('data-week') || hit.dataset?.week,
      hit
    );
  });
  svg.addEventListener('focusout', event => {
    if (!svg.contains?.(event.relatedTarget)) paint(null);
  });
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
  const weekly = model.themeWeekly ?? null;
  const themes = weekly?.themes ?? Object.keys(ranks[0]?.rankByTheme ?? {});
  const chart = buildBumpChart({ ranks, weekly, themes });
  const foot = tile.querySelector?.('[data-role="bump-foot"]');
  const hint = tile.querySelector?.('[data-mind="bump-hint"]');
  const legend = tile.querySelector?.('[data-role="bump-legend"]');
  if (!paintChartOrEmpty(root, tile, svg, {
    need: 2,
    have: chart.empty ? 0 : ranks.length,
    unit: 'weeks with ranks'
  })) {
    if (foot) foot.hidden = true;
    if (hint) hint.hidden = true;
    if (legend) legend.replaceChildren?.();
    return;
  }
  if (foot) foot.hidden = false;
  if (hint) hint.hidden = false;
  paintBumpChart(root, svg, chart, model);
  paintBumpLegend(root, legend, chart);
}

function trendMark(dir) {
  if (dir === 'up') return '↑';
  if (dir === 'down') return '↓';
  return '—';
}

function paintBumpLegend(root, host, chart) {
  if (!host) return;
  host.replaceChildren();
  for (const line of chart.lines) {
    const item = root.createElement('li');
    const swatch = root.createElement('i');
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.background = line.colour;
    const name = root.createElement('span');
    name.textContent = displayThemeLabel(line.key);
    item.append(swatch, name);
    host.append(item);
  }
}

function weekRows(model, weekStart) {
  const to = addCalendarDays(weekStart, 6);
  const rows = [];
  for (const entry of model.diary ?? []) {
    if (entry.date < weekStart || entry.date > to) continue;
    rows.push({
      date: entry.date,
      title: entry.title ?? 'Diary',
      excerpt: String(entry.body || '').slice(0, 140)
    });
  }
  for (const session of model.sessions ?? []) {
    if (session.date < weekStart || session.date > to) continue;
    rows.push({
      date: session.date,
      title: session.title ?? 'Session',
      excerpt: String(session.body || session.insight || session.observation || '').slice(0, 140)
    });
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function paintBumpChart(root, svg, chart, model) {
  const host = svg.parentNode;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('class', 'mind-bump__chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Theme rank by week');

  let tooltip = host?.querySelector?.('[data-role="bump-tooltip"]');
  if (host && !tooltip) {
    tooltip = root.createElement('div');
    tooltip.className = 'mind-bump__tooltip';
    tooltip.dataset.role = 'bump-tooltip';
    tooltip.setAttribute('aria-live', 'polite');
    tooltip.hidden = true;
    host.append(tooltip);
  }

  const rankTitle = createSvg(root, 'text');
  setSvgClass(rankTitle, 'mind-bump__axis-kicker');
  rankTitle.setAttribute('x', String(chart.pad.left));
  rankTitle.setAttribute('y', String(chart.pad.top - 10));
  rankTitle.textContent = 'Rank';
  svg.append(rankTitle);

  for (const row of chart.ranks) {
    const grid = createSvg(root, 'line');
    setSvgClass(grid, 'mind-bump__grid');
    grid.setAttribute('x1', String(chart.pad.left));
    grid.setAttribute('x2', String(chart.width - chart.pad.right));
    grid.setAttribute('y1', String(row.y));
    grid.setAttribute('y2', String(row.y));
    const label = createSvg(root, 'text');
    setSvgClass(label, 'mind-bump__rank');
    label.setAttribute('x', String(chart.pad.left - 10));
    label.setAttribute('y', String(row.y + 4));
    label.setAttribute('text-anchor', 'end');
    label.textContent = String(row.rank);
    svg.append(grid, label);
  }

  const weekHits = createSvg(root, 'g');
  weekHits.setAttribute('data-role', 'weeks');
  for (const tick of chart.weeks) {
    const hit = createSvg(root, 'rect');
    hit.setAttribute('data-role', 'week');
    hit.setAttribute('data-week', tick.week);
    hit.setAttribute('x', String(tick.x - 16));
    hit.setAttribute('y', String(chart.pad.top));
    hit.setAttribute('width', '32');
    hit.setAttribute('height', String(chart.height - chart.pad.top - chart.pad.bottom));
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', `Notes week of ${tick.label}`);
    bindMark(hit, root, {
      title: tick.label,
      rows: weekRows(model, tick.week),
      continueAgent: 'vera'
    });
    weekHits.append(hit);
    if (!tick.show) continue;
    const label = createSvg(root, 'text');
    setSvgClass(label, 'mind-bump__week');
    label.setAttribute('x', String(tick.x));
    label.setAttribute('y', String(chart.height - 18));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = tick.label;
    svg.append(label);
  }
  svg.append(weekHits);

  const paths = createSvg(root, 'g');
  paths.setAttribute('data-role', 'lines');
  for (const line of chart.lines) {
    const group = createSvg(root, 'g');
    setSvgClass(group, 'mind-bump__series');
    group.setAttribute('data-theme', line.key);
    const path = createSvg(root, 'path');
    setSvgClass(path, 'mind-bump__path');
    path.setAttribute('d', line.d);
    path.setAttribute('stroke', line.colour);
    path.setAttribute('fill', 'none');
    path.setAttribute('pointer-events', 'none');
    group.append(path);
    for (const point of line.points) {
      const dot = createSvg(root, 'circle');
      setSvgClass(dot, 'mind-bump__dot');
      dot.setAttribute('data-role', 'dot');
      dot.setAttribute('data-theme', line.key);
      dot.setAttribute('data-week', point.week);
      dot.setAttribute('cx', String(point.x));
      dot.setAttribute('cy', String(point.y));
      dot.setAttribute('r', String(point.r));
      dot.setAttribute('fill', line.colour);
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('role', 'button');
      dot.setAttribute('aria-label', `${displayThemeLabel(line.key)} ${point.week} rank ${point.rank}`);
      bindMark(dot, root, {
        title: `${displayThemeLabel(line.key)} · ${point.week}`,
        rows: entriesForThemeWeek(model.diary ?? [], model.sessions ?? [], line.key, point.week),
        continueAgent: 'vera'
      });
      group.append(dot);
    }
    const label = createSvg(root, 'text');
    setSvgClass(label, `mind-bump__label is-${line.dir}`);
    label.setAttribute('data-role', 'label');
    label.setAttribute('data-theme', line.key);
    label.setAttribute('x', String(chart.width - chart.pad.right + 14));
    label.setAttribute('y', String(line.labelY + 4));
    label.setAttribute('tabindex', '0');
    label.setAttribute('role', 'button');
    label.textContent = `${displayThemeLabel(line.key)}  ${line.lastRank ?? '—'}  ${trendMark(line.dir)}`;
    bindMark(label, root, {
      title: displayThemeLabel(line.key),
      rows: themeRows(model, line.key),
      continueAgent: 'vera'
    });
    group.append(label);
    paths.append(group);
  }
  svg.append(paths);
  svg._bump = chart;
  bindBumpHover(svg, host);
}

function bindBumpHover(svg, host) {
  if (svg.dataset.hoverBound) return;
  svg.dataset.hoverBound = '1';
  const tooltip = () => host?.querySelector?.('[data-role="bump-tooltip"]');
  const paint = (theme, week, node) => {
    const chart = svg._bump;
    const on = Boolean(theme);
    setSvgClass(svg, on ? 'mind-bump__chart is-focusing' : 'mind-bump__chart');
    for (const series of svg.querySelectorAll?.('.mind-bump__series') ?? []) {
      const key = series.getAttribute?.('data-theme') || series.dataset?.theme;
      const hit = key === theme;
      setSvgClass(series, [
        'mind-bump__series',
        on && hit ? 'is-hot' : '',
        on && !hit ? 'is-dim' : ''
      ].filter(Boolean).join(' '));
    }
    const tip = tooltip();
    if (!tip) return;
    if (!theme || !chart) {
      tip.hidden = true;
      return;
    }
    const line = chart.lines.find(item => item.key === theme);
    const point = week ? line?.points.find(item => item.week === week) : line?.points.at(-1);
    const bits = [displayThemeLabel(theme)];
    if (point) bits.push(`rank ${point.rank}`, point.count ? `${point.count} mentions` : 'no mentions');
    if (line) bits.push(line.dir === 'up' ? 'rising' : line.dir === 'down' ? 'falling' : 'holding');
    tip.textContent = bits.join(' · ');
    tip.hidden = false;
    if (node?.getBoundingClientRect && host?.getBoundingClientRect && tip.style) {
      const card = host.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      let left = rect.left - card.left + (rect.width || 0) / 2 - 80;
      left = Math.max(0, Math.min(left, (card.width || 300) - 160));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, rect.top - card.top - 40)}px`;
    }
  };
  svg.addEventListener('pointerover', event => {
    const hit = event.target?.closest?.('[data-theme], [data-role="dot"], [data-role="label"]');
    if (!hit) return;
    paint(
      hit.getAttribute?.('data-theme') || hit.dataset?.theme,
      hit.getAttribute?.('data-week') || hit.dataset?.week,
      hit
    );
  });
  svg.addEventListener('pointerleave', () => paint(null));
  svg.addEventListener('focusin', event => {
    const hit = event.target?.closest?.('[data-theme], [data-role="dot"], [data-role="label"]');
    if (!hit) return;
    paint(
      hit.getAttribute?.('data-theme') || hit.dataset?.theme,
      hit.getAttribute?.('data-week') || hit.dataset?.week,
      hit
    );
  });
  svg.addEventListener('focusout', event => {
    if (!svg.contains?.(event.relatedTarget)) paint(null);
  });
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
  const previous = model.date && model.range
    ? previousRangeWindow(model.date, model.range)
    : null;
  const inWindow = (entry, bounds) => entry.date >= bounds.from && entry.date <= bounds.to;
  const mood = (model.diary ?? [])
    .filter(entry => model.bounds && inWindow(entry, model.bounds) && entry.mood_score != null)
    .map(entry => ({ date: entry.date, value: entry.mood_score, mood: entry.mood }));
  const energy = (model.energyOrbit ?? []).map(entry => ({ date: entry.date, energy: entry.energy }));
  const previousMood = previous
    ? (model.diary ?? [])
      .filter(entry => inWindow(entry, previous) && entry.mood_score != null)
      .map(entry => ({ date: entry.date, value: entry.mood_score, mood: entry.mood }))
    : [];
  const chart = buildMetricStrip({
    bounds: model.bounds,
    range: model.range ?? 'monthly',
    mood,
    energy,
    previousMood,
    previousEnergy: model.previousEnergyOrbit ?? []
  });
  const foot = tile.querySelector?.('[data-role="strip-foot"]');
  const hint = tile.querySelector?.('[data-mind="strip-hint"]');
  if (!paintChartOrEmpty(root, tile, null, { need: 1, have: chart.bands.length, unit: 'metrics' })) {
    host.replaceChildren();
    if (foot) foot.hidden = true;
    if (hint) hint.hidden = true;
    return;
  }
  if (foot) foot.hidden = false;
  if (hint) hint.hidden = false;
  paintMetricStrip(root, host, chart, model);
  const moodSummary = tile.querySelector?.('[data-mind="strip-mood"]');
  const energySummary = tile.querySelector?.('[data-mind="strip-energy"]');
  if (moodSummary) {
    moodSummary.textContent = chart.summary.mood ? `Mood · ${chart.summary.mood}` : 'Mood —';
  }
  if (energySummary) {
    const mark = chart.summary.energyDir === 'down' ? '↓ ' : chart.summary.energyDir === 'up' ? '↑ ' : '';
    energySummary.textContent = chart.summary.energy ? `Energy · ${mark}${chart.summary.energy}` : 'Energy —';
    energySummary.dataset.dir = chart.summary.energyDir || 'flat';
  }
}

function paintMetricStrip(root, host, chart, model) {
  host.replaceChildren();
  host.className = `${String(host.className || '').replace(/\bmind-metric-strip\b/g, '').trim()} mind-metric-strip`.trim();
  const tooltip = root.createElement('div');
  tooltip.className = 'mind-metric-strip__tooltip';
  tooltip.dataset.role = 'strip-tooltip';
  tooltip.setAttribute('aria-live', 'polite');
  tooltip.hidden = true;
  host.append(tooltip);

  for (const band of chart.bands) {
    const row = root.createElement('div');
    row.className = 'mind-metric-strip__band';
    row.dataset.band = band.key;
    const meta = root.createElement('div');
    meta.className = 'mind-metric-strip__meta';
    const mark = root.createElement('i');
    mark.className = 'mind-metric-strip__mark';
    mark.setAttribute('aria-hidden', 'true');
    const copy = root.createElement('div');
    const name = root.createElement('p');
    name.className = 'mind-metric-strip__name';
    name.textContent = band.label;
    const blurb = root.createElement('p');
    blurb.className = 'mind-metric-strip__blurb';
    blurb.textContent = band.blurb;
    copy.append(name, blurb);
    meta.append(mark, copy);
    const plot = root.createElement('div');
    plot.className = 'mind-metric-strip__plot';
    const svg = createSvg(root, 'svg');
    svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.bandHeight}`);
    svg.setAttribute('class', 'mind-metric-strip__chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${band.label} by day`);
    for (const y of [0.08, 0.42, 0.72].map(ratio => ratio * chart.bandHeight)) {
      const guide = createSvg(root, 'line');
      guide.setAttribute('data-role', 'guide');
      guide.setAttribute('x1', '0');
      guide.setAttribute('x2', String(chart.width));
      guide.setAttribute('y1', String(y));
      guide.setAttribute('y2', String(y));
      svg.append(guide);
    }
    for (const tick of chart.axis) {
      if (!tick.show) continue;
      const divider = createSvg(root, 'line');
      divider.setAttribute('data-role', 'divider');
      divider.setAttribute('x1', String(tick.x));
      divider.setAttribute('x2', String(tick.x));
      divider.setAttribute('y1', '0');
      divider.setAttribute('y2', String(chart.bandHeight));
      svg.append(divider);
    }
    const hair = createSvg(root, 'line');
    hair.setAttribute('data-role', 'hairline');
    hair.setAttribute('y1', '0');
    hair.setAttribute('y2', String(chart.bandHeight));
    hair.setAttribute('x1', '0');
    hair.setAttribute('x2', '0');
    hair.setAttribute('opacity', '0');
    svg.append(hair);
    for (const tick of band.ticks) {
      const hit = createSvg(root, 'rect');
      hit.setAttribute('data-role', 'day');
      hit.setAttribute('data-date', tick.date);
      hit.setAttribute('x', String(tick.hitX));
      hit.setAttribute('y', '0');
      hit.setAttribute('width', String(Math.max(tick.hitWidth, 6)));
      hit.setAttribute('height', String(chart.bandHeight));
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button');
      hit.setAttribute('aria-label', `${band.label} ${formatChartDay(tick.date)}`);
      const line = createSvg(root, 'rect');
      line.setAttribute('data-role', 'tick');
      line.setAttribute('x', String(tick.x));
      line.setAttribute('y', String(tick.y));
      line.setAttribute('width', String(tick.width));
      line.setAttribute('height', String(tick.height));
      line.setAttribute('rx', '1');
      line.setAttribute('fill', band.colour);
      line.setAttribute('opacity', String(tick.opacity));
      line.setAttribute('pointer-events', 'none');
      bindMark(hit, root, {
        title: formatChartDay(tick.date),
        rows: dateRows(model, tick.date),
        continueAgent: 'penelope'
      });
      svg.append(hit, line);
    }
    plot.append(svg);
    const scale = root.createElement('div');
    scale.className = 'mind-metric-strip__scale';
    for (const label of ['High', 'Medium', 'Low']) {
      const item = root.createElement('span');
      item.textContent = label;
      scale.append(item);
    }
    row.append(meta, plot, scale);
    host.append(row);
  }

  const axis = root.createElement('div');
  axis.className = 'mind-metric-strip__axis';
  const spacer = root.createElement('div');
  spacer.className = 'mind-metric-strip__axis-spacer';
  const ticks = root.createElement('div');
  ticks.className = 'mind-metric-strip__axis-plot';
  for (const tick of chart.axis) {
    if (!tick.show) continue;
    const label = root.createElement('span');
    label.className = 'mind-metric-strip__axis-tick';
    label.textContent = tick.label;
    label.style.left = `${(tick.x / chart.width) * 100}%`;
    ticks.append(label);
  }
  const scalePad = root.createElement('div');
  scalePad.className = 'mind-metric-strip__axis-pad';
  axis.append(spacer, ticks, scalePad);
  host.append(axis);
  host._metricStrip = chart;
  bindMetricStripHover(host, chart);
}

function bindMetricStripHover(host, chart) {
  if (host.dataset.hoverBound) return;
  host.dataset.hoverBound = '1';
  const tooltip = () => host.querySelector?.('[data-role="strip-tooltip"]');
  const highlight = (date, node) => {
    const live = host._metricStrip ?? chart;
    for (const hair of host.querySelectorAll?.('[data-role="hairline"]') ?? []) {
      if (!date) {
        hair.setAttribute('opacity', '0');
        continue;
      }
      const dayIndex = live.days.indexOf(date);
      if (dayIndex < 0) continue;
      const x = ((dayIndex + 0.5) / Math.max(live.days.length, 1)) * live.width;
      hair.setAttribute('x1', String(x));
      hair.setAttribute('x2', String(x));
      hair.setAttribute('opacity', '1');
    }
    const tip = tooltip();
    if (!tip) return;
    if (!date) {
      tip.hidden = true;
      return;
    }
    const bits = [formatChartDay(date)];
    for (const band of live.bands) {
      const tick = band.ticks.find(item => item.date === date);
      if (!tick) continue;
      if (band.key === 'mood') bits.push(`Mood ${tick.mood ?? tick.level} ${tick.value ?? ''}`.trim());
      else bits.push(`Energy ${tick.energy ?? tick.level}`);
    }
    tip.textContent = bits.join(' · ');
    tip.hidden = false;
    if (node?.getBoundingClientRect && host.getBoundingClientRect && tip.style) {
      const card = host.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      let left = rect.left - card.left + rect.width / 2 - 80;
      left = Math.max(0, Math.min(left, (card.width || 300) - 160));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, rect.top - card.top - 44)}px`;
    }
  };
  host.addEventListener('pointerover', event => {
    const day = event.target?.closest?.('[data-role="day"]');
    if (!day) return;
    highlight(day.getAttribute?.('data-date') || day.dataset?.date, day);
  });
  host.addEventListener('focusin', event => {
    const day = event.target?.closest?.('[data-role="day"]');
    if (!day) return;
    highlight(day.getAttribute?.('data-date') || day.dataset?.date, day);
  });
  host.addEventListener('pointerleave', () => highlight(null));
  host.addEventListener('focusout', event => {
    if (!host.contains?.(event.relatedTarget)) highlight(null);
  });
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
  const tile = root.querySelector('#mind-tile-lexical') ?? host;
  const series = model.lexical ?? [];
  const chart = buildWatchlistHeat(series);
  const table = tile.querySelector?.('[data-role="lexical-table"]') ?? null;
  if (!paintChartOrEmpty(root, tile, null, { need: 1, have: series.length, unit: 'watchlist terms' })) {
    host.replaceChildren();
    if (table) table.hidden = true;
    bindLexicalChrome(root, tile, series, onWatchlistChange);
    return;
  }

  paintWatchlistHeat(root, host, chart, model);
  paintLexicalTable(root, tile, chart);
  bindLexicalChrome(root, tile, series, onWatchlistChange);
}

function deltaCopy(delta) {
  if (!delta || delta.dir === 'flat') return { dir: 'flat', text: 'steady' };
  return {
    dir: delta.dir,
    text: `${Math.abs(Number(delta.pct) || 0)}%`
  };
}

function paintWatchlistHeat(root, host, chart, model) {
  host.replaceChildren();
  host.className = `${String(host.className || '').replace(/\bmind-watchlist__grid\b/g, '').trim()} mind-watchlist__grid`.trim();
  const tooltip = root.createElement('div');
  tooltip.className = 'mind-watchlist__tooltip';
  tooltip.hidden = true;
  tooltip.dataset.role = 'lexical-tooltip';
  host.append(tooltip);

  for (const row of chart.rows) {
    const line = root.createElement('div');
    line.className = 'mind-watchlist__row';
    const meta = root.createElement('div');
    meta.className = 'mind-watchlist__meta';
    const name = root.createElement('p');
    name.className = 'mind-watchlist__term';
    const dot = root.createElement('i');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.background = row.colour;
    const term = root.createElement('span');
    term.textContent = row.term;
    name.append(dot, term);
    const sub = root.createElement('p');
    sub.className = 'mind-watchlist__sub';
    const last = root.createElement('strong');
    last.textContent = String(row.last);
    const rest = root.createElement('span');
    rest.textContent = ' this week · ';
    const delta = deltaCopy(row.delta);
    const shift = root.createElement('span');
    shift.className = `mind-watchlist__delta is-${delta.dir}`;
    const arrow = delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '▬';
    shift.textContent = `${arrow} ${delta.text}`;
    sub.append(last, rest, shift);
    meta.append(name, sub);
    const cells = root.createElement('div');
    cells.className = 'mind-watchlist__cells';
    row.cells.forEach((cell, index) => {
      const button = root.createElement('button');
      button.type = 'button';
      button.className = cell.zero ? 'mind-watchlist__cell is-zero' : 'mind-watchlist__cell';
      button.dataset.index = String(index);
      button.dataset.term = row.term;
      button.dataset.count = String(cell.count);
      button.setAttribute('aria-label', `${row.term}, week of ${chart.axis[index]?.label ?? cell.date}: ${cell.count} ${cell.count === 1 ? 'mention' : 'mentions'}`);
      if (!cell.zero) {
        button.style.background = `color-mix(in srgb, ${row.colour} ${Math.round(cell.mix)}%, var(--warm-white))`;
      }
      const weekTo = addCalendarDays(cell.date, 6);
      const to = model.bounds?.to && weekTo > model.bounds.to ? model.bounds.to : weekTo;
      bindMark(button, root, {
        title: `${row.term} · ${chart.axis[index]?.label ?? cell.date}`,
        rows: entriesForWatchlistTerm(model.diary ?? [], model.sessions ?? [], row.term, {
          from: cell.date,
          to
        }),
        continueAgent: 'vera'
      });
      cells.append(button);
    });
    line.append(meta, cells);
    host.append(line);
  }

  const axis = root.createElement('div');
  axis.className = 'mind-watchlist__axis';
  const spacer = root.createElement('div');
  spacer.className = 'mind-watchlist__axis-spacer';
  const ticks = root.createElement('div');
  ticks.className = 'mind-watchlist__axis-cells';
  for (const tick of chart.axis) {
    const span = root.createElement('span');
    if (tick.show) span.textContent = tick.label;
    ticks.append(span);
  }
  axis.append(spacer, ticks);
  host.append(axis);
  host._watchlistChart = chart;
  bindWatchlistHover(host);
}

function paintLexicalTable(root, tile, chart) {
  const table = tile.querySelector?.('[data-role="lexical-table"]');
  const head = tile.querySelector?.('[data-role="lexical-table-head"]');
  const body = tile.querySelector?.('[data-role="lexical-table-body"]');
  if (!table || !head || !body) return;
  const headRow = root.createElement('tr');
  const weekHead = root.createElement('th');
  weekHead.scope = 'col';
  weekHead.textContent = 'Week';
  headRow.append(weekHead);
  for (const row of chart.rows) {
    const th = root.createElement('th');
    th.scope = 'col';
    th.textContent = row.term;
    headRow.append(th);
  }
  head.replaceChildren(headRow);
  const rows = [];
  chart.axis.forEach((tick, index) => {
    const tr = root.createElement('tr');
    const th = root.createElement('th');
    th.scope = 'row';
    th.textContent = tick.label;
    tr.append(th);
    for (const row of chart.rows) {
      const td = root.createElement('td');
      td.textContent = String(row.cells[index]?.count ?? 0);
      tr.append(td);
    }
    rows.push(tr);
  });
  body.replaceChildren(...rows);
}

function bindLexicalChrome(root, tile, series, onWatchlistChange) {
  const toggle = tile.querySelector?.('[data-mind="lexical-table-toggle"]');
  const table = tile.querySelector?.('[data-role="lexical-table"]');
  const grid = tile.querySelector?.('#mind-lexical');
  if (toggle && table && !toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.textContent = expanded ? 'Table view' : 'Grid view';
      table.hidden = expanded;
      if (grid) grid.hidden = !expanded;
    });
  }
  let form = tile.querySelector?.('[data-mind="lexical-form"]') ?? tile.querySelector?.('.mind-lexical-form');
  if (!form) {
    form = root.createElement('form');
    form.className = 'mind-lexical-form';
    form.dataset.mind = 'lexical-form';
    const input = root.createElement('input');
    input.type = 'text';
    input.maxLength = 24;
    input.setAttribute('aria-label', 'Add watchlist term');
    input.setAttribute('placeholder', 'Add a term to watch, e.g. “overwhelmed”');
    const button = root.createElement('button');
    button.type = 'submit';
    button.className = 'btn btn--primary';
    button.textContent = 'Watch';
    form.append(input, button);
    tile.append(form);
  }
  if (form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', event => {
    event.preventDefault?.();
    const input = form.querySelector?.('input');
    const term = String(input?.value ?? '').trim().toLowerCase();
    if (!term) return;
    if (input) input.value = '';
    onWatchlistChange?.([...new Set([...series.map(item => item.term), term])]);
  });
}

function bindWatchlistHover(host) {
  if (host.dataset.hoverBound) return;
  host.dataset.hoverBound = '1';
  const tooltip = () => host.querySelector?.('[data-role="lexical-tooltip"]');
    const highlight = (index, cell) => {
    const chart = host._watchlistChart;
    for (const node of host.querySelectorAll?.('.mind-watchlist__cell') ?? []) {
      node.classList?.toggle?.('is-col', Number(node.dataset.index) === index);
    }
    const tip = tooltip();
    if (!tip || index == null || !chart) {
      if (tip) tip.hidden = true;
      return;
    }
    const tick = chart.axis[index];
    const lines = [`${tick?.label ?? ''}`];
    for (const row of chart.rows) {
      lines.push(`${row.term} ${row.cells[index]?.count ?? 0}`);
    }
    tip.textContent = lines.join(' · ');
    tip.hidden = false;
    if (cell?.getBoundingClientRect && host.getBoundingClientRect && tip.style) {
      const card = host.getBoundingClientRect();
      const rect = cell.getBoundingClientRect();
      let left = rect.left - card.left + rect.width / 2 - 80;
      let top = rect.top - card.top - 8;
      left = Math.max(0, Math.min(left, (card.width || 300) - 160));
      if (top < 60) top = rect.bottom - card.top + 10;
      else top -= 48;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }
  };
  host.addEventListener('pointerover', event => {
    const cell = event.target?.closest?.('.mind-watchlist__cell');
    if (!cell) return;
    highlight(Number(cell.dataset.index), cell);
  });
  host.addEventListener('focusin', event => {
    const cell = event.target?.closest?.('.mind-watchlist__cell');
    if (!cell) return;
    highlight(Number(cell.dataset.index), cell);
  });
  host.addEventListener('pointerleave', () => highlight(null));
  host.addEventListener('focusout', event => {
    if (!host.contains?.(event.relatedTarget)) highlight(null);
  });
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
