import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, onTasksDeleted } from '@/services/task-cache';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { toDateKey } from '@/domain/queries';
import {
  chronologyBounds,
  collectChronologyItems,
  dayOffset,
  type ChronologyItem
} from '@/domain/chronology';
import {
  getFocus,
  hydrateFocusFromHash,
  isFocusedTaskId,
  setFocus,
  subscribeFocus
} from '@/domain/focus';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';
import { renderTaskEditor } from '@/views/task-editor';

const PX_PER_DAY = 22;

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

function groupByDueDate(items: ChronologyItem[]): { dueKey: string; items: ChronologyItem[] }[] {
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

function paintTrack(
  items: ChronologyItem[],
  onOpen: (taskId: string) => void
): HTMLElement {
  const bounds = chronologyBounds(items);
  const width = bounds.days * PX_PER_DAY;
  const track = el('div', 'chronology__track');
  track.style.width = `${width}px`;
  track.style.minHeight = `${Math.max(10, 3 + items.length * 1.45)}rem`;

  const axis = el('div', 'chronology__axis');
  axis.style.width = `${width}px`;
  for (let i = 0; i < bounds.days; i += 7) {
    const tick = el('span', 'chronology__tick');
    tick.style.left = `${i * PX_PER_DAY}px`;
    const date = new Date(bounds.start);
    date.setDate(date.getDate() + i);
    tick.textContent = formatDisplayDate(date);
    axis.append(tick);
  }
  track.append(axis);

  const todayOffset = dayOffset(bounds.start, toDateKey(new Date()));
  if (todayOffset >= 0 && todayOffset <= bounds.days) {
    const todayMark = el('div', 'chronology__today');
    todayMark.style.left = `${todayOffset * PX_PER_DAY}px`;
    todayMark.setAttribute('aria-hidden', 'true');
    track.append(todayMark);
  }

  if (!items.length) {
    track.append(el('p', 'empty-state', 'No dated tasks yet. Give work a due date to see it here.'));
  }

  items.forEach((item, index) => {
    const row = el('button', 'chronology__bar');
    row.type = 'button';
    const left = dayOffset(bounds.start, item.startKey) * PX_PER_DAY;
    const span = Math.max(
      1,
      dayOffset(bounds.start, item.endKey) - dayOffset(bounds.start, item.startKey) + 1
    );
    row.style.left = `${left}px`;
    row.style.width = `${span * PX_PER_DAY}px`;
    row.style.top = `${2.5 + index * 1.45}rem`;
    row.dataset.taskId = item.taskId;
    row.dataset.status = item.status;
    row.classList.toggle('is-focused', isFocusedTaskId(item.taskId));
    row.textContent = item.title;
    row.title = `${item.title} · ${rangeLabel(item)}`;
    row.addEventListener('click', () => onOpen(item.taskId));
    track.append(row);
  });

  return track;
}

/** Phone layout — full titles by due date. Horizontal bars crush to 2 letters under 720px. */
function paintList(
  items: ChronologyItem[],
  onOpen: (taskId: string) => void
): HTMLElement {
  const list = el('ol', 'chronology__list');
  list.setAttribute('aria-label', 'Dated work by due date');

  if (!items.length) {
    list.append(el('p', 'empty-state', 'No dated tasks yet. Give work a due date to see it here.'));
    return list;
  }

  const todayKey = toDateKey(new Date());
  for (const group of groupByDueDate(items)) {
    const day = el('li', 'chronology__day');
    day.dataset.dueKey = group.dueKey;
    if (group.dueKey === todayKey) day.classList.add('is-today');

    const when = el('p', 'chronology__when', formatDisplayDate(group.dueKey));
    if (group.dueKey === todayKey) when.append(document.createTextNode(' · Today'));
    day.append(when);

    const stack = el('div', 'chronology__day-items');
    for (const item of group.items) {
      const row = el('button', 'chronology__item');
      row.type = 'button';
      row.dataset.taskId = item.taskId;
      row.dataset.status = item.status;
      row.classList.toggle('is-focused', isFocusedTaskId(item.taskId));
      row.setAttribute('aria-label', `${item.title}, due ${formatDisplayDate(item.endKey)}`);
      row.append(el('span', 'chronology__item-title', item.title));
      const metaBits = [rangeLabel(item)];
      if (item.projectTitle) metaBits.push(item.projectTitle);
      row.append(el('span', 'chronology__item-meta', metaBits.join(' · ')));
      row.addEventListener('click', () => onOpen(item.taskId));
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
  try {
    [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderTimelineView(canvas), 'Could not load timeline');
    return;
  }

  hydrateFocusFromHash();

  const root = el('div', 'chronology');
  const lede = el(
    'p',
    'view-lede',
    'Chronology — how dated work unfolds. Not the Gantt: no dependency arrows here.'
  );
  const scroll = el('div', 'chronology__scroll');
  const preview = el('aside', 'graph-preview chronology__preview');
  preview.hidden = true;
  const side = el('div', 'chronology__side');
  side.append(preview);
  root.append(lede, scroll, side);
  canvas.replaceChildren(root);

  function openTask(taskId: string): void {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) return;
    setFocus({ type: 'task', id: taskId });
    preview.hidden = false;
    void renderTaskEditor(preview, task, projects, () => void renderTimelineView(canvas)).catch((err) => {
      preview.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    });
  }

  function paint(): void {
    const items = collectChronologyItems(tasks, projects);
    scroll.replaceChildren(paintTrack(items, openTask), paintList(items, openTask));

    const focus = getFocus();
    if (focus?.type === 'task' && items.some((item) => item.taskId === focus.id)) {
      openTask(focus.id);
    }
  }

  subscribeFocus((ref) => {
    for (const node of scroll.querySelectorAll<HTMLElement>('.chronology__bar, .chronology__item')) {
      node.classList.toggle(
        'is-focused',
        Boolean(ref && ref.type === 'task' && node.dataset.taskId === ref.id)
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
