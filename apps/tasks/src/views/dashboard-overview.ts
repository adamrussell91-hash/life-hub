import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import {
  chipUrgencyClass,
  dashboardFocusStats,
  dashboardHeatDays,
  dashboardNextAction,
  dashboardTimeline,
  sourceChipClass,
  trendLabel,
  weeklyCompletionTrend,
  type DashboardHeatDay,
  type DashboardTimelineItem
} from '@/domain/dashboard-overview';
import { addDays, preferredDomains, startOfDay, toDateKey } from '@/domain/queries';
import { findStallCandidates } from '@/domain/stall';
import {
  findPortfolioTension,
  buildProjectPulseCard,
  projectLifecycleMix,
  runningProjectCount
} from '@/domain/projects-pulse';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { buildAreaLine } from '@/chart-kit/area-line';
import { animateAreaReveal } from '@/chart-kit/animate';
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
};

const OVERVIEW_OPEN_KEY = 'tasks-hub:dashboard-overview-open';
const SELECTED_DAY_KEY = 'tasks-hub:dashboard-selected-day';
const MOBILE_OVERVIEW_QUERY = '(max-width: 720px)';
const TASK_DRAG_MIME = 'application/x-tasks-hub-task';
const RAIL_DAYS = 31;

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

function renderTrendChart(values: number[], dates: string[], delta: number): SVGSVGElement {
  const series = values.map((value, index) => ({ date: dates[index], value }));
  const chart = buildAreaLine(series, { width: 280, height: 72, padding: 8, paddingBottom: 18 });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'dashboard-trend-chart');
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Completions over the last 14 days');
  svg.dataset.trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('data-role', 'area');
  area.setAttribute('class', 'dashboard-trend-chart__area');
  area.setAttribute('d', chart.areaPath);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('data-role', 'line');
  line.setAttribute('class', 'dashboard-trend-chart__line');
  line.setAttribute('d', chart.linePath);
  line.setAttribute('fill', 'none');
  svg.append(area, line);

  const first = chart.dayLabels[0];
  const last = chart.dayLabels[chart.dayLabels.length - 1];
  for (const label of [first, last]) {
    if (!label?.date) continue;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'dashboard-trend-chart__label');
    text.setAttribute('x', String(label.x));
    text.setAttribute('y', String(chart.height - 4));
    text.setAttribute('text-anchor', label === first ? 'start' : 'end');
    text.textContent = formatDisplayDate(label.date);
    svg.append(text);
  }

  queueMicrotask(() => animateAreaReveal(svg));
  return svg;
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
    { id: 'today', label: "Today's tasks", value: stats.today, href: '#/day' },
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
    {
      id: 'attention',
      label: 'Needs attention',
      value: stats.needsAttention,
      href: '#/projects'
    },
    {
      id: 'projects',
      label: 'Active projects',
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
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    openAction();
  });
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    event.preventDefault();
    openAction();
  });
  card.append(el('p', 'hub-card__eyebrow', 'Next action'));
  const row = el('div', 'dashboard-next__row');
  const title = el('p', 'dashboard-next__title', action.title);
  row.append(title, el('span', sourceChipClass(action.source), action.source));
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
  row.append(go);
  card.append(row);
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
  if (item.source === 'task' && item.meta && item.meta !== when) {
    meta.append(el('span', 'dashboard-row__date', item.meta));
  }
  body.append(meta);
  row.append(body);
  return row;
}

function itemsForDay(items: DashboardTimelineItem[], dateKey: string, todayKey: string): DashboardTimelineItem[] {
  if (dateKey === todayKey) return items.filter((item) => item.daysOut <= 0);
  return items.filter((item) => item.due_date === dateKey);
}

