/**
 * Day Sense (docs/proposals/calendar-day-sense.md §3.1): see the day before anyone asks.
 * Pure helpers over the Tideline model.
 *
 * - actualSpans: what actually happened (tracked work sessions, finished workouts).
 * - tonightFit: does today's due work still fit before lights-out? What spills?
 * - dayCost: "63% · 4½ h booked · move Marking to Fri (74%)".
 *
 * Honesty: an elapsed block is not work done; no tracked session is not "nothing
 * happened". Tasks without an estimate are named, never guessed into minutes.
 */
import { CAPACITY, isOverCapacity } from './capacity-model.js';
import { canMoveItem, itemType } from './calendar-item-actions.js';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const hours = (hhmm) => {
  const m = TIME.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

/** Tracked work + finished workouts on `date`, as { start, end, title, kind, result? }. */
export function actualSpans(events, date) {
  const out = [];
  for (const event of events ?? []) {
    const record = event?.record ?? event;
    if (!record || record.date !== date) continue;
    const start = hours(record.time);
    if (start == null) continue;
    if (record.type === 'work_session') {
      const end = hours(record.end_time) ?? start;
      if (end > start) out.push({ start, end, title: record.title, kind: 'work', result: record.result, open: record.open === true, taskId: record.task_id ?? null });
    } else if (record.type === 'workout' && record.status === 'completed') {
      const minutes = Number(record.duration_min) || 45;
      out.push({ start, end: Math.min(24, start + minutes / 60), title: record.title || 'Workout', kind: 'workout' });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export const trackedHours = (spans) => spans.reduce((sum, span) => sum + (span.end - span.start), 0);

function overlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

/**
 * Tonight: due-today tasks (with estimates, not already given a block today) against
 * the free hours between now and lights-out.
 * @param {{ day: object, nowHour: number, lightsOut: number, events?: object[] }} input
 * @returns {null | { free: number, need: number, over: number, spill: Array<{ id, title, hours }>, unestimated: string[] }}
 */
export function tonightFit({ day, nowHour, lightsOut, events = [] }) {
  if (!day || !(lightsOut > nowHour)) return null;
  const booked = (day.chips ?? [])
    .filter((chip) => !chip.ghost)
    .reduce((sum, chip) => sum + overlap(chip.start, chip.end, nowHour, lightsOut), 0);
  const free = Math.max(0, lightsOut - nowHour - booked);
  const blockedTasks = new Set((day.chips ?? [])
    .filter((chip) => chip.source === 'work_block' && chip.end > nowHour)
    .map((chip) => chip.record?.task_id)
    .filter(Boolean));
  const doneToday = new Map();
  for (const span of actualSpans(events, day.date)) {
    if (span.taskId) doneToday.set(span.taskId, (doneToday.get(span.taskId) ?? 0) + (span.end - span.start));
  }
  const needs = [];
  const unestimated = [];
  for (const due of day.due ?? []) {
    if (due.kind === 'promise' || due.kind === 'allday' || itemType(due) !== 'task') continue;
    const record = due.record ?? {};
    if (record.status === 'done' || blockedTasks.has(due.id)) continue;
    const minutes = Number(record.estimated_duration);
    if (!(minutes > 0)) {
      unestimated.push(due.title);
      continue;
    }
    const left = Math.max(0, minutes / 60 - (doneToday.get(due.id) ?? 0));
    if (left > 0) needs.push({ id: due.id, title: due.title, hours: left });
  }
  const need = needs.reduce((sum, row) => sum + row.hours, 0);
  const over = Math.max(0, need - free);
  // What spills: the latest-listed work past what fits, in order.
  const spill = [];
  let room = free;
  for (const row of needs) {
    if (row.hours <= room) {
      room -= row.hours;
      continue;
    }
    spill.push({ ...row, hours: row.hours - Math.max(0, room) });
    room = 0;
  }
  const minute = (value) => Math.round(value * 60) / 60;
  return {
    free: minute(free),
    need: minute(need),
    over: minute(over),
    spill: spill.map((row) => ({ ...row, hours: minute(row.hours) })),
    unestimated
  };
}

const halfHours = (value) => {
  const rounded = Math.round(value * 2) / 2;
  const whole = Math.floor(rounded);
  return `${whole || (rounded % 1 ? '' : '0')}${rounded % 1 ? '½' : ''} h`;
};

/**
 * Week header line. Over capacity → one concrete move: the longest movable item
 * to the best-capacity later day this week that has room.
 * @returns {{ booked: number, text: string, over: boolean, move: null | { id, title, to, toPct } }}
 */
export function dayCost(day, days, today) {
  const load = (day.chips ?? [])
    .filter((chip) => !chip.isClass && !chip.protected && !chip.ghost && !chip.ambient && chip.kind !== 'corey')
    .reduce((sum, chip) => sum + Math.max(0, chip.end - chip.start), 0);
  const pct = day.cap?.pct ?? CAPACITY.baseline;
  const over = load > 0 && isOverCapacity(pct, load);
  const text = load > 0 ? `${halfHours(load)} booked` : '';
  if (!over || day.date < today) return { booked: load, text, over, move: null };
  const candidates = (day.chips ?? [])
    .filter((chip) => canMoveItem(chip) && !chip.isClass && itemType(chip) !== 'scheduled_lesson')
    .sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const chip = candidates[0];
  if (!chip) return { booked: load, text, over, move: null };
  const length = chip.end - chip.start;
  const target = (days ?? [])
    .filter((other) => other.date > day.date && other.date >= today)
    .map((other) => {
      const otherLoad = (other.chips ?? []).filter((c) => !c.isClass && !c.protected && !c.ghost && !c.ambient).reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
      const otherPct = other.cap?.pct ?? CAPACITY.baseline;
      return { other, otherPct, fits: !isOverCapacity(otherPct, otherLoad + length) };
    })
    .filter((row) => row.fits)
    .sort((a, b) => b.otherPct - a.otherPct)[0];
  if (!target) return { booked: load, text, over, move: null };
  return {
    booked: load,
    text,
    over,
    move: { id: chip.id, title: chip.title, to: target.other.date, toPct: target.otherPct }
  };
}

/**
 * The moment to leave a way back in: a work block for a task is running and either
 * ends within 10 minutes, or a fixed commitment (a class, a meeting, an appointment)
 * starts within 10 minutes and will cut it off.
 * @returns {null | { blockId, taskId, title, reason: 'ending'|'interrupted', at: number, next?: string, previous: string }}
 */
export function bookmarkMoment(day, nowHour, { dismissed = new Set(), within = 10 / 60 } = {}) {
  if (!day) return null;
  const running = (day.chips ?? []).find((chip) => chip.source === 'work_block' && !chip.ghost
    && chip.record?.task_id && chip.start <= nowHour && nowHour < chip.end && !dismissed.has(chip.id));
  if (!running) return null;
  const recent = Date.parse(running.bookmark?.at ?? '');
  if (Number.isFinite(recent) && Date.now() - recent < 30 * 60 * 1000) return null;
  const fixed = (day.chips ?? [])
    .filter((chip) => chip.id !== running.id && !chip.ghost && !chip.ambient && chip.start > nowHour && chip.start <= nowHour + within && chip.start < running.end
      && (chip.isClass || chip.protected || ['professional_meeting', 'professional_event', 'medical', 'ical_event'].includes(chip.source)))
    .sort((a, b) => a.start - b.start)[0];
  const base = {
    blockId: running.id,
    taskId: running.record.task_id,
    title: running.title,
    previous: running.bookmark?.note ?? ''
  };
  if (fixed) return { ...base, reason: 'interrupted', at: fixed.start, next: fixed.title };
  if (running.end - nowHour <= within) return { ...base, reason: 'ending', at: running.end };
  return null;
}
