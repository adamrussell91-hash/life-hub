import { buildWatchlistHeat } from './chart-kit/watchlist-heat.js';
import { animateRingFill } from './chart-kit/animate.js';
import { CLINICAL_CHART_SLOTS } from './chart-kit/clinical-slots.js';
import { buildHorizonBands } from './chart-kit/horizon.js';
import { packMasonry } from './chart-kit/masonry.js';
import { buildRadialYear } from './chart-kit/radial-year.js';
import { buildThemeTopography } from './chart-kit/stream.js';
import { buildChordLayout } from './chart-kit/chord-layout.js';
import { buildCompletionRing, focusCrossAgentEdges, hitMapFromSeries, scanTrendBlocks, weekHorizonMetrics } from './central-node-charts.js';
import { renderInlineMarkdown } from './render-chat.js';
import { createLabeledProgress } from '../../../../packages/design-kit/js/hub-surfaces.js';
import { formatGrams } from '../core/aggregate.js';

const TILE_FALLBACK_HEIGHT = 160;
const PACK_GAP = 12;

const SECTION_SELECTORS = {
  todaysStatus: '[data-central-node="todays-status"]',
  thisWeek: '[data-central-node="this-week"]',
  thisMonth: '[data-central-node="this-month"]',
  longTermTrends: '[data-central-node="long-term-trends"]',
  crossAgentCoordination: '[data-central-node="cross-agent"]',
  recentAgentActions: '[data-central-node="recent-actions"]',
  constraints: '[data-central-node="constraints"]',
  backlinks: '[data-central-node="backlinks"]',
  urlWatches: '[data-central-node="url-watches"]'
};

export function renderCentralNode(root, model) {
  for (const [key, selector] of Object.entries(SECTION_SELECTORS)) {
    const container = root.querySelector(selector);
    if (!container) continue;
    const prose = model.sections?.[key]?.trim?.() ?? '';
    if (key === 'todaysStatus') {
      if (prose) renderInlineMarkdown(root, container, prose, { multiline: true });
      else container.textContent = 'No agent notes yet.';
      continue;
    }
    if (key === 'thisWeek' || key === 'thisMonth' || key === 'longTermTrends' || key === 'crossAgentCoordination') {
      if (prose && key !== 'longTermTrends' && key !== 'crossAgentCoordination') {
        renderInlineMarkdown(root, container, prose, { multiline: true });
        container.removeAttribute('hidden');
      } else {
        container.textContent = '';
        container.setAttribute('hidden', '');
      }
      continue;
    }
    if (key === 'backlinks') {
      renderBacklinks(root, container, model.inverseLinks);
      continue;
    }
    if (key === 'urlWatches') {
      renderUrlWatches(root, container, model.urlWatches);
      continue;
    }
    renderInlineMarkdown(root, container, model.sections[key], { multiline: true });
  }

  renderLiveStatus(root, model.liveStatus);
  renderCompletionRing(root, model.completeness);
  renderDayProgress(root, model.completeness);
  bindCnBoard(root);
  renderWeekHorizon(root, model);
  renderRadialYear(root, model);
  renderStreamTile(root, model);
  renderTrendScan(root, model);
  renderChordTile(root, model);
  renderGovernanceHeat(root, model);
  packCnBoard(root);
  root.querySelector('#central-node-dashboard')?.removeAttribute('hidden');
}

