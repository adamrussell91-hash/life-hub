import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { pendingReminders, snoozeReminder, type PendingReminder } from '@/domain/reminders';
import { errorMessage } from '@/views/feedback';
import { formatRecurrenceLabel, parseRecurrenceRule } from '@/domain/recurrence';

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

let browserNotifyRequested = false;

function maybeBrowserNotify(items: PendingReminder[]): void {
  if (!items.length || typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    const first = items[0]!;
    new Notification('Tasks Hub', {
      body: items.length === 1 ? first.label : `${items.length} reminders waiting`,
      tag: `tasks-remind-${first.task.id}`
    });
    return;
  }
  if (!browserNotifyRequested && Notification.permission === 'default') {
    browserNotifyRequested = true;
    void Notification.requestPermission();
  }
}

function renderReminderCard(
  item: PendingReminder,
  onChanged: () => void
): HTMLElement {
  const card = el('article', 'reminder-card');
  card.append(el('h3', 'reminder-card__title', item.task.title));
  card.append(el('p', 'reminder-card__copy', item.label));

  const meta = el('div', 'reminder-card__meta');
  const rule = parseRecurrenceRule(item.task.recurrence_rule);
  if (rule) meta.append(el('span', 'chip chip--muted', formatRecurrenceLabel(rule)));
  if (item.task.due_time) meta.append(el('span', 'chip chip--muted', item.task.due_time));
  if (meta.childElementCount) card.append(meta);

  const actions = el('div', 'reminder-card__actions');
  const open = el('button', 'btn btn--primary', 'Open task');
  open.type = 'button';
  open.addEventListener('click', () => {
    location.hash = '#/day';
    onChanged();
  });
  const snooze = el('button', 'btn btn--secondary', 'Snooze 1h');
  snooze.type = 'button';
  snooze.addEventListener('click', () => {
    void tasksApi
      .updateTask(item.task.id, {
        remind_at: snoozeReminder(item.task, 60),
        remind_dismissed_at: null
      })
      .then(onChanged)
      .catch((err) => window.alert(errorMessage(err)));
  });
  const dismiss = el('button', 'btn btn--ghost', 'Dismiss');
  dismiss.type = 'button';
  dismiss.addEventListener('click', () => {
    void tasksApi
      .updateTask(item.task.id, { remind_dismissed_at: new Date().toISOString() })
      .then(onChanged)
      .catch((err) => window.alert(errorMessage(err)));
  });
  actions.append(open, snooze, dismiss);
  card.append(actions);
  return card;
}

/** In-app reminder strip — surfaces tasks whose remind_at has passed. */
export async function renderReminderStrip(
  host: HTMLElement,
  onChanged?: () => void
): Promise<void> {
  host.replaceChildren();
  try {
    const tasks = await tasksApi.listTasks();
    const items = pendingReminders(tasks);
    if (!items.length) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    maybeBrowserNotify(items);

    const reload = () => {
      void renderReminderStrip(host, onChanged).then(() => onChanged?.());
    };

    const head = el('div', 'reminder-strip__head');
    head.append(
      el('span', 'chip', 'Notify'),
      el('p', 'reminder-strip__lede', `${items.length} reminder${items.length === 1 ? '' : 's'} waiting`)
    );
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const enable = el('button', 'btn btn--ghost reminder-strip__enable', 'Enable browser alerts');
      enable.type = 'button';
      enable.addEventListener('click', () => {
        void Notification.requestPermission();
      });
      head.append(enable);
    }
    host.append(head);

    const list = el('div', 'reminder-strip__list');
    for (const item of items.slice(0, 4)) {
      list.append(renderReminderCard(item, reload));
    }
    if (items.length > 4) {
      list.append(el('p', 'hierarchy-meta', `+${items.length - 4} more`));
    }
    host.append(list);
  } catch {
    host.hidden = true;
  }
}

export function taskHasReminderMeta(task: Task): boolean {
  return Boolean(task.remind_at) || Boolean(parseRecurrenceRule(task.recurrence_rule));
}
