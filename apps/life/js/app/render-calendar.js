import { formatDisplayDate } from '../core/time.js';
import { candidateForLog, inferMealSlot, isWritableCalendarType, slugForLog } from './calendar-write.js';
import { buildRingTarget } from './chart-kit/ring.js';
import {
  blockStyle,
  formatBlockTime,
  hoursFromOffset,
  hoursToDueTime,
  layoutTimedBlocks,
  nowLineOffset,
  parseGoToDate,
  parseTimeHours,
  splitDayItems,
  timeGridHours,
  hourCaption
} from '../../../../packages/design-kit/js/time-grid.js';

const TINT = {
  nutrition: 'gold',
  fitness: 'peach',
  diary: 'lilac',
  mind: 'lilac',
  body: 'sage',
  skincare: 'sand',
  sleep: 'sage'
};

const TYPE_TINT = {
  meal: 'gold',
  workout: 'peach',
  diary: 'lilac',
  skincare: 'sand',
  sleep: 'sage',
  scheduled_lesson: 'blue',
  professional_meeting: 'violet',
  professional_event: 'violet',
  task: 'sage',
  work_block: 'lilac',
  knowledge_page: 'sand',
  medical: 'lilac'
};

const VIEWS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' }
];

const COMPOSE_TYPES = [
  { id: 'diary', label: 'Diary' },
  { id: 'workout', label: 'Workout' },
  { id: 'meal', label: 'Meal' }
];

const TYPE_LABEL = {
  task: 'Tasks',
  work_block: 'Work block',
  scheduled_lesson: 'Teaching',
  professional_meeting: 'Meeting',
  professional_event: 'Event',
  knowledge_page: 'Knowledge',
  meal: 'Meal',
  workout: 'Workout',
  diary: 'Diary',
  medical: 'Medical',
  skincare: 'Skincare',
  sleep: 'Sleep'
};

const TASK_STATUS_ORDER = ['in_progress', 'open'];
const TASK_STATUS_LABEL = {
  in_progress: 'In progress',
  open: 'Open'
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const handlersByRoot = new WeakMap();

export function renderCalendar(root, model, {
  onSelectDate,
  onShiftRange,
  onSwitchView,
  onSwitchMobilePanel,
  onCreateLog,
  scrollToDetail = false,
  monthDelta = 0,
  expanded = false,
  view = 'week',
  mobilePanel = 'schedule',
  composeDraft = null,
  selectedEventId = null,
  focusCompose = false,
  now = new Date()
} = {}) {
  const dashboard = root.querySelector('#calendar-dashboard');
  if (!dashboard || !model) return;

  const host = root.querySelector('#life-calendar-host') ?? dashboard;
  let calendar = host.querySelector(':scope > .hub-calendar');
  if (!calendar) {
    calendar = root.createElement('div');
    calendar.className = 'hub-calendar hub-calendar--workspace';
    host.replaceChildren(calendar);
  }

  const mode = VIEWS.some(item => item.id === view) ? view : 'week';
  const mobile = isMobileViewport(root);
  handlersByRoot.set(calendar, {
    onSelectDate,
    onShiftRange,
    onSwitchView,
    onSwitchMobilePanel,
    onCreateLog,
    view: mode,
    today: model.date,
    selectedDate: model.selectedDate,
    root
  });

  calendar.replaceChildren();
  {
    const classes = new Set(String(calendar.className || '').split(/\s+/).filter(Boolean));
    for (const name of ['hub-calendar--mobile', 'hub-calendar--mobile-day', 'hub-calendar--mobile-week', 'hub-calendar--mobile-month']) {
      classes.delete(name);
    }
    if (mobile) {
      classes.add('hub-calendar--mobile');
      classes.add(`hub-calendar--mobile-${mode}`);
    }
    calendar.className = [...classes].join(' ');
  }
  calendar.append(renderNav(root, model, mode));
  if (model.planningLens && mode === 'week') {
    calendar.append(renderMissionStrip(root, model.mission));
  }

  const draft = composeDraft ?? { date: model.selectedDate, time: null, type: 'diary' };

  if (mobile) {
    if (mode === 'week') {
      calendar.append(renderMobileWeek(root, model, { draft, now }));
    } else if (mode === 'month') {
      calendar.append(renderMobileMonth(root, model, { draft, monthDelta, now, mobilePanel }));
    } else {
      calendar.append(renderMobileDay(root, model, {
        mobilePanel,
        draft,
        now
      }));
    }
    bindNav(calendar);
    bindKeys(calendar, root);
    bindViewport(calendar, root);
    if (focusCompose) openMobileComposeSheet(calendar);
    dashboard.removeAttribute('hidden');
    return;
  }

  const workspace = root.createElement('div');
  workspace.className = 'hub-calendar__workspace';

  const body = root.createElement('div');
  body.className = 'hub-calendar__body';
  if (mode === 'month') {
    body.append(renderMonth(root, model, monthDelta));
  } else {
    body.append(renderTimeGrid(root, model, mode, now));
  }

  const rail = root.createElement('div');
  rail.className = 'hub-calendar__rail';
  const selected = findEvent(model, selectedEventId);
  rail.append(renderCompose(root, draft, mode));
  const agenda = renderAgenda(root, selected, scrollToDetail);
  if (agenda) rail.append(agenda);
  rail.append(renderShortcutHint(root));
  workspace.append(body, rail);
  calendar.append(workspace);

  bindNav(calendar);
  bindKeys(calendar, root);
  bindViewport(calendar, root);

  if (focusCompose) {
    const input = calendar.querySelector('[data-calendar="compose-title"]');
    input?.focus?.();
  }

  dashboard.removeAttribute('hidden');
}

function isMobileViewport(root) {
  return root.defaultView?.matchMedia?.('(max-width: 720px)')?.matches === true;
}

function bindViewport(calendar, root) {
  if (calendar.dataset.viewportBound) return;
  const mql = root.defaultView?.matchMedia?.('(max-width: 720px)');
  if (!mql || typeof mql.addEventListener !== 'function') return;
  calendar.dataset.viewportBound = '1';
  mql.addEventListener('change', () => {
    const handlers = handlersByRoot.get(calendar);
    if (!handlers?.selectedDate) return;
    handlers.onSelectDate?.(handlers.selectedDate);
  });
}

function findEvent(model, id) {
  if (!id) return null;
  return (model.dayEvents ?? []).find(event => event.id === id || event.path === id)
    ?? Object.values(model.eventsByDate ?? {}).flat().find(event => event.id === id || event.path === id)
    ?? null;
}

function renderNav(root, model, view) {
  const nav = root.createElement('div');
  nav.className = 'hub-calendar__nav';

  const paging = root.createElement('div');
  paging.className = 'hub-calendar__paging';
  paging.setAttribute('role', 'group');
  paging.setAttribute('aria-label', view === 'day' ? 'Day navigation' : view === 'week' ? 'Week navigation' : 'Month navigation');

  const prev = root.createElement('button');
  prev.type = 'button';
  prev.className = 'hub-calendar__nav-btn';
  prev.dataset.calendar = 'prev';
  prev.setAttribute('aria-label', view === 'day' ? 'Previous day' : view === 'week' ? 'Previous week' : 'Previous month');
  prev.textContent = '‹';

  const label = root.createElement('span');
  label.className = 'hub-calendar__month-label';
  label.dataset.calendar = 'month-label';
  label.textContent = labelForView(model, view);

  const next = root.createElement('button');
  next.type = 'button';
  next.className = 'hub-calendar__nav-btn';
  next.dataset.calendar = 'next';
  next.setAttribute('aria-label', view === 'day' ? 'Next day' : view === 'week' ? 'Next week' : 'Next month');
  next.textContent = '›';

  const todayBtn = root.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'hub-calendar__today';
  todayBtn.dataset.calendar = 'today';
  todayBtn.textContent = 'Today';

  paging.append(prev, label, next, todayBtn);

  const tabs = root.createElement('div');
  tabs.className = 'hub-pills calendar-view-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Calendar view');
  for (const item of VIEWS) {
    const tab = root.createElement('button');
    tab.type = 'button';
    tab.className = 'hub-pills__btn calendar-view-tabs__tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.calendarView = item.id;
    tab.setAttribute('aria-selected', item.id === view ? 'true' : 'false');
    if (item.id === view) tab.classList?.add?.('is-selected');
    tab.textContent = item.label;
    tabs.append(tab);
  }

  const lens = root.createElement('button');
  lens.type = 'button';
  lens.className = 'hub-pills__btn calendar-planning-lens';
  lens.dataset.calendar = 'planning-lens';
  lens.setAttribute('aria-pressed', model.planningLens ? 'true' : 'false');
  if (model.planningLens) lens.classList.add('is-selected');
  lens.textContent = model.planningLens ? 'Planning · on' : 'Planning';

  nav.append(paging, tabs, lens);
  return nav;
}

