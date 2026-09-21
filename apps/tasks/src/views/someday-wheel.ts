import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { somedayTasks } from '@/domain/hierarchy';
import {
  computeLifeCoverage,
  LIFE_COVERAGE_SEATS,
  LIFE_COVERAGE_VIEWBOX,
  lifeCoverageStarRadius,
  MATURITY_LEVELS,
  type LifeCoverageArea
} from '@/domain/someday';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { el } from '@/views/hub-kit';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function setHot(root: HTMLElement, areaId: string | null): void {
  for (const node of root.querySelectorAll('[data-area]')) {
    node.classList.toggle('is-hot', node.getAttribute('data-area') === areaId);
  }
}

function wireAreaTarget(
  node: Element,
  areaId: string,
  root: HTMLElement,
  onSelect: (id: string) => void
): void {
  node.setAttribute('data-area', areaId);
  node.addEventListener('click', () => onSelect(areaId));
  node.addEventListener('mouseenter', () => setHot(root, areaId));
  node.addEventListener('mouseleave', () => setHot(root, null));
}

function buildStar(
  area: LifeCoverageArea,
  selected: boolean,
  root: HTMLElement,
  onSelect: (id: string) => void
): SVGGElement {
  const pos = LIFE_COVERAGE_SEATS[area.id] ?? { x: 500, y: 280, labelDy: 42 };
  const group = svgEl('g', {
    class: `someday-wheel__star someday-wheel__star--${area.count === 0 ? 'unlit' : 'lit'}${selected ? ' is-selected' : ''}`,
    role: 'button',
    tabindex: 0,
    'aria-pressed': selected ? 'true' : 'false',
    'aria-label': `${area.label}: ${area.count} dream${area.count === 1 ? '' : 's'}`
  });

  const coreR = lifeCoverageStarRadius(area.count);
  group.append(svgEl('circle', { cx: pos.x, cy: pos.y, r: coreR + 16, class: 'someday-wheel__hit' }));

  if (area.count === 0) {
    group.append(
      svgEl('circle', { cx: pos.x, cy: pos.y, r: coreR, class: 'someday-wheel__unlit-ring' }),
      svgEl('circle', { cx: pos.x, cy: pos.y, r: 5, class: 'someday-wheel__unlit-dot' })
    );
  } else {
    const opacity = 0.35 + area.avgMaturity * 0.65;
    group.append(
      svgEl('circle', {
        cx: pos.x,
        cy: pos.y,
        r: coreR * 2.1,
        class: 'someday-wheel__glow-outer',
        style: `opacity:${(opacity * 0.14).toFixed(2)}`
      }),
      svgEl('circle', {
        cx: pos.x,
        cy: pos.y,
        r: coreR * 1.5,
        class: 'someday-wheel__glow-inner',
        style: `opacity:${(opacity * 0.22).toFixed(2)}`
      }),
      svgEl('circle', {
        cx: pos.x,
        cy: pos.y,
        r: coreR,
        class: 'someday-wheel__core',
        style: `opacity:${opacity.toFixed(2)}`
      })
    );
    if (area.avgMaturity > 0.85) {
      group.append(
        svgEl('circle', {
          cx: pos.x - coreR * 0.3,
          cy: pos.y - coreR * 0.3,
          r: 2.2,
          class: 'someday-wheel__sparkle'
        })
      );
    }
  }

  if (selected) {
    group.append(svgEl('circle', { cx: pos.x, cy: pos.y, r: coreR + 10, class: 'someday-wheel__select-ring' }));
  }

  const label = svgEl('text', {
    x: pos.x,
    y: pos.y + pos.labelDy,
    'text-anchor': 'middle',
    class: `someday-wheel__label${area.count === 0 ? ' someday-wheel__label--unlit' : ''}`
  });
  label.textContent = area.label;
  group.append(label);

  wireAreaTarget(group, area.id, root, onSelect);
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(area.id);
    }
  });
  return group;
}

function buildConstellation(
  coverage: LifeCoverageArea[],
  selectedId: string | null,
  root: HTMLElement,
  onSelect: (id: string) => void
): SVGSVGElement {
  const { width, height } = LIFE_COVERAGE_VIEWBOX;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'someday-wheel__svg',
    role: 'group'
  });
  svg.setAttribute('aria-label', 'Life coverage constellation. Click a star to see its dreams.');
  for (let i = 0; i < 36; i += 1) {
    const x = (i * 89) % width;
    const y = (i * 73) % height;
    svg.append(svgEl('circle', { cx: x, cy: y, r: 1.1, class: 'someday-wheel__speck' }));
  }
  for (const area of coverage) svg.append(buildStar(area, area.id === selectedId, root, onSelect));
  return svg;
}

