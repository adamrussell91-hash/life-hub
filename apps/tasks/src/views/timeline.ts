import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { Program } from '@/schemas/program';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, onTasksDeleted } from '@/services/task-cache';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { toDateKey } from '@/domain/queries';
import {
  chronologyAxisKeys,
  chronologyItemsInWindow,
  chronologyWindow,
  clipChronologySpan,
  collectChronologyItems,
  dayOffset,
  filterChronologyItems,
  packChronologyLanes,
  type ChronologyFilters,
  type ChronologyItem,
  type ChronologySource,
  type ChronologyZoom
} from '@/domain/chronology';
import { statusBadgeClass, statusLabel } from '@/domain/cards';
import { ProjectStatusSchema } from '@/schemas/project';
import {
  getFocus,
  hydrateFocusFromHash,
  subscribeFocus
} from '@/domain/focus';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import { createHubFilter, createHubPills, createHubToolbar } from '@/views/hub-kit';
import { renderLoadError, showViewLoading } from '@/views/feedback';

const LANE_TOP = 2.75;
const LANE_HEIGHT = 2.85;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function rangeLabel(item: ChronologyItem): string {
  if (item.startKey === item.endKey) return formatDisplayDate(item.endKey);
  return `${formatDisplayDate(item.startKey)} → ${formatDisplayDate(item.endKey)}`;
}

function pct(offset: number, days: number): string {
  return `${(Math.max(0, offset) / Math.max(1, days)) * 100}%`;
}

function isPast(item: ChronologyItem, todayKey: string): boolean {
  return item.endKey < todayKey;
}

function isFocusedItem(item: ChronologyItem): boolean {
  const focus = getFocus();
  return Boolean(focus && focus.type === 'project' && focus.id === item.id);
}

type TimelineSession = {
  zoom: ChronologyZoom;
  source: ChronologySource | 'all';
  status: string;
};

const session: TimelineSession = {
  zoom: 'all',
  source: 'all',
  status: 'all'
};

export function resetTimelineSession(): void {
  session.zoom = 'all';
  session.source = 'all';
  session.status = 'all';
}

function filtersAreSet(): boolean {
  return session.source !== 'all' || (session.status !== 'all' && session.status !== '');
}

function paintBar(
  item: ChronologyItem,
  boundsDays: number,
  boundsStart: Date,
  top: string
): HTMLAnchorElement | null {
  const clipped = clipChronologySpan(item, boundsStart, boundsDays);
  if (!clipped) return null;
  const todayKey = toDateKey(new Date());
  const row = document.createElement('a');
  row.className = 'chronology__bar';
  row.href = item.href;
  row.style.left = pct(clipped.left, boundsDays);
  row.style.width = pct(clipped.span, boundsDays);
  row.style.top = top;
  row.dataset.id = item.id;
  row.dataset.source = item.source;
  row.dataset.status = item.status;
  row.classList.toggle('is-focused', isFocusedItem(item));
  row.classList.toggle('is-past', isPast(item, todayKey));
  row.title = `${item.title} · ${item.kindLabel} · ${statusLabel(item.status)} · ${rangeLabel(item)}`;
  row.setAttribute(
    'aria-label',
    `${item.title}, ${item.kindLabel}, ${statusLabel(item.status)}, ${rangeLabel(item)}`
  );
  row.append(el('span', 'chronology__bar-title', item.title));
  const badge = el('span', statusBadgeClass(item.status), statusLabel(item.status));
  row.append(badge);
  return row;
}

function paintTrack(
  items: ChronologyItem[],
  bounds: { start: Date; end: Date; days: number }
): HTMLElement {
  const lanes = packChronologyLanes(items);
  const track = el('div', 'chronology__track');
  track.style.minHeight = `${Math.max(14, LANE_TOP + Math.max(1, lanes.length) * LANE_HEIGHT + 1.25)}rem`;

  const axis = el('div', 'chronology__axis');
  for (const key of chronologyAxisKeys(bounds.start, bounds.days)) {
    const tick = el('span', 'chronology__tick');
    tick.style.left = pct(dayOffset(bounds.start, key), bounds.days);
    tick.textContent = formatDisplayDate(key);
    axis.append(tick);
  }
  track.append(axis);

  const todayOffset = dayOffset(bounds.start, toDateKey(new Date()));
  if (todayOffset >= 0 && todayOffset <= bounds.days) {
    const todayMark = el('div', 'chronology__today');
    todayMark.style.left = pct(todayOffset, bounds.days);
    todayMark.setAttribute('aria-hidden', 'true');
    track.append(todayMark);
  }

  if (!items.length) {
    track.append(
      el('p', 'empty-state', 'No dated projects, excursions, or programs match this view.')
    );
  }

  lanes.forEach((lane, laneIndex) => {
    const top = `${LANE_TOP + laneIndex * LANE_HEIGHT}rem`;
    for (const item of lane) {
      const bar = paintBar(item, bounds.days, bounds.start, top);
      if (bar) track.append(bar);
    }
  });

  return track;
}

function groupByEndDate(items: ChronologyItem[]): { dueKey: string; items: ChronologyItem[] }[] {
  const groups = new Map<string, ChronologyItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.endKey);
    if (bucket) bucket.push(item);
    else groups.set(item.endKey, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dueKey, group]) => ({ dueKey, items: group }));
}

