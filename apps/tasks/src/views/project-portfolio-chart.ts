import { buildMoodMixDonut } from '@/chart-kit/mood-mix';
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

function setCenter(
  root: HTMLElement,
  running: number,
  dominantLabel: string | null,
  empty: boolean
): void {
  const value = root.querySelector<HTMLElement>('[data-mix="value"]');
  const name = root.querySelector<HTMLElement>('[data-mix="name"]');
  const sub = root.querySelector<HTMLElement>('[data-mix="sub"]');
  if (!value || !name || !sub) return;
  if (empty) {
    value.textContent = '0';
    name.textContent = 'projects';
    sub.textContent = 'Nothing in the mix yet';
    return;
  }
  value.textContent = String(running);
  name.textContent = 'running';
  const overBy = Math.max(0, running - SUSTAINABLE_RUNNING_LOAD);
  sub.textContent = dominantLabel
    ? overBy
      ? `${overBy} over · ${dominantLabel} leads`
      : `of ~${SUSTAINABLE_RUNNING_LOAD} · ${dominantLabel} leads`
    : overBy
      ? `${overBy} over the ~${SUSTAINABLE_RUNNING_LOAD} sustainable load`
      : `of ~${SUSTAINABLE_RUNNING_LOAD} sustainable`;
}

function paintHover(root: HTMLElement, key: string | null): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-lifecycle]')) {
    const match = key != null && node.dataset.lifecycle === key;
    node.classList.toggle('is-active', match);
    if (node.tagName === 'BUTTON') {
      node.setAttribute('aria-pressed', match ? 'true' : 'false');
    }
  }
}

/**
 * Life Hub mood-mix donut for project lifecycle share.
 * Center keeps the running-load signal; legend rows filter the board / portfolio.
 */
