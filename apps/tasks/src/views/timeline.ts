import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import {
  chronologyBounds,
  collectChronologyItems,
  dayOffset
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

const PX_PER_DAY = 18;

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

export async function renderTimelineView(canvas: HTMLElement): Promise<void> {
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
    const bounds = chronologyBounds(items);
    const width = bounds.days * PX_PER_DAY;
    const track = el('div', 'chronology__track');
    track.style.width = `${width}px`;
    track.style.minHeight = `${Math.max(10, 3.5 + items.length * 2)}rem`;

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
      row.style.top = `${2.75 + index * 2}rem`;
      row.dataset.taskId = item.taskId;
      row.classList.toggle('is-focused', isFocusedTaskId(item.taskId));
      row.textContent = item.title;
      row.title = `${item.title} · ${formatDisplayDate(item.startKey)} → ${formatDisplayDate(item.endKey)}`;
      row.addEventListener('click', () => openTask(item.taskId));
      track.append(row);
    });

    scroll.replaceChildren(track);

    const focus = getFocus();
    if (focus?.type === 'task' && items.some((item) => item.taskId === focus.id)) {
      openTask(focus.id);
    }
  }

  subscribeFocus((ref) => {
    for (const bar of scroll.querySelectorAll<HTMLElement>('.chronology__bar')) {
      bar.classList.toggle(
        'is-focused',
        Boolean(ref && ref.type === 'task' && bar.dataset.taskId === ref.id)
      );
    }
  });

  paint();
}
