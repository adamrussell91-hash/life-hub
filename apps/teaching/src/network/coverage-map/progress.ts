import { wireStudentAnchor } from '@/student/shell';
import type { CoverageMap, MapItem, MapItemKind } from './model';
import { drawCoverageMap, fitNameWidth, layoutLanes, progressNameWidth, PROGRESS_LANE_W, type ProgressLayer } from './draw';
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
  /** A short "where you are" line for a column's card, from the student's own progress; null leaves it out. */
  lineStatus?: (columnId: string) => string | null;
};

const KIND_LABEL: Record<MapItemKind, string> = {
  syllabus: 'Syllabus line',
  concept: 'Concept line',
  skill: 'Skill line',
  point: 'Syllabus dot point'
};
const lessonHref = (classId: string, lessonId: string) => `/s/classes/${classId}/lessons/${lessonId}`;

/** Measures names in the map's own type (14px semibold), so the name column fits them exactly. */
const measureName = (): ((text: string) => number) | undefined => {
  const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext?.('2d') : null;
  if (!ctx) return undefined;
  ctx.font = `600 14px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
  return (text) => ctx.measureText(text).width;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The map without the placeholder "Assessment task" row, which isn't a lesson a student can do. */
export const withoutPlaceholder = (map: CoverageMap): CoverageMap => ({ ...map, rows: map.rows.filter((r) => r.id !== '__terminus') });

/** Only the columns some lesson teaches: an empty column can never light up, so it is just noise to a student. */
export const taughtOnly = (map: CoverageMap): CoverageMap => {
  const taught = new Set(map.rows.flatMap((r) => [...r.teaches.keys()]));
  const groups = map.groups.map((g) => ({ ...g, items: g.items.filter((it) => taught.has(it.id)) })).filter((g) => g.items.length);
  return { ...map, groups };
};

export function mountProgressMap(host: HTMLElement, options: ProgressMapOptions): { update(done: ReadonlySet<string>, next: string | null): void } {
  const map = taughtOnly(withoutPlaceholder(options.map));
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

  const measure = measureName();
  const items = new Map(map.groups.flatMap((g) => g.items.map((it) => [it.id, it] as const)));
  /** The column whose card is open, its tag button, and the card. */
  let openId: string | null = null;
  let card: HTMLElement | null = null;
  const tagButton = (id: string) => [...stage.querySelectorAll<HTMLButtonElement>('.cm-tagbtn')].find((b) => b.dataset.column === id) ?? null;

  /** Under its tag, inside the map, and never wider than the map. */
  const place = (): void => {
    const btn = openId ? tagButton(openId) : null;
    if (!card || !btn) return;
    const box = root.getBoundingClientRect();
    const at = btn.getBoundingClientRect();
    const width = Math.min(300, root.clientWidth || 300);
    card.style.width = `${width}px`;
    const centre = at.left - box.left + at.width / 2;
    const room = Math.max(0, (root.clientWidth || width) - width);
    card.style.left = `${Math.round(Math.min(room, Math.max(0, centre - width / 2)))}px`;
    card.style.top = `${Math.round(at.bottom - box.top + 4)}px`;
  };

  const onOutside = (event: Event): void => {
    const target = event.target as Node;
    if (card?.contains(target) || (target instanceof Element && target.closest('.cm-tagbtn'))) return;
    close();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !openId) return;
    const id = openId;
    close();
    tagButton(id)?.focus();
  };

  function close(): void {
    if (openId) tagButton(openId)?.setAttribute('aria-expanded', 'false');
    openId = null;
    card?.remove();
    card = null;
    document.removeEventListener('click', onOutside, true);
    document.removeEventListener('keydown', onKey);
  }

  function cardFor(item: MapItem): HTMLElement {
    const box = el('div', 'cm-card');
    box.id = `cm-card-${Math.random().toString(36).slice(2, 8)}`;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', `${item.label} · ${item.name}`);
    const x = el('button', 'cm-card__close', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', () => {
      const id = openId;
      close();
      if (id) tagButton(id)?.focus();
    });
    box.append(x, el('p', 'cm-card__kind', KIND_LABEL[item.kind]));
    const head = el('h3', 'cm-card__title', `${item.label} · ${item.name}`);
    head.style.setProperty('--cm-card-colour', item.colour);
    box.append(head);
    box.append(el('p', `cm-card__meaning${item.meaning ? '' : ' is-empty'}`, item.meaning ?? 'Your teacher hasn’t added a description for this line yet.'));
    const rows = map.rows.filter((r) => r.teaches.has(item.id));
    const finished = rows.filter((r) => done.has(r.id)).length;
    box.append(el('p', 'cm-card__count', `${rows.length} ${rows.length === 1 ? 'lesson' : 'lessons'} in this unit · ${finished} done`));
    const status = options.lineStatus?.(item.id);
    if (status) box.append(el('p', 'cm-card__status', status));
    const todo = rows.filter((r) => !done.has(r.id));
    const nextRow = todo.find((r) => !options.faded.has(r.id)) ?? todo[0];
    if (nextRow) {
      const link = wireStudentAnchor(el('a', 'cm-card__next'), lessonHref(options.classId, nextRow.id));
      link.textContent = `Next lesson on this line: ${nextRow.title} →`;
      box.append(link);
    }
    return box;
  }

  function openCard(id: string): void {
    const item = items.get(id);
    if (!item) return;
    close();
    openId = id;
    card = cardFor(item);
    root.append(card);
    tagButton(id)?.setAttribute('aria-expanded', 'true');
    tagButton(id)?.setAttribute('aria-controls', card.id);
    place();
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onKey);
  }

  /** One button over each column's angled tag; the label itself stays in the drawing. */
  const tagButtons = (nameW: number): HTMLElement => {
    const layer = el('div', 'cm-tags');
    for (const lane of layoutLanes(map, { collapsed, nameW, laneW: PROGRESS_LANE_W }).lanes) {
      if (lane.collapsed) continue;
      const item = lane.items[0]!;
      const btn = el('button', 'cm-tagbtn');
      btn.type = 'button';
      btn.dataset.column = item.id;
      btn.setAttribute('aria-expanded', String(openId === item.id));
      btn.setAttribute('aria-label', `${item.name}: what this means`);
      btn.style.left = `${lane.x - PROGRESS_LANE_W / 2 + 4}px`;
      btn.style.width = `${PROGRESS_LANE_W - 2}px`;
      btn.addEventListener('click', () => (openId === item.id ? close() : openCard(item.id)));
      layer.append(btn);
    }
    return layer;
  };

  const paint = (): void => {
    const layer: ProgressLayer = { done, next, faded: options.faded };
    // Names take only the room they need, so the columns sit beside them instead of across a gap.
    const available = scroller.clientWidth || host.clientWidth || 700;
    const nameW = Math.min(progressNameWidth(map, measure), fitNameWidth(map, collapsed, available, 460, PROGRESS_LANE_W));
    const drawn = drawCoverageMap(map, { collapsed, selected: null, focus: null, student: null, progress: layer, nameW, laneW: PROGRESS_LANE_W });
    stage.innerHTML = `<svg class="cm__svg" width="${drawn.width}" height="${drawn.height}" viewBox="0 0 ${drawn.width} ${drawn.height}">${drawn.svg}</svg>`;
    stage.append(tagButtons(nameW));
    // A card stays open under its tag while the column shows; a folded column closes it.
    if (openId && !tagButton(openId)) close();
    else if (openId && card) {
      const item = items.get(openId)!;
      const fresh = cardFor(item);
      card.replaceWith(fresh);
      card = fresh;
      tagButton(openId)?.setAttribute('aria-controls', fresh.id);
      place();
    }
  };
  scroller.addEventListener('scroll', place, { passive: true });

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
