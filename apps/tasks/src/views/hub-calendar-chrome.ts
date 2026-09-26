/**
 * Tasks calendar chrome around the locked kit object — KEEP features from
 * HUB-MIGRATION.md (plan-work, planning lens, Day agenda, pinch/pressure,
 * keyboard shortcuts, rail widgets). Not a second calendar skin.
 */
import { createHubPills } from '@/views/hub-kit';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { detectPinchPoints } from '@/domain/pinch';
import { pinchLineLabel, renderPressureStrips } from '@/views/pinch-strip';
import { tasksApi } from '@/services/client-api';
import { taskPageHash } from '@/domain/cards';
import type { PlanningLayer } from '@/domain/calendar';
import type { Task } from '@/schemas/task';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export type TasksCalendarChromeState = {
  planWorkMode: boolean;
  planningLens: boolean;
  layers: PlanningLayer[];
};

const state: TasksCalendarChromeState = {
  planWorkMode: false,
  planningLens: false,
  layers: ['hard_deadline', 'planned_work', 'protected_time']
};

export function getTasksCalendarChromeState(): TasksCalendarChromeState {
  return { ...state, layers: [...state.layers] };
}

export function isPlanWorkMode(): boolean {
  return state.planWorkMode;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function openCalendarCommand(
  mode: 'date' | 'help',
  onDate: (value: string) => void,
  onAdd: () => void
): void {
  document.querySelector('.calendar-command')?.remove();
  const overlay = el('div', 'calendar-command');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', mode === 'date' ? 'Go to date' : 'Calendar shortcuts');
  const panel = el('div', 'calendar-command__panel');
  if (mode === 'date') {
    panel.append(el('h3', 'hub-calendar__detail-heading', 'Go to date'));
    const form = el('form', 'quick-add hub-toolbar');
    const field = document.createElement('input');
    field.className = 'hub-search__input';
    field.type = 'text';
    field.placeholder = 'dd/mm/yy or today';
    field.setAttribute('aria-label', 'Go to date');
    const go = el('button', 'btn btn--primary', 'Go');
    go.type = 'submit';
    form.append(field, go);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      onDate(field.value);
      overlay.remove();
    });
    panel.append(form);
  } else {
    panel.append(el('h3', 'hub-calendar__detail-heading', 'Shortcuts'));
    const list = el('ul', 'calendar-command__list');
    for (const [key, label] of [
      ['A', 'Add / compose'],
      ['T', 'Jump to today'],
      ['G', 'Go to date'],
      ['D / W', 'Day, week'],
      ['⌘K / ?', 'This menu']
    ] as const) {
      const row = el('li');
      const btn = el('button');
      btn.type = 'button';
      btn.append(el('span', '', label), el('kbd', 'hub-kbd', key));
      btn.addEventListener('click', () => {
        overlay.remove();
        if (key === 'A') onAdd();
        if (key === 'T') onDate('today');
        if (key === 'G') openCalendarCommand('date', onDate, onAdd);
      });
      row.append(btn);
      list.append(row);
    }
    panel.append(list);
  }
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });
  overlay.append(panel);
  document.body.append(overlay);
  overlay.querySelector('input')?.focus();
}

function renderShortcutHint(): HTMLElement {
  const hint = el('p', 'calendar-shortcuts');
  for (const [key, label] of [
    ['A', 'Add'],
    ['T', 'Today'],
    ['G', 'Date'],
    ['?', 'Keys']
  ] as const) {
    const item = el('span');
    item.append(el('kbd', 'hub-kbd', key), document.createTextNode(` ${label}`));
    hint.append(item);
  }
  return hint;
}

function renderDayAgenda(tasks: Task[], dateKey: string): HTMLElement {
  const agenda = el('section', 'hub-calendar__detail');
  agenda.dataset.part = 'day-agenda';
  agenda.append(el('h3', 'hub-calendar__detail-heading', formatDisplayDate(dateKey)));
  const dayTasks = tasks.filter((t) => t.due_date === dateKey && t.status !== 'done');
  agenda.append(
    el(
      'p',
      'hub-calendar__detail-empty',
      dayTasks.length
        ? `${dayTasks.length} on this day`
        : 'Nothing on this day yet — use Plan work or Accept a ghost.'
    )
  );
  const stack = el('div', 'task-stack calendar-agenda__stack');
  for (const task of dayTasks.slice(0, 12)) {
    const row = el('a', 'hub-row');
    row.href = taskPageHash(task.id);
    row.append(el('p', 'hub-row__title', task.title));
    stack.append(row);
  }
  agenda.append(stack);
  return agenda;
}

