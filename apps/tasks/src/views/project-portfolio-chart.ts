import { applyRingTarget } from '@/chart-kit/apply-ring';
import { animateColumnGrow } from '@/chart-kit/animate';
import { buildColumns } from '@/chart-kit/columns';
import { loadToneFor } from '@/domain/dashboard-overview';
import {
  SUSTAINABLE_RUNNING_LOAD,
  type LifecycleMixSlice,
  type ProjectLifecycle
} from '@/domain/projects-pulse';
import { el } from '@/views/hub-kit';

export type ProjectPortfolioChartOptions = {
  running: number;
  compact?: boolean;
  href?: string;
  onActivate?: () => void;
  active?: boolean;
  onSelect?: (id: ProjectLifecycle | 'all') => void;
  selected?: ProjectLifecycle | 'all';
};

function renderLoadRing(
  running: number,
  compact: boolean,
  href?: string,
  onActivate?: () => void,
  active = false
): HTMLElement {
  const tone = loadToneFor(running, SUSTAINABLE_RUNNING_LOAD);
  const size = compact ? 56 : 72;
  const strokeWidth = compact ? 6 : 7;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `metric-ring metric-ring--${tone}`);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `${running} running of about ${SUSTAINABLE_RUNNING_LOAD} sustainable`
  );

  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('data-role', 'track');
  track.setAttribute('class', 'metric-ring-track');
  track.setAttribute('fill', 'none');
  const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fill.setAttribute('data-role', 'fill');
  fill.setAttribute('class', 'metric-ring-fill');
  fill.setAttribute('fill', 'none');
  svg.append(track, fill);
  applyRingTarget(svg, { value: running, target: SUSTAINABLE_RUNNING_LOAD }, { size, strokeWidth });

  const copy = el('div', 'metric-ring__copy');
  const value = el('p', 'metric-ring__value');
  value.append(el('strong', undefined, String(running)), el('span', undefined, 'running'));
  const overBy = Math.max(0, running - SUSTAINABLE_RUNNING_LOAD);
  copy.append(
    value,
    el(
      'p',
      'metric-ring__target',
      overBy
        ? `${overBy} over the ~${SUSTAINABLE_RUNNING_LOAD} sustainable load`
        : `of ~${SUSTAINABLE_RUNNING_LOAD} sustainable`
    )
  );

  const wrap = onActivate
    ? el('button', 'metric-ring-wrap metric-ring-wrap--action')
    : href
      ? document.createElement('a')
      : el('div', 'metric-ring-wrap');
  if (onActivate) {
    const btn = wrap as HTMLButtonElement;
    btn.type = 'button';
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute('aria-label', 'Filter board to running projects');
    if (active) btn.classList.add('is-active');
    btn.addEventListener('click', onActivate);
  } else if (href) {
    wrap.className = 'metric-ring-wrap metric-ring-wrap--link';
    (wrap as HTMLAnchorElement).href = href;
    wrap.setAttribute('aria-label', 'Open Projects portfolio');
  }
  wrap.append(svg, copy);
  return wrap;
}

function renderMixBars(
  mix: LifecycleMixSlice[],
  compact: boolean,
  onSelect?: (id: ProjectLifecycle | 'all') => void,
  selected: ProjectLifecycle | 'all' = 'all'
): HTMLElement | null {
  const slices = compact ? mix.filter((slice) => slice.count > 0) : mix;
  if (!slices.length) return null;
  const columns = buildColumns(
    slices.map((slice) => ({ key: slice.id, value: slice.count, label: slice.label }))
  );
  const chart = el('div', 'column-chart column-chart--rows');
  const spoken = slices
    .filter((slice) => slice.count)
    .map((slice) => `${slice.count} ${slice.label}`)
    .join(', ');
  chart.setAttribute('role', onSelect ? 'group' : 'img');
  chart.setAttribute('aria-label', spoken || 'No projects yet');

  for (const bar of columns.bars) {
    const slice = slices.find((item) => item.id === bar.key);
    if (!slice) continue;
    const row = onSelect
      ? el('button', 'column-bar column-bar--row projects-chart__slice')
      : el('div', 'column-bar column-bar--row');
    if (onSelect) {
      const btn = row as HTMLButtonElement;
      btn.type = 'button';
      btn.dataset.lifecycle = slice.id;
      const pressed = selected === slice.id;
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      if (pressed) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        onSelect(selected === slice.id ? 'all' : slice.id);
      });
    }
    const track = el('span', 'column-bar__track');
    const fill = el('span', 'column-bar__fill');
    fill.style.background = slice.color;
    track.append(fill);
    row.append(
      el('span', 'column-bar__label', slice.label),
      track,
      el('span', 'column-bar__count', String(slice.count))
    );
    chart.append(row);
    animateColumnGrow(fill, bar.heightPct, { property: 'width' });
  }
  return chart;
}

/** Life Hub ring (running load) + columns (lifecycle mix). Replaces the doughnut. */
export function renderProjectPortfolioChart(
  mix: LifecycleMixSlice[],
  options: ProjectPortfolioChartOptions
): HTMLElement {
  const compact = options.compact ?? false;
  const wrap = el('div', compact ? 'project-pulse-chart project-pulse-chart--compact' : 'project-pulse-chart');
  wrap.append(
    renderLoadRing(options.running, compact, options.href, options.onActivate, options.active)
  );
  const bars = renderMixBars(mix, compact, options.onSelect, options.selected ?? 'all');
  if (bars) wrap.append(bars);
  return wrap;
}