function buildAreaRow(
  area: LifeCoverageArea,
  maxCount: number,
  selected: boolean,
  root: HTMLElement,
  onSelect: (id: string) => void
): HTMLButtonElement {
  const row = el(
    'button',
    `someday-wheel__row${area.count === 0 ? ' someday-wheel__row--unlit' : ''}${selected ? ' is-selected' : ''}`
  );
  row.type = 'button';
  row.setAttribute('aria-pressed', selected ? 'true' : 'false');
  row.append(el('span', 'someday-wheel__row-label', area.label));
  const track = el('div', 'someday-wheel__track');
  const fill = el('div', 'someday-wheel__fill');
  fill.style.width = maxCount ? `${Math.round((area.count / maxCount) * 100)}%` : '0%';
  track.append(fill);
  row.append(track);
  row.append(el('span', 'someday-wheel__count', String(area.count)));
  wireAreaTarget(row, area.id, root, onSelect);
  return row;
}

function maturityLabel(task: Task): string {
  return MATURITY_LEVELS.find((level) => level.id === task.maturity)?.label ?? 'New';
}

function buildAreaDetail(area: LifeCoverageArea, dreams: Task[]): HTMLElement {
  const panel = el('div', 'someday-wheel__detail');
  const countLabel = area.count === 1 ? '1 dream' : `${area.count} dreams`;
  panel.append(el('h2', 'someday-wheel__detail-title', `${area.label} · ${countLabel}`));
  if (dreams.length === 0) {
    panel.append(el('p', 'someday-wheel__detail-empty', `Nothing parked in ${area.label} yet.`));
    const add = el('a', 'btn btn--secondary btn--sm', 'Park a dream');
    add.href = '#/someday';
    panel.append(add);
    return panel;
  }
  const list = el('ul', 'someday-wheel__dreams');
  for (const dream of dreams) {
    const item = el('li');
    const link = el('a', 'someday-wheel__dream');
    link.href = `#/someday/odyssey/${encodeURIComponent(dream.id)}`;
    link.append(el('span', 'someday-wheel__dream-title', dream.title));
    link.append(el('span', 'someday-wheel__dream-meta', maturityLabel(dream)));
    item.append(link);
    list.append(item);
  }
  panel.append(list);
  return panel;
}

export async function renderSomedayWheelView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Lighting up the sky…', '.someday-wheel');
  try {
    const tasks = somedayTasks(await tasksApi.listTasks());
    const coverage = computeLifeCoverage(tasks);
    let selectedId: string | null = null;
    const paint = () =>
      paintWheel(canvas, coverage, tasks, selectedId, (id) => {
        selectedId = selectedId === id ? null : id;
        paint();
      });
    paint();
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load life coverage.')));
  }
}

function paintWheel(
  canvas: HTMLElement,
  coverage: LifeCoverageArea[],
  items: Task[],
  selectedId: string | null,
  onSelect: (id: string) => void
): void {
  canvas.replaceChildren();
  const root = el('div', 'someday-wheel');

  const back = el('a', 'someday-back-link', '← Someday');
  back.href = '#/someday';
  root.append(back);

  const panel = el('div', 'someday-wheel__panel');
  panel.append(buildConstellation(coverage, selectedId, root, onSelect));
  root.append(panel);
  root.append(
    el('p', 'someday-wheel__key', 'Size = how many dreams. Brightness = how developed they are.')
  );

  const selected = coverage.find((row) => row.id === selectedId) ?? null;
  if (selected) {
    root.append(
      buildAreaDetail(
        selected,
        items.filter((task) => task.life_area === selected.id)
      )
    );
  } else {
    root.append(
      el('p', 'someday-wheel__hint', 'Click a star — or a row — to see the dreams parked there.')
    );
  }

  const unlit = coverage.filter((row) => row.count === 0);
  if (unlit.length) {
    const banner = el('div', 'someday-wheel__gap-banner');
    const names = unlit.map((row) => row.label).join(', ');
    banner.append(
      el(
        'p',
        'someday-wheel__gap-copy',
        unlit.length === 1
          ? `${names} is unlit — nothing parked there yet.`
          : `${names} are unlit — nothing parked there yet.`
      )
    );
    root.append(banner);
  }

  const list = el('div', 'someday-wheel__list');
  const maxCount = Math.max(1, ...coverage.map((row) => row.count));
  for (const area of [...coverage].sort((a, b) => b.count - a.count)) {
    list.append(buildAreaRow(area, maxCount, area.id === selectedId, root, onSelect));
  }
  root.append(list);

  canvas.append(root);
}
