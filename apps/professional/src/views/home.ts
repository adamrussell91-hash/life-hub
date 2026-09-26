import { formatDisplayDate, formatDisplayDateRange } from '../../design-kit/js/format-display-date.js';
import { listEvents } from '@/api/events';
import { listMeetings } from '@/api/meetings';
import { communicationRoute, eventRoute, meetingRoute } from '@/app/router';
import {
  mountProfessionalCalendar,
  unmountProfessionalCalendar
} from '@/calendar/hub-calendar';
import type { CommunicationRecord, EventOccurrenceState, EventRecord, LedgerItem, MeetingRecord, MeetingState } from '@/domain/types';
import { splitEventLabels } from '@/domain/priority-area';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { nextWalkIn, homeNudges } from '@/lib/walk-in';
import { clareBrief } from '@/api/clare-comms';
import { listCommunications } from '@/api/communications';
import { listLedgerDue } from '@/api/ledger';
import { listThreads } from '@/api/threads';
import { listLedgerForSources } from '@/api/ledger';
import { listUniversalLinksForEntity } from '@/api/universal-links';

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

function renderAccreditation(today: YmdParts, events: EventRecord[]): HTMLElement {
  const card = el('section', 'pro-home__progress');
  card.setAttribute('data-part', 'accreditation-progress');

  let hoursThisYear = 0;
  const categoryTotals = new Map<string, number>();
  const priorityTotals = new Map<string, number>();
  for (const event of events) {
    if (event.event_type !== 'professional_development') continue;
    if (event.occurrence_state !== 'completed') continue;
    if (event.hours == null) continue;
    const key = sydneyDateKey(event.start);
    if (Number(key.slice(0, 4)) !== today.year) continue;
    hoursThisYear += event.hours;
    const labels = splitEventLabels(event);
    const category = labels.category || 'Uncategorised';
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + event.hours);
    if (labels.priority) {
      priorityTotals.set(labels.priority, (priorityTotals.get(labels.priority) ?? 0) + event.hours);
    }
  }

  const head = el('div', 'pro-home__progress-head');
  const titleRow = el('div', 'pro-home__progress-title-row');
  titleRow.append(el('h2', 'pro-home__card-title', 'Accreditation progress'));
  const toggle = el('button', 'pro-home__progress-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'pro-home-progress-details');
  toggle.setAttribute('aria-label', 'Show PD breakdown');
  toggle.innerHTML =
    '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 4 5 6.5 7.5 4"/></svg>';
  titleRow.append(toggle);
  head.append(titleRow);

  const top = el('div', 'pro-home__progress-top');
  top.append(
    el('span', 'pro-home__progress-value', `${hoursThisYear} hrs`),
    el('span', 'pro-home__progress-of', `of ${ACCREDITATION_TARGET_HOURS}`)
  );
  head.append(top);

  const barTrack = el('div', 'pro-home__progress-bar');
  const fill = el('div', 'pro-home__progress-fill');
  fill.style.width = `${Math.min(100, (hoursThisYear / ACCREDITATION_TARGET_HOURS) * 100)}%`;
  barTrack.append(fill);
  head.append(barTrack);
  card.append(head);

  function hourChips(totals: Map<string, number>, tone: string, limit?: number): HTMLElement {
    const chips = el('div', 'pro-home__progress-chips');
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const shown = limit == null ? sorted : sorted.slice(0, limit);
    for (const [label, hours] of shown) {
      chips.append(el('span', `pro-home__chip-tag pro-home__chip-tag--${tone}`, `${label} · ${hours} hrs`));
    }
    return chips;
  }

  // Caption + breakdown live in the expand panel so the contracted card
  // matches Year-at-a-glance height in the lede row.
  const reveal = el('div', 'pro-home__progress-reveal');
  reveal.id = 'pro-home-progress-details';
  const inner = el('div', 'pro-home__progress-reveal-inner');
  inner.append(el('p', 'pro-home__progress-caption', `Logged in ${today.year} · goal is a placeholder`));
  if (categoryTotals.size) inner.append(hourChips(categoryTotals, 'blue', 4));
  if (priorityTotals.size) {
    inner.append(el('p', 'pro-home__progress-caption', 'Priority areas'));
    inner.append(hourChips(priorityTotals, 'sage'));
  }
  reveal.append(inner);
  card.append(reveal);

  const setOpen = (open: boolean): void => {
    card.classList.toggle('is-expanded', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Hide PD breakdown' : 'Show PD breakdown');
  };
  toggle.addEventListener('click', () => setOpen(!card.classList.contains('is-expanded')));

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

async function quietThreads(now: Date): Promise<Array<{ title: string; days: number; href: string }>> {
  const nowMs = now.getTime();
  let threads: Array<{ id: string; title: string; status: string; updated_at: string }> = [];
  try {
    threads = (await listThreads()).threads ?? [];
  } catch {
    return [];
  }
  const candidates = threads
    .filter((thread) => thread.status === 'open')
    .map((thread) => ({ thread, days: Math.round((nowMs - Date.parse(thread.updated_at)) / 86_400_000) }))
    .filter(({ days }) => days >= 14 && days <= 60)
    .slice(0, 10);

  const out: Array<{ title: string; days: number; href: string }> = [];
  for (const { thread, days } of candidates) {
    try {
      const threadRef = `professional:thread:${thread.id}`;
      const members = (await listUniversalLinksForEntity(threadRef)).incoming
        .filter((entry) => entry.link.relationship_type === 'in_thread' && entry.link.status === 'current')
        .map((entry) => ({ ref: entry.link.source_ref, at: String(entry.link.created_at ?? '') }))
        .sort((a, b) => b.at.localeCompare(a.at));
      const latest = members[0];
      if (!latest) continue;
      const { items } = await listLedgerForSources([latest.ref]);
      if (items.some((item) => item.direction === 'they_owe' && item.status === 'open')) {
        out.push({ title: thread.title, days, href: `#/thread/${encodeURIComponent(thread.id)}` });
      }
    } catch {
      continue;
    }
  }
  return out;
}

async function renderWalkInAndNudges(host: HTMLElement, meetings: MeetingRecord[]): Promise<void> {
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now);
  const dayKey = (offset: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(now.getTime() + offset * 86_400_000));
  const [commsResult, ledgerResult, quiet] = await Promise.all([
    listCommunications().catch(() => ({ communications: [] as CommunicationRecord[] })),
    listLedgerDue(dayKey(-60), dayKey(-1)).catch(() => ({ items: [] as LedgerItem[] })),
    quietThreads(now).catch(() => [] as Array<{ title: string; days: number; href: string }>)
  ]);
  const communications = commsResult.communications ?? [];
  const lateItems = ledgerResult.items ?? [];

  const walk = nextWalkIn([
    ...communications.filter((comm) => comm.scheduled_start).map((comm) => ({ kind: 'comm' as const, id: comm.id, title: comm.subject || 'Comm', start: comm.scheduled_start!, href: communicationRoute(comm.id) })),
    ...meetings.map((meeting) => ({ kind: 'meeting' as const, id: meeting.id, title: meeting.title, start: meeting.scheduled_start, href: meetingRoute(meeting.id) }))
  ], now);

  if (walk) {
    const card = el('section', 'walk-in');
    card.dataset.part = 'walk-in';
    card.append(el('p', 'walk-in__count', walk.minutes >= 0 ? `in ${walk.minutes} min` : `started ${-walk.minutes} min ago`), el('h3', undefined, walk.title));
    const list = el('ol');
    card.append(list);
    const owed = el('p', 'walk-in__owe');
    card.append(owed);
    const start = el('a', 'btn walk-in__start', 'Start') as HTMLAnchorElement;
    start.href = walk.href;
    start.dataset.part = 'walk-in-start';
    card.append(start);
    host.append(card);
    clareBrief({ title: walk.title, kind: walk.kind, when: walk.start, people: [], previous: [], open_promises: [], notes: '' })
      .then((brief) => {
        for (const point of brief.points) list.append(el('li', undefined, point.text));
        owed.textContent = brief.owed_line ?? '';
      })
      .catch(() => list.append(el('li', undefined, 'Open the page for the full brief.')));
  }

  const late = lateItems
    .filter((item) => item.direction === 'you_owe' && item.status === 'open' && item.due && item.due < todayKey)
    .map((item) => ({
      text: item.text,
      days_late: Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${item.due}T00:00:00Z`)) / 86_400_000),
      href: item.comm_ref ? communicationRoute(item.comm_ref.split(':').pop()!) : '#/calendar'
    }));
  const wrapUps = communications
    .filter((comm) => comm.scheduled_end && Date.parse(comm.scheduled_end) < now.getTime() && Date.parse(comm.scheduled_end) > now.getTime() - 3 * 86_400_000 && !comm.summary)
    .map((comm) => ({ title: comm.subject || 'a comm', href: communicationRoute(comm.id) }));
  const nudges = homeNudges({ late, wrapUps, quiet });
  if (nudges.length) {
    const card = el('section', 'card home-nudges');
    card.dataset.part = 'nudges';
    card.append(el('h3', undefined, 'Clare noticed'));
    for (const nudge of nudges) {
      const link = el('a', `home-nudges__item is-${nudge.tone}`, nudge.text) as HTMLAnchorElement;
      link.href = nudge.href;
      card.append(link);
    }
    host.append(card);
  }
}

export async function renderHomeView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading…');
    try {
      const [{ events }, { meetings }] = await Promise.all([listEvents(), listMeetings()]);
      await paint(events, meetings);
    } catch (err) {
      renderLoadError(canvas, err, () => void load());
    }
  }

  async function paint(events: EventRecord[], meetings: MeetingRecord[]): Promise<void> {
    canvas.replaceChildren();

    await renderWalkInAndNudges(canvas, meetings);

    const actions = el('div', 'pro-home__actions');
    const add = el('a', 'btn btn--primary', '+ Log PD event');
    add.href = '#/event/new';
    actions.append(add);
    canvas.append(actions);

    const today = sydneyParts(new Date());

    const lede = el('div', 'pro-home__lede');
    lede.append(renderYearStrip(today, events, meetings));
    const side = el('div', 'pro-home__side');
    side.append(renderAccreditation(today, events));
    lede.append(side);
    canvas.append(lede);

    const body = el('div', 'pro-home__body');
    unmountProfessionalCalendar();
    const calendarHost = el('div', 'pro-home__calendar-host');
    body.append(calendarHost);
    mountProfessionalCalendar(calendarHost, { routeZoom: false });

    canvas.append(body);
    canvas.append(renderTimeline(events));
  }

  await load();
}
