import { isProjectArchived, type Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import {
  chipUrgencyClass,
  dashboardFocusStats,
  dashboardHeatDays,
  dashboardNextAction,
  dashboardTimeline,
  sourceChipClass,
  type DashboardHeatDay,
  type DashboardTimelineItem
} from '@/domain/dashboard-overview';
import { compareByDue, preferredDomains, toDateKey } from '@/domain/queries';
import { parseDueTimeHours } from '@/domain/daily-dial';
import { findStallCandidates } from '@/domain/stall';
import {
  findPortfolioTension,
  buildProjectPulseCard,
  projectLifecycleMix,
  runningProjectCount
} from '@/domain/projects-pulse';
import { taskAttachments } from '@/domain/task-attachments';
import { formatTaskTimeRange } from '@/domain/time-grid';
import { attachmentChip, hydrateTaskLinkPills } from '@/views/attachment-chips';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderPressureStrips } from '@/views/pinch-strip';
import { renderProjectPortfolioChart } from '@/views/project-portfolio-chart';
import { el } from '@/views/hub-kit';

export type DashboardOverviewOptions = {
  tasks: Task[];
  projects: Project[];
  now?: Date;
  onChanged?: () => void;
  runningFilterActive?: boolean;
  onFilterRunning?: () => void;
  onCompleteTask?: (task: Task) => void;
  onStartTask?: (task: Task) => void;
  onRescheduleTask?: (task: Task, dateKey: string) => void;
  statusHost?: HTMLElement;
};

const OVERVIEW_OPEN_KEY = 'tasks-hub:dashboard-overview-open';
const SELECTED_DAY_KEY = 'tasks-hub:dashboard-selected-day';
const MOBILE_OVERVIEW_QUERY = '(max-width: 720px)';
const TASK_DRAG_MIME = 'application/x-tasks-hub-task';
const WEEK_DAYS = 7;

let tensionDismissed = false;
let draggingTaskId: string | null = null;

function readOverviewOpen(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = sessionStorage.getItem(OVERVIEW_OPEN_KEY);
  if (stored !== null) return stored === 'true';
  return true;
}

function writeOverviewOpen(open: boolean): void {
  sessionStorage.setItem(OVERVIEW_OPEN_KEY, open ? 'true' : 'false');
}

function readSelectedDay(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return sessionStorage.getItem(SELECTED_DAY_KEY) ?? fallback;
}

function writeSelectedDay(dateKey: string): void {
  sessionStorage.setItem(SELECTED_DAY_KEY, dateKey);
}

function viewLink(href: string, label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'btn btn--ghost dashboard-overview__link';
  link.href = href;
  link.textContent = label;
  return link;
}

function gripIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<path fill="currentColor" d="M9 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM9 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM9 18.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>';
  return svg;
}

function renderTensionBanner(message: string, onDismiss: () => void): HTMLElement {
  const banner = el('div', 'pulse-banner dashboard-overview__banner');
  banner.setAttribute('role', 'status');
  const icon = el('span', 'pulse-banner__icon');
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2 20h20z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>';
  banner.append(icon, el('span', 'pulse-banner__text', message));
  const dismiss = el('button', 'pulse-banner__dismiss');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  dismiss.addEventListener('click', onDismiss);
  banner.append(dismiss);
  return banner;
}

function tileTone(id: string, value: number): string {
  if (id === 'overdue') return value > 0 ? 'danger' : 'calm';
  if (id === 'attention') return value > 0 ? 'warning' : 'calm';
  if (id === 'today') return 'today';
  return 'projects';
}

