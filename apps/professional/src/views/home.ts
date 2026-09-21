import { formatDisplayDate, formatDisplayDateRange } from '../../design-kit/js/format-display-date.js';
import { listEvents } from '@/api/events';
import { listMeetings } from '@/api/meetings';
import { eventRoute, meetingRoute } from '@/app/router';
import type { EventOccurrenceState, EventRecord, MeetingRecord, MeetingState } from '@/domain/types';
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

const MEETING_STATE_LABEL: Record<MeetingState, string> = {
  completed: 'Completed',
  scheduled: 'Scheduled',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  no_show: 'No show'
};

interface YearMark {
  id: string;
  kind: 'meeting' | 'event';
  title: string;
  start: string;
  href: string;
  stateLabel: string;
  tint: 'meeting' | 'event' | 'muted';
}

function dayOfYear(year: number, parts: YmdParts): number {
  return (Date.UTC(year, parts.month - 1, parts.day) - Date.UTC(year, 0, 1)) / 86_400_000 + 1;
}

function yearProgressPct(year: number, parts: YmdParts, totalDays: number): number {
  return (dayOfYear(year, parts) / totalDays) * 100;
}

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

function collectYearMarks(today: YmdParts, events: EventRecord[], meetings: MeetingRecord[]): YearMark[] {
  const marks: YearMark[] = [];
  for (const event of events) {
    if (event.occurrence_state === 'cancelled') continue;
    if (sydneyParts(new Date(event.start)).year !== today.year) continue;
    marks.push({
      id: event.id,
      kind: 'event',
      title: event.title,
      start: event.start,
      href: eventRoute(event.id),
      stateLabel: STATE_LABEL[event.occurrence_state],
      tint: 'event'
    });
  }
  for (const meeting of meetings) {
    if (meeting.state === 'cancelled') continue;
    if (sydneyParts(new Date(meeting.scheduled_start)).year !== today.year) continue;
    marks.push({
      id: meeting.id,
      kind: 'meeting',
      title: meeting.title,
      start: meeting.scheduled_start,
      href: meetingRoute(meeting.id),
      stateLabel: MEETING_STATE_LABEL[meeting.state],
      tint: 'meeting'
    });
  }
  marks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return marks;
}

function renderYearStrip(today: YmdParts, events: EventRecord[], meetings: MeetingRecord[]): HTMLElement {
  const card = el('section', 'pro-home__yearstrip');
  const head = el('div', 'pro-home__yearstrip-head');
  head.append(
    el('span', 'pro-home__card-title', 'Year at a glance'),
    el('span', 'pro-home__yearstrip-year', String(today.year))
  );
  card.append(head);

  const totalDays = (Date.UTC(today.year, 11, 31) - Date.UTC(today.year, 0, 1)) / 86_400_000 + 1;

  const axis = el('div', 'pro-home__yearstrip-axis');
  for (let m = 0; m < 12; m += 1) {
    const label = el(
      'span',
      `pro-home__yearstrip-month${m === today.month - 1 ? ' pro-home__yearstrip-month--current' : ''}${m === 0 ? ' pro-home__yearstrip-month--start' : ''}`
    );
    label.append(el('span', 'pro-home__yearstrip-month-full', MONTH_ABBR[m]!));
    label.append(el('span', 'pro-home__yearstrip-month-short', MONTH_ABBR[m]!.slice(0, 1)));
    label.style.left = `${((dayOfYear(today.year, { year: today.year, month: m + 1, day: 1 }) - 1) / totalDays) * 100}%`;
    axis.append(label);
  }
  card.append(axis);

  const track = el('div', 'pro-home__yearstrip-track');
  track.append(el('div', 'pro-home__yearstrip-line'));

  const todayPct = yearProgressPct(today.year, today, totalDays);
  const tick = el('div', 'pro-home__yearstrip-today');
  tick.style.left = `${todayPct}%`;
  const tickLabel = el('span', 'pro-home__yearstrip-todaylabel', 'Today');
  tickLabel.style.left = `${todayPct}%`;
  track.append(tick, tickLabel);

  const tip = el('div', 'pro-home__yearstrip-tip');
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  card.append(tip);

  const hideTip = (): void => {
    tip.hidden = true;
    tip.replaceChildren();
    delete tip.dataset.for;
  };

  const showTip = (anchor: HTMLAnchorElement, mark: YearMark): void => {
    const kindLabel = mark.kind === 'meeting' ? 'Meeting' : 'Event';
    const date = formatDisplayDate(mark.start);
    tip.replaceChildren(
      el('strong', 'pro-home__yearstrip-tip-title', mark.title),
      el('span', 'pro-home__yearstrip-tip-meta', `${kindLabel} · ${date} · ${mark.stateLabel}`)
    );
    tip.hidden = false;
    tip.dataset.for = mark.id;
    const rect = anchor.getBoundingClientRect();
    const width = tip.offsetWidth || 180;
    const minLeft = 8 + width / 2;
    const maxLeft = window.innerWidth - 8 - width / 2;
    const left = Math.min(maxLeft, Math.max(minLeft, rect.left + rect.width / 2));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, rect.top)}px`;
  };

  const stackByDay = new Map<string, number>();
  for (const mark of collectYearMarks(today, events, meetings)) {
    const parts = sydneyParts(new Date(mark.start));
    const key = ymdKey(parts);
    const stack = stackByDay.get(key) ?? 0;
    stackByDay.set(key, stack + 1);

    const isPast = Date.parse(mark.start) < Date.now();
    const dot = el(
      'a',
      `pro-home__yearstrip-mark pro-home__yearstrip-mark--${mark.tint}${isPast ? ' pro-home__yearstrip-mark--past' : ''}`
    );
    dot.href = mark.href;
    dot.dataset.kind = mark.kind;
    dot.dataset.id = mark.id;
    dot.setAttribute(
      'aria-label',
      `${mark.kind === 'meeting' ? 'Meeting' : 'Event'}: ${mark.title}, ${formatDisplayDate(mark.start)}, ${mark.stateLabel}`
    );
    dot.style.left = `calc(${yearProgressPct(today.year, parts, totalDays)}% + ${stack * 10}px)`;
    dot.addEventListener('pointerenter', () => showTip(dot, mark));
    dot.addEventListener('focus', () => showTip(dot, mark));
    dot.addEventListener('pointerleave', hideTip);
    dot.addEventListener('blur', hideTip);
    track.append(dot);
  }

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
      const [{ events }, { meetings }] = await Promise.all([listEvents(), listMeetings()]);
      paint(events, meetings);
    } catch (err) {
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(events: EventRecord[], meetings: MeetingRecord[]): void {
    canvas.replaceChildren();

    const actions = el('div', 'pro-home__actions');
    const add = el('a', 'btn btn--primary', '+ Log PD event');
    add.href = '#/event/new';
    actions.append(add);
    canvas.append(actions);

    const today = sydneyParts(new Date());
    canvas.append(renderYearStrip(today, events, meetings));

    const body = el('div', 'pro-home__body');
    body.append(renderCalendar(today, events));

    const side = el('div', 'pro-home__side');
    side.append(renderAccreditation(today, events));
    body.append(side);

    canvas.append(body);
    canvas.append(renderTimeline(events));
  }

  await load();
}