export function packCnBoard(root) {
  const board = root.querySelector('#cn-board');
  if (!board) return;
  const width = board.getBoundingClientRect?.()?.width ?? 0;
  if (width <= 0) return;
  const tiles = [...(board.children ?? [])].filter(node =>
    String(node.className || '').split(/\s+/).includes('cn-tile')
  );
  if (!tiles.length) return;
  const gap = PACK_GAP;
  const columns = width >= 1100 ? 4 : width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const columnWidth = (width - gap * (columns - 1)) / columns;
  for (const tile of tiles) {
    if (!tile.style) continue;
    const span = Math.min(Math.max(1, Number(tile.dataset?.cnSpan) || 1), columns);
    tile.style.position = 'absolute';
    tile.style.width = `${columnWidth * span + gap * (span - 1)}px`;
  }
  const items = tiles.map(tile => ({
    id: tile.id,
    span: Number(tile.dataset?.cnSpan) || 1,
    height: tile.offsetHeight || TILE_FALLBACK_HEIGHT
  }));
  const packed = packMasonry(items, { columns, gap, columnWidth, flowOffset: 0 });
  let bottom = 0;
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

function bindCnBoard(root) {
  const constraints = root.querySelector('#cn-tile-constraints');
  if (constraints && !constraints.dataset.boundPack) {
    constraints.dataset.boundPack = '1';
    constraints.addEventListener('toggle', () => packCnBoard(root));
  }
}

export function paintChartOrEmpty(root, host, svg, { need, have, unit }) {
  const count = Number(have) || 0;
  const threshold = Number(need) || 0;
  const qualifies = count >= threshold;
  const children = [...(host?.children ?? [])];
  let empty = children.find(node => String(node.className || '').split(/\s+/).includes('cn-honest-empty'));
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
    empty.className = 'cn-honest-empty mind-honest-empty metric-caption';
  }
  if (svg && typeof svg.after === 'function') svg.after(empty);
  else if (!children.includes(empty)) host.append(empty);
  empty.hidden = false;
  empty.textContent = `Need ${threshold} ${unit}. ${count} so far.`;
  return false;
}