function labelForView(model, view) {
  if (view === 'month') return model.monthLabel;
  if (view === 'day') return formatDisplayDate(model.selectedDate);
  const start = model.weekDays[0]?.date;
  const end = model.weekDays[model.weekDays.length - 1]?.date;
  if (!start || !end) return model.monthLabel;
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
}

function bindNav(calendar) {
  const prev = calendar.querySelector('[data-calendar="prev"]');
  const next = calendar.querySelector('[data-calendar="next"]');
  const todayBtn = calendar.querySelector('[data-calendar="today"]');
  if (prev && !prev.dataset.bound) {
    prev.dataset.bound = '1';
    prev.addEventListener('click', () => handlersByRoot.get(calendar)?.onShiftRange?.(-1));
  }
  if (next && !next.dataset.bound) {
    next.dataset.bound = '1';
    next.addEventListener('click', () => handlersByRoot.get(calendar)?.onShiftRange?.(1));
  }
  if (todayBtn && !todayBtn.dataset.bound) {
    todayBtn.dataset.bound = '1';
    todayBtn.addEventListener('click', () => {
      const handlers = handlersByRoot.get(calendar);
      handlers?.onSelectDate?.(handlers.today, { time: null });
    });
  }
  for (const tab of calendar.querySelectorAll('[data-calendar-view]')) {
    if (tab.dataset.bound) continue;
    tab.dataset.bound = '1';
    tab.addEventListener('click', () => {
      handlersByRoot.get(calendar)?.onSwitchView?.(tab.dataset.calendarView);
    });
  }
  const lens = calendar.querySelector('[data-calendar="planning-lens"]');
  if (lens && !lens.dataset.bound) {
    lens.dataset.bound = '1';
    lens.addEventListener('click', () => {
      handlersByRoot.get(calendar)?.onTogglePlanningLens?.();
    });
  }
}

function bindKeys(calendar, root) {
  if (calendar.dataset.keysBound) return;
  calendar.dataset.keysBound = '1';
  const onKey = event => {
    if (!calendar.isConnected) {
      root.defaultView?.document?.removeEventListener?.('keydown', onKey);
      return;
    }
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      root.querySelector?.('.calendar-command')?.remove?.();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommand(root, calendar, 'help');
      return;
    }
    const target = event.target;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const handlers = handlersByRoot.get(calendar);
    if (!handlers) return;
    if (event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      handlers.onSelectDate?.(handlers.selectedDate, { focusCompose: true });
    } else if (event.key === 't' || event.key === 'T') {
      event.preventDefault();
      handlers.onSelectDate?.(handlers.today, { time: null });
    } else if (event.key === 'g' || event.key === 'G' || event.key === '.') {
      event.preventDefault();
      openCommand(root, calendar, 'date');
    } else if (event.key === '?') {
      event.preventDefault();
      openCommand(root, calendar, 'help');
    } else if (event.key === 'd' || event.key === 'D') {
      event.preventDefault();
      handlers.onSwitchView?.('day');
    } else if (event.key === 'w' || event.key === 'W') {
      event.preventDefault();
      handlers.onSwitchView?.('week');
    } else if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      handlers.onSwitchView?.('month');
    }
  };
  const doc = root.defaultView?.document ?? root;
  doc.addEventListener?.('keydown', onKey);
}

