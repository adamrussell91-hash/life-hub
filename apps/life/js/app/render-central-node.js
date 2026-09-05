import { animateRingFill } from './chart-kit/animate.js';
import { packMasonry } from './chart-kit/masonry.js';
import { buildCompletionRing } from './central-node-charts.js';
import { renderInlineMarkdown } from './render-chat.js';

const TILE_FALLBACK_HEIGHT = 160;
const PACK_GAP = 16;

const SECTION_SELECTORS = {
  todaysStatus: '[data-central-node="todays-status"]',
  thisWeek: '[data-central-node="this-week"]',
  thisMonth: '[data-central-node="this-month"]',
  longTermTrends: '[data-central-node="long-term-trends"]',
  crossAgentCoordination: '[data-central-node="cross-agent"]',
  recentAgentActions: '[data-central-node="recent-actions"]',
  constraints: '[data-central-node="constraints"]'
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
    renderInlineMarkdown(root, container, model.sections[key], { multiline: true });
  }

  renderLiveStatus(root, model.liveStatus);
  renderCompletionRing(root, model.completeness);
  bindCnBoard(root);
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
  const columns = width >= 900 ? 3 : width >= 560 ? 2 : 1;
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
    host.append(empty);
  }
  empty.hidden = false;
  empty.textContent = `Need ${threshold} ${unit}. ${count} so far.`;
  return false;
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
    el.textContent = `Protein ${snapshot.protein_g} g · Energy ${snapshot.calories.toLocaleString('en-AU')} kcal · Fat ${snapshot.fat_g} g`;
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

function createSvg(root, tag) {
  return root.createElementNS?.('http://www.w3.org/2000/svg', tag) ?? root.createElement(tag);
}
