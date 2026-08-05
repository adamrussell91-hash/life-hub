import { animateAreaReveal, animateColumnGrow } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildColumns } from './chart-kit/columns.js';

export function renderMind(root, model, { onRangeChange, onOpenAgent } = {}) {
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

  renderMoodChart(root, model.moodSeries);
  renderBarHost(root, '#mind-mood-columns', model.byMood);
  renderBarHost(root, '#mind-theme-columns', model.themes);

  const empty = root.querySelector('#mind-empty');
  if (empty) empty.hidden = !model.empty;

  for (const button of root.querySelectorAll?.('[data-mind-agent]') ?? []) {
    if (button.dataset.bound) continue;
    button.dataset.bound = '1';
    button.addEventListener('click', () => onOpenAgent?.(button.dataset.mindAgent));
  }

  dashboard.removeAttribute('hidden');
}

function renderMoodChart(root, series) {
  const svg = root.querySelector('#mind-mood-chart');
  if (!svg) return;
  const area = svg.querySelector('[data-role="area"]');
  const line = svg.querySelector('[data-role="line"]');
  if (!series.length) {
    if (area) area.setAttribute('d', '');
    if (line) line.setAttribute('d', '');
    svg.classList?.remove?.('chart-animating', 'chart-static');
    return;
  }
  const chart = buildAreaLine(series.map(point => ({ date: point.date, value: point.value })));
  if (area) area.setAttribute('d', chart.areaPath || '');
  if (line) line.setAttribute('d', chart.linePath || '');
  animateAreaReveal(svg);
}

function renderBarHost(root, selector, items) {
  const host = root.querySelector(selector);
  if (!host) return;
  host.replaceChildren();
  if (!items?.length) {
    const caption = root.createElement('p');
    caption.className = 'metric-caption';
    caption.textContent = selector.includes('theme')
      ? 'No recurring themes in this range yet.'
      : 'No mood entries in this range yet.';
    host.append(caption);
    return;
  }
  const built = buildColumns(items, { height: 96 });
  for (const bar of built.bars) {
    const col = root.createElement('div');
    col.className = 'column-bar';
    const fill = root.createElement('span');
    const label = root.createElement('span');
    label.textContent = bar.label;
    col.append(fill, label);
    host.append(col);
    animateColumnGrow(fill, Math.max(bar.heightPct, bar.value > 0 ? 8 : 0));
  }
}