function renderFocusStrip(
  stats: ReturnType<typeof dashboardFocusStats>,
  options: DashboardOverviewOptions,
  host: HTMLElement
): HTMLElement {
  const strip = el('div', 'dashboard-focus');
  strip.setAttribute('aria-label', 'Focus');
  const tiles: Array<{
    id: string;
    label: string;
    value: number;
    href?: string;
    onClick?: () => void;
  }> = [
    {
      id: 'overdue',
      label: 'Overdue',
      value: stats.overdue,
      onClick: () => {
        writeOverviewOpen(true);
        const todayKey = toDateKey(options.now ?? new Date());
        writeSelectedDay(todayKey);
        setOverviewOpen(host, true);
        renderDashboardOverview(host, options);
        requestAnimationFrame(() => {
          document
            .getElementById('timeline-today')
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }
    },
    { id: 'today', label: 'Today', value: stats.today, href: '#/day' },
    {
      id: 'attention',
      label: 'Attention',
      value: stats.needsAttention,
      href: '#/projects'
    },
    {
      id: 'projects',
      label: 'Projects',
      value: stats.activeProjects,
      onClick: () => {
        if (options.onFilterRunning) {
          options.onFilterRunning();
          requestAnimationFrame(() => {
            document
              .querySelector('.dashboard-board')
              ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          });
          return;
        }
        location.hash = '#/projects';
      }
    }
  ];

  for (const tile of tiles) {
    const tone = tileTone(tile.id, tile.value);
    const className = `dashboard-focus__tile dashboard-focus__tile--${tone}`;
    let node: HTMLElement;
    if (tile.onClick) {
      const btn = el('button', className) as HTMLButtonElement;
      btn.type = 'button';
      btn.addEventListener('click', tile.onClick);
      if (tile.id === 'projects' && options.runningFilterActive) btn.classList.add('is-active');
      node = btn;
    } else {
      const link = document.createElement('a');
      link.className = className;
      link.href = tile.href ?? '#/board';
      node = link;
    }
    node.setAttribute('aria-label', `${tile.value} ${tile.label}`);
    node.append(
      el('p', 'dashboard-focus__value', String(tile.value)),
      el('p', 'dashboard-focus__label', tile.label)
    );
    strip.append(node);
  }
  return strip;
}

function renderNextAction(
  options: DashboardOverviewOptions,
  now: Date
): HTMLElement | null {
  const action = dashboardNextAction(options.tasks, options.projects, now);
  if (!action) return null;
  const card = el('div', 'dashboard-next');
  card.setAttribute('role', 'link');
  card.tabIndex = 0;
  card.setAttribute('aria-label', `Next action: ${action.title}`);
  const openAction = (): void => {
    location.hash = action.href.replace(/^#/, '') ? action.href : '#/board';
  };
  card.addEventListener('click', (event) => {
    if ((event.target as HTMLElement | null)?.closest('button, a')) return;
    openAction();
  });
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if ((event.target as HTMLElement | null)?.closest('button, a')) return;
    event.preventDefault();
    openAction();
  });
  const ring = el('span', 'dashboard-next__ring');
  ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 8v4l2.5 2.5"/></svg>';

  const body = el('div', 'dashboard-next__body');
  body.append(el('p', 'hub-card__eyebrow dashboard-next__eyebrow', 'Next up'));
  const row = el('div', 'dashboard-next__row');
  const title = el('p', 'dashboard-next__title', action.title);
  row.append(title, el('span', sourceChipClass(action.source), action.source));
  body.append(row);
  if (action.task) {
    const when = formatTaskTimeRange(action.task);
    if (when) body.append(el('p', 'dashboard-next__time', when));
    const attachments = taskAttachments(action.task, {
      projects: options.projects,
      tasks: options.tasks
    });
    if (attachments.length) {
      const chips = el('div', 'hub-chips dashboard-next__attach');
      for (const item of attachments) chips.append(attachmentChip(item));
      body.append(chips);
    }
    hydrateTaskLinkPills(card, action.task.id);
  }

  const go = el(
    'button',
    action.kind === 'complete' ? 'btn btn--primary' : 'btn btn--decisive',
    action.kind === 'complete' ? 'Complete' : 'Start'
  );
  go.type = 'button';
  go.addEventListener('click', (event) => {
    event.stopPropagation();
    if (action.task && action.kind === 'complete') {
      options.onCompleteTask?.(action.task);
      return;
    }
    if (action.task && action.kind === 'start') {
      options.onStartTask?.(action.task);
      return;
    }
    openAction();
  });
  card.append(ring, body, go);
  return card;
}

function bindTaskDrag(handle: HTMLElement, task: Task): void {
  handle.draggable = true;
  handle.setAttribute('aria-label', `Drag to reschedule ${task.title}`);
  handle.addEventListener('dragstart', (event) => {
    draggingTaskId = task.id;
    event.dataTransfer?.setData(TASK_DRAG_MIME, task.id);
    event.dataTransfer?.setData('text/plain', task.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    handle.closest('.dashboard-row')?.classList.add('is-dragging');
  });
  handle.addEventListener('dragend', () => {
    draggingTaskId = null;
    handle.closest('.dashboard-row')?.classList.remove('is-dragging');
  });
}

function renderTimelineRow(
  item: DashboardTimelineItem,
  options: DashboardOverviewOptions
): HTMLElement {
  const row = el('li', `dashboard-row dashboard-row--${item.source}`);
  row.dataset.source = item.source;
  row.dataset.urgency = item.urgency;

  if (item.task) {
    const grip = el('button', 'dashboard-row__grip');
    grip.type = 'button';
    grip.append(gripIcon());
    bindTaskDrag(grip, item.task);
    row.append(grip);

    const check = el('label', 'task-check dashboard-row__check');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.task.status === 'done';
    box.setAttribute('aria-label', `Mark ${item.task.title} done`);
    box.addEventListener('change', () => options.onCompleteTask?.(item.task!));
    check.append(box, el('span', 'check-box'));
    row.append(check);
  } else {
    row.append(el('span', 'dashboard-row__grip dashboard-row__grip--static'));
  }

  const body = document.createElement('a');
  body.className = 'dashboard-row__body';
  body.href = item.href;
  body.append(el('span', 'dashboard-row__title', item.title));
  const meta = el('span', 'dashboard-row__meta');
  const when =
    item.daysOut < 0 ? 'Overdue' : item.daysOut === 0 ? 'Today' : formatDisplayDate(item.due_date);
  meta.append(
    el('span', sourceChipClass(item.source), item.source),
    el('span', `${chipUrgencyClass(item.urgency)} dashboard-row__when`, when)
  );
  if (item.task) {
    const time = formatTaskTimeRange(item.task);
    if (time) meta.append(el('span', 'dashboard-row__time', time));
    row.dataset.taskId = item.task.id;
  }
  if (item.source === 'task' && item.meta && item.meta !== when) {
    meta.append(el('span', 'dashboard-row__date', item.meta));
  }
  body.append(meta);
  row.append(body);
  if (item.task) {
    const attachments = taskAttachments(item.task, {
      projects: options.projects,
      tasks: options.tasks
    });
    if (attachments.length) {
      const chips = el('div', 'hub-chips dashboard-row__attach');
      for (const attachment of attachments) chips.append(attachmentChip(attachment));
      row.append(chips);
    }
    hydrateTaskLinkPills(row, item.task.id);
  }
  return row;
}

function itemsForDay(
  items: DashboardTimelineItem[],
  dateKey: string,
  todayKey: string
): DashboardTimelineItem[] {
  const dayItems =
    dateKey === todayKey
      ? items.filter((item) => item.daysOut <= 0)
      : items.filter((item) => item.due_date === dateKey);
  // Due order: date, then clock (untimed after timed), then tasks ahead of project dates.
  const sourceRank = { task: 0, excursion: 1, project: 2 } as const;
  return [...dayItems].sort((a, b) => {
    if (a.daysOut !== b.daysOut) return a.daysOut - b.daysOut;
    if (a.task && b.task) return compareByDue(a.task, b.task);
    const at = parseDueTimeHours(a.task?.due_time) ?? Number.POSITIVE_INFINITY;
    const bt = parseDueTimeHours(b.task?.due_time) ?? Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    if (a.source !== b.source) return sourceRank[a.source] - sourceRank[b.source];
    return a.title.localeCompare(b.title);
  });
}

function renderTimelineGroup(
  label: string,
  items: DashboardTimelineItem[],
  options: DashboardOverviewOptions,
  danger = false
): HTMLElement {
  const group = el('div', 'dashboard-timeline__group');
  group.append(
    el('h3', `dashboard-timeline__label${danger ? ' dashboard-timeline__label--danger' : ''}`, label)
  );
  const list = el('ul', 'dashboard-overview__list dashboard-timeline__list');
  for (const item of items) list.append(renderTimelineRow(item, options));
  group.append(list);
  return group;
}

function renderAgendaBody(
  items: DashboardTimelineItem[],
  options: DashboardOverviewOptions,
  now: Date,
  selectedKey: string
): HTMLElement {
  const todayKey = toDateKey(now);
  const dayItems = itemsForDay(items, selectedKey, todayKey);
  const agenda = el('div', 'dashboard-timeline');
  if (selectedKey === todayKey) agenda.id = 'timeline-today';

  if (!dayItems.length) {
    agenda.append(
      el(
        'h3',
        'dashboard-timeline__label',
        selectedKey === todayKey ? 'Today' : formatDisplayDate(selectedKey)
      ),
      el('p', 'empty-state empty-state--compact', 'Clear.')
    );
    return agenda;
  }

  if (selectedKey === todayKey) {
    const overdueItems = dayItems.filter((item) => item.daysOut < 0);
    const todayItems = dayItems.filter((item) => item.daysOut >= 0);
    if (overdueItems.length) {
      agenda.append(renderTimelineGroup('Overdue', overdueItems, options, true));
    }
    if (todayItems.length) {
      agenda.append(renderTimelineGroup('Today', todayItems, options));
    }
    return agenda;
  }

  agenda.append(renderTimelineGroup(formatDisplayDate(selectedKey), dayItems, options));
  return agenda;
}

function bindHeatDrop(
  cell: HTMLElement,
  day: DashboardHeatDay,
  options: DashboardOverviewOptions
): void {
  cell.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    cell.classList.add('is-drop');
  });
  cell.addEventListener('dragleave', () => cell.classList.remove('is-drop'));
  cell.addEventListener('drop', (event) => {
    event.preventDefault();
    cell.classList.remove('is-drop');
    const id =
      event.dataTransfer?.getData(TASK_DRAG_MIME) ||
      event.dataTransfer?.getData('text/plain') ||
      draggingTaskId;
    if (!id) return;
    const task = options.tasks.find((entry) => entry.id === id);
    if (task) options.onRescheduleTask?.(task, day.date_key);
  });
}