function renderTimelineRail(
  items: DashboardTimelineItem[],
  selectedKey: string,
  now: Date,
  onSelect: (dateKey: string) => void
): HTMLElement {
  const todayKey = toDateKey(now);
  const start = startOfDay(now);
  const byDay = new Map<string, DashboardTimelineItem[]>();
  for (const item of items) {
    const key = item.daysOut <= 0 ? todayKey : item.due_date;
    const bucket = byDay.get(key) ?? [];
    bucket.push(item);
    byDay.set(key, bucket);
  }

  const rail = el('div', 'dashboard-rail');
  rail.setAttribute('role', 'list');
  rail.setAttribute('aria-label', 'Work on a 31-day timeline');

  for (let index = 0; index < RAIL_DAYS; index++) {
    const date = addDays(start, index);
    const dateKey = toDateKey(date);
    const dayItems = byDay.get(dateKey) ?? [];
    const cell = el('button', 'dashboard-rail__day');
    cell.type = 'button';
    cell.setAttribute('role', 'listitem');
    cell.dataset.date = dateKey;
    if (dateKey === todayKey) cell.dataset.today = 'true';
    if (dateKey === selectedKey) cell.dataset.selected = 'true';
    if (dayItems.some((item) => item.daysOut < 0)) cell.dataset.overdue = 'true';
    const spoken = dayItems.length
      ? `${dayItems.length} on ${formatDisplayDate(dateKey)}: ${dayItems.map((item) => item.title).join(', ')}`
      : `Nothing on ${formatDisplayDate(dateKey)}`;
    cell.setAttribute('aria-label', spoken);
    cell.setAttribute('aria-pressed', dateKey === selectedKey ? 'true' : 'false');
    cell.addEventListener('click', () => onSelect(dateKey));

    const stack = el('span', 'dashboard-rail__stack');
    for (const item of dayItems.slice(0, 4)) {
      const mark = el('span', `dashboard-rail__mark dashboard-rail__mark--${item.source}`);
      mark.title = item.title;
      stack.append(mark);
    }
    if (dayItems.length > 4) {
      stack.append(el('span', 'dashboard-rail__more', `+${dayItems.length - 4}`));
    }
    cell.append(stack, el('span', 'dashboard-rail__tick', String(date.getDate())));
    rail.append(cell);
  }
  return rail;
}

function renderTimelineCard(
  items: DashboardTimelineItem[],
  options: DashboardOverviewOptions,
  now: Date,
  selectedKey: string,
  onSelectDay: (dateKey: string) => void
): HTMLElement {
  const card = el('section', 'hub-card dashboard-overview__tile dashboard-overview__tile--timeline');
  card.setAttribute('aria-label', 'Timeline');
  const head = el('div', 'dashboard-overview__head');
  head.append(el('p', 'hub-card__eyebrow', 'Timeline'));
  head.append(viewLink('#/timeline', 'Open Timeline'));
  card.append(head);

  const next = renderNextAction(options, now);
  if (next) card.append(next);

  card.append(renderTimelineRail(items, selectedKey, now, onSelectDay));

  const todayKey = toDateKey(now);
  const dayItems = itemsForDay(items, selectedKey, todayKey);
  const agenda = el('div', 'dashboard-timeline');
  if (selectedKey === todayKey) agenda.id = 'timeline-today';
  agenda.append(
    el(
      'h3',
      'dashboard-timeline__label',
      selectedKey === todayKey ? 'Today' : formatDisplayDate(selectedKey)
    )
  );
  if (!dayItems.length) {
    agenda.append(el('p', 'empty-state empty-state--compact', 'Clear.'));
  } else {
    const list = el('ul', 'dashboard-overview__list dashboard-timeline__list');
    for (const item of dayItems) list.append(renderTimelineRow(item, options));
    agenda.append(list);
  }
  card.append(agenda);
  return card;
}

