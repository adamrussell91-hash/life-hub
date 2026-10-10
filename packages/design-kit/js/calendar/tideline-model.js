/**
 * Week model for the Tideline. Pure: events and the optional calendar-visual
 * file in, view data out. Capacity comes from capacity-model.js. Logs never
 * become grid chips.
 */
import { bandsFromProfile, baseHeights, totalHeight } from '../calendar-bands.js';
import { annotateDurations, freedSpansFor, interruptibleSpans, regainedCost, textureFor } from './day-sense-plan.js';
import { formatDisplayDate, formatDisplayDateRange } from '../format-display-date.js';
import { isHoliday, mondayOf, termAt, toMs, weekLabel } from '../school-time.js';
import { capacityForDates, dayLoadHours, isOverCapacity, symptomsIn } from './capacity-model.js';
import { medicationDay, medicationLogs, usualDoseTimes } from './medication-model.js';
import { actualSpans, dayCost } from './day-sense.js';

const DAY_MS = 86_400_000;
const LOG_TYPES = new Set(['meal', 'diary', 'sleep', 'skincare', 'heart', 'weight', 'composition', 'measurements', 'bloods', 'fragrance', 'medication', 'work_session']);
const SOURCE_ORDER = ['teaching', 'professional', 'task', 'health', 'fitness', 'corey', 'study'];
const SOURCE_LABEL = {
  teaching: 'Teaching',
  professional: 'Professional',
  task: 'Tasks',
  health: 'Health',
  fitness: 'Fitness',
  corey: 'Corey',
  study: 'Study'
};
const SUBS = {
  morning: 'up 6:15',
  school: '8:15 – bell 3:10',
  after: 'work window to 5:30',
  yours: 'home ~5:30 · the hours that count'
};

const utcDay = key => new Date(toMs(key)).getUTCDay();
export const toHour = hhmm => Number(String(hhmm).slice(0, 2)) + Number(String(hhmm).slice(3, 5)) / 60;

export function isSchoolHoliday(key, terms) {
  return isHoliday(key, terms ?? []);
}

export function movedCaption(date, terms) {
  const label = weekLabel(date, terms);
  const day = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  if (label) return `Moved to ${label} ${day}`;
  return `Moved to ${formatDisplayDate(date)}`;
}

function periodTitle(week, terms) {
  const inside = week.find(day => termAt(day, terms));
  if (inside) {
    const label = weekLabel(inside, terms);
    const ending = (terms ?? []).find(term => term.ends_on >= week[0] && term.ends_on <= week[week.length - 1]);
    if (label && ending) return `${label} · last week of term`;
    return label;
  }
  const holidayDay = week.find(day => isSchoolHoliday(day, terms));
  if (!holidayDay) return null;
  const label = weekLabel(holidayDay, terms);
  return label ? `${label} · holidays` : null;
}

function dayTag(date, terms) {
  const ending = (terms ?? []).find(term => term.ends_on === date);
  if (ending) return { text: `Last day T${ending.term}`, tone: 'term' };
  if (isSchoolHoliday(date, terms) && (terms ?? []).some(term => term.ends_on < date)) {
    return { text: 'Holidays', tone: 'holiday' };
  }
  return null;
}

function tokens(value) {
  return String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.length || !right.length) return 0;
  const set = new Set(right);
  const shared = left.filter(token => set.has(token)).length;
  return (2 * shared) / (left.length + right.length);
}

function clockMeta(start, end) {
  const fmt = hour => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    const suffix = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
  };
  if (end == null || end === start) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function eventKind(record) {
  if (record.type === 'scheduled_lesson') return 'teaching';
  if (record.type === 'professional_communication') return 'comm';
  if (record.type === 'professional_event' && record.event_type && record.event_type !== 'professional_development') return 'event';
  if (record.type === 'professional_meeting' || record.type === 'professional_event') return 'professional';
  if (record.type === 'workout') return 'fitness';
  if (record.type === 'medical') return 'health';
  if (record.type === 'calendar_block') {
    if (record.kind === 'corey') return 'corey';
    if (record.kind === 'focus') return 'study';
    if (record.kind === 'workout') return 'fitness';
    // plan (outing / meal_block) and rest → health chip
    return 'health';
  }
  if (record.type === 'work_block' || record.type === 'task' || record.type === 'deadline') return 'task';
  if (record.type === 'ical_event') return record.feed === 'social' || record.feed === 'family' ? record.feed : 'event';
  // Anything else with a time is a log (creatine, a mind session, a new Life type):
  // never a block. Defaulting to 'task' drew an untitled "task" arc at 7–8 pm.
  return null;
}

