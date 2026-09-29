/**
 * Day Sense steps 8 and 10 on the calendar model (pure).
 *
 * - Availability textures: what kind of time each span is (§3.5), so 2 h between
 *   classes never reads as 2 h of marking.
 * - Free and planned minutes before a due date, for the fragility check.
 * - Regained time: a dropped recurring commitment leaves a span that remembers why.
 *
 * Missing data means unknown: a due date past the loaded days has no fragility.
 */
import { durationRange, fragility } from './duration-model.js';

export const AVAILABILITY = Object.freeze({
  fixed: 'Fixed',
  protected: 'Protected',
  focus: 'Focus',
  interruptible: 'Interruptible',
  callback_wait: 'Waiting on a call back',
  transition: 'Transition',
  travel: 'Travel',
  recovery: 'Recovery'
});

/** What each texture means, for the item card when it affects a suggestion. */
export const AVAILABILITY_NOTE = Object.freeze({
  fixed: 'Fixed commitment. Never moved.',
  protected: 'Protected time. Only moves if you say so.',
  focus: 'Planned focus time.',
  interruptible: 'School time between classes: short and interruptible. Work that needs a run-up is never placed here.',
  callback_wait: 'Waiting on someone. Light work only.',
  transition: 'Changing over. Not counted as work time.',
  travel: 'Travel. Not counted as work time.',
  recovery: 'Recovery. Not counted as work time.'
});

/** Work window used for "free time before it is due" (matches the runway planner). */
export const WORK_WINDOW = Object.freeze({ schoolFrom: 15.5, dayFrom: 9.5, to: 21 });

const FIXED_SOURCES = new Set(['scheduled_lesson', 'professional_meeting', 'professional_event', 'medical', 'ical_event']);
const TRAVEL = /\b(train|drive|driving|commute|flight|travel|bus|ferry)\b/i;
const RECOVERY = /^(rest|recovery|nap)\b/i;

/** Texture for one chip. An explicit `availability` on the record wins. */
export function textureFor(chip) {
  const explicit = chip?.record?.availability;
  if (explicit && AVAILABILITY[explicit]) return explicit;
  if (!chip || chip.ghost) return null;
  if (chip.protected || chip.kind === 'corey') return RECOVERY.test(chip.title ?? '') ? 'recovery' : 'protected';
  if (chip.isClass || FIXED_SOURCES.has(chip.source)) return TRAVEL.test(chip.title ?? '') ? 'travel' : 'fixed';
  if (chip.source === 'work_block') return 'focus';
  if (TRAVEL.test(chip.title ?? '')) return 'travel';
  if (RECOVERY.test(chip.title ?? '')) return 'recovery';
  return null;
}

/**
 * Interruptible spans: on a school day, the school band minus classes and meetings.
 * @param {{ school: boolean, chips: object[] }} day
 * @param {{ from: number, to: number } | null} schoolBand
 */
export function interruptibleSpans(day, schoolBand) {
  if (!day?.school || !schoolBand) return [];
  const busy = (day.chips ?? [])
    .filter((chip) => !chip.ghost && !chip.ambient && chip.end > schoolBand.from && chip.start < schoolBand.to)
    .map((chip) => [Math.max(chip.start, schoolBand.from), Math.min(chip.end, schoolBand.to)])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = schoolBand.from;
  for (const [start, end] of busy) {
    if (start - cursor >= 1 / 6) out.push({ start: cursor, end: start, kind: 'interruptible' });
    cursor = Math.max(cursor, end);
  }
  if (schoolBand.to - cursor >= 1 / 6) out.push({ start: cursor, end: schoolBand.to, kind: 'interruptible' });
  return out;
}

const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/**
 * Free work-window minutes from now to a due time, over the loaded days.
 * null when the due date is past the last loaded day (unknown, not zero).
 */
