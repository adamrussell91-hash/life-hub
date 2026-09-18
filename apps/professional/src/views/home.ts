import { formatDisplayDateRange } from '../../design-kit/js/format-display-date.js';
import { listEvents } from '@/api/events';
import { eventRoute } from '@/app/router';
import type { EventOccurrenceState, EventRecord } from '@/domain/types';
import { renderLoadError, showViewLoading } from '@/views/feedback';

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

const SYDNEY_TZ = 'Australia/Sydney';

// No settings surface stores a real accreditation target yet — this is a
// stand-in goal so the progress bar has something to measure against, not a
// figure sourced from any accreditation body.
const ACCREDITATION_TARGET_HOURS = 100;

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface YmdParts {
  year: number;
  month: number; // 1-12
  day: number;
}

/** Projects a UTC instant onto its Sydney calendar day — same locked
 * convention as design-kit/js/format-display-date.js. */
function sydneyParts(instant: Date): YmdParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SYDNEY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function ymdKey(parts: YmdParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function sydneyDateKey(iso: string): string {
  return ymdKey(sydneyParts(new Date(iso)));
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

const STATE_TINT: Record<EventOccurrenceState, string> = {
  completed: 'sage',
  scheduled: 'blue',
  rescheduled: 'blue',
  cancelled: 'muted'
};

const STATE_LABEL: Record<EventOccurrenceState, string> = {
  completed: 'Completed',
  scheduled: 'Scheduled',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled'
};

function statusChip(state: EventOccurrenceState): HTMLElement {
  return el('span', `pro-home__chip-tag pro-home__chip-tag--${STATE_TINT[state]}`, STATE_LABEL[state]);
}

function renderCalendar(today: YmdParts, events: EventRecord[]): HTMLElement {
  const byDay = new Map<string, EventRecord[]>();
  for (const event of events) {
    const key = sydneyDateKey(event.start);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);
  }

  const card = el('section', 'pro-home__calendar');
  const head = el('div', 'pro-home__cal-head');
  const monthLabel = new Date(Date.UTC(today.year, today.month - 1, 1)).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
  head.append(el('span', 'pro-home__cal-title', monthLabel));
  card.append(head);

  const dow = el('div', 'pro-home__dow');
  for (const label of DOW) dow.append(el('span', undefined, label));
  card.append(dow);

  const firstWeekday = (new Date(Date.UTC(today.year, today.month - 1, 1)).getUTCDay() + 6) % 7;
  const total = daysInMonth(today.year, today.month);
  const prevTotal = daysInMonth(today.year, today.month - 1 <= 0 ? 12 : today.month - 1);
  const cellCount = Math.ceil((firstWeekday + total) / 7) * 7;

  const grid = el('div', 'pro-home__grid');
  for (let i = 0; i < cellCount; i += 1) {
    const offset = i - firstWeekday;
    const inMonth = offset >= 0 && offset < total;
    let dayNum: number;
    let cellParts: YmdParts;
    if (offset < 0) {
      dayNum = prevTotal + offset + 1;
      const prevMonth = today.month - 1 <= 0 ? 12 : today.month - 1;
      const prevYear = today.month - 1 <= 0 ? today.year - 1 : today.year;
      cellParts = { year: prevYear, month: prevMonth, day: dayNum };
    } else if (offset >= total) {
      dayNum = offset - total + 1;
      const nextMonth = today.month + 1 > 12 ? 1 : today.month + 1;
      const nextYear = today.month + 1 > 12 ? today.year + 1 : today.year;
      cellParts = { year: nextYear, month: nextMonth, day: dayNum };
    } else {
      dayNum = offset + 1;
      cellParts = { year: today.year, month: today.month, day: dayNum };
    }

    const key = ymdKey(cellParts);
    const isToday = inMonth && key === ymdKey(today);
    const cell = el('div', `pro-home__day${inMonth ? '' : ' pro-home__day--out'}${isToday ? ' pro-home__day--today' : ''}`);
    cell.append(el('span', 'pro-home__daynum', String(dayNum)));

    const dayEvents = byDay.get(key) ?? [];
    const shown = dayEvents.slice(0, 2);
    for (const event of shown) {
      const chip = el('a', `pro-home__chip pro-home__chip--${STATE_TINT[event.occurrence_state]}`, event.title);
      chip.href = eventRoute(event.id);
      cell.append(chip);
    }
    if (dayEvents.length > shown.length) {
      cell.append(el('span', 'pro-home__more', `+${dayEvents.length - shown.length} more`));
    }
    grid.append(cell);
  }
  card.append(grid);
  return card;
}

function renderAccreditation(today: YmdParts, events: EventRecord[]): HTMLElement {
  const card = el('section', 'pro-home__progress');
  card.append(el('h2', 'pro-home__card-title', 'Accreditation progress'));

  let hoursThisYear = 0;
  const categoryTotals = new Map<string, number>();
  for (const event of events) {
    if (event.occurrence_state !== 'completed') continue;
    if (event.hours == null) continue;
    const key = sydneyDateKey(event.start);
    if (Number(key.slice(0, 4)) !== today.year) continue;
    hoursThisYear += event.hours;
    const category = event.accreditation_category?.trim() || 'Uncategorised';
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + event.hours);
  }

  const top = el('div', 'pro-home__progress-top');
  top.append(
    el('span', 'pro-home__progress-value', `${hoursThisYear} hrs`),
    el('span', 'pro-home__progress-of', `of ${ACCREDITATION_TARGET_HOURS}`)
  );
  card.append(top);
  card.append(el('p', 'pro-home__progress-caption', `Logged in ${today.year} · goal is a placeholder`));

  const barTrack = el('div', 'pro-home__progress-bar');
  const fill = el('div', 'pro-home__progress-fill');
  fill.style.width = `${Math.min(100, (hoursThisYear / ACCREDITATION_TARGET_HOURS) * 100)}%`;
  barTrack.append(fill);
  card.append(barTrack);

  if (categoryTotals.size) {
    const chips = el('div', 'pro-home__progress-chips');
    const sorted = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    for (const [category, hours] of sorted) {
      chips.append(el('span', 'pro-home__chip-tag pro-home__chip-tag--blue', `${category} · ${hours} hrs`));
    }
    card.append(chips);
  }

  return card;
}

