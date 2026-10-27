import { wireStudentAnchor } from '@/student/shell';
import type { CoverageMap } from './model';
import { drawCoverageMap, fitNameWidth, type ProgressLayer } from './draw';
import './coverage-map.css';

/**
 * The student's own copy of the unit map. Same route, lanes and branches as the teacher's coverage
 * map, but grey until a lesson is done and never showing scores, counts or comparison. Pressing a
 * lesson opens it. Returns `update` for a new set of done lessons.
 */

export type ProgressMapOptions = {
  map: CoverageMap;
  classId: string;
  label: string;
  done: ReadonlySet<string>;
  /** Side lessons not assigned to the student. */
  faded: ReadonlySet<string>;
  next: string | null;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The map without the placeholder "Assessment task" row, which isn't a lesson a student can do. */
export const withoutPlaceholder = (map: CoverageMap): CoverageMap => ({ ...map, rows: map.rows.filter((r) => r.id !== '__terminus') });

export function mountProgressMap(host: HTMLElement, options: ProgressMapOptions): { update(done: ReadonlySet<string>, next: string | null): void } {
  const map = withoutPlaceholder(options.map);
  let done = options.done;
  let next = options.next;
  const narrow = () => window.matchMedia?.('(max-width: 599px)').matches ?? window.innerWidth < 600;
  const collapsed = new Set<string>(narrow() ? map.groups.map((g) => g.id) : []);

  const root = el('div', 'cm cm--progress');
  const scroller = el('div', 'cm__scroll');
  const stage = el('div', 'cm__stage');
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', options.label);
  scroller.append(stage);
  const legend = el('p', 'cm__legend', 'Grey: not done yet. Colour: done. Gold ring: next up. Faded: not set for you, still open. Diamond: quiz. Square: assessment, filled when your teacher has marked it.');
  root.append(scroller, legend);
  host.append(root);

  const paint = (): void => {
    const layer: ProgressLayer = { done, next, faded: options.faded };
    const nameW = fitNameWidth(map, collapsed, scroller.clientWidth || host.clientWidth || 700);
    const drawn = drawCoverageMap(map, { collapsed, selected: null, focus: null, student: null, progress: layer, nameW });
    stage.innerHTML = `<svg class="cm__svg" width="${drawn.width}" height="${drawn.height}" viewBox="0 0 ${drawn.width} ${drawn.height}">${drawn.svg}</svg>`;
  };

  const open = (target: Element): void => {
    const hit = target.closest<HTMLElement | SVGElement>('[data-row],[data-group]');
    if (!hit) return;
    const { row, group } = hit.dataset;
    if (group) {
      if (collapsed.has(group)) collapsed.delete(group);
      else collapsed.add(group);
      paint();
    } else if (row) {
      // A real link, so the class host and the umbrella both navigate correctly.
      const link = wireStudentAnchor(el('a'), `/s/classes/${options.classId}/lessons/${row}`);
      root.append(link);
      link.click();
      link.remove();
    }
  };
  stage.addEventListener('click', (event) => open(event.target as Element));
  stage.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!(event.target as Element).closest('[data-row],[data-group]')) return;
    event.preventDefault();
    open(event.target as Element);
  });

  paint();
  if (typeof ResizeObserver !== 'undefined') {
    let last = 0;
    new ResizeObserver(() => {
      const w = scroller.clientWidth;
      if (w && Math.abs(w - last) > 8) {
        last = w;
        paint();
      }
    }).observe(scroller);
  }
  return {
    update(nextDone, nextNext) {
      done = nextDone;
      next = nextNext;
      paint();
    }
  };
}