function renderRadialYear(root, model) {
  const svg = root.querySelector('#central-node-radial-year');
  const tile = root.querySelector('#cn-tile-radial') ?? svg?.parentNode;
  if (!svg || !tile) return;
  const logging = hitMapFromSeries(model.loggingYear, day => day.complete);
  const exercise = hitMapFromSeries(model.exerciseYear, day => day.completed);
  const eating = hitMapFromSeries(model.eatingYear, day => day.hitEatingTargets);
  const hits = Object.keys(logging).length + Object.keys(exercise).length + Object.keys(eating).length;
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: hits, unit: 'hit days this year' })) return;
  svg.replaceChildren();
  const year = Number(String(model.date ?? '').slice(0, 4)) || 2026;
  const rings = [
    { byDate: logging, inner: 36, outer: 52, colour: CLINICAL_CHART_SLOTS[0] },
    { byDate: exercise, inner: 56, outer: 72, colour: CLINICAL_CHART_SLOTS[1] },
    { byDate: eating, inner: 76, outer: 92, colour: CLINICAL_CHART_SLOTS[2] }
  ];
  const cx = 120;
  const cy = 120;
  for (const ring of rings) {
    for (const tick of buildRadialYear({ year, byDate: ring.byDate })) {
      if (tick.mood !== 'hit') continue;
      const line = createSvg(root, 'line');
      line.setAttribute('x1', String(cx + ring.inner * Math.cos(tick.angle)));
      line.setAttribute('y1', String(cy + ring.inner * Math.sin(tick.angle)));
      line.setAttribute('x2', String(cx + ring.outer * Math.cos(tick.angle)));
      line.setAttribute('y2', String(cy + ring.outer * Math.sin(tick.angle)));
      line.setAttribute('stroke', ring.colour);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('title', tick.date);
      svg.append(line);
    }
  }
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach((month, index) => {
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

function renderStreamTile(root, model) {
  const svg = root.querySelector('#central-node-stream');
  const tile = root.querySelector('#cn-tile-trends') ?? svg?.parentNode;
  if (!svg || !tile) return;
  const chart = buildThemeTopography(model.domainWeekly ?? { weeks: [], series: [] });
  if (!paintChartOrEmpty(root, tile, svg, {
    need: 1,
    have: chart.bands.length,
    unit: 'weekly domain bands'
  })) return;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  const hideContours = (root.querySelector('#cn-board')?.getBoundingClientRect?.()?.width ?? 900) < 560;
  chart.bands.forEach((band, index) => {
    const colour = CLINICAL_CHART_SLOTS[index % CLINICAL_CHART_SLOTS.length];
    const path = createSvg(root, 'path');
    path.setAttribute('d', band.d);
    path.setAttribute('fill', colour);
    path.setAttribute('fill-opacity', '0.55');
    path.setAttribute('stroke', 'none');
    svg.append(path);
    if (hideContours) return;
    for (const contour of band.contours ?? []) {
      const line = createSvg(root, 'path');
      line.setAttribute('d', contour.d);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', colour);
      line.setAttribute('stroke-opacity', '0.35');
      svg.append(line);
    }
  });
}

function renderTrendScan(root, model) {
  const host = root.querySelector('[data-role="trend-scan"]');
  const more = root.querySelector('[data-role="trend-more"]');
  if (!host) return;
  const scan = scanTrendBlocks(model.sections?.longTermTrends ?? '');
  const paint = (blocks) => {
    host.replaceChildren();
    for (const block of blocks) {
      const row = root.createElement('p');
      row.className = 'metric-caption';
      const strong = root.createElement('strong');
      strong.textContent = block.label;
      row.append(strong, root.createTextNode ? root.createTextNode(` · ${block.line}`) : null);
      if (!root.createTextNode) row.append(Object.assign(root.createElement('span'), { textContent: ` · ${block.line}` }));
      host.append(row);
    }
  };
  paint(scan.preview);
  if (more) {
    more.hidden = scan.rest.length === 0;
    more._scan = scan;
    if (!more.dataset.bound) {
      more.dataset.bound = '1';
      more.addEventListener('click', () => {
        const latest = more._scan ?? { preview: [], rest: [] };
        paint([...latest.preview, ...latest.rest]);
        more.hidden = true;
        packCnBoard(root);
      });
    }
  }
}

function renderChordTile(root, model) {
  const svg = root.querySelector('#central-node-chord');
  const tile = root.querySelector('#cn-tile-cross-agent') ?? svg?.parentNode;
  const caption = root.querySelector('[data-cn="chord-detail"]');
  if (!svg || !tile) return;
  const focused = focusCrossAgentEdges(model.crossAgent?.edges ?? []);
  if (!paintChartOrEmpty(root, tile, svg, { need: 3, have: focused.length, unit: 'paired handoffs' })) {
    if (caption) caption.textContent = '';
    return;
  }
  const prose = root.querySelector('[data-central-node="cross-agent"]');
  if (prose) {
    prose.textContent = '';
    prose.setAttribute('hidden', '');
  }
  svg.replaceChildren();
  const layout = buildChordLayout(focused);
  const colourByKey = new Map(
    (layout.arcs ?? []).map((arc, index) => [arc.key, CLINICAL_CHART_SLOTS[index % CLINICAL_CHART_SLOTS.length]])
  );
  const details = model.crossAgent?.details ?? [];
  const linesFor = (sourceKey, targetKey) => details
    .filter(row => targetKey
      ? (row.themeA === sourceKey && row.themeB === targetKey)
        || (row.themeA === targetKey && row.themeB === sourceKey)
      : row.themeA === sourceKey || row.themeB === sourceKey)
    .flatMap(row => row.lines);
  const show = (text) => { if (caption) caption.textContent = text; };
  show(details[0]?.lines?.[0] ?? '');
  const cx = 180;
  const cy = 180;
  const radius = 120;
  for (const arc of layout.arcs ?? []) {
    const colour = colourByKey.get(arc.key) ?? CLINICAL_CHART_SLOTS[0];
    const path = createSvg(root, 'path');
    const x0 = cx + radius * Math.cos(arc.startAngle - Math.PI / 2);
    const y0 = cy + radius * Math.sin(arc.startAngle - Math.PI / 2);
    const x1 = cx + radius * Math.cos(arc.endAngle - Math.PI / 2);
    const y1 = cy + radius * Math.sin(arc.endAngle - Math.PI / 2);
    const large = arc.endAngle - arc.startAngle > Math.PI ? 1 : 0;
    path.setAttribute('d', `M${x0},${y0} A${radius},${radius},0,${large},1,${x1},${y1}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colour);
    path.setAttribute('stroke-width', '10');
    path.setAttribute('data-role', 'arc');
    path.setAttribute('data-theme', arc.key);
    path.setAttribute('tabindex', '0');
    const focus = () => show(linesFor(arc.key).join(' '));
    path.addEventListener('focus', focus);
    path.addEventListener('mouseenter', focus);
    svg.append(path);
    const mid = (arc.startAngle + arc.endAngle) / 2;
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(cx + (radius + 22) * Math.cos(mid - Math.PI / 2)));
    label.setAttribute('y', String(cy + (radius + 22) * Math.sin(mid - Math.PI / 2) + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'mind-chart-label');
    label.textContent = arc.key;
    svg.append(label);
  }
  for (const ribbon of layout.ribbons ?? []) {
    const source = ribbon.source ?? {};
    const target = ribbon.target ?? {};
    const start = ((source.startAngle ?? 0) + (source.endAngle ?? 0)) / 2;
    const end = ((target.startAngle ?? 0) + (target.endAngle ?? 0)) / 2;
    const x0 = cx + (radius - 10) * Math.cos(start - Math.PI / 2);
    const y0 = cy + (radius - 10) * Math.sin(start - Math.PI / 2);
    const x1 = cx + (radius - 10) * Math.cos(end - Math.PI / 2);
    const y1 = cy + (radius - 10) * Math.sin(end - Math.PI / 2);
    const sourceKey = layout.themes?.[source.index] ?? layout.arcs?.[source.index]?.key;
    const targetKey = layout.themes?.[target.index] ?? layout.arcs?.[target.index]?.key;
    const colour = colourByKey.get(sourceKey) ?? CLINICAL_CHART_SLOTS[0];
    const path = createSvg(root, 'path');
    path.setAttribute('d', `M${x0},${y0} Q${cx},${cy} ${x1},${y1}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', `color-mix(in srgb, ${colour} 55%, transparent)`);
    path.setAttribute('stroke-width', String(Math.max(2, Math.min(14, Number(ribbon.value) || 2))));
    path.setAttribute('data-role', 'ribbon');
    if (sourceKey) path.setAttribute('data-theme', sourceKey);
    path.setAttribute('tabindex', '0');
    const focus = () => show(linesFor(sourceKey, targetKey).join(' '));
    path.addEventListener('focus', focus);
    path.addEventListener('mouseenter', focus);
    svg.append(path);
  }
}

function renderGovernanceHeat(root, model) {
  const host = root.querySelector('#central-node-governance-heat');
  const tile = root.querySelector('#cn-tile-governance') ?? host;
  if (!host || !tile) return;
  const series = model.governanceHeat ?? [];
  host.replaceChildren();
  if (!paintChartOrEmpty(root, host, null, { need: 1, have: series.length, unit: 'open items' })) {
    return;
  }
  const chart = buildWatchlistHeat(series);
  const ageByTerm = new Map(
    (model.governanceOpen ?? []).map(entry => [entry.title || entry.entryType || 'Open item', entry.ageDays])
  );
  host.replaceChildren();
  for (const row of (chart.rows ?? []).slice(0, 5)) {
    const wrap = root.createElement('div');
    wrap.className = 'cn-watchlist-heat__row';
    const term = root.createElement('span');
    term.className = 'cn-watchlist-heat__term';
    term.textContent = row.term;
    wrap.append(term);
    for (const cell of row.cells ?? []) {
      const swatch = root.createElement('span');
      swatch.className = 'cn-watchlist-heat__cell';
      if (swatch.style?.setProperty) swatch.style.setProperty('--heat', String(cell.mix ?? 0));
      swatch.setAttribute('title', `${cell.date} · ${cell.count}`);
      wrap.append(swatch);
    }
    const age = ageByTerm.get(row.term);
    const caption = root.createElement('span');
    caption.className = 'cn-watchlist-heat__age';
    caption.textContent = Number.isFinite(age) ? `${age}d open` : '';
    wrap.append(caption);
    host.append(wrap);
  }
}

function renderWeekHorizon(root, model) {
  const svg = root.querySelector('#central-node-week-horizon');
  const tile = root.querySelector('#cn-tile-week') ?? svg?.parentNode;
  if (!svg || !tile) return;
  const week = model.week ?? [];
  const have = week.filter(day => Number(day.protein_g) > 0).length;
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have, unit: 'protein days' })) return;
  const bands = buildHorizonBands(weekHorizonMetrics(week), { width: 320, height: 24 });
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 320 24');
  for (const band of bands) {
    for (const rect of band.rects) {
      const node = createSvg(root, 'rect');
      node.setAttribute('x', String(rect.x));
      node.setAttribute('y', String(rect.y));
      node.setAttribute('width', String(rect.width));
      node.setAttribute('height', String(rect.height));
      node.setAttribute('fill', 'var(--wave)');
      node.setAttribute('opacity', String(rect.opacity));
      node.setAttribute('title', `${rect.date} · ${rect.value} g`);
      svg.append(node);
    }
  }
}