function renderYearStrip(today: YmdParts, events: EventRecord[]): HTMLElement {
  const card = el('section', 'pro-home__yearstrip');
  const head = el('div', 'pro-home__yearstrip-head');
  head.append(el('span', 'pro-home__card-title', 'Year at a glance'), el('span', 'pro-home__yearstrip-year', String(today.year)));
  card.append(head);

  const countsByMonth = new Array(12).fill(0) as number[];
  for (const event of events) {
    if (event.occurrence_state === 'cancelled') continue;
    const key = sydneyDateKey(event.start);
    const [yearStr, monthStr] = key.split('-');
    if (Number(yearStr) !== today.year) continue;
    countsByMonth[Number(monthStr) - 1] += 1;
  }

  const months = el('div', 'pro-home__months');
  for (let m = 0; m < 12; m += 1) {
    const isCurrent = m === today.month - 1;
    const cell = el('div', `pro-home__month${isCurrent ? ' pro-home__month--current' : ''}`);
    cell.append(el('span', 'pro-home__month-label', MONTH_ABBR[m]!));
    if (countsByMonth[m] > 0) cell.append(el('span', 'pro-home__month-dot'));
    months.append(cell);
  }
  card.append(months);

  const track = el('div', 'pro-home__track');
  const line = el('div', 'pro-home__track-line');
  track.append(line);
  const totalDaysInYear = (Date.UTC(today.year, 11, 31) - Date.UTC(today.year, 0, 1)) / 86_400_000 + 1;
  const dayOfYear = (Date.UTC(today.year, today.month - 1, today.day) - Date.UTC(today.year, 0, 1)) / 86_400_000 + 1;
  const todayPct = (dayOfYear / totalDaysInYear) * 100;
  const tick = el('div', 'pro-home__track-today');
  tick.style.left = `${todayPct}%`;
  const tickLabel = el('span', 'pro-home__track-todaylabel', 'Today');
  tickLabel.style.left = `${todayPct}%`;
  track.append(tick, tickLabel);
  card.append(track);

  return card;
}

function renderTimeline(events: EventRecord[]): HTMLElement {
  const card = el('section', 'pro-home__timeline');
  const head = el('div', 'pro-home__timeline-head');
  head.append(el('h2', 'pro-home__card-title', 'Your development, in order'));
  const viewAll = el('a', 'pro-home__timeline-link', 'View all');
  viewAll.href = '#/events';
  head.append(viewAll);
  card.append(head);

  if (!events.length) {
    card.append(el('p', 'empty-state', 'No events yet.'));
    return card;
  }

  const nowMs = Date.now();
  const withTime = events.map((event) => ({ event, startMs: Date.parse(event.start) }));
  const upcoming = withTime.filter((e) => e.startMs >= nowMs).sort((a, b) => a.startMs - b.startMs);
  const past = withTime.filter((e) => e.startMs < nowMs).sort((a, b) => b.startMs - a.startMs);
  const ordered = [...upcoming, ...past].slice(0, 8);

  for (const { event } of ordered) {
    const row = el('div', 'pro-home__timeline-row');
    row.append(el('span', `pro-home__timeline-dot pro-home__timeline-dot--${STATE_TINT[event.occurrence_state]}`));
    row.append(el('span', 'pro-home__timeline-date', formatDisplayDateRange(event.start, event.end)));
    const title = el('a', 'pro-home__timeline-title', event.title);
    title.href = eventRoute(event.id);
    row.append(title);
    row.append(statusChip(event.occurrence_state));
    card.append(row);
  }

  return card;
}

export async function renderHomeView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading…');
    try {
      const { events } = await listEvents();
      paint(events);
    } catch (err) {
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(events: EventRecord[]): void {
    canvas.replaceChildren();

    const actions = el('div', 'pro-home__actions');
    const add = el('a', 'btn btn--primary', '+ Log PD event');
    add.href = '#/event/new';
    actions.append(add);
    canvas.append(actions);

    const today = sydneyParts(new Date());

    const body = el('div', 'pro-home__body');
    body.append(renderCalendar(today, events));

    const side = el('div', 'pro-home__side');
    side.append(renderAccreditation(today, events));
    side.append(renderYearStrip(today, events));
    body.append(side);

    canvas.append(body);
    canvas.append(renderTimeline(events));
  }

  await load();
}