function openCommand(root, calendar, mode) {
  const doc = root.defaultView?.document ?? root;
  doc.querySelector?.('.calendar-command')?.remove?.();
  const overlay = root.createElement('div');
  overlay.className = 'calendar-command';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', mode === 'date' ? 'Go to date' : 'Calendar shortcuts');
  const panel = root.createElement('div');
  panel.className = 'calendar-command__panel';
  const heading = root.createElement('h3');
  heading.className = 'hub-calendar__detail-heading';
  heading.textContent = mode === 'date' ? 'Go to date' : 'Shortcuts';
  panel.append(heading);
  if (mode === 'date') {
    const form = root.createElement('form');
    form.className = 'quick-add hub-toolbar';
    const field = root.createElement('input');
    field.className = 'hub-search__input';
    field.type = 'text';
    field.placeholder = 'dd/mm/yy or today';
    field.setAttribute('aria-label', 'Go to date');
    const go = root.createElement('button');
    go.type = 'submit';
    go.className = 'btn btn--primary';
    go.textContent = 'Go';
    form.append(field, go);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const next = parseGoToDate(field.value, new Date());
      overlay.remove?.();
      if (!next) return;
      const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      handlersByRoot.get(calendar)?.onSelectDate?.(key, { time: null });
    });
    panel.append(form);
  } else {
    const list = root.createElement('ul');
    list.className = 'calendar-command__list';
    for (const [key, label] of [
      ['A', 'Add to this day'],
      ['T', 'Jump to today'],
      ['G', 'Go to date'],
      ['D / W / M', 'Day, week, month']
    ]) {
      const row = root.createElement('li');
      const btn = root.createElement('button');
      btn.type = 'button';
      const text = root.createElement('span');
      text.textContent = label;
      const kbd = root.createElement('kbd');
      kbd.className = 'hub-kbd';
      kbd.textContent = key;
      btn.append(text, kbd);
      row.append(btn);
      list.append(row);
    }
    panel.append(list);
  }
  overlay.append(panel);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) overlay.remove?.();
  });
  (doc.body ?? doc).append?.(overlay);
  overlay.querySelector?.('input')?.focus?.();
}

function renderTimeGrid(root, model, view, now) {
  const days = view === 'day'
    ? [model.weekDays.find(day => day.date === model.selectedDate) ?? {
      date: model.selectedDate,
      events: model.dayEvents,
      isToday: model.selectedDate === model.date,
      isSelected: true
    }]
    : model.weekDays;
  const grid = root.createElement('div');
  grid.className = 'hub-calendar__timegrid';
  grid.style.setProperty?.('--days', String(days.length));
  grid.dataset.days = String(days.length);
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', days.length === 1 ? 'Day time grid' : 'Week time grid');

  const corner = root.createElement('div');
  corner.className = 'hub-calendar__time-corner';
  grid.append(corner);
  for (const day of days) {
    const heading = root.createElement('div');
    heading.className = 'hub-calendar__time-heading hub-calendar__week-day';
    heading.dataset.date = day.date;
    if (day.isToday) heading.dataset.today = 'true';
    if (day.isSelected) heading.dataset.selected = 'true';
    heading.addEventListener('click', () => selectDay(heading, day.date));
    const weekday = root.createElement('span');
    weekday.className = 'hub-calendar__week-weekday';
    weekday.textContent = weekdayShort(day.date);
    const num = root.createElement('span');
    num.className = 'hub-calendar__day-num';
    num.textContent = String(Number(day.date.slice(8, 10)));
    heading.append(weekday, num);
    grid.append(heading);
  }

  const allDayLabel = root.createElement('div');
  allDayLabel.className = 'hub-calendar__time-allday-label';
  allDayLabel.textContent = 'All day';
  grid.append(allDayLabel);
  for (const day of days) {
    const { allDay } = splitDayItems(day.events ?? []);
    const cell = root.createElement('div');
    cell.className = 'hub-calendar__all-day';
    cell.dataset.date = day.date;
    if (day.isSelected) cell.dataset.selected = 'true';
    cell.addEventListener('click', event => {
      if (event.target?.closest?.('.event-chip')) return;
      selectDay(grid, day.date, null, true);
    });
    for (const event of allDay) cell.append(renderChip(root, event, grid));
    grid.append(cell);
  }

  const gutter = root.createElement('div');
  gutter.className = 'hub-calendar__time-gutter';
  for (const hour of timeGridHours()) {
    const label = root.createElement('p');
    label.className = 'hub-calendar__time-label';
    label.textContent = hourCaption(hour);
    gutter.append(label);
  }
  grid.append(gutter);

  for (const day of days) {
    const { timed } = splitDayItems(day.events ?? []);
    const hours = root.createElement('div');
    hours.className = 'hub-calendar__hours';
    hours.dataset.date = day.date;
    if (day.isSelected) hours.dataset.selected = 'true';
    if (day.isToday) {
      const offset = nowLineOffset(now);
      if (offset != null) {
        const line = root.createElement('div');
        line.className = 'hub-calendar__now';
        line.style.top = `${offset}px`;
        hours.append(line);
      }
    }
    hours.addEventListener('click', event => {
      if (event.target?.closest?.('.event-chip')) return;
      const top = hours.getBoundingClientRect?.()?.top ?? 0;
      const dueTime = hoursToDueTime(hoursFromOffset((event.clientY ?? 0) - top));
      selectDay(grid, day.date, dueTime, true);
    });
    const protectedSpans = day.protected ?? model.protectedByDate?.[day.date] ?? [];
    for (const span of protectedSpans) {
      const start = parseTimeHours(span.start);
      const end = parseTimeHours(span.end);
      if (start == null || end == null) continue;
      const bg = root.createElement('div');
      bg.className = 'hub-calendar__protected-bg';
      bg.setAttribute('aria-hidden', 'true');
      bg.title = span.label || 'Protected';
      Object.assign(bg.style, blockStyle({ start, end, lane: 0, lanes: 1 }));
      hours.append(bg);
    }
    for (const block of layoutTimedBlocks(timed)) {
      const chip = renderChip(root, block.item, grid);
      chip.classList?.add?.('event-chip--timed');
      if (chip.className && !chip.className.includes('event-chip--timed')) {
        chip.className += ' event-chip--timed';
      }
      const meta = chip.querySelector?.('.event-chip__meta');
      if (meta) meta.textContent = formatBlockTime(block);
      else {
        const time = root.createElement('span');
        time.className = 'event-chip__meta';
        time.textContent = formatBlockTime(block);
        chip.append(time);
      }
      Object.assign(chip.style, blockStyle(block));
      hours.append(chip);
    }
    grid.append(hours);
  }

  return grid;
}

function selectDay(fromNode, date, time, focusCompose) {
  const calendar = fromNode.closest?.('.hub-calendar') ?? fromNode;
  handlersByRoot.get(calendar)?.onSelectDate?.(date, { time, focusCompose, eventId: null });
}

