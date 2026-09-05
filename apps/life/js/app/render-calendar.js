import { formatDisplayDate } from '../core/time.js';
import { listCalendarSources } from '../shell/calendar-sources.js';
import { renderCalendarSources } from '../shell/render-calendar-sources.js';
import { candidateForLog, inferMealSlot, isWritableCalendarType, slugForLog } from './calendar-write.js';
import {
  blockStyle,
  formatBlockTime,
  hoursFromOffset,
  hoursToDueTime,
  layoutTimedBlocks,
  nowLineOffset,
  parseGoToDate,
  splitDayItems,
  timeGridHours,
  hourCaption
} from '../../../../packages/design-kit/js/time-grid.js';

const CATEGORY_CLASS = {
  nutrition: 'nutrition',
  fitness: 'fitness',
  diary: 'mind',
  body: 'body',
  skincare: 'skincare',
  sleep: 'body'
};

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
  task: 'sage',
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

const handlersByRoot = new WeakMap();

export function renderCalendar(root, model, {
  onSelectDate,
  onShiftRange,
  onSwitchView,
  onCreateLog,
  scrollToDetail = false,
  monthDelta = 0,
  expanded = false,
  view = 'week',
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
  handlersByRoot.set(calendar, {
    onSelectDate,
    onShiftRange,
    onSwitchView,
    onCreateLog,
    view: mode,
    today: model.date,
    selectedDate: model.selectedDate
  });

  calendar.replaceChildren();
  calendar.append(renderNav(root, model, mode));

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
  const draft = composeDraft ?? { date: model.selectedDate, time: null, type: 'diary' };
  const selected = findEvent(model, selectedEventId);
  rail.append(renderCompose(root, draft, mode));
  rail.append(renderAgenda(root, model, mode, selected, expanded, scrollToDetail));
  rail.append(renderSources(root));
  rail.append(renderShortcutHint(root));
  workspace.append(body, rail);
  calendar.append(workspace);

  bindNav(calendar);
  bindKeys(calendar, root);

  if (focusCompose) {
    const input = calendar.querySelector('[data-calendar="compose-title"]');
    input?.focus?.();
  }

  dashboard.removeAttribute('hidden');
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

  nav.append(paging, tabs);
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

function renderAgenda(root, model, view, selected, expanded, scrollToDetail) {
  const detail = root.createElement('section');
  detail.className = 'hub-calendar__detail';
  detail.id = 'calendar-day-detail';
  if (selected) {
    const heading = root.createElement('h3');
    heading.className = 'hub-calendar__detail-heading';
    heading.textContent = selected.title;
    const meta = root.createElement('p');
    meta.className = 'hub-calendar__detail-empty';
    meta.textContent = [
      selected.time ? selected.time : 'All day',
      selected.brief,
      isWritableCalendarType(selected.type) ? 'Life log' : selected.type
    ].filter(Boolean).join(' · ');
    const snippet = root.createElement('p');
    snippet.className = 'metric-caption';
    snippet.textContent = selected.snippet || 'No notes.';
    detail.append(heading, meta, snippet);
    return detail;
  }

  const heading = root.createElement('h3');
  heading.className = 'hub-calendar__detail-heading';
  heading.textContent = formatDisplayDate(model.selectedDate);
  detail.append(heading);
  if (!model.dayEvents.length) {
    const empty = root.createElement('p');
    empty.className = 'hub-calendar__detail-empty';
    empty.textContent = 'Nothing logged this day.';
    detail.append(empty);
  } else {
    for (const event of model.dayEvents) {
      detail.append(eventRow(root, event));
    }
  }
  if (expanded && scrollToDetail) {
    delete detail.dataset.motion;
    void detail.offsetWidth;
    detail.dataset.motion = 'in';
    scrollDetailIntoView(root, detail);
  }
  return detail;
}

function renderSources(root) {
  const card = root.createElement('article');
  card.className = 'hub-calendar__detail';
  card.id = 'calendar-source-registry';
  card.setAttribute('aria-label', 'Shared calendar sources');
  const label = root.createElement('p');
  label.className = 'metric-label';
  label.textContent = 'Shared sources';
  const empty = root.createElement('p');
  empty.className = 'metric-caption';
  empty.dataset.calendar = 'sources-empty';
  empty.textContent = 'No shared sources yet.';
  const list = root.createElement('ul');
  list.id = 'calendar-source-list';
  list.setAttribute('hidden', '');
  card.append(label, empty, list);
  renderCalendarSources({
    createElement: root.createElement.bind(root),
    querySelector(selector) {
      if (selector === '[data-calendar="sources-empty"]') return empty;
      if (selector === '#calendar-source-list') return list;
      return card.querySelector?.(selector) ?? null;
    }
  }, listCalendarSources());
  return card;
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

function eventRow(root, event) {
  const row = root.createElement('div');
  row.className = 'calendar-event';

  const affordance = root.createElement('span');
  affordance.className = 'calendar-event__affordance';
  const category = event.categories?.[0];
  if (category) {
    const dot = root.createElement('i');
    dot.className = `calendar-dot ${CATEGORY_CLASS[category] ?? ''}`.trim();
    dot.title = category;
    affordance.append(dot);
  }
  row.append(affordance);

  const meta = root.createElement('div');
  meta.className = 'calendar-event__meta';
  const title = root.createElement('strong');
  title.className = 'calendar-event__title';
  title.textContent = event.title;
  meta.append(title);
  if (event.brief) {
    const brief = root.createElement('p');
    brief.className = 'calendar-event__brief';
    brief.textContent = event.brief;
    meta.append(brief);
  }
  row.append(meta);
  return row;
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