function skippedBySara(record) {
  return [record.updated_by, record.source].some(value => typeof value === 'string' && /\bsara\b/i.test(value));
}

/** Completed workouts leave the grid. Skipped ones stay, struck through. Planned (or no status) is unchanged. */
function workoutOnGrid(record) {
  if (record.type !== 'workout') return null;
  if (record.status === 'completed') return 'omit';
  if (record.status === 'skipped') {
    return { skipped: true, meta: skippedBySara(record) ? 'Skipped · Sara' : 'Skipped' };
  }
  return null;
}

/** `9:00–10:00 · with Rohan, Tania +2 · Library` for meetings, events and comms. */
export function withMeta(clock, record) {
  const names = Array.isArray(record?.with) ? record.with.filter(Boolean) : [];
  const who = names.length
    ? `with ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`
    : '';
  const where = typeof record?.location === 'string' ? record.location.trim() : '';
  return [clock, who, where].filter(Boolean).join(' · ');
}

export function chipFromEvent(event) {
  const record = event.record ?? {};
  if (!record.time || LOG_TYPES.has(record.type) || record.type === 'knowledge_page') return null;
  if (record.type === 'calendar_block' && (record.kind === 'wall' || record.kind === 'protected')) return null;
  if (record.type === 'calendar_block' && record.status === 'cancelled') return null;
  // A task's due time is a deadline (Due row). Planned time is a work block.
  if (record.type === 'task' && !record.end_time) return null;
  const kind = eventKind(record);
  if (!kind) return null;
  const workout = workoutOnGrid(record);
  if (workout === 'omit') return null;
  const start = toHour(record.time);
  const pin = record.pin === true;
  const end = pin
    ? start + 0.4
    : record.end_time
      ? toHour(record.end_time)
      : start + (Number(record.duration_min) || 60) / 60;
  // A finished block keeps its place on the day, struck through, and stops loading it.
  const done = (record.type === 'work_block' || record.type === 'task') && record.status === 'done';
  const isClass = record.type === 'scheduled_lesson' || record.isClass === true;
  const filterKey = kind === 'teaching' || isClass
    ? (isClass || record.type === 'scheduled_lesson' ? 'classes' : 'events')
    : kind === 'comm'
      ? 'comms'
      : kind === 'event'
        ? 'events'
        : kind === 'professional'
          ? (record.type === 'professional_meeting' ? 'meetings' : 'pd')
          : kind === 'task'
            ? 'tasks'
            : kind === 'health' || kind === 'fitness' || kind === 'corey' || kind === 'social' || kind === 'family'
              ? kind
              : null;
  const feedMeta = record.feed && record.location ? `${clockMeta(start, end)} · ${record.location}` : null;
  const peopleMeta = kind === 'professional' || kind === 'comm' ? withMeta(clockMeta(start, end), record) : null;
  const classMeta = isClass
    ? record.period
      ? `P${record.period} · ${record.focus || record.title || ''}`.trim()
      : record.class_title && record.title && record.class_title !== record.title
        ? `${record.class_title} · ${clockMeta(start, end)}`
        : record.class_title || clockMeta(start, end)
    : clockMeta(start, end);
  return {
    id: record.id || event.path,
    date: record.date,
    start,
    end,
    kind,
    // Prefer lesson title for class chips; class name stays in meta.
    title: isClass ? (record.title || record.class_title || 'Class') : (record.title || kind),
    meta: workout?.meta ?? feedMeta ?? peopleMeta ?? (done ? `Done · ${classMeta}` : classMeta),
    isClass,
    protected: record.protected === true || kind === 'corey',
    provider: record.provider || record.clinician || '',
    source: record.type,
    filterKey,
    pin,
    lesson_id: typeof record.lesson_id === 'string' ? record.lesson_id : undefined,
    class_id: typeof record.class_id === 'string' ? record.class_id : undefined,
    record,
    ...(record.feed ? { feed: record.feed } : {}),
    ...(record.ambient || done ? { ambient: true } : {}),
    ...(done ? { done: true } : {}),
    ...(record.location ? { location: record.location } : {}),
    ...(workout?.skipped ? { skipped: true } : {})
  };
}

