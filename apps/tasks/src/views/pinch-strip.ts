import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import {
  applyShrinkPatch,
  detectPinchPoints,
  dueSoonTasks,
  type PinchPoint,
  type ShrinkSuggestion
} from '@/domain/pinch';

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

async function runShrink(
  task: Task,
  suggestion: ShrinkSuggestion,
  dateKey: string
): Promise<void> {
  const plan = applyShrinkPatch(task, suggestion, dateKey);
  if (plan.mode === 'delete') {
    await tasksApi.deleteTask(task.id, {
      agent: 'Clare DeMind',
      reason: `Pinch shrink: ${suggestion.detail}`
    });
    return;
  }
  await tasksApi.updateTask(task.id, plan.patch);
}

function showShrinkConfirm(
  host: HTMLElement,
  pinch: PinchPoint,
  suggestion: ShrinkSuggestion,
  task: Task,
  onDone: () => void
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm shrink');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'pinch-confirm__title', suggestion.label));
  card.append(el('p', 'page-header__supporting', `${suggestion.detail} Do not apply until Confirm.`));
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await runShrink(task, suggestion, pinch.date_key);
      host.replaceChildren(el('p', 'canvas-status', 'Shrink applied.'));
      onDone();
    } catch (err) {
      host.replaceChildren(
        el('p', 'empty-state', err instanceof Error ? err.message : 'Shrink failed')
      );
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
}

function renderPinchCard(pinch: PinchPoint, confirmHost: HTMLElement, onDone: () => void): HTMLElement {
  const card = el('article', `pinch-card pinch-card--${pinch.severity}`);
  card.append(
    el(
      'p',
      'page-header__eyebrow',
      pinch.severity === 'overloaded' ? 'Pinch · overloaded' : 'Pinch · watch'
    )
  );
  card.append(el('p', 'pinch-card__summary', pinch.summary));

  if (!pinch.shrink.length) {
    card.append(el('p', 'pinch-card__empty', 'No safe shrink moves — protect the high-priority work.'));
    return card;
  }

  const actions = el('div', 'pinch-card__actions');
  for (const suggestion of pinch.shrink) {
    const task = pinch.tasks.find((t) => t.id === suggestion.task_id);
    if (!task) continue;
    const btn = el('button', 'btn btn--secondary', suggestion.label);
    btn.type = 'button';
    btn.title = suggestion.detail;
    btn.addEventListener('click', () => showShrinkConfirm(confirmHost, pinch, suggestion, task, onDone));
    actions.append(btn);
  }
  card.append(actions);
  return card;
}

export type PressureStripOptions = {
  /** Due-soon pills. Off on the dashboard — that story lives in the timeline. */
  dueSoon?: boolean;
  emptyClear?: boolean;
};

/** Due-soon strip + pinch flags for Day / Week (in-app reminders). */
export function renderPressureStrips(
  host: HTMLElement,
  tasks: Task[],
  anchor: Date,
  onChanged: () => void,
  options: PressureStripOptions = {}
): void {
  host.replaceChildren();
  const showDueSoon = options.dueSoon !== false;
  const soon = showDueSoon ? dueSoonTasks(tasks, anchor, 1) : [];
  const pinches = detectPinchPoints(tasks, anchor, { days: 7 });

  if (soon.length) {
    const strip = el('div', 'due-soon-strip');
    strip.append(el('span', 'chip', 'Due soon'));
    for (const item of soon.slice(0, 5)) {
      strip.append(
        el(
          'span',
          'chip chip--muted',
          `${item.label}: ${item.task.title}`
        )
      );
    }
    host.append(strip);
  }

  if (!pinches.length) {
    if (!soon.length && options.emptyClear !== false) {
      host.append(el('p', 'pinch-clear', 'No pinch points in the next week.'));
    }
    return;
  }

  const confirmHost = el('div', 'pinch-confirm');
  const list = el('div', 'pinch-list');
  for (const pinch of pinches) {
    list.append(renderPinchCard(pinch, confirmHost, onChanged));
  }
  host.append(list, confirmHost);
}
