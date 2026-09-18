import { tasksApi } from '@/services/client-api';
import { somedayTasks } from '@/domain/hierarchy';
import { computeLifeCoverage, type LifeCoverageArea } from '@/domain/someday';
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

/** Fixed, organic (not geometric) placement — a real constellation, not a spider chart. */
const POSITIONS: Record<string, { x: number; y: number; labelDy: number }> = {
  explore: { x: 240, y: 60, labelDy: -26 },
  career: { x: 70, y: 55, labelDy: -25 },
  create: { x: 150, y: 130, labelDy: 25 },
  money: { x: 235, y: 150, labelDy: 25 },
  learn: { x: 55, y: 150, labelDy: 25 },
  love: { x: 110, y: 205, labelDy: 25 },
  friends: { x: 195, y: 210, labelDy: 25 },
  health: { x: 150, y: 85, labelDy: 27 }
};

function starRadius(count: number): number {
  return Math.min(28, 4 + count * 1.1);
}

function buildStar(area: LifeCoverageArea): SVGGElement {
  const pos = POSITIONS[area.id] ?? { x: 150, y: 130, labelDy: 25 };
  const group = svgEl('g', { class: `someday-wheel__star someday-wheel__star--${area.count === 0 ? 'unlit' : 'lit'}` });

  if (area.count === 0) {
    group.append(
      svgEl('circle', { cx: pos.x, cy: pos.y, r: 16, class: 'someday-wheel__unlit-ring' }),
      svgEl('circle', { cx: pos.x, cy: pos.y, r: 5, class: 'someday-wheel__unlit-dot' })
    );
  } else {
    const r = starRadius(area.count);
    const opacity = 0.35 + area.avgMaturity * 0.65;
    group.append(
      svgEl('circle', { cx: pos.x, cy: pos.y, r: r * 2.4, class: 'someday-wheel__glow-outer', style: `opacity:${(opacity * 0.14).toFixed(2)}` }),
      svgEl('circle', { cx: pos.x, cy: pos.y, r: r * 1.7, class: 'someday-wheel__glow-inner', style: `opacity:${(opacity * 0.22).toFixed(2)}` }),
      svgEl('circle', { cx: pos.x, cy: pos.y, r, class: 'someday-wheel__core', style: `opacity:${opacity.toFixed(2)}` })
    );
    if (area.avgMaturity > 0.85) {
      group.append(svgEl('circle', { cx: pos.x - r * 0.3, cy: pos.y - r * 0.3, r: 1.8, class: 'someday-wheel__sparkle' }));
    }
  }

  const label = svgEl('text', {
    x: pos.x,
    y: pos.y + pos.labelDy,
    'text-anchor': 'middle',
    class: `someday-wheel__label${area.count === 0 ? ' someday-wheel__label--unlit' : ''}`
  });
  label.textContent = area.label;
  group.append(label);
  return group;
}

function buildConstellation(coverage: LifeCoverageArea[]): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 300 260', class: 'someday-wheel__svg', role: 'img' });
  svg.setAttribute(
    'aria-label',
    coverage.map((row) => `${row.label}: ${row.count} dream${row.count === 1 ? '' : 's'}`).join(', ')
  );
  for (let i = 0; i < 26; i += 1) {
    const x = (i * 37) % 300;
    const y = (i * 53) % 260;
    svg.append(svgEl('circle', { cx: x, cy: y, r: 0.8, class: 'someday-wheel__speck' }));
  }
  for (const area of coverage) svg.append(buildStar(area));
  return svg;
}

function buildAreaRow(area: LifeCoverageArea, maxCount: number): HTMLElement {
  const row = el('div', `someday-wheel__row${area.count === 0 ? ' someday-wheel__row--unlit' : ''}`);
  row.append(el('span', 'someday-wheel__row-label', area.label));
  const track = el('div', 'someday-wheel__track');
  const fill = el('div', 'someday-wheel__fill');
  fill.style.width = maxCount ? `${Math.round((area.count / maxCount) * 100)}%` : '0%';
  track.append(fill);
  row.append(track);
  row.append(el('span', 'someday-wheel__count', String(area.count)));
  return row;
}

export async function renderSomedayWheelView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Lighting up the sky…', '.someday-wheel');
  try {
    const tasks = somedayTasks(await tasksApi.listTasks());
    const coverage = computeLifeCoverage(tasks);
    paintWheel(canvas, coverage);
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load life coverage.')));
  }
}

function paintWheel(canvas: HTMLElement, coverage: LifeCoverageArea[]): void {
  canvas.replaceChildren();
  const root = el('div', 'someday-wheel');

  const back = el('a', 'someday-back-link', '← Someday');
  back.href = '#/someday';
  root.append(back);

  root.append(
    el('h2', 'someday-wheel__title', 'Life coverage'),
    el('p', 'someday-wheel__subtitle', "Where your someday dreams cluster — and where they don't.")
  );

  const panel = el('div', 'someday-wheel__panel');
  panel.append(buildConstellation(coverage));
  root.append(panel);
  root.append(
    el('p', 'someday-wheel__key', 'Size = how many dreams. Brightness = how developed they are.')
  );

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
    list.append(buildAreaRow(area, maxCount));
  }
  root.append(list);

  canvas.append(root);
}