function mergeMedical(chips) {
  const medical = chips.filter(chip => chip.source === 'medical');
  const rest = chips.filter(chip => chip.source !== 'medical');
  const used = new Set();
  const merged = [];
  for (const chip of medical) {
    if (used.has(chip.id)) continue;
    const group = [chip];
    used.add(chip.id);
    for (const other of medical) {
      if (used.has(other.id) || other.date !== chip.date) continue;
      if (Math.abs(other.start - chip.start) > 2) continue;
      const sameProvider = chip.provider && chip.provider === other.provider;
      if (!sameProvider && similarity(chip.title, other.title) < 0.6) continue;
      used.add(other.id);
      group.push(other);
    }
    if (group.length === 1) {
      merged.push(chip);
      continue;
    }
    const first = group.slice().sort((a, b) => a.start - b.start)[0];
    merged.push({
      ...first,
      end: Math.max(...group.map(item => item.end)),
      meta: `${clockMeta(first.start, first.start)} · ${group.length} records merged`,
      mergedRecords: group.length
    });
  }
  return [...rest, ...merged];
}

function recordForItem(events, item) {
  const path = typeof item.recordPath === 'string' ? item.recordPath : '';
  if (!path) return null;
  return (events ?? []).find(event => event.path === path)?.record ?? null;
}

/** Hub feeds Life's visual never paints — merge these (and calendar_block) under visualCovers. */
const HUB_OVERLAY_SOURCES = new Set([
  'professional_meeting',
  'professional_event',
  'professional_communication',
  'scheduled_lesson',
  'task',
  'work_block',
  'deadline',
  'ical_event'
]);

function chipsFromVisual(visual, date, events) {
  const chips = [];
  for (const item of visual.ITEMS ?? []) {
    if (item.date !== date) continue;
    const workout = workoutOnGrid(recordForItem(events, item) ?? {});
    if (workout === 'omit') continue;
    const record = recordForItem(events, item);
    chips.push({
      ...item,
      ...(record ? { record } : {}),
      start: toHour(item.start),
      end: toHour(item.end),
      ...(workout?.skipped ? { skipped: true, meta: workout.meta } : {})
    });
  }
  // calendar_block: accepted Life writes not in ITEMS. Overlays: Professional / Teaching / Tasks.
  for (const event of events ?? []) {
    const chip = chipFromEvent(event);
    if (!chip || chip.date !== date) continue;
    if (!(HUB_OVERLAY_SOURCES.has(chip.source) || chip.source === 'calendar_block' || chip.feed)) continue;
    // A health appointment already in Life's own records: keep one.
    if (chip.feed && chips.some(existing => existing.date === chip.date
      && Math.abs(existing.start - chip.start) < 0.26
      && similarity(existing.title, chip.title) >= 0.6)) continue;
    // Blocks also skip time-clashes with visual ITEMS; overlays only skip same id.
    if (chips.some(existing =>
      existing.id === chip.id
      || (chip.source === 'calendar_block'
        && Math.abs(existing.start - chip.start) < 1e-6
        && Math.abs(existing.end - chip.end) < 1e-6)
    )) continue;
    chips.push(chip);
  }
  return chips;
}

function appendGhostChips(chips, ghosts, date) {
  for (const ghost of ghosts) {
    if (!ghost.chip || ghost.chip.date !== date || ghost.overItem) continue;
    if (chips.some(chip => chip.id === ghost.id)) continue;
    chips.push({
      id: ghost.id,
      date,
      start: toHour(ghost.chip.start),
      end: toHour(ghost.chip.end),
      kind: ghost.chip.kind,
      title: ghost.label,
      meta: ghost.meta,
      ghost
    });
  }
  return chips;
}

function promiseDuesFromEvents(events, date) {
  return (events ?? [])
    .filter(event => event.record?.type === 'ledger_item' && event.record.date === date)
    .map(event => ({
      id: event.record.id,
      date,
      title: event.record.title,
      kind: 'promise',
      filterKey: 'promises',
      direction: event.record.direction,
      late: event.record.late === true,
      source: 'ledger_item',
      meta: event.record.late ? `${event.record.days_late ?? ''} day${event.record.days_late === 1 ? '' : 's'} late`.trim() : '',
      record: event.record
    }));
}