export function freeMinutesUntil(days, { today, nowHour, due, dueHour = null }) {
  const loaded = (days ?? []).filter((day) => day.date >= today && day.date <= due);
  if (!loaded.length || !(days ?? []).some((day) => day.date === due)) return null;
  let free = 0;
  for (const day of loaded) {
    let from = day.school ? WORK_WINDOW.schoolFrom : WORK_WINDOW.dayFrom;
    let to = WORK_WINDOW.to;
    if (day.date === today) from = Math.max(from, nowHour);
    if (day.date === due && dueHour != null) to = Math.min(to, dueHour);
    if (to <= from) continue;
    const busy = (day.chips ?? [])
      .filter((chip) => !chip.ghost && !chip.ambient)
      .reduce((sum, chip) => sum + overlap(chip.start, chip.end, from, to), 0);
    free += Math.max(0, to - from - busy);
  }
  return Math.round(free * 60);
}

/** Minutes of this task's own (non-ghost) work blocks still ahead, up to the due date. */
export function plannedMinutes(days, { taskId, today, nowHour, due }) {
  let total = 0;
  for (const day of days ?? []) {
    if (day.date < today || day.date > due) continue;
    for (const chip of day.chips ?? []) {
      if (chip.ghost || chip.source !== 'work_block' || chip.record?.task_id !== taskId) continue;
      const start = day.date === today ? Math.max(chip.start, nowHour) : chip.start;
      total += Math.max(0, chip.end - start);
    }
  }
  return Math.round(total * 60);
}

/**
 * Range + fragility for every task Due row (and the blocks linked to it).
 * Mutates the model's days: due.range, due.fragility; chip.range for linked blocks.
 */
export function annotateDurations(days, events, { today, nowHour }) {
  const sessions = (events ?? []).map((event) => event?.record).filter((record) => record?.type === 'work_session');
  const tasks = new Map();
  for (const event of events ?? []) {
    const record = event?.record;
    if ((record?.type === 'task' || record?.type === 'task_context') && record.id) tasks.set(record.id, record);
  }
  const ranges = new Map();
  const rangeOf = (id) => {
    if (!ranges.has(id)) ranges.set(id, tasks.has(id) ? durationRange(tasks.get(id), sessions) : null);
    return ranges.get(id);
  };
  for (const day of days ?? []) {
    for (const due of day.due ?? []) {
      const task = tasks.get(due.id);
      if (!task || task.type !== 'task') continue;
      const range = rangeOf(due.id);
      if (!range) continue;
      due.range = range;
      if (day.date < today) continue;
      const dueHour = /^(\d{2}):(\d{2})$/.exec(task.time ?? '');
      const free = freeMinutesUntil(days, { today, nowHour, due: day.date, dueHour: dueHour ? Number(dueHour[1]) + Number(dueHour[2]) / 60 : null });
      if (free == null) continue;
      due.fragility = fragility({ range, planned: plannedMinutes(days, { taskId: due.id, today, nowHour, due: day.date }), free });
    }
    for (const chip of day.chips ?? []) {
      const taskId = chip.record?.task_id ?? (chip.ghost ? chip.ghost.taskId : null);
      if (taskId && rangeOf(taskId)) chip.range = rangeOf(taskId);
    }
  }
}

/**
 * Freed spans on a day: [{ start, end, title, reason, termEnd }] in hours.
 * @param {Array<{ weekday: number, start: string, end: string, from: string, title: string, reason?: string, term_end?: string }>} freed
 */
export function freedSpansFor(date, freed) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const hour = (hhmm) => {
    const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm ?? ''));
    return m ? Number(m[1]) + Number(m[2]) / 60 : null;
  };
  return (freed ?? [])
    .filter((row) => row && row.weekday === dow && date >= row.from && hour(row.start) != null && hour(row.end) > hour(row.start))
    .map((row) => ({ id: row.id, start: hour(row.start), end: hour(row.end), title: row.title, reason: row.reason ?? '', termEnd: row.term_end ?? null }));
}

/**
 * A commitment placed in freed time: what it costs across the rest of term if it repeats.
 * Advisory only. termHours is null when the term end is unknown.
 */
export function regainedCost(chip, span, date) {
  const hours = overlap(chip.start, chip.end, span.start, span.end);
  if (!(hours > 0)) return null;
  let weeks = null;
  if (span.termEnd && span.termEnd >= date) {
    weeks = Math.floor((Date.parse(`${span.termEnd}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / (7 * 86_400_000)) + 1;
  }
  return { title: span.title, reason: span.reason, hours, weeks, termHours: weeks == null ? null : Math.round(hours * weeks * 2) / 2 };
}
