const CATEGORY_CLASS = {
  nutrition: 'nutrition',
  fitness: 'fitness',
  diary: 'mind',
  body: 'body',
  skincare: 'skincare',
  sleep: 'body'
};

export function renderCalendar(root, model, {
  onSelectDate,
  onShiftMonth,
  scrollToDetail = false,
  monthDelta = 0
} = {}) {
  const dashboard = root.querySelector('#calendar-dashboard');
  if (!dashboard || !model) return;

  const label = root.querySelector('[data-calendar="month-label"]');
  if (label) label.textContent = model.monthLabel;

  const week = root.querySelector('#calendar-week-strip');
  if (week) {
    week.replaceChildren();
    for (const day of model.weekDays) {
      week.append(dayButton(root, day, onSelectDate));
    }
  }

  const grid = root.querySelector('#calendar-month-grid');
  if (grid) {
    grid.replaceChildren();
    for (const heading of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
      const cell = root.createElement('span');
      cell.className = 'calendar-weekday';
      cell.textContent = heading;
      grid.append(cell);
    }
    for (const day of model.monthDays) {
      grid.append(monthCell(root, day, onSelectDate));
    }
    applyMonthMotion(grid, monthDelta);
  }

  const detail = root.querySelector('#calendar-day-detail');
  if (detail) {
    detail.replaceChildren();
    const heading = root.createElement('p');
    heading.className = 'metric-label';
    heading.textContent = `Selected · ${model.selectedDate}`;
    detail.append(heading);
    if (!model.dayEvents.length) {
      const empty = root.createElement('p');
      empty.className = 'metric-caption';
      empty.textContent = 'Nothing logged this day.';
      detail.append(empty);
    } else {
      for (const event of model.dayEvents) {
        const row = root.createElement('div');
        row.className = 'calendar-event';
        const title = root.createElement('strong');
        title.textContent = event.title;
        row.append(title);
        if (event.snippet) {
          const snippet = root.createElement('p');
          snippet.textContent = event.snippet;
          row.append(snippet);
        }
        detail.append(row);
      }
    }
    if (scrollToDetail) {
      detail.dataset.motion = 'in';
      scrollDetailIntoView(root, detail);
    }
  }

  const prev = root.querySelector('[data-calendar="prev-month"]');
  const next = root.querySelector('[data-calendar="next-month"]');
  if (prev && !prev.dataset.bound) {
    prev.dataset.bound = '1';
    prev.addEventListener('click', () => onShiftMonth?.(-1));
  }
  if (next && !next.dataset.bound) {
    next.dataset.bound = '1';
    next.addEventListener('click', () => onShiftMonth?.(1));
  }

  dashboard.removeAttribute('hidden');
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

function dayButton(root, day, onSelectDate) {
  const button = root.createElement('button');
  button.type = 'button';
  button.className = 'calendar-week-day';
  if (day.isToday) button.dataset.today = 'true';
  if (day.isSelected) button.dataset.selected = 'true';
  button.addEventListener('click', () => onSelectDate?.(day.date));

  const letter = root.createElement('span');
  letter.textContent = day.letter;
  button.append(letter);
  button.append(dots(root, day.categories));
  return button;
}

function monthCell(root, day, onSelectDate) {
  const button = root.createElement('button');
  button.type = 'button';
  button.className = 'calendar-day';
  if (!day.inMonth) button.dataset.outside = 'true';
  if (day.isToday) button.dataset.today = 'true';
  if (day.isSelected) button.dataset.selected = 'true';
  button.addEventListener('click', () => onSelectDate?.(day.date));

  const num = root.createElement('span');
  num.className = 'calendar-day__num';
  num.textContent = String(day.day);
  button.append(num);
  button.append(dots(root, day.categories));
  return button;
}

function dots(root, categories) {
  const wrap = root.createElement('span');
  wrap.className = 'calendar-dots';
  for (const category of categories.slice(0, 4)) {
    const dot = root.createElement('i');
    dot.className = `calendar-dot ${CATEGORY_CLASS[category] ?? ''}`.trim();
    dot.title = category;
    wrap.append(dot);
  }
  return wrap;
}