function renderProjectsCard(
  projects: Project[],
  tasks: Task[],
  now: Date,
  options: DashboardOverviewOptions
): HTMLElement {
  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const mix = projectLifecycleMix(projects, tasks, stallIds, now);
  const running = runningProjectCount(mix);
  const trend = weeklyCompletionTrend(tasks, now);

  const card = el('section', 'hub-card dashboard-overview__tile dashboard-overview__tile--projects');
  card.setAttribute('aria-label', 'Projects');
  const head = el('div', 'dashboard-overview__head');
  head.append(el('p', 'hub-card__eyebrow', 'Projects'));
  head.append(viewLink('#/projects', 'Open Projects'));
  card.append(head);

  const portfolio = el('div', 'dashboard-overview__portfolio');
  portfolio.append(
    renderProjectPortfolioChart(mix, {
      running,
      compact: true,
      onActivate: options.onFilterRunning,
      active: options.runningFilterActive
    })
  );
  card.append(portfolio);

  const heatStart = addDays(startOfDay(now), -13);
  const dates = trend.daily.map((_, index) => toDateKey(addDays(heatStart, index)));
  const spark = el(
    'div',
    `dashboard-trend dashboard-trend--${trend.delta > 0 ? 'up' : trend.delta < 0 ? 'down' : 'flat'}`
  );
  spark.append(renderTrendChart(trend.daily, dates, trend.delta), el('p', 'dashboard-trend__label', trendLabel(trend)));
  card.append(spark);
  return card;
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

function renderHeatCard(
  days: DashboardHeatDay[],
  selectedKey: string,
  options: DashboardOverviewOptions,
  onSelectDay: (dateKey: string) => void
): HTMLElement {
  const selected = days.find((day) => day.date_key === selectedKey) ?? days[0];
  const card = el('section', 'hub-card dashboard-overview__tile dashboard-overview__tile--heat');
  card.setAttribute('aria-label', 'Next 14 days');
  const head = el('div', 'dashboard-overview__head');
  head.append(el('p', 'hub-card__eyebrow', 'This fortnight'));
  if (selected) head.append(viewLink(`#/week?date=${selected.date_key}`, 'Open week'));
  card.append(head);

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
    cell.append(el('span', 'dashboard-heat__weekday', day.weekday), el('span', 'dashboard-heat__day', String(day.day)));
    if (day.count) cell.append(el('span', 'dashboard-heat__count', String(day.count)));
    cell.addEventListener('click', () => onSelectDay(day.date_key));
    bindHeatDrop(cell, day, options);
    row.append(cell);
  }
  card.append(row);

  const peek = el('p', 'dashboard-heat__peek');
  if (!selected?.items.length) {
    peek.textContent = selected
      ? `Nothing dated ${selected.isToday ? 'today' : formatDisplayDate(selected.date_key)}.`
      : 'Nothing dated in the next fortnight.';
  } else {
    peek.textContent = selected.items.map((item) => item.title).join(' · ');
  }
  card.append(peek);
  return card;
}

function overviewPeek(options: DashboardOverviewOptions, now: Date): string {
  const stats = dashboardFocusStats(options.tasks, options.projects, now);
  const parts = [
    stats.overdue ? `${stats.overdue} overdue` : null,
    stats.today ? `${stats.today} due today` : null,
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

/** Overview band for the home dashboard — focus, timeline, load, heat. */
export function renderDashboardOverview(host: HTMLElement, options: DashboardOverviewOptions): void {
  const now = options.now ?? new Date();
  const { tasks, projects, onChanged } = options;
  host.replaceChildren();
  host.className = 'dashboard-overview';

  const open = readOverviewOpen();
  host.dataset.open = open ? 'true' : 'false';

  const prefs = preferredDomains(now);
  const stats = dashboardFocusStats(tasks, projects, now);
  const todayKey = toDateKey(now);
  const selectedKey = readSelectedDay(todayKey);
  const selectDay = (dateKey: string): void => {
    writeSelectedDay(dateKey);
    writeOverviewOpen(true);
    renderDashboardOverview(host, options);
  };

  host.append(renderFocusStrip(stats, options, host));

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
  const syncViewport = (): void => setOverviewOpen(host, readOverviewOpen());
  mq.addEventListener('change', syncViewport);

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

  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const pulseCards = projects
    .filter((p) => p.status !== 'archived_dead')
    .map((p) => buildProjectPulseCard(p, tasks, stallIds, now));
  const tension = tensionDismissed ? null : findPortfolioTension(pulseCards, tasks, now);
  if (tension) {
    panel.append(
      renderTensionBanner(tension.message, () => {
        tensionDismissed = true;
        renderDashboardOverview(host, options);
      })
    );
  }

  const heatDays = dashboardHeatDays(tasks, projects, now);
  panel.append(renderHeatCard(heatDays, selectedKey, options, selectDay));

  const grid = el('div', 'dashboard-overview__grid dashboard-overview__grid--merged');
  const timeline = dashboardTimeline(tasks, projects, now);
  grid.append(
    renderTimelineCard(timeline, options, now, selectedKey, selectDay),
    renderProjectsCard(projects, tasks, now, options)
  );
  panel.append(grid);

  const pressure = el('div', 'dashboard-overview__pressure');
  renderPressureStrips(pressure, tasks, now, () => onChanged?.(), {
    dueSoon: false,
    emptyClear: false
  });
  if (pressure.childElementCount) panel.append(pressure);

  host.append(panel);
}