function renderLiveStatus(root, liveStatus) {
  if (!liveStatus) return;
  const { completeness, snapshot } = liveStatus;
  for (const key of ['nutrition', 'fitness', 'diary', 'body', 'skincare']) {
    const item = root.querySelector(`[data-live-complete="${key}"]`);
    if (item) item.dataset.checked = String(Boolean(completeness[key]));
  }
  const el = root.querySelector('[data-live-snapshot]');
  if (el) {
    el.textContent = `Protein ${formatGrams(snapshot.protein_g)} g · Energy ${snapshot.calories.toLocaleString('en-AU')} kcal · Fat ${formatGrams(snapshot.fat_g)} g`;
  }
}

function renderCompletionRing(root, completeness) {
  const svg = root.querySelector('#central-node-completion-ring');
  if (!svg) return;
  const ring = buildCompletionRing(completeness, { size: 72, strokeWidth: 8 });
  let fill = null;
  for (const role of ['track', 'fill']) {
    const circle = svg.querySelector(`[data-role="${role}"]`);
    if (!circle) continue;
    circle.setAttribute('cx', ring.center);
    circle.setAttribute('cy', ring.center);
    circle.setAttribute('r', ring.radius);
    circle.setAttribute('stroke-width', ring.strokeWidth);
    if (role === 'fill') fill = circle;
  }
  if (fill) animateRingFill(fill, ring);
  const label = root.querySelector('[data-value="completion-ring-label"]');
  if (label) label.textContent = `${completeness.complete} of ${completeness.total}`;
}

