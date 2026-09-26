/**
 * Week model for the Tideline. Pure: events and the optional calendar-visual
 * file in, view data out. Capacity comes from capacity-model.js. Logs never
 * become grid chips.
 */
import { bandsFromProfile, baseHeights, totalHeight } from '../calendar-bands.js';
import { formatDisplayDate, formatDisplayDateRange } from '../format-display-date.js';
import { isHoliday, mondayOf, termAt, toMs, weekLabel } from '../school-time.js';
import { capacityForDates, dayLoadHours, isOverCapacity, symptomsIn } from './capacity-model.js';

const DAY_MS = 86_400_000;
const LOG_TYPES = new Set(['meal', 'diary', 'sleep', 'skincare', 'heart', 'weight', 'composition', 'measurements', 'bloods', 'fragrance']);
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
  if (record.type === 'calendar_block') return record.kind === 'corey' ? 'corey' : record.kind === 'focus' ? 'study' : 'health';
  if (record.type === 'work_block' || record.type === 'task') return 'task';
  return 'task';
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

function chipFromEvent(event) {
  const record = event.record ?? {};
  if (!record.time || LOG_TYPES.has(record.type) || record.type === 'knowledge_page') return null;
  if (record.type === 'calendar_block' && (record.kind === 'wall' || record.kind === 'protected')) return null;
  if (record.type === 'task' && !record.end_time) return null;
  const workout = workoutOnGrid(record);
  if (workout === 'omit') return null;
  const start = toHour(record.time);
  const pin = record.pin === true;
  const end = pin
    ? start + 0.4
    : record.end_time
      ? toHour(record.end_time)
      : start + (Number(record.duration_min) || 60) / 60;
  const kind = eventKind(record);
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
            : kind === 'health' || kind === 'fitness' || kind === 'corey'
              ? kind
              : null;
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
    meta: workout?.meta ?? classMeta,
    isClass,
    protected: record.protected === true || kind === 'corey',
    provider: record.provider || record.clinician || '',
    source: record.type,
    filterKey,
    pin,
    lesson_id: typeof record.lesson_id === 'string' ? record.lesson_id : undefined,
    class_id: typeof record.class_id === 'string' ? record.class_id : undefined,
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

function chipsFromVisual(visual, date, events) {
  const chips = [];
  for (const item of visual.ITEMS ?? []) {
    if (item.date !== date) continue;
    const workout = workoutOnGrid(recordForItem(events, item) ?? {});
    if (workout === 'omit') continue;
    chips.push({
      ...item,
      start: toHour(item.start),
      end: toHour(item.end),
      ...(workout?.skipped ? { skipped: true, meta: workout.meta } : {})
    });
  }
  // Accept writes (bedtime wind-down, protect blocks) land as Life calendar_block
  // records. The visual ITEMS file does not grow; merge those in so an accepted
  // proposal stays a solid arc and a plain row after reload.
  for (const event of events ?? []) {
    const chip = chipFromEvent(event);
    if (!chip || chip.date !== date || chip.source !== 'calendar_block') continue;
    if (chips.some(existing =>
      existing.id === chip.id
      || (Math.abs(existing.start - chip.start) < 1e-6 && Math.abs(existing.end - chip.end) < 1e-6)
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

function dueFor(visual, events, date, useVisual) {
  if (useVisual) {
    return (visual.DUE ?? []).filter(item => item.date === date).map(item => {
      const task = (events ?? []).find(event => event.record?.type === 'task' && event.record.id === item.id);
      const actual = task?.record?.date;
      if (typeof actual === 'string' && actual !== item.date) return { ...item, moved: true, movedTo: actual };
      return item;
    });
  }
  const tasks = (events ?? [])
    .filter(event => event.record?.type === 'task' && event.record.date === date && !event.record.time)
    .map(event => ({ id: event.record.id || event.path, date, title: event.record.title || 'Task', kind: 'task', filterKey: 'tasks' }));
  const promises = (events ?? [])
    .filter(event => event.record?.type === 'ledger_item' && event.record.date === date)
    .map(event => ({
      id: event.record.id,
      date,
      title: event.record.title,
      kind: 'promise',
      filterKey: 'promises',
      direction: event.record.direction,
      late: event.record.late === true
    }));
  return [...tasks, ...promises];
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
    for (const chip of day.chips) counts[chip.kind] = (counts[chip.kind] ?? 0) + 1;
    for (const due of day.due) if (due.kind !== 'promise') counts.task += 1;
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
  terms = null
} = {}) {
  const schoolTerms = terms ?? visual?.school_terms ?? [];
  const bands = bandsFromProfile(dayProfile ?? visual?.day_profile ?? {});
  const useVisual = visualCovers(visual, week);
  const ghostList = Array.isArray(ghosts) ? ghosts : (useVisual ? (visual?.GHOSTS ?? []) : []);
  const holiday = date => isSchoolHoliday(date, schoolTerms);
  const capacity = capacityForDates(events, week, { isHoliday: holiday });
  const days = week.map(date => {
    const chips = appendGhostChips(useVisual ? chipsFromVisual(visual, date, events) : mergeMedical(
      (events ?? []).map(chipFromEvent).filter(chip => chip && chip.date === date)
    ), ghostList, date);
    const cap = capacity.get(date);
    const load = dayLoadHours(chips.map(chip => ({
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
      sleepText: sleepLabel(date, week, events, today, schoolTerms)
    };
  });
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
