import type { ScheduledLesson, Unit } from '@/schemas';
import { unitDateProgress, unitDateSpan } from '@/schedule/unit-progress';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export type SequenceUnit = Pick<Unit, 'id' | 'title'> &
  Partial<Pick<Unit, 'start_date' | 'end_date'>>;

export type SequenceScheduledLesson = Pick<
  ScheduledLesson,
  'id' | 'lesson_id' | 'unit_id' | 'date' | 'schedule_order' | 'delivery_status'
>;

export interface RenderUnitSequenceOptions {
  units: SequenceUnit[];
  scheduled: SequenceScheduledLesson[];
  lessonTitles: Map<string, string>;
  currentUnitId: string;
  classId: string;
  today: string;
  onMoveUp?: (scheduledId: string) => void;
  onMoveDown?: (scheduledId: string) => void;
  onOverflow?: (scheduledId: string, anchor: HTMLElement) => void;
  onNavigate?: (path: string) => void;
  /** Hide reorder/overflow controls (student / read-only class page). */
  readOnly?: boolean;
  lessonHref?: (entry: SequenceScheduledLesson) => string | null;
  unitHref?: (unitId: string) => string;
}

type SequenceHandlers = Pick<
  RenderUnitSequenceOptions,
  'onMoveUp' | 'onMoveDown' | 'onOverflow' | 'onNavigate' | 'readOnly' | 'lessonHref' | 'unitHref'
>;

const handlersByRoot = new WeakMap<HTMLElement, SequenceHandlers>();

function storageKey(classId: string): string {
  return `th:class:${classId}:openUnits`;
}

function readOpenUnits(classId: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(classId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return null;
  }
}

function writeOpenUnits(classId: string, ids: string[]): void {
  try {
    localStorage.setItem(storageKey(classId), JSON.stringify(ids));
  } catch {
    // localStorage may be unavailable (private mode, quota).
  }
}

function formatShortDate(date: string): string {
  return formatDisplayDate(date);
}

function formatDateRange(start: string, end: string): string {
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

function compareScheduled(a: SequenceScheduledLesson, b: SequenceScheduledLesson): number {
  const byOrder = a.schedule_order - b.schedule_order;
  if (byOrder !== 0) return byOrder;
  return a.date.localeCompare(b.date);
}

function earliestScheduled(rows: SequenceScheduledLesson[]): SequenceScheduledLesson | undefined {
  return [...rows].sort(compareScheduled)[0];
}

function unitsInScheduleOrder(units: SequenceUnit[], scheduled: SequenceScheduledLesson[]): SequenceUnit[] {
  const byUnit = new Map<string, SequenceScheduledLesson[]>();
  for (const row of scheduled) {
    const list = byUnit.get(row.unit_id) ?? [];
    list.push(row);
    byUnit.set(row.unit_id, list);
  }

  return [...units].sort((a, b) => {
    const aFirst = earliestScheduled(byUnit.get(a.id) ?? []);
    const bFirst = earliestScheduled(byUnit.get(b.id) ?? []);
    if (!aFirst && !bFirst) return units.indexOf(a) - units.indexOf(b);
    if (!aFirst) return 1;
    if (!bFirst) return -1;
    return compareScheduled(aFirst, bFirst);
  });
}

function wireSpaLink(
  anchor: HTMLAnchorElement,
  root: HTMLElement,
  options?: { stopPropagation?: boolean }
): void {
  anchor.addEventListener('click', (event) => {
    if (options?.stopPropagation) event.stopPropagation();
    const navigate = handlersByRoot.get(root)?.onNavigate;
    if (!navigate) return;
    event.preventDefault();
    navigate(anchor.getAttribute('href') ?? '/');
  });
}

function lessonMarker(index: number, status: SequenceScheduledLesson['delivery_status']): string {
  return status === 'delivered' ? '✓' : String(index);
}

function resolveLessonHref(root: HTMLElement, entry: SequenceScheduledLesson): string | null {
  const custom = handlersByRoot.get(root)?.lessonHref;
  if (custom) return custom(entry);
  return `/lessons/${entry.lesson_id}`;
}

function buildLessonRow(
  entry: SequenceScheduledLesson,
  index: number,
  lessonTitles: Map<string, string>,
  root: HTMLElement
): HTMLElement {
  // Row is a div so reorder buttons are valid siblings of the lesson link.
  const row = document.createElement('div');
  row.className = 'seq__row';

  const href = resolveLessonHref(root, entry);
  const link = document.createElement(href ? 'a' : 'div');
  link.className = 'seq__lesson-link';
  if (href && link instanceof HTMLAnchorElement) {
    link.href = href;
    wireSpaLink(link, root);
  }

  const marker = document.createElement('span');
  marker.className = 'seq__marker';
  marker.textContent = lessonMarker(index, entry.delivery_status);

  const title = document.createElement('span');
  title.className = 'seq__lesson-title';
  title.textContent = lessonTitles.get(entry.lesson_id) ?? entry.lesson_id;

  const date = document.createElement('span');
  date.className = 'seq__lesson-date';
  date.textContent = formatShortDate(entry.date);

  const status = document.createElement('span');
  status.className = 'seq__lesson-status';
  status.textContent = entry.delivery_status;

  link.append(marker, title, date, status);
  row.append(link);

  if (handlersByRoot.get(root)?.readOnly) {
    return row;
  }

  const controls = document.createElement('span');
  controls.className = 'seq__controls';

  const up = document.createElement('button');
  up.type = 'button';
  up.textContent = '↑';
  up.setAttribute('aria-label', 'Move up');
  up.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlersByRoot.get(root)?.onMoveUp?.(entry.id);
  });

  const down = document.createElement('button');
  down.type = 'button';
  down.textContent = '↓';
  down.setAttribute('aria-label', 'Move down');
  down.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlersByRoot.get(root)?.onMoveDown?.(entry.id);
  });

  const overflow = document.createElement('button');
  overflow.type = 'button';
  overflow.textContent = '⋯';
  overflow.setAttribute('aria-label', 'More actions');
  overflow.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlersByRoot.get(root)?.onOverflow?.(entry.id, overflow);
  });

  controls.append(up, down, overflow);
  row.append(controls);
  return row;
}