/** All-day iCloud events (a birthday, a school event day) ride the all-day row, read-only. */
function allDayFeedRows(events, date) {
  return (events ?? [])
    .filter(event => event.record?.feed && event.record.all_day && event.record.date === date)
    .map(event => {
      const feed = event.record.feed;
      const kind = feed === 'health' ? 'health' : feed === 'work' ? 'event' : feed;
      return {
        id: event.record.id,
        date,
        title: event.record.title,
        kind: 'allday',
        feed,
        filterKey: kind === 'event' ? 'events' : kind,
        source: event.record.type,
        meta: [event.record.source_calendar, event.record.span ? `day ${event.record.span}` : ''].filter(Boolean).join(' · '),
        ambient: Boolean(event.record.ambient),
        record: event.record
      };
    });
}

function dueFor(visual, events, date, useVisual) {
  const allDay = allDayFeedRows(events, date);
  return [...allDay, ...dueForHubs(visual, events, date, useVisual)];
}

function taskDueRow(event, date) {
  const done = event.record.status === 'done';
  const at = event.record.time ? toHour(event.record.time) : null;
  return {
    ...(done ? { done: true } : {}),
    // A due time is a moment, not a block: views draw it as a marker at that hour
    // (Week / Linear grid, the Day Dial ring) instead of in the all-day Due row.
    ...(Number.isFinite(at) ? { at } : {}),
    id: event.record.id || event.path,
    date,
    title: event.record.title || 'Task',
    kind: 'task',
    filterKey: 'tasks',
    source: 'task',
    time: event.record.time || undefined,
    meta: [done ? 'Done' : '', event.record.time ? `due ${clockMeta(toHour(event.record.time))}` : ''].filter(Boolean).join(' · '),
    record: event.record
  };
}

function liveTaskDues(events, date) {
  // Untimed tasks, and timed tasks with no end (a due time is a deadline, not a block).
  // Done tasks stay, struck through, after the open ones. A task already on the grid
  // that day (a linked work block) with no deadline time is marked onGrid: planners
  // still see it here, views do not list it twice.
  const blocked = new Set((events ?? [])
    .filter(event => event.record?.type === 'work_block' && event.record.date === date && event.record.task_id && !event.record.ghost && event.record.status !== 'cancelled')
    .map(event => event.record.task_id));
  return (events ?? [])
    .filter(event => event.record?.type === 'task' && event.record.date === date && !(event.record.time && event.record.end_time))
    .map(event => {
      const row = taskDueRow(event, date);
      return !event.record.time && blocked.has(event.record.id) ? { ...row, onGrid: true } : row;
    })
    .sort((a, b) => Number(Boolean(a.done)) - Number(Boolean(b.done)) || String(a.time ?? '').localeCompare(String(b.time ?? '')));
}

function dueForHubs(visual, events, date, useVisual) {
  const promises = promiseDuesFromEvents(events, date);
  const live = liveTaskDues(events, date);
  if (useVisual) {
    const visualDue = (visual.DUE ?? []).filter(item => item.date === date).map(item => {
      const task = (events ?? []).find(event => event.record?.type === 'task' && event.record.id === item.id);
      const actual = task?.record?.date;
      const withRecord = task?.record ? { ...item, source: 'task', record: task.record } : item;
      if (typeof actual === 'string' && actual !== item.date) return { ...withRecord, moved: true, movedTo: actual };
      return withRecord;
    });
    // Same contract as chipsFromVisual overlays: a covering visual must not hide live Tasks Due.
    const extras = live.filter(row => !visualDue.some(due => due.id === row.id));
    return [...visualDue, ...extras, ...promises.filter(item => !visualDue.some(due => due.id === item.id))];
  }
  return [...live, ...promises];
}

function wallsFor(visual, events, date, useVisual) {
  if (useVisual) return (visual.WALLS ?? []).filter(wall => wall.date === date);
  return (events ?? [])
    .filter(event => event.record?.type === 'calendar_block' && event.record.kind === 'wall' && event.record.date === date)
    .map(event => ({ date, label: event.record.title || 'Protected' }));
}

function freeHoursTitle(hours) {
  const whole = Math.floor(hours + 1e-6);
  const fraction = hours - whole;
  const mark = Math.abs(fraction - 0.5) < 0.05 ? '½' : '';
  if (mark) return `${whole ? whole : ''}${mark} h free`.trim();
  return `${Math.round(hours)} h free`;
}