function overviewPeek(options: DashboardOverviewOptions, now: Date): string {
  const stats = dashboardFocusStats(options.tasks, options.projects, now);
  const parts = [
    stats.overdue ? `${stats.overdue} overdue` : null,
    stats.today ? `${stats.today} today` : null,
    stats.needsAttention ? `${stats.needsAttention} need attention` : null,
    stats.activeProjects ? `${stats.activeProjects} active` : null
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'All clear for now';
}

function setOverviewOpen(root: HTMLElement, open: boolean): void {
  root.dataset.open = open ? 'true' : 'false';
  const toggle = root.querySelector<HTMLButtonElement>('.dashboard-overview__toggle');
  const panel = root.querySelector<HTMLElement>('.dashboard-overview__panel');
  const peek = root.querySelector<HTMLElement>('.dashboard-overview__peek');
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (panel) panel.hidden = !open;
  if (peek) peek.hidden = open;
}

function fillWeekCard(
  card: HTMLElement,
  days: DashboardHeatDay[],
  selectedKey: string,
  timeline: DashboardTimelineItem[],
  options: DashboardOverviewOptions,
  now: Date,
  onSelectDay: (dateKey: string) => void
): void {
  const selected = days.find((day) => day.date_key === selectedKey) ?? days[0];
  let head = card.querySelector<HTMLElement>('.dashboard-overview__head');
  if (!head) {
    head = el('div', 'dashboard-overview__head');
    head.append(el('p', 'hub-card__eyebrow', 'This week'));
    card.prepend(head);
  }
  const openWeek = head.querySelector<HTMLAnchorElement>('a.dashboard-overview__link');
  if (selected) {
    const href = `#/week?date=${selected.date_key}`;
    if (openWeek) openWeek.href = href;
    else head.append(viewLink(href, 'Open week'));
  } else {
    openWeek?.remove();
  }

  for (const child of [...card.children]) {
    if (child !== head) child.remove();
  }

  const row = el('div', 'dashboard-heat');
  row.setAttribute('role', 'list');
  for (const day of days) {
    const cell = el('button', 'dashboard-heat__cell');
    cell.type = 'button';
    cell.dataset.heat = String(day.heat);
    if (day.isToday) cell.dataset.today = 'true';
    if (day.date_key === selectedKey) cell.dataset.selected = 'true';
    cell.setAttribute('role', 'listitem');
    cell.setAttribute(
      'aria-label',
      `${day.count} item${day.count === 1 ? '' : 's'} on ${formatDisplayDate(day.date_key)}`
    );
    cell.setAttribute('aria-pressed', day.date_key === selectedKey ? 'true' : 'false');
    cell.append(
      el('span', 'dashboard-heat__weekday', day.weekday),
      el('span', 'dashboard-heat__day', String(day.day)),
      el(
        'span',
        day.count ? 'dashboard-heat__count' : 'dashboard-heat__count dashboard-heat__count--empty',
        day.count ? String(day.count) : ''
      )
    );
    cell.addEventListener('click', () => onSelectDay(day.date_key));
    bindHeatDrop(cell, day, options);
    row.append(cell);
  }
  card.append(row);

  const next = renderNextAction(options, now);
  if (next) card.append(next);
  card.append(renderAgendaBody(timeline, options, now, selectedKey));
}

function fillProjectsCard(
  card: HTMLElement,
  projects: Project[],
  tasks: Task[],
  now: Date,
  options: DashboardOverviewOptions
): void {
  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const mix = projectLifecycleMix(projects, tasks, stallIds, now);
  const running = runningProjectCount(mix);

  let head = card.querySelector<HTMLElement>('.dashboard-overview__head');
  if (!head) {
    head = el('div', 'dashboard-overview__head');
    head.append(el('p', 'hub-card__eyebrow', 'Projects'));
    head.append(viewLink('#/projects', 'Open Projects'));
    card.prepend(head);
  }

  let portfolio = card.querySelector<HTMLElement>('.dashboard-overview__portfolio');
  if (!portfolio) {
    portfolio = el('div', 'dashboard-overview__portfolio');
    card.append(portfolio);
  }
  portfolio.replaceChildren(
    renderProjectPortfolioChart(mix, {
      running,
      compact: true,
      onActivate: options.onFilterRunning,
      active: options.runningFilterActive
    })
  );
}

/** Direct child by class. Avoid `:scope >` — happy-dom returns null. */
function childByClass(parent: HTMLElement, className: string): HTMLElement | undefined {
  return [...parent.children].find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains(className)
  );
}