function buildUnitDetails(
  unit: SequenceUnit,
  unitLessons: SequenceScheduledLesson[],
  openIds: Set<string>,
  options: RenderUnitSequenceOptions,
  root: HTMLElement
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'seq__unit';
  details.dataset.unitId = unit.id;
  details.open = openIds.has(unit.id);

  const summary = document.createElement('summary');
  summary.className = 'seq__summary';

  const unitHref = handlersByRoot.get(root)?.unitHref?.(unit.id) ?? `/units/${unit.id}`;
  const titleLink = document.createElement('a');
  titleLink.className = 'seq__unit-title';
  titleLink.href = unitHref;
  titleLink.textContent = unit.title;
  wireSpaLink(titleLink, root, { stopPropagation: true });

  const meta = document.createElement('span');
  meta.className = 'seq__unit-meta';
  const lessonCount = unitLessons.length;
  const lessonLabel = `${lessonCount} ${lessonCount === 1 ? 'lesson' : 'lessons'}`;
  const span = unitDateSpan(unit, options.scheduled);
  const rangeLabel = span ? formatDateRange(span.start, span.end) : 'Not scheduled';
  meta.textContent = ` · ${lessonLabel} · ${rangeLabel}`;

  summary.append(titleLink, meta);

  if (span) {
    const progress = document.createElement('div');
    progress.className = 'seq__progress';
    progress.setAttribute('aria-hidden', 'true');

    const bar = document.createElement('div');
    bar.className = 'seq__progress-bar';
    const { ratio } = unitDateProgress(span, options.today);
    bar.style.width = `${Math.round(ratio * 1000) / 10}%`;
    progress.append(bar);
    summary.append(progress);
  }

  details.append(summary);

  const list = document.createElement('div');
  list.className = 'seq__lessons';
  const ordered = [...unitLessons].sort(compareScheduled);
  ordered.forEach((entry, index) => {
    list.append(buildLessonRow(entry, index + 1, options.lessonTitles, root));
  });
  details.append(list);

  details.addEventListener('toggle', () => {
    const open = [...root.querySelectorAll<HTMLDetailsElement>('details.seq__unit')]
      .filter((el) => el.open)
      .map((el) => el.dataset.unitId!)
      .filter(Boolean);
    writeOpenUnits(options.classId, open);
  });

  return details;
}

/**
 * Collapsible per-unit lesson sequence for the class page.
 * Open state persists under `th:class:<classId>:openUnits`.
 */
export function renderUnitSequence(
  host: HTMLElement,
  options: RenderUnitSequenceOptions
): { dispose: () => void } {
  const root = document.createElement('div');
  root.className = 'unit-sequence';
  handlersByRoot.set(root, {
    onMoveUp: options.onMoveUp,
    onMoveDown: options.onMoveDown,
    onOverflow: options.onOverflow,
    onNavigate: options.onNavigate,
    readOnly: options.readOnly,
    lessonHref: options.lessonHref,
    unitHref: options.unitHref
  });

  const stored = readOpenUnits(options.classId);
  const openIds = new Set(stored ?? [options.currentUnitId]);

  const byUnit = new Map<string, SequenceScheduledLesson[]>();
  for (const row of options.scheduled) {
    const list = byUnit.get(row.unit_id) ?? [];
    list.push(row);
    byUnit.set(row.unit_id, list);
  }

  for (const unit of unitsInScheduleOrder(options.units, options.scheduled)) {
    root.append(
      buildUnitDetails(unit, byUnit.get(unit.id) ?? [], openIds, options, root)
    );
  }

  host.replaceChildren(root);

  return {
    dispose: () => {
      handlersByRoot.delete(root);
      if (host.contains(root)) host.replaceChildren();
    }
  };
}