/** Phone layout — full titles by target date. Horizontal bars hide under 720px. */
function paintList(items: ChronologyItem[]): HTMLElement {
  const list = el('ol', 'chronology__list');
  list.setAttribute('aria-label', 'Dated work by target date');

  if (!items.length) {
    list.append(el('p', 'empty-state', 'No dated projects, excursions, or programs match this view.'));
    return list;
  }

  const todayKey = toDateKey(new Date());
  for (const group of groupByEndDate(items)) {
    const day = el('li', 'chronology__day');
    day.dataset.dueKey = group.dueKey;
    if (group.dueKey === todayKey) day.classList.add('is-today');

    const when = el('p', 'chronology__when', formatDisplayDate(group.dueKey));
    if (group.dueKey === todayKey) when.append(document.createTextNode(' · Today'));
    day.append(when);

    const stack = el('div', 'chronology__day-items');
    for (const item of group.items) {
      const row = document.createElement('a');
      row.className = 'chronology__item';
      row.href = item.href;
      row.dataset.id = item.id;
      row.dataset.source = item.source;
      row.dataset.status = item.status;
      row.classList.toggle('is-focused', isFocusedItem(item));
      row.setAttribute(
        'aria-label',
        `${item.title}, ${item.kindLabel}, ${statusLabel(item.status)}, ${rangeLabel(item)}`
      );
      const titleRow = el('span', 'chronology__item-head');
      titleRow.append(el('span', 'chronology__item-title', item.title));
      titleRow.append(el('span', statusBadgeClass(item.status), statusLabel(item.status)));
      row.append(titleRow);
      row.append(el('span', 'chronology__item-meta', `${item.kindLabel} · ${rangeLabel(item)}`));
      stack.append(row);
    }
    day.append(stack);
    list.append(day);
  }

  return list;
}

let teardownTimeline: (() => void) | null = null;

export async function renderTimelineView(canvas: HTMLElement): Promise<void> {
  teardownTimeline?.();
  teardownTimeline = null;
  showViewLoading(canvas, 'Loading timeline…', '.chronology');
  let tasks: Task[];
  let projects: Project[];
  let programs: Program[] = [];
  try {
    [tasks, projects, programs] = await Promise.all([
      tasksApi.listTasks(),
      tasksApi.listProjects(),
      tasksApi.listPrograms().catch(() => [] as Program[])
    ]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderTimelineView(canvas), 'Could not load timeline');
    return;
  }

  hydrateFocusFromHash();

  const root = el('div', 'chronology');
  const lede = el(
    'p',
    'view-lede',
    'Projects, excursions, and programs — how the larger pieces unfold. Open a bar for the full page.'
  );
  const toolbar = createHubToolbar('chronology-toolbar');
  const left = el('div', 'chronology-toolbar__group');
  const right = el('div', 'chronology-toolbar__group');
  const zoomHost = el('div');
  const scroll = el('div', 'chronology__scroll');

  function currentFilters(): ChronologyFilters {
    return { source: session.source, status: session.status };
  }

  const filters = createCollapsibleFilters({
    id: 'timeline',
    ariaLabel: 'Filters',
    className: 'hub-filters--inline',
    active: filtersAreSet()
  });
  const kind = createHubFilter({
    key: 'Kind',
    label: 'Kind',
    defaultValue: 'all',
    value: session.source,
    options: [
      { value: 'all', label: 'All kinds' },
      { value: 'project', label: 'Project' },
      { value: 'excursion', label: 'Excursion' },
      { value: 'program', label: 'Program' }
    ],
    onChange: (value) => {
      session.source = value as ChronologySource | 'all';
      filters.toggle.classList.toggle('is-set', filtersAreSet());
      paint();
    }
  });
  const status = createHubFilter({
    key: 'Status',
    label: 'Status',
    defaultValue: 'all',
    value: session.status,
    options: [
      { value: 'all', label: 'All statuses' },
      ...ProjectStatusSchema.options
        .filter((value) => value !== 'archived_dead')
        .map((value) => ({ value, label: statusLabel(value) }))
    ],
    onChange: (value) => {
      session.status = value;
      filters.toggle.classList.toggle('is-set', filtersAreSet());
      paint();
    }
  });
  filters.panel.append(kind.el, status.el);
  left.append(filters.root);

  function paintZoom(): void {
    zoomHost.replaceChildren(
      createHubPills<ChronologyZoom>({
        label: 'Zoom',
        items: [
          { id: 'week', label: 'Week' },
          { id: 'month', label: 'Month' },
          { id: 'term', label: 'Term' },
          { id: 'all', label: 'All' }
        ],
        value: session.zoom,
        onSelect: (id) => {
          session.zoom = id;
          paintZoom();
          paint();
        }
      })
    );
  }

  right.append(zoomHost);
  toolbar.append(left, right);
  root.append(lede, toolbar, scroll);
  canvas.replaceChildren(root);
  paintZoom();

  function paint(): void {
    const items = filterChronologyItems(
      collectChronologyItems(tasks, projects, programs),
      currentFilters()
    );
    const bounds = chronologyWindow(session.zoom, items);
    const visible = chronologyItemsInWindow(items, bounds.start, bounds.end);
    scroll.replaceChildren(paintTrack(visible, bounds), paintList(visible));
  }

  subscribeFocus((ref) => {
    for (const node of scroll.querySelectorAll<HTMLElement>('.chronology__bar, .chronology__item')) {
      node.classList.toggle(
        'is-focused',
        Boolean(ref && ref.type === 'project' && node.dataset.id === ref.id)
      );
    }
  });

  const stopChanged = onTasksChanged((incoming) => {
    for (const task of incoming) {
      const index = tasks.findIndex((entry) => entry.id === task.id);
      if (index >= 0) tasks[index] = task;
      else tasks.push(task);
    }
    paint();
  });
  const stopDeleted = onTasksDeleted((ids) => {
    tasks = tasks.filter((task) => !ids.includes(task.id));
    paint();
  });
  teardownTimeline = () => {
    stopChanged();
    stopDeleted();
  };

  paint();
}