function renderDayProgress(root, completeness) {
  const host = root.querySelector('[data-central-node="progress"]');
  if (!host || !completeness) return;
  host.replaceChildren();
  createLabeledProgress({
    root,
    wrap: host,
    label: 'Today',
    value: completeness.complete,
    max: completeness.total
  });
}

function renderBacklinks(root, container, inverseLinks) {
  if (!container) return;
  const status = inverseLinks?.status;
  if (status === 'unavailable') {
    container.textContent = 'Inbound links are unavailable.';
    container.removeAttribute('hidden');
    return;
  }
  const groups = Array.isArray(inverseLinks?.groups) ? inverseLinks.groups : [];
  if (!groups.length) {
    container.textContent = 'No Knowledge pages point at a Life decision yet.';
    container.removeAttribute('hidden');
    return;
  }
  container.textContent = '';
  const list = root.createElement('ul');
  list.className = 'cn-backlinks';
  for (const group of groups) {
    const item = root.createElement('li');
    const target = String(group.target || 'decision');
    const sources = Array.isArray(group.sources) ? group.sources : [];
    const names = sources.map(source => source.title || source.id).filter(Boolean).join(', ');
    item.textContent = `${target} ← ${names || 'unknown page'}`;
    list.append(item);
  }
  container.append(list);
  container.removeAttribute('hidden');
}

function renderUrlWatches(root, container, urlWatches) {
  if (!container) return;
  const status = urlWatches?.status;
  if (status === 'unavailable') {
    container.textContent = 'URL watch is unavailable.';
    container.removeAttribute('hidden');
    return;
  }
  const watches = Array.isArray(urlWatches?.watches) ? urlWatches.watches : [];
  if (!watches.length) {
    container.textContent = 'No watched URLs yet.';
    container.removeAttribute('hidden');
    return;
  }
  container.textContent = '';
  const list = root.createElement('ul');
  list.className = 'cn-url-watches';
  for (const watch of watches) {
    const item = root.createElement('li');
    const state = watch.status === 'changed' ? 'Changed' : watch.status === 'unchanged' ? 'Unchanged' : 'Unavailable';
    item.textContent = `${watch.url} — ${state}`;
    item.dataset.watchStatus = watch.status === 'changed' || watch.status === 'unchanged' ? watch.status : 'unavailable';
    list.append(item);
  }
  container.append(list);
  container.removeAttribute('hidden');
}

function createSvg(root, tag) {
  return root.createElementNS?.('http://www.w3.org/2000/svg', tag) ?? root.createElement(tag);
}