function paintOverviewChrome(
  host: HTMLElement,
  options: DashboardOverviewOptions,
  now: Date,
  prefs: string[],
  stats: ReturnType<typeof dashboardFocusStats>
): void {
  const strip = renderFocusStrip(stats, options, host);
  if (options.statusHost) {
    options.statusHost.replaceChildren(strip);
  } else {
    const existing = childByClass(host, 'dashboard-focus');
    if (existing) existing.replaceWith(strip);
    else host.prepend(strip);
  }

  const lede = host.querySelector('.dashboard-overview__lede');
  if (lede) lede.textContent = `Focus: ${prefs.join(', ')} · ${formatDisplayDate(now)}`;

  const peek = host.querySelector('.dashboard-overview__peek');
  if (peek) peek.textContent = overviewPeek(options, now);
}

function paintOverviewPanel(
  host: HTMLElement,
  options: DashboardOverviewOptions,
  now: Date,
  heatDays: DashboardHeatDay[],
  selectedKey: string,
  timeline: DashboardTimelineItem[],
  selectDay: (dateKey: string) => void
): void {
  const { tasks, projects, onChanged } = options;
  const panel = host.querySelector<HTMLElement>('#dashboard-overview-panel');
  if (!panel) return;

  panel.querySelector('.dashboard-overview__banner')?.remove();
  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const pulseCards = projects
    .filter((p) => !isProjectArchived(p.status))
    .map((p) => buildProjectPulseCard(p, tasks, stallIds, now));
  const tension = tensionDismissed ? null : findPortfolioTension(pulseCards, tasks, now);
  if (tension) {
    panel.prepend(
      renderTensionBanner(tension.message, () => {
        tensionDismissed = true;
        renderDashboardOverview(host, options);
      })
    );
  }

  let grid = panel.querySelector<HTMLElement>('.dashboard-overview__grid--week');
  if (!grid) {
    grid = el('div', 'dashboard-overview__grid dashboard-overview__grid--week');
    panel.append(grid);
  }

  let weekCard = grid.querySelector<HTMLElement>('.dashboard-overview__tile--week');
  if (!weekCard) {
    weekCard = el('section', 'hub-card dashboard-overview__tile dashboard-overview__tile--week');
    weekCard.setAttribute('aria-label', 'This week');
    grid.prepend(weekCard);
  }
  fillWeekCard(weekCard, heatDays, selectedKey, timeline, options, now, selectDay);

  let projectsCard = grid.querySelector<HTMLElement>('.dashboard-overview__tile--projects');
  if (!projectsCard) {
    projectsCard = el('section', 'hub-card dashboard-overview__tile dashboard-overview__tile--projects');
    projectsCard.setAttribute('aria-label', 'Projects');
    grid.append(projectsCard);
  }
  fillProjectsCard(projectsCard, projects, tasks, now, options);

  panel.querySelector('.dashboard-overview__pressure')?.remove();
  const pressure = el('div', 'dashboard-overview__pressure');
  renderPressureStrips(pressure, tasks, now, () => onChanged?.(), {
    dueSoon: false,
    emptyClear: false
  });
  if (pressure.childElementCount) panel.append(pressure);
}