function renderMonth(root, model, monthDelta) {
  const grid = root.createElement('div');
  grid.className = 'hub-calendar__grid';
  grid.id = 'calendar-month-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Month grid');
  if (monthDelta > 0) grid.dataset.motion = 'forward';
  if (monthDelta < 0) grid.dataset.motion = 'back';
  for (const heading of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
    const cell = root.createElement('span');
    cell.className = 'hub-calendar__weekday';
    cell.textContent = heading;
    grid.append(cell);
  }
  for (const day of model.monthDays) {
    const cell = root.createElement('div');
    cell.className = 'hub-calendar__day calendar-day';
    cell.setAttribute('role', 'gridcell');
    cell.dataset.date = day.date;
    if (!day.inMonth) cell.dataset.outside = 'true';
    if (day.isToday) cell.dataset.today = 'true';
    if (day.isSelected) cell.dataset.selected = 'true';
    cell.addEventListener('click', () => selectDay(grid, day.date));
    const num = root.createElement('span');
    num.className = 'hub-calendar__day-num calendar-day__num';
    num.textContent = String(day.day);
    cell.append(num);
    for (const event of (day.events ?? []).slice(0, 2)) {
      cell.append(renderChip(root, event, grid));
    }
    const hidden = (day.events?.length ?? 0) - 2;
    if (hidden > 0) {
      const more = root.createElement('button');
      more.type = 'button';
      more.className = 'event-chip-more';
      more.textContent = `+${hidden} more`;
      more.addEventListener('click', event => {
        event.stopPropagation();
        selectDay(grid, day.date);
      });
      cell.append(more);
    }
    grid.append(cell);
  }
  applyMonthMotion(grid, monthDelta);
  return grid;
}

function renderChip(root, event, fromNode) {
  const chip = root.createElement('button');
  chip.type = 'button';
  chip.className = 'event-chip';
  chip.dataset.tint = TYPE_TINT[event.type] ?? TINT[event.categories?.[0]] ?? 'sage';
  chip.dataset.kind = event.type;
  if (event.ghost || (event.type === 'work_block' && event.status === 'proposed')) {
    chip.classList.add('is-ghost');
  }
  chip.title = event.title;
  chip.addEventListener('click', ev => {
    ev.stopPropagation();
    const calendar = (fromNode.closest?.('.hub-calendar') ?? fromNode);
    const date = event.path?.match(/\d{4}-\d{2}-\d{2}/)?.[0]
      ?? handlersByRoot.get(calendar)?.selectedDate;
    handlersByRoot.get(calendar)?.onSelectDate?.(date, {
      eventId: event.id ?? event.path,
      time: event.time
    });
  });
  const title = root.createElement('span');
  title.className = 'event-chip__title';
  title.textContent = event.title;
  chip.append(title);
  if (event.brief) {
    const meta = root.createElement('span');
    meta.className = 'event-chip__meta';
    meta.textContent = event.brief;
    chip.append(meta);
  }
  return chip;
}

function renderCompose(root, draft, view) {
  const card = root.createElement('section');
  card.className = 'hub-calendar__detail calendar-compose-card';
  const heading = root.createElement('div');
  heading.className = 'calendar-agenda__head';
  const title = root.createElement('h3');
  title.className = 'hub-calendar__detail-heading';
  title.textContent = 'Add';
  const kbd = root.createElement('span');
  kbd.className = 'hub-kbd';
  kbd.textContent = 'A';
  heading.append(title, kbd);
  card.append(heading);

  const form = root.createElement('form');
  form.className = 'calendar-compose quick-add';
  form.addEventListener('submit', event => {
    event.preventDefault();
    const calendar = card.closest?.('.hub-calendar') ?? card;
    const handlers = handlersByRoot.get(calendar);
    const type = form.querySelector('[data-calendar="compose-type"]')?.value || 'diary';
    const text = form.querySelector('[data-calendar="compose-title"]')?.value?.trim() ?? '';
    const date = form.querySelector('[data-calendar="compose-date"]')?.value ?? draft.date;
    const time = form.querySelector('[data-calendar="compose-time"]')?.value || null;
    if (!text) return;
    try {
      const candidate = candidateForLog({ type, title: text, date, time });
      const slug = slugForLog(type, { meal: inferMealSlot(text, time), time });
      handlers?.onCreateLog?.({ candidate, slug });
    } catch {
      // Invalid compose stays on the form.
    }
  });

  const typeField = root.createElement('select');
  typeField.className = 'hub-search__input';
  typeField.dataset.calendar = 'compose-type';
  typeField.setAttribute('aria-label', 'Log type');
  for (const item of COMPOSE_TYPES) {
    const option = root.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    if (item.id === (draft.type ?? 'diary')) option.selected = true;
    typeField.append(option);
  }

  const titleField = root.createElement('input');
  titleField.className = 'hub-search__input';
  titleField.type = 'text';
  titleField.dataset.calendar = 'compose-title';
  titleField.setAttribute('aria-label', 'Log title');
  titleField.placeholder = view === 'month' ? 'What belongs on this day?' : 'What belongs in this slot?';

  const dateField = root.createElement('input');
  dateField.className = 'hub-search__input';
  dateField.type = 'date';
  dateField.dataset.calendar = 'compose-date';
  dateField.setAttribute('aria-label', 'Date');
  dateField.value = draft.date;

  const timeField = root.createElement('input');
  timeField.className = 'hub-search__input';
  timeField.type = 'time';
  timeField.dataset.calendar = 'compose-time';
  timeField.setAttribute('aria-label', 'Time');
  if (draft.time) timeField.value = draft.time;

  const submit = root.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn--primary';
  submit.textContent = 'Add';

  form.append(typeField, titleField, dateField, timeField, submit);
  card.append(form);
  return card;
}

function renderAgenda(root, selected, scrollToDetail) {
  if (!selected) return null;
  const detail = root.createElement('section');
  detail.className = 'hub-calendar__detail';
  detail.id = 'calendar-day-detail';
  const heading = root.createElement('h3');
  heading.className = 'hub-calendar__detail-heading';
  heading.textContent = selected.title;
  const meta = root.createElement('p');
  meta.className = 'hub-calendar__detail-empty';
  const bits = [
    selected.time ? selected.time : 'All day',
    selected.type === 'work_block'
      ? [
          'Planned work',
          selected.durationMin != null ? `${selected.durationMin}m` : null,
          selected.depth,
          selected.ghost ? 'ghost preview' : selected.status
        ]
          .filter(Boolean)
          .join(' · ')
      : selected.brief,
    selected.type === 'work_block'
      ? null
      : isWritableCalendarType(selected.type)
        ? 'Life log'
        : selected.type
  ].filter(Boolean);
  meta.textContent = bits.join(' · ');
  const snippet = root.createElement('p');
  snippet.className = 'metric-caption';
  snippet.textContent =
    selected.type === 'work_block'
      ? selected.ghost
        ? 'Ghost proposal — not saved until confirmed.'
        : selected.snippet || 'Planned work block.'
      : selected.snippet || 'No notes.';
  detail.append(heading, meta, snippet);
  if (scrollToDetail) {
    delete detail.dataset.motion;
    void detail.offsetWidth;
    detail.dataset.motion = 'in';
    scrollDetailIntoView(root, detail);
  }
  return detail;
}