function freeFor(visual, date, chips, bands, terms, useVisual) {
  if (useVisual) return (visual.FREE ?? []).filter(block => block.date === date);
  const yours = bands.find(band => band.id === 'yours');
  if (!yours) return [];
  let cursor = yours.from;
  const spans = chips
    .filter(chip => chip.end > yours.from && chip.start < yours.to)
    .map(chip => [Math.max(chip.start, yours.from), Math.min(chip.end, yours.to)])
    .sort((a, b) => a[0] - b[0]);
  let open = 0;
  let gapStart = yours.from;
  for (const [start, end] of spans) {
    if (start > cursor) {
      open += start - cursor;
      if (cursor === yours.from) gapStart = cursor;
    }
    cursor = Math.max(cursor, end);
  }
  if (yours.to > cursor) open += yours.to - cursor;
  if (open < 3) return [];
  const ending = (terms ?? []).some(term => term.ends_on === date);
  return [{
    date,
    start: hoursToHHMM(gapStart),
    end: hoursToHHMM(yours.to),
    title: freeHoursTitle(open),
    sub: ending ? 'End of term. Nothing booked. Keep it that way?' : 'Nothing booked. Keep it that way?'
  }];
}

function hoursToHHMM(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function sleepLabel(date, week, events, today, terms) {
  const next = week[week.indexOf(date) + 1];
  const slept = (events ?? []).find(event => event.record?.type === 'sleep' && event.record.date === next)?.record.duration_h;
  if (slept != null) return `slept ${slept} h`;
  if (date === today) return 'aim 10:00 tonight';
  if (isSchoolHoliday(date, terms)) return 'aim 11:00';
  return 'aim 10:30';
}

function sourceCounts(days) {
  const counts = Object.fromEntries(SOURCE_ORDER.map(id => [id, 0]));
  for (const day of days) {
    for (const chip of day.chips) if (!chip.done) counts[chip.kind] = (counts[chip.kind] ?? 0) + 1;
    for (const due of day.due) if (due.kind !== 'promise' && due.kind !== 'allday' && !due.done) counts.task += 1;
  }
  return SOURCE_ORDER
    .filter(id => counts[id] > 0)
    .map(id => ({ id, label: SOURCE_LABEL[id] ?? id, count: counts[id] }));
}

function ambientLine(events, week, notes) {
  const inWeek = (events ?? []).filter(event => week.includes(event.record?.date));
  const meals = inWeek.filter(event => event.record.type === 'meal').length;
  const diaries = inWeek.filter(event => event.record.type === 'diary').length;
  const symptoms = inWeek.filter(event => event.record.type === 'diary' && symptomsIn(event.record, event.body).length).length;
  const touched = Array.isArray(notes) ? notes.length : inWeek.filter(event => event.record.type === 'knowledge_page').length;
  return `${meals} meals · ${diaries} diary · ${symptoms} symptoms · ${touched} notes touched`;
}

function visualCovers(visual, week) {
  const dates = new Set([
    ...(visual?.ITEMS ?? []).map(item => item.date),
    ...(visual?.DUE ?? []).map(item => item.date),
    ...(visual?.WALLS ?? []).map(item => item.date),
    ...(visual?.FREE ?? []).map(item => item.date)
  ]);
  return week.some(date => dates.has(date));
}

/**
 * @param {{ events?: Array<{record: object, body?: string}>, visual?: object|null, ghosts?: object[]|null, week: string[], today: string, nowHour: number, dayProfile?: object|null, terms?: object[]|null }} input
 * `ghosts`, when an array, is the pending queue from GET /api/calendar-ghosts.
 * It replaces visual.GHOSTS. Omit it and a covering visual file supplies the queue.
 */
export function buildTidelineModel({
  events = [],
  visual = null,
  ghosts = null,
  week,
  today,
  nowHour,
  dayProfile = null,
  terms = null,
  lifeLogStatus = 'live'
} = {}) {
  const schoolTerms = terms ?? visual?.school_terms ?? [];
  const bands = bandsFromProfile(dayProfile ?? visual?.day_profile ?? {});
  const useVisual = visualCovers(visual, week);
  const ghostList = Array.isArray(ghosts) ? ghosts : (useVisual ? (visual?.GHOSTS ?? []) : []);
  const holiday = date => isSchoolHoliday(date, schoolTerms);
  const capacity = capacityForDates(events, week, { isHoliday: holiday, today });
  // A failed or in-flight Life fetch has no diaries yet. "no logs" would
  // claim Adam didn't write them. Keep a real diary day's note when one arrived.
  if (lifeLogStatus !== 'live') {
    const waiting = lifeLogStatus === 'error' || lifeLogStatus === 'degraded' || lifeLogStatus === 'unavailable';
    for (const [date, cap] of capacity) {
      if (cap.note === 'no logs') {
        capacity.set(date, { ...cap, note: waiting ? 'logs unavailable' : 'loading logs' });
      }
    }
  }
  // A block for a task that is ticked off reads as done too. The tick on a block also
  // needs to know whether other open blocks remain for its task (calendar-item-actions).
  const taskStatus = new Map();
  const taskDue = new Map();
  const openBlocks = new Map();
  for (const event of events ?? []) {
    const record = event?.record;
    if (record?.type === 'task' && record.id) {
      taskStatus.set(record.id, record.status ?? 'open');
      if (record.time) taskDue.set(record.id, { date: record.date, time: record.time });
    }
    if (record?.type === 'work_block' && record.task_id && !record.ghost && record.status !== 'done' && record.status !== 'cancelled') {
      openBlocks.set(record.task_id, (openBlocks.get(record.task_id) ?? 0) + 1);
    }
  }
  const markLinked = chip => {
    const taskId = chip.record?.type === 'work_block' ? chip.record.task_id : null;
    if (!taskId) return chip;
    chip.taskStatus = taskStatus.get(taskId);
    chip.taskOpenBlocks = openBlocks.get(taskId) ?? 0;
    // Planned time and the deadline are one task: the block names the deadline it serves.
    const due = taskDue.get(taskId);
    if (due && due.date === chip.date && chip.taskStatus !== 'done' && !String(chip.meta ?? '').includes('due ')) {
      chip.meta = `${chip.meta ?? ''} · due ${clockMeta(toHour(due.time))}`.replace(/^ · /, '');
    }
    if (chip.taskStatus === 'done' && !chip.done) {
      chip.done = true;
      chip.ambient = true;
      chip.meta = `Done · ${chip.meta ?? ''}`.replace(/ · $/, '');
    }
    return chip;
  };
  const medLogs = medicationLogs(events);
  const usualDoses = usualDoseTimes(medLogs, today);
  const days = week.map(date => {
    const chips = appendGhostChips(useVisual ? chipsFromVisual(visual, date, events) : mergeMedical(
      (events ?? []).map(chipFromEvent).filter(chip => chip && chip.date === date)
    ), ghostList, date).map(markLinked);
    const cap = capacity.get(date);
    const load = dayLoadHours(chips.filter(chip => !chip.ambient).map(chip => ({
      start: chip.start,
      end: chip.end,
      kind: chip.kind,
      isClass: chip.isClass,
      protected: chip.protected,
      ghost: Boolean(chip.ghost)
    })));
    const logs = (events ?? []).filter(event => event.record?.date === date);
    const symptom = cap?.factors?.find(factor => factor.id === 'symptoms')?.symptoms?.[0];
    return {
      date,
      cap,
      over: Boolean(cap && !cap.forecast && isOverCapacity(cap.pct, load)),
      sleep: logs.find(event => event.record.type === 'sleep')?.record.duration_h,
      energy: logs.find(event => event.record.type === 'diary' && event.record.energy)?.record.energy,
      meals: logs.filter(event => event.record.type === 'meal').length,
      symptom,
      tag: dayTag(date, schoolTerms),
      past: date < today,
      school: utcDay(date) >= 1 && utcDay(date) <= 5 && !holiday(date),
      chips,
      due: dueFor(visual, events, date, useVisual),
      walls: wallsFor(visual, events, date, useVisual),
      free: freeFor(visual, date, chips, bands, schoolTerms, useVisual),
      sleepText: sleepLabel(date, week, events, today, schoolTerms),
      med: date <= today ? medicationDay({ date, today, nowHour, logs: medLogs, usual: usualDoses }) : null,
      actual: date <= today ? actualSpans(events, date) : []
    };
  });
  for (const day of days) assignLanes(day.chips);
  for (const day of days) day.cost = dayCost(day, days, today);
  // Where Adam left each task (bookmark) and its count progress, on its Due row and on
  // any work block linked to it.
  const taskCtx = new Map();
  for (const event of events ?? []) {
    const record = event?.record;
    if ((record?.type === 'task' || record?.type === 'task_context') && record.id) {
      taskCtx.set(record.id, { title: record.title, bookmark: record.bookmark ?? null, progress: record.progress ?? null });
    }
  }
  for (const day of days) {
    for (const chip of day.chips) {
      const ctx = chip.record?.task_id ? taskCtx.get(chip.record.task_id) : null;
      if (ctx?.bookmark) chip.bookmark = ctx.bookmark;
      if (ctx?.progress) chip.progress = ctx.progress;
    }
    for (const due of day.due) {
      const ctx = taskCtx.get(due.id);
      if (ctx?.bookmark) due.bookmark = ctx.bookmark;
      if (ctx?.progress) due.progress = ctx.progress;
    }
  }
  // Steps 8 and 10: what kind of time each span is, freed time, ranges and fragility.
  const schoolBand = bands.find(band => band.id === 'school') ?? null;
  const freed = (events ?? []).map(event => event?.record).filter(record => record?.type === 'freed_span');
  for (const day of days) {
    for (const chip of day.chips) {
      const texture = textureFor(chip);
      if (texture) chip.texture = texture;
    }
    day.textures = interruptibleSpans(day, schoolBand);
    day.freed = freedSpansFor(day.date, freed);
    for (const span of day.freed) {
      for (const chip of day.chips) {
        if (chip.ambient || chip.isClass) continue;
        const cost = regainedCost(chip, span, day.date);
        if (cost) chip.regained = cost;
      }
    }
  }
  annotateDurations(days, events, { today, nowHour });
  const title = periodTitle(week, schoolTerms);
  return {
    week,
    today,
    nowHour,
    bands,
    subs: SUBS,
    total: totalHeight(baseHeights(bands)),
    period: {
      title: title || 'Week',
      range: formatDisplayDateRange(week[0], week[week.length - 1])
    },
    days,
    sources: sourceCounts(days),
    ambient: ambientLine(events, week, visual?.NOTES),
    tray: visual?.TRAY ?? trayFor(ghostList),
    ghosts: ghostList,
    terms: schoolTerms,
    visual: useVisual ? visual : null
  };
}

/**
 * Side-by-side lanes for chips that share time, so two blocks at 11 am sit next to
 * each other instead of on top of each other. Each overlapping cluster gets as many
 * lanes as it needs at its busiest moment; chips that overlap nothing keep the full width.
 * A chip widens into lanes to its right that are free for its whole time (`laneSpan`).
 * Sets `lane` (0-based), `lanes` and `laneSpan` on every chip; nothing else.
 */
export function assignLanes(chips) {
  const sorted = [...(chips ?? [])]
    .filter(chip => Number.isFinite(chip?.start) && Number.isFinite(chip?.end))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster = [];
  let clusterEnd = -Infinity;
  let laneEnds = [];
  const close = () => {
    for (const chip of cluster) chip.lanes = laneEnds.length;
    // Widen into lanes to the right that stay free for this chip's whole time.
    for (const chip of cluster) {
      let span = 1;
      while (chip.lane + span < chip.lanes && !cluster.some(other => other !== chip
        && other.lane === chip.lane + span && other.start < chip.end - 1e-6 && other.end > chip.start + 1e-6)) span += 1;
      chip.laneSpan = span;
    }
    cluster = [];
    laneEnds = [];
  };
  for (const chip of sorted) {
    const end = Math.max(chip.end, chip.start + 1 / 60);
    if (cluster.length && chip.start >= clusterEnd - 1e-6) close();
    let lane = laneEnds.findIndex(laneEnd => laneEnd <= chip.start + 1e-6);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else laneEnds[lane] = end;
    chip.lane = lane;
    cluster.push(chip);
    clusterEnd = cluster.length === 1 ? end : Math.max(clusterEnd, end);
  }
  close();
  return chips;
}

function trayFor(ghosts) {
  const pending = ghosts.filter(ghost => ghost.settled !== 'accepted');
  if (!pending.length) return null;
  const count = pending.length;
  return {
    agent: pending[0].agent || 'hammond',
    headline: `${count} change${count === 1 ? '' : 's'} waiting`,
    detail: 'nothing is written until you accept'
  };
}