/**
 * Overview band for the home dashboard — focus, week+agenda, projects.
 * Live refreshes keep week/projects hub-card shells mounted so hub-motion
 * does not replay hub-reveal (opacity 0) on every tick.
 */
export function renderDashboardOverview(host: HTMLElement, options: DashboardOverviewOptions): void {
  const now = options.now ?? new Date();
  const { tasks, projects } = options;
  const prefs = preferredDomains(now);
  const stats = dashboardFocusStats(tasks, projects, now);
  const heatDays = dashboardHeatDays(tasks, projects, now, WEEK_DAYS);
  const todayKey = toDateKey(now);
  const storedDay = readSelectedDay(todayKey);
  const selectedKey = heatDays.some((day) => day.date_key === storedDay) ? storedDay : todayKey;
  const selectDay = (dateKey: string): void => {
    writeSelectedDay(dateKey);
    writeOverviewOpen(true);
    renderDashboardOverview(host, options);
  };

  const mounted = Boolean(childByClass(host, 'dashboard-overview__shell'));
  if (!mounted) {
    host.replaceChildren();
    host.className = 'dashboard-overview';
    delete host.dataset.hubSettled;

    const open = readOverviewOpen();
    host.dataset.open = open ? 'true' : 'false';

    paintOverviewChrome(host, options, now, prefs, stats);

    const shell = el('div', 'dashboard-overview__shell');
    const toggle = el('button', 'dashboard-overview__toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', 'dashboard-overview-panel');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.append(
      el('span', 'dashboard-overview__toggle-label', 'Overview'),
      el('span', 'dashboard-overview__toggle-icon', '▾')
    );
    toggle.addEventListener('click', () => {
      const next = host.dataset.open !== 'true';
      writeOverviewOpen(next);
      setOverviewOpen(host, next);
    });

    const mq = window.matchMedia(MOBILE_OVERVIEW_QUERY);
    mq.addEventListener('change', () => setOverviewOpen(host, readOverviewOpen()));

    const peek = el('p', 'dashboard-overview__peek', overviewPeek(options, now));
    peek.hidden = open;
    shell.append(
      toggle,
      el(
        'p',
        'view-lede dashboard-overview__lede',
        `Focus: ${prefs.join(', ')} · ${formatDisplayDate(now)}`
      ),
      peek
    );
    host.append(shell);

    const panel = el('div', 'dashboard-overview__panel');
    panel.id = 'dashboard-overview-panel';
    panel.hidden = !open;
    host.append(panel);
  } else {
    paintOverviewChrome(host, options, now, prefs, stats);
    setOverviewOpen(host, readOverviewOpen());
  }

  paintOverviewPanel(
    host,
    options,
    now,
    heatDays,
    selectedKey,
    dashboardTimeline(tasks, projects, now),
    selectDay
  );

  // First paint: settle after hub-motion's entrance scan. Later ticks: settle now
  // so a late scan cannot replay hub-reveal on the kept shells.
  if (mounted) host.dataset.hubSettled = '1';
  else requestAnimationFrame(() => {
    host.dataset.hubSettled = '1';
  });
}