function renderMissionStrip(root, mission) {
  const strip = root.createElement('div');
  strip.className = 'hub-calendar__mission';
  strip.setAttribute('role', 'status');
  const data = mission ?? {};
  const cells = [
    ['Outcomes', data.outcomes ?? 'Not set'],
    ['Active', data.active_count != null ? String(data.active_count) : 'Not set'],
    ['Deep work', data.deep_work ?? 'Not set'],
    ['Capacity', data.capacity ?? 'Not set']
  ];
  for (const [label, value] of cells) {
    const cell = root.createElement('span');
    cell.textContent = `${label}: ${value}`;
    strip.append(cell);
  }
  return strip;
}

function renderShortcutHint(root) {
  const hint = root.createElement('p');
  hint.className = 'calendar-shortcuts';
  for (const [key, label] of [['A', 'Add'], ['T', 'Today'], ['G', 'Date'], ['?', 'Keys']]) {
    const item = root.createElement('span');
    const kbd = root.createElement('kbd');
    kbd.className = 'hub-kbd';
    kbd.textContent = key;
    item.append(kbd, ` ${label}`);
    hint.append(item);
  }
  return hint;
}

function applyMonthMotion(grid, monthDelta) {
  delete grid.dataset.motion;
  if (!monthDelta) return;
  void grid.offsetWidth;
  grid.dataset.motion = monthDelta > 0 ? 'forward' : 'back';
}

function scrollDetailIntoView(root, detail) {
  if (typeof detail.scrollIntoView !== 'function') return;
  const reduced = root.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  detail.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
}

function weekdayShort(date) {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(new Date(`${date}T12:00:00+10:00`));
}

function taskStatusFromBrief(event) {
  return event?.brief?.startsWith('Tasks · ') ? event.brief.slice('Tasks · '.length) : null;
}

function eventTint(event) {
  return TYPE_TINT[event?.type] ?? TINT[event?.categories?.[0]] ?? 'sage';
}

function typeLabel(type) {
  return TYPE_LABEL[type] ?? String(type ?? 'Event');
}

function nextTimedEvent(timed, now) {
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const upcoming = timed
    .map(event => ({ event, start: parseTimeHours(event.time) }))
    .filter(item => item.start != null && item.start > hours)
    .sort((a, b) => a.start - b.start);
  return upcoming[0]?.event ?? null;
}

function openTaskCount(allDay) {
  return allDay.filter(event => event.type === 'task').length;
}

/** Timed items whose start has passed ÷ total timed — chart-kit ring progress. */
function scheduleRingProgress(timed, now) {
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  let done = 0;
  let total = 0;
  for (const event of timed) {
    const start = parseTimeHours(event.time);
    if (start == null) continue;
    total += 1;
    if (start <= hours) done += 1;
  }
  return { value: done, target: total };
}

function flattenWeekTimed(model) {
  const timed = [];
  for (const day of model.weekDays ?? []) {
    const split = splitDayItems(day.events ?? []);
    for (const event of split.timed) timed.push({ ...event, _date: day.date });
  }
  return timed;
}

function weekOpenTaskCount(model) {
  let count = 0;
  for (const day of model.weekDays ?? []) {
    count += openTaskCount(splitDayItems(day.events ?? []).allDay);
  }
  return count;
}

function nextWeekTimedEvent(model, now) {
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const today = model.date;
  const upcoming = [];
  for (const day of model.weekDays ?? []) {
    if (day.date < today) continue;
    const { timed } = splitDayItems(day.events ?? []);
    for (const event of timed) {
      const start = parseTimeHours(event.time);
      if (start == null) continue;
      if (day.date === today && start <= hours) continue;
      upcoming.push({ event, date: day.date, start });
    }
  }
  upcoming.sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1));
  return upcoming[0] ?? null;
}

function renderMobileDay(root, model, { mobilePanel, draft, now }) {
  const shell = root.createElement('div');
  shell.className = 'hub-calendar__mobile-shell hub-calendar__mobile-day';
  shell.dataset.calendar = 'mobile-day';

  const { timed, allDay } = splitDayItems(model.dayEvents);
  const tasks = openTaskCount(allDay);
  const panel = mobilePanel === 'tasks' ? 'tasks' : 'schedule';

  shell.append(renderNowCard(root, {
    timed,
    tasks,
    now,
    emptyTitle: 'Clear ahead',
    emptyMeta: `${timed.length} timed · ${tasks} open task${tasks === 1 ? '' : 's'}`
  }));
  shell.append(renderDayStrip(root, model));
  shell.append(renderMobileSegmented(root, panel, tasks));
  if (panel === 'tasks') shell.append(renderTasksList(root, allDay));
  else shell.append(renderScheduleList(root, timed));

  appendMobileChrome(shell, root, draft);
  return shell;
}

function renderMobileWeek(root, model, { draft, now }) {
  const shell = root.createElement('div');
  shell.className = 'hub-calendar__mobile-shell hub-calendar__mobile-week';
  shell.dataset.calendar = 'mobile-week';

  const timed = flattenWeekTimed(model);
  const tasks = weekOpenTaskCount(model);
  const next = nextWeekTimedEvent(model, now);

  shell.append(renderNowCard(root, {
    timed,
    tasks,
    now,
    nextOverride: next?.event ?? null,
    nextMeta: next
      ? `${formatDisplayDate(next.date)}${next.event.time ? ` · ${next.event.time}` : ''}`
      : null,
    emptyTitle: 'Clear week',
    emptyMeta: `${timed.length} timed · ${tasks} open task${tasks === 1 ? '' : 's'}`,
    labelWhenNext: 'Next up',
    labelWhenEmpty: 'Nothing else this week'
  }));
  shell.append(renderDayStrip(root, model));
  shell.append(renderWeekAgenda(root, model));
  appendMobileChrome(shell, root, draft);
  return shell;
}