function renderLocksWidget(tasks: Task[], weekDates: string[]): HTMLElement {
  const card = el('section', 'hub-calendar__detail calendar-locks');
  card.dataset.part = 'rail-locks';
  card.append(el('h3', 'hub-calendar__detail-heading', "This week's locks"));
  const list = el('div', 'calendar-locks__list');
  for (const date of weekDates) {
    const lock = tasks.find((t) => t.due_date === date && t.status !== 'done');
    const row = el('button', `calendar-lock-row${lock ? ' is-locked' : ''}`);
    row.type = 'button';
    row.disabled = !lock;
    const day = new Date(`${date}T12:00:00`);
    row.append(
      el('span', 'calendar-lock-row__day', day.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase()),
      el('span', 'calendar-lock-row__task', lock ? lock.title : 'Nothing due')
    );
    if (lock) {
      row.addEventListener('click', () => {
        location.hash = taskPageHash(lock.id);
      });
    }
    list.append(row);
  }
  card.append(list);
  return card;
}

function renderNextActionsWidget(tasks: Task[]): HTMLElement {
  const card = el('section', 'hub-calendar__detail calendar-next-actions');
  card.dataset.part = 'rail-next-actions';
  card.append(el('h3', 'hub-calendar__detail-heading', 'Next actions'));
  const backlog = tasks.filter((t) => !t.due_date && t.status !== 'done').slice(0, 8);
  if (!backlog.length) {
    card.append(el('p', 'hub-calendar__detail-empty', 'Backlog is empty.'));
    return card;
  }
  const list = el('div', 'calendar-next-actions__list');
  for (const task of backlog) {
    const row = el('a', 'calendar-next-action');
    row.href = taskPageHash(task.id);
    row.append(el('span', 'calendar-next-action__title', task.title));
    list.append(row);
  }
  card.append(list);
  return card;
}

function renderDumpWidget(onReload: () => void): HTMLElement {
  const card = el('section', 'hub-calendar__detail calendar-dump');
  card.dataset.part = 'rail-dump';
  card.append(el('h3', 'hub-calendar__detail-heading', 'Brain dump'));
  const form = el('form', 'calendar-dump__form');
  const textarea = document.createElement('textarea');
  textarea.className = 'hub-search__input calendar-dump__input';
  textarea.rows = 2;
  textarea.placeholder = 'Dump away.';
  textarea.setAttribute('aria-label', 'Brain dump');
  const submit = el('button', 'btn btn--primary', 'Sort it');
  submit.type = 'submit';
  form.append(textarea, submit);
  const results = el('div', 'calendar-dump__results');
  card.append(form, results);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;
    submit.disabled = true;
    void tasksApi
      .processDumpWithClare({ text })
      .then(() => {
        textarea.value = '';
        results.replaceChildren(el('p', 'hub-calendar__detail-empty', 'Sorted — check Clare to confirm.'));
        onReload();
      })
      .catch((err: unknown) => {
        results.replaceChildren(
          el('p', 'empty-state', err instanceof Error ? err.message : 'Could not process that dump')
        );
      })
      .finally(() => {
        submit.disabled = false;
      });
  });
  return card;
}

export type TasksChromeMount = {
  root: HTMLElement;
  calendarHost: HTMLElement;
  destroy: () => void;
  refresh: (opts?: { zoom?: string; today?: string }) => Promise<void>;
};

/**
 * Wrap a host with Tasks KEEP chrome around the kit calendar mount point.
 */