export function renderProjectPortfolioChart(
  mix: LifecycleMixSlice[],
  options: ProjectPortfolioChartOptions
): HTMLElement {
  const compact = options.compact ?? false;
  const selected = options.selected ?? 'all';
  const size = compact ? 160 : 218;
  const radius = compact ? 64 : 90;
  const stroke = compact ? 18 : 26;
  const slices = compact ? mix.filter((slice) => slice.count > 0) : mix;
  const donut = buildMoodMixDonut(
    slices.map((slice) => ({
      key: slice.id,
      label: slice.label,
      value: slice.count,
      colour: slice.color
    })),
    { size, radius, gap: compact ? 5 : 7 }
  );

  const wrap = el(
    'div',
    compact
      ? 'project-pulse-chart project-pulse-chart--compact projects-mix'
      : 'project-pulse-chart projects-mix'
  );
  if (compact) wrap.append(el('p', 'projects-mix__question', 'What’s the mix?'));

  const row = el('div', 'projects-mix__row');
  const donutHost = el('div', 'projects-mix__donut');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'projects-mix__pie');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  const spoken = slices
    .filter((slice) => slice.count)
    .map((slice) => `${slice.count} ${slice.label}`)
    .join(', ');
  svg.setAttribute('aria-label', spoken || 'No projects yet');

  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('class', 'projects-mix__track');
  track.setAttribute('cx', String(donut.center));
  track.setAttribute('cy', String(donut.center));
  track.setAttribute('r', String(donut.radius));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke-width', String(stroke));
  svg.append(track);

  const slicesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  slicesGroup.setAttribute('transform', `rotate(-90 ${donut.center} ${donut.center})`);
  for (const segment of donut.segments) {
    if (!segment.visible) continue;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'projects-mix__seg');
    circle.setAttribute('cx', String(donut.center));
    circle.setAttribute('cy', String(donut.center));
    circle.setAttribute('r', String(donut.radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', segment.colour ?? 'var(--wave)');
    circle.setAttribute('stroke-width', String(stroke));
    circle.setAttribute('stroke-dasharray', segment.dasharray);
    circle.setAttribute('stroke-dashoffset', String(segment.dashoffset));
    circle.dataset.lifecycle = segment.key;
    if (options.onSelect) {
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('role', 'button');
      circle.setAttribute('aria-label', `${segment.label} · ${segment.value}`);
      const toggle = (): void => {
        options.onSelect?.(selected === segment.key ? 'all' : (segment.key as ProjectLifecycle));
      };
      circle.addEventListener('click', toggle);
      circle.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      });
      circle.addEventListener('pointerenter', () => paintHover(wrap, segment.key));
      circle.addEventListener('pointerleave', () =>
        paintHover(wrap, selected === 'all' ? null : selected)
      );
    }
    slicesGroup.append(circle);
  }
  svg.append(slicesGroup);
  donutHost.append(svg);

  const center = options.onActivate
    ? el('button', 'projects-mix__center metric-ring-wrap--action')
    : options.href
      ? document.createElement('a')
      : el('div', 'projects-mix__center');
  if (options.onActivate) {
    const btn = center as HTMLButtonElement;
    btn.type = 'button';
    btn.classList.add('projects-mix__center');
    btn.setAttribute('aria-pressed', options.active ? 'true' : 'false');
    btn.setAttribute('aria-label', 'Filter board to running projects');
    if (options.active) btn.classList.add('is-active');
    btn.addEventListener('click', options.onActivate);
  } else if (options.href) {
    center.className = 'projects-mix__center projects-mix__center--link metric-ring-wrap--link';
    (center as HTMLAnchorElement).href = options.href;
    center.setAttribute('aria-label', 'Open Projects portfolio');
  }
  const tone = loadToneFor(options.running, SUSTAINABLE_RUNNING_LOAD);
  center.dataset.tone = tone;
  center.append(
    el('p', 'projects-mix__value', ''),
    el('p', 'projects-mix__name', ''),
    el('p', 'projects-mix__sub', '')
  );
  center.querySelector('.projects-mix__value')!.setAttribute('data-mix', 'value');
  center.querySelector('.projects-mix__name')!.setAttribute('data-mix', 'name');
  center.querySelector('.projects-mix__sub')!.setAttribute('data-mix', 'sub');
  donutHost.append(center);
  row.append(donutHost);

  const legend = el('ul', 'projects-mix__legend');
  legend.setAttribute('role', options.onSelect ? 'group' : 'list');
  legend.setAttribute('aria-label', spoken || 'No projects yet');
  for (const slice of slices) {
    const rowBtn = options.onSelect
      ? el('button', 'projects-mix__legend-row projects-chart__slice')
      : el('li', 'projects-mix__legend-row');
    if (options.onSelect) {
      const btn = rowBtn as HTMLButtonElement;
      btn.type = 'button';
      btn.dataset.lifecycle = slice.id;
      const pressed = selected === slice.id;
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      if (pressed) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        options.onSelect?.(selected === slice.id ? 'all' : slice.id);
      });
      btn.addEventListener('pointerenter', () => paintHover(wrap, slice.id));
      btn.addEventListener('pointerleave', () =>
        paintHover(wrap, selected === 'all' ? null : selected)
      );
    } else {
      rowBtn.dataset.lifecycle = slice.id;
    }
    const swatch = el('span', 'projects-mix__swatch');
    swatch.style.background = slice.color;
    const info = el('span', 'projects-mix__info');
    const line = el('span', 'projects-mix__row1');
    line.append(el('span', 'projects-mix__label', slice.label));
    const segment = donut.segments.find((item) => item.key === slice.id);
    line.append(el('span', 'projects-mix__pct', segment ? `${segment.pct}%` : '0%'));
    const trackBar = el('span', 'projects-mix__bar-track');
    const fill = el('span', 'projects-mix__bar-fill');
    fill.style.background = slice.color;
    fill.style.width = `${segment?.pct ?? 0}%`;
    trackBar.append(fill);
    info.append(line, trackBar);
    rowBtn.append(swatch, info, el('span', 'projects-mix__count', String(slice.count)));
    legend.append(rowBtn);
  }
  if (legend.childElementCount) row.append(legend);
  wrap.append(row);

  const foot = el('p', 'projects-mix__foot');
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  foot.append(
    el('strong', undefined, String(total)),
    document.createTextNode(total === 1 ? ' project in this mix' : ' projects in this mix')
  );
  wrap.append(foot);

  setCenter(wrap, options.running, donut.dominant?.label ?? null, donut.empty);
  if (selected !== 'all') paintHover(wrap, selected);
  return wrap;
}