function renderMobileMonth(root, model, { draft, monthDelta, now, mobilePanel }) {
  const shell = root.createElement('div');
  shell.className = 'hub-calendar__mobile-shell hub-calendar__mobile-month';
  shell.dataset.calendar = 'mobile-month';

  const { timed, allDay } = splitDayItems(model.dayEvents);
  const tasks = openTaskCount(allDay);
  const panel = mobilePanel === 'tasks' ? 'tasks' : 'schedule';

  shell.append(renderNowCard(root, {
    timed,
    tasks,
    now,
    emptyTitle: 'Clear day',
    emptyMeta: `${timed.length} timed · ${tasks} open task${tasks === 1 ? '' : 's'}`
  }));
  shell.append(renderMobileMonthGrid(root, model, monthDelta));
  shell.append(renderMobileSegmented(root, panel, tasks));
  if (panel === 'tasks') shell.append(renderTasksList(root, allDay));
  else shell.append(renderScheduleList(root, timed));

  appendMobileChrome(shell, root, draft);
  return shell;
}

function appendMobileChrome(shell, root, draft) {
  shell.append(renderMobileFab(root));
  shell.append(renderEventSheet(root));
  shell.append(renderMobileCompose(root, draft));
}

function renderNowCard(root, {
  timed,
  tasks,
  now,
  nextOverride,
  nextMeta,
  emptyTitle = 'Clear ahead',
  emptyMeta,
  labelWhenNext = 'Next up',
  labelWhenEmpty = 'Nothing else scheduled'
}) {
  const card = root.createElement('section');
  card.className = 'hub-calendar__now-card';
  card.dataset.calendar = 'now-card';
  card.setAttribute('aria-label', 'Now');

  const progress = scheduleRingProgress(timed, now);
  card.append(renderNowRing(root, progress));

  const next = nextOverride !== undefined ? nextOverride : nextTimedEvent(timed, now);
  const copy = root.createElement('div');
  copy.className = 'hub-calendar__now-card-copy';
  const label = root.createElement('p');
  label.className = 'hub-calendar__now-card-label';
  label.textContent = next ? labelWhenNext : labelWhenEmpty;
  const title = root.createElement('p');
  title.className = 'hub-calendar__now-card-title';
  title.textContent = next ? next.title : emptyTitle;
  const meta = root.createElement('p');
  meta.className = 'hub-calendar__now-card-meta';
  if (next && nextMeta) meta.textContent = nextMeta;
  else if (next?.time) meta.textContent = next.time;
  else {
    const base = emptyMeta
      ?? `${timed.length} timed · ${tasks} open task${tasks === 1 ? '' : 's'}`;
    meta.textContent = progress.target > 0
      ? `${base} · ${progress.value}/${progress.target} done`
      : base;
  }
  copy.append(label, title, meta);
  card.append(copy);

  const taskBadge = root.createElement('div');
  taskBadge.className = 'hub-calendar__now-card-tasks';
  taskBadge.dataset.calendar = 'now-tasks';
  const count = root.createElement('strong');
  count.textContent = String(tasks);
  const caption = root.createElement('span');
  caption.textContent = 'Tasks';
  taskBadge.append(count, caption);
  card.append(taskBadge);
  return card;
}