export function mountTasksCalendarChrome(host: HTMLElement): TasksChromeMount {
  host.replaceChildren();
  const root = el('div', 'tasks-calendar-chrome');
  root.dataset.part = 'tasks-calendar-chrome';
  const meta = el('div', 'calendar-meta');
  meta.dataset.part = 'calendar-meta';
  const pressure = el('div', 'pressure-host');
  pressure.dataset.part = 'pressure-host';
  const workspace = el('div', 'tasks-calendar-chrome__workspace hub-calendar__workspace');
  const calendarHost = el('div', 'tasks-calendar-chrome__kit');
  calendarHost.dataset.part = 'kit-host';
  const rail = el('div', 'hub-calendar__rail');
  rail.dataset.part = 'calendar-rail';
  workspace.append(calendarHost, rail);
  root.append(meta, pressure, workspace);
  host.append(root);

  const ac = new AbortController();
  let tasks: Task[] = [];
  let todayKey = new Date().toISOString().slice(0, 10);

  async function loadTasks() {
    try {
      const listed = await tasksApi.listTasks();
      tasks = Array.isArray(listed) ? listed : [];
    } catch {
      tasks = [];
    }
  }

  function paintMeta() {
    meta.replaceChildren();
    const filters = el('div', 'calendar-meta__filters');
    filters.append(
      createHubPills({
        label: 'Planning',
        items: [
          { id: 'lens', label: 'Planning lens' },
          { id: 'plan_work', label: state.planWorkMode ? 'Plan work · on' : 'Plan work' }
        ],
        value: [
          ...(state.planningLens ? (['lens'] as const) : []),
          ...(state.planWorkMode ? (['plan_work'] as const) : [])
        ],
        onSelect: (id: string) => {
          if (id === 'lens') state.planningLens = !state.planningLens;
          else state.planWorkMode = !state.planWorkMode;
          paintMeta();
          void paintRail();
        }
      })
    );
    if (state.planningLens) {
      filters.append(
        createHubPills({
          label: 'Planning layers',
          items: [
            { id: 'hard_deadline', label: 'Deadlines' },
            { id: 'planned_work', label: 'Planned work' },
            { id: 'protected_time', label: 'Protected' },
            { id: 'target', label: 'Target' },
            { id: 'review', label: 'Review' },
            { id: 'deep_filter', label: 'Deep' }
          ],
          value: state.layers,
          onSelect: (id: string) => {
            const next = new Set(state.layers);
            if (next.has(id as PlanningLayer)) next.delete(id as PlanningLayer);
            else next.add(id as PlanningLayer);
            state.layers = [...next] as PlanningLayer[];
            paintMeta();
          }
        })
      );
    }
    const pinches = detectPinchPoints(tasks, todayKey, { days: 7 });
    meta.append(
      filters,
      el(
        'p',
        pinches.length ? 'pinch-clear pinch-clear--alert' : 'pinch-clear',
        pinchLineLabel(pinches.length)
      )
    );
    renderPressureStrips(pressure, tasks, todayKey, () => void refresh(), { emptyClear: false });
  }

  function paintRail(zoom = 'week') {
    rail.replaceChildren();
    rail.append(renderShortcutHint());
    if (zoom === 'day') {
      rail.append(renderDayAgenda(tasks, todayKey));
    } else if (zoom === 'week') {
      const monday = (() => {
        const d = new Date(`${todayKey}T12:00:00`);
        const day = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - day);
        return d;
      })();
      const weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d.toISOString().slice(0, 10);
      });
      rail.append(renderLocksWidget(tasks, weekDates));
      rail.append(renderNextActionsWidget(tasks));
      rail.append(renderDumpWidget(() => void refresh()));
      const links = el('section', 'hub-calendar__detail');
      links.dataset.part = 'rail-quick-links';
      links.append(el('h3', 'hub-calendar__detail-heading', 'Quick links'));
      const a = el('a', '', 'Open Backlog →');
      a.href = '#/backlog';
      links.append(a);
      rail.append(links);
    }
  }

  function setZoomHash(zoom: string) {
    const href = zoom === 'week' ? '#/week' : `#/${zoom}`;
    if (location.hash !== href) location.hash = href;
  }

  document.addEventListener(
    'keydown',
    (event) => {
      if (!root.isConnected || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        document.querySelector('.calendar-command')?.remove();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCalendarCommand('help', () => setZoomHash('week'), () => setZoomHash('day'));
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        setZoomHash('day');
      } else if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        setZoomHash('week');
        root.querySelector<HTMLElement>('[data-today]')?.click();
      } else if (event.key === 'g' || event.key === 'G' || event.key === '.') {
        event.preventDefault();
        openCalendarCommand(
          'date',
          (value) => {
            if (value.trim().toLowerCase() === 'today') setZoomHash('week');
          },
          () => setZoomHash('day')
        );
      } else if (event.key === '?') {
        event.preventDefault();
        openCalendarCommand('help', () => setZoomHash('week'), () => setZoomHash('day'));
      } else if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        setZoomHash('day');
      } else if (event.key === 'w' || event.key === 'W') {
        event.preventDefault();
        setZoomHash('week');
      }
      // Month (M) intentionally omitted — lock forbids Month as a zoom stop.
    },
    { signal: ac.signal }
  );

  async function refresh(opts?: { zoom?: string; today?: string }) {
    if (opts?.today) todayKey = opts.today;
    await loadTasks();
    paintMeta();
    paintRail(opts?.zoom || 'week');
  }

  void refresh();

  return {
    root,
    calendarHost,
    destroy() {
      ac.abort();
      document.querySelector('.calendar-command')?.remove();
      host.replaceChildren();
    },
    refresh
  };
}