function renderNowRing(root, { value, target }) {
  const wrap = root.createElement('div');
  wrap.className = 'hub-calendar__now-card-ring';
  wrap.dataset.calendar = 'now-ring';
  wrap.dataset.value = String(value);
  wrap.dataset.target = String(target);
  wrap.setAttribute('aria-hidden', 'true');

  const ring = buildRingTarget(
    { value, target: target > 0 ? target : 1 },
    { size: 48, strokeWidth: 5 }
  );
  const fraction = target > 0 ? ring.fraction : 0;
  const dashoffset = ring.circumference * (1 - fraction);

  const svg = svgEl(root, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ring.size} ${ring.size}`);
  svg.dataset.ringKey = `${value}\0${target}\0${ring.size}\0${ring.strokeWidth}`;

  const track = svgEl(root, 'circle');
  track.setAttribute('data-role', 'track');
  track.setAttribute('cx', String(ring.center));
  track.setAttribute('cy', String(ring.center));
  track.setAttribute('r', String(ring.radius));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'currentColor');
  track.setAttribute('stroke-width', String(ring.strokeWidth));
  track.setAttribute('opacity', '0.28');

  const arc = svgEl(root, 'circle');
  arc.setAttribute('data-role', 'fill');
  arc.setAttribute('cx', String(ring.center));
  arc.setAttribute('cy', String(ring.center));
  arc.setAttribute('r', String(ring.radius));
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke', 'currentColor');
  arc.setAttribute('stroke-width', String(ring.strokeWidth));
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('transform', `rotate(-90 ${ring.center} ${ring.center})`);
  arc.setAttribute('stroke-dasharray', String(ring.circumference));
  arc.setAttribute('stroke-dashoffset', String(dashoffset));

  svg.append(track, arc);
  wrap.append(svg);
  return wrap;
}

function renderDayStrip(root, model) {
  const strip = root.createElement('div');
  strip.className = 'hub-calendar__day-strip';
  strip.dataset.calendar = 'day-strip';
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Days this week');
  for (const day of model.weekDays ?? []) {
    const pill = root.createElement('button');
    pill.type = 'button';
    pill.className = 'hub-calendar__day-pill';
    pill.dataset.calendar = 'day-pill';
    pill.dataset.date = day.date;
    pill.setAttribute('role', 'tab');
    pill.setAttribute('aria-selected', day.isSelected ? 'true' : 'false');
    if (day.isToday) pill.dataset.today = 'true';
    if (day.isSelected) pill.dataset.selected = 'true';
    const letter = root.createElement('span');
    letter.className = 'hub-calendar__day-pill-letter';
    letter.textContent = day.letter || weekdayShort(day.date).slice(0, 1);
    const num = root.createElement('span');
    num.className = 'hub-calendar__day-pill-num';
    num.textContent = String(Number(day.date.slice(8, 10)));
    pill.append(letter, num);
    if ((day.events ?? []).length) {
      const marks = root.createElement('span');
      marks.className = 'hub-calendar__day-pill-marks';
      marks.setAttribute('aria-hidden', 'true');
      for (const event of (day.events ?? []).slice(0, 3)) {
        const dot = root.createElement('span');
        dot.className = 'hub-calendar__day-pill-dot';
        dot.dataset.tint = eventTint(event);
        marks.append(dot);
      }
      pill.append(marks);
    }
    pill.addEventListener('click', () => {
      const calendar = pill.closest?.('.hub-calendar') ?? pill;
      handlersByRoot.get(calendar)?.onSelectDate?.(day.date);
    });
    strip.append(pill);
  }
  return strip;
}

function renderWeekAgenda(root, model) {
  const list = root.createElement('div');
  list.className = 'hub-calendar__mobile-list';
  list.dataset.calendar = 'week-agenda';

  let painted = 0;
  for (const day of model.weekDays ?? []) {
    const events = day.events ?? [];
    if (!events.length) continue;
    const heading = root.createElement('p');
    heading.className = 'hub-calendar__mobile-group';
    heading.textContent = `${weekdayShort(day.date)} · ${formatDisplayDate(day.date)}`;
    list.append(heading);
    const { timed, allDay } = splitDayItems(events);
    for (const block of layoutTimedBlocks(timed)) {
      list.append(renderMobileRow(root, {
        event: block.item,
        meta: formatBlockTime(block),
        iconPaths: ['M12 7v5l3 2', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z']
      }));
      painted += 1;
    }
    for (const event of allDay) {
      list.append(renderMobileRow(root, {
        event,
        meta: typeLabel(event.type),
        iconPaths: event.type === 'task'
          ? ['M8 7h11M8 12h11M8 17h11', 'm4.5 7 .8.8L7 6M4.5 12l.8.8L7 11']
          : ['M8 7h11M8 12h11M8 17h11']
      }));
      painted += 1;
    }
  }
  if (!painted) {
    const empty = root.createElement('p');
    empty.className = 'hub-calendar__mobile-empty';
    empty.textContent = 'Nothing scheduled this week.';
    list.append(empty);
  }
  return list;
}

function renderMobileMonthGrid(root, model, monthDelta) {
  const grid = root.createElement('div');
  grid.className = 'hub-calendar__mobile-month-grid';
  grid.dataset.calendar = 'mobile-month-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Month grid');
  if (monthDelta > 0) grid.dataset.motion = 'forward';
  if (monthDelta < 0) grid.dataset.motion = 'back';

  for (const heading of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
    const cell = root.createElement('span');
    cell.className = 'hub-calendar__mobile-month-weekday';
    cell.textContent = heading;
    grid.append(cell);
  }

  for (const day of model.monthDays ?? []) {
    const cell = root.createElement('button');
    cell.type = 'button';
    cell.className = 'hub-calendar__mobile-month-day';
    cell.setAttribute('role', 'gridcell');
    cell.dataset.date = day.date;
    cell.dataset.calendar = 'mobile-month-day';
    if (!day.inMonth) cell.dataset.outside = 'true';
    if (day.isToday) cell.dataset.today = 'true';
    if (day.isSelected) cell.dataset.selected = 'true';
    const num = root.createElement('span');
    num.className = 'hub-calendar__mobile-month-num';
    num.textContent = String(day.day);
    cell.append(num);
    if ((day.events ?? []).length) {
      const marks = root.createElement('span');
      marks.className = 'hub-calendar__mobile-month-marks';
      marks.setAttribute('aria-hidden', 'true');
      for (const event of (day.events ?? []).slice(0, 3)) {
        const dot = root.createElement('span');
        dot.className = 'hub-calendar__mobile-month-dot';
        dot.dataset.tint = eventTint(event);
        marks.append(dot);
      }
      cell.append(marks);
    }
    cell.addEventListener('click', () => {
      const calendar = cell.closest?.('.hub-calendar') ?? cell;
      handlersByRoot.get(calendar)?.onSelectDate?.(day.date);
    });
    grid.append(cell);
  }
  applyMonthMotion(grid, monthDelta);
  return grid;
}

function renderMobileSegmented(root, panel, taskCount) {
  const tabs = root.createElement('div');
  tabs.className = 'hub-calendar__mobile-segments';
  tabs.dataset.calendar = 'mobile-segments';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Schedule or tasks');

  for (const item of [
    { id: 'schedule', label: 'Schedule' },
    { id: 'tasks', label: `Tasks · ${taskCount}` }
  ]) {
    const tab = root.createElement('button');
    tab.type = 'button';
    tab.className = 'hub-calendar__mobile-segment';
    tab.dataset.calendar = 'mobile-panel';
    tab.dataset.panel = item.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', item.id === panel ? 'true' : 'false');
    tab.textContent = item.label;
    tab.addEventListener('click', () => {
      const calendar = tab.closest?.('.hub-calendar') ?? tab;
      handlersByRoot.get(calendar)?.onSwitchMobilePanel?.(item.id);
    });
    tabs.append(tab);
  }
  return tabs;
}

function renderScheduleList(root, timed) {
  const list = root.createElement('div');
  list.className = 'hub-calendar__mobile-list';
  list.dataset.calendar = 'schedule-list';
  const blocks = layoutTimedBlocks(timed);
  if (!blocks.length) {
    const empty = root.createElement('p');
    empty.className = 'hub-calendar__mobile-empty';
    empty.textContent = 'Nothing timed today.';
    list.append(empty);
    return list;
  }
  for (const block of blocks) {
    list.append(renderMobileRow(root, {
      event: block.item,
      meta: formatBlockTime(block),
      iconPaths: ['M12 7v5l3 2', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z']
    }));
  }
  return list;
}

function renderTasksList(root, allDay) {
  const list = root.createElement('div');
  list.className = 'hub-calendar__mobile-list';
  list.dataset.calendar = 'tasks-list';

  const tasks = allDay.filter(event => event.type === 'task');
  const other = allDay.filter(event => event.type !== 'task');
  const byStatus = new Map();
  for (const event of tasks) {
    const status = taskStatusFromBrief(event) || 'open';
    if (!byStatus.has(status)) byStatus.set(status, []);
    byStatus.get(status).push(event);
  }

  let painted = 0;
  for (const status of TASK_STATUS_ORDER) {
    const group = byStatus.get(status);
    if (!group?.length) continue;
    painted += appendTaskGroup(root, list, TASK_STATUS_LABEL[status] ?? status, group);
    byStatus.delete(status);
  }
  for (const [status, group] of byStatus) {
    if (!group.length) continue;
    painted += appendTaskGroup(root, list, TASK_STATUS_LABEL[status] ?? status, group);
  }
  if (other.length) {
    painted += appendTaskGroup(root, list, 'Other', other);
  }
  if (!painted) {
    const empty = root.createElement('p');
    empty.className = 'hub-calendar__mobile-empty';
    empty.textContent = 'No open tasks today.';
    list.append(empty);
  }
  return list;
}

function appendTaskGroup(root, list, heading, events) {
  const label = root.createElement('p');
  label.className = 'hub-calendar__mobile-group';
  label.textContent = heading;
  list.append(label);
  for (const event of events) {
    list.append(renderMobileRow(root, {
      event,
      meta: typeLabel(event.type),
      iconPaths: event.type === 'task'
        ? ['M8 7h11M8 12h11M8 17h11', 'm4.5 7 .8.8L7 6M4.5 12l.8.8L7 11']
        : ['M8 7h11M8 12h11M8 17h11']
    }));
  }
  return events.length;
}

function renderMobileRow(root, { event, meta, iconPaths }) {
  const row = root.createElement('button');
  row.type = 'button';
  row.className = 'hub-calendar__mobile-row';
  row.dataset.calendar = 'mobile-row';
  row.dataset.eventId = event.id ?? event.path ?? '';

  const icon = root.createElement('span');
  icon.className = 'hub-calendar__mobile-row-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.append(svgFromPaths(root, iconPaths));

  const copy = root.createElement('div');
  copy.className = 'hub-calendar__mobile-row-copy';
  const title = root.createElement('p');
  title.className = 'hub-calendar__mobile-row-title';
  title.textContent = event.title;
  const caption = root.createElement('p');
  caption.className = 'hub-calendar__mobile-row-meta';
  caption.textContent = meta;
  copy.append(title, caption);

  const dot = root.createElement('span');
  dot.className = 'hub-calendar__mobile-row-dot';
  dot.dataset.tint = eventTint(event);
  dot.setAttribute('aria-hidden', 'true');

  row.append(icon, copy, dot);
  row.addEventListener('click', () => {
    const calendar = row.closest?.('.hub-calendar') ?? row;
    openEventSheet(calendar, event);
  });
  return row;
}

function renderMobileFab(root) {
  const fab = root.createElement('button');
  fab.type = 'button';
  fab.className = 'hub-calendar__fab';
  fab.dataset.calendar = 'mobile-fab';
  fab.setAttribute('aria-label', 'Add log');
  fab.append(svgFromPaths(root, ['M12 5v14M5 12h14']));
  fab.addEventListener('click', () => {
    const calendar = fab.closest?.('.hub-calendar') ?? fab;
    openMobileComposeSheet(calendar);
  });
  return fab;
}

function renderEventSheet(root) {
  const sheet = root.createElement('dialog');
  sheet.className = 'hub-more-sheet hub-calendar-sheet';
  sheet.dataset.calendar = 'event-sheet';
  sheet.setAttribute('aria-label', 'Event detail');

  const panel = root.createElement('div');
  panel.className = 'hub-more-sheet__panel';

  const head = root.createElement('header');
  head.className = 'hub-more-sheet__head';
  const title = root.createElement('h2');
  title.dataset.calendar = 'event-sheet-title';
  title.textContent = 'Event';
  const close = root.createElement('button');
  close.type = 'button';
  close.className = 'hub-calendar-sheet__close-x';
  close.dataset.calendar = 'event-sheet-close';
  close.setAttribute('aria-label', 'Close');
  close.append(svgFromPaths(root, ['M6 6l12 12M18 6 6 18']));
  head.append(title, close);

  const body = root.createElement('div');
  body.className = 'hub-calendar-sheet__body';
  body.dataset.calendar = 'event-sheet-body';

  panel.append(head, body);
  sheet.append(panel);

  const closeSheet = () => {
    if (typeof sheet.close === 'function') sheet.close();
    else sheet.removeAttribute?.('open');
  };
  close.addEventListener('click', closeSheet);
  sheet.addEventListener('click', event => {
    if (event.target === sheet) closeSheet();
  });
  return sheet;
}

function openEventSheet(calendar, event) {
  const sheet = calendar.querySelector?.('[data-calendar="event-sheet"]');
  const handlers = handlersByRoot.get(calendar);
  const root = handlers?.root;
  if (!sheet || !event || !root) return;
  const title = sheet.querySelector?.('[data-calendar="event-sheet-title"]');
  const body = sheet.querySelector?.('[data-calendar="event-sheet-body"]');
  if (title) title.textContent = event.title || 'Event';
  if (body?.replaceChildren) {
    const meta = root.createElement('p');
    meta.className = 'hub-calendar-sheet__meta';
    meta.textContent = [
      event.time ? event.time : 'All day',
      typeLabel(event.type),
      event.brief
    ].filter(Boolean).join(' · ');
    const snippet = root.createElement('p');
    snippet.className = 'hub-calendar-sheet__snippet';
    snippet.textContent = event.snippet || event.brief || 'No notes.';
    body.replaceChildren(meta, snippet);
  }
  if (typeof sheet.showModal === 'function') sheet.showModal();
  else sheet.setAttribute?.('open', '');
}

function renderMobileCompose(root, draft) {
  const sheet = root.createElement('dialog');
  sheet.className = 'hub-more-sheet hub-calendar-sheet';
  sheet.dataset.calendar = 'compose-sheet';
  sheet.setAttribute('aria-label', 'Add log');

  const panel = root.createElement('div');
  panel.className = 'hub-more-sheet__panel';

  const head = root.createElement('header');
  head.className = 'hub-more-sheet__head';
  const title = root.createElement('h2');
  title.textContent = 'Add';
  const close = root.createElement('button');
  close.type = 'button';
  close.className = 'hub-calendar-sheet__close-x';
  close.dataset.calendar = 'compose-sheet-close';
  close.setAttribute('aria-label', 'Close');
  close.append(svgFromPaths(root, ['M6 6l12 12M18 6 6 18']));
  head.append(title, close);

  const body = root.createElement('div');
  body.className = 'hub-calendar-sheet__body';
  body.dataset.calendar = 'compose-sheet-body';
  body.append(renderCompose(root, draft, 'day'));

  panel.append(head, body);
  sheet.append(panel);

  const closeSheet = () => {
    if (typeof sheet.close === 'function') sheet.close();
    else sheet.removeAttribute?.('open');
  };
  close.addEventListener('click', closeSheet);
  sheet.addEventListener('click', event => {
    if (event.target === sheet) closeSheet();
  });
  return sheet;
}

function openMobileComposeSheet(calendar) {
  const sheet = calendar.querySelector?.('[data-calendar="compose-sheet"]');
  if (!sheet) return;
  if (typeof sheet.showModal === 'function') sheet.showModal();
  else sheet.setAttribute?.('open', '');
  sheet.querySelector?.('[data-calendar="compose-title"]')?.focus?.();
}

function svgEl(root, tag) {
  if (typeof root.createElementNS === 'function') {
    return root.createElementNS(SVG_NS, tag);
  }
  const doc = root.defaultView?.document;
  if (typeof doc?.createElementNS === 'function') {
    return doc.createElementNS(SVG_NS, tag);
  }
  return root.createElement(tag);
}

function svgFromPaths(root, paths) {
  const svg = svgEl(root, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = svgEl(root, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
