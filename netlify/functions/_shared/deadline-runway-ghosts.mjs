/**
 * Deadline runway → calendar ghost proposals (deterministic).
 * Extends the morning ghost-propose pass — no new cron, no LLM.
 *
 * Respects existing work blocks (already_scheduled) and busy intervals
 * (lessons / events). Prefer after-school slots, not a blind 09:00.
 */
import { addCalendarDays, daysBetween } from '../../../apps/life/js/core/time.js';
import { validateGhost } from '../../../packages/design-kit/js/calendar/ghost-writes.js';
import { computeDeadlineRunway } from './productivity-os.mjs';

export const SCHOOL_DAY_END = '15:30';
export const WORK_WINDOW_END = '21:00';
export const WORK_WINDOW_FALLBACK_START = '07:30';

function parseHm(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatHm(total) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function endFromStart(startHhmm, minutes) {
  const start = parseHm(startHhmm);
  if (start == null) return formatHm(9 * 60 + minutes);
  return formatHm(start + Math.max(25, minutes));
}

function blockDurationMinutes(block) {
  if (Number.isFinite(block?.duration_minutes)) return Math.max(0, Math.round(block.duration_minutes));
  const start = parseHm(block?.start_time ?? block?.start);
  const end = parseHm(block?.end_time ?? block?.end);
  if (start != null && end != null && end > start) return end - start;
  return 60;
}

/** Minutes already protected for this task between today and due (inclusive). */
export function minutesScheduledForTask(workBlocks, taskId, today, due) {
  if (!taskId || !Array.isArray(workBlocks)) return 0;
  let total = 0;
  for (const block of workBlocks) {
    if (!block || block.status === 'cancelled' || block.status === 'dead') continue;
    if (String(block.task_id ?? '') !== String(taskId)) continue;
    const date = typeof block.date === 'string' ? block.date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > due) continue;
    total += blockDurationMinutes(block);
  }
  return total;
}

/**
 * Busy intervals for a calendar day: [{ start, end }] in minutes from midnight.
 * Lessons default to 60 minutes when end is missing.
 */
export function busyIntervalsForDate(date, { lessons = [], events = [], workBlocks = [] } = {}) {
  const intervals = [];
  for (const lesson of lessons) {
    if (!lesson || lesson.delivery_status === 'cancelled') continue;
    if (lesson.date !== date) continue;
    const start = parseHm(lesson.start_time ?? lesson.start) ?? 9 * 60;
    const end = parseHm(lesson.end_time ?? lesson.end) ?? start + 60;
    if (end > start) intervals.push({ start, end });
  }
  for (const event of events) {
    const rec = event?.record ?? event;
    if (!rec || rec.date !== date) continue;
    if (rec.type && rec.type !== 'calendar_block' && rec.type !== 'appointment') continue;
    const start = parseHm(rec.time ?? rec.start_time ?? rec.start);
    const end = parseHm(rec.end_time ?? rec.end);
    if (start == null) continue;
    intervals.push({ start, end: end != null && end > start ? end : start + 60 });
  }
  for (const block of workBlocks) {
    if (!block || block.date !== date) continue;
    if (block.status === 'cancelled' || block.status === 'dead') continue;
    const start = parseHm(block.start_time ?? block.start);
    if (start == null) continue;
    const end = parseHm(block.end_time ?? block.end) ?? start + blockDurationMinutes(block);
    if (end > start) intervals.push({ start, end });
  }
  return intervals.sort((a, b) => a.start - b.start);
}

function overlaps(aStart, aEnd, intervals) {
  return intervals.some(iv => aStart < iv.end && aEnd > iv.start);
}

/**
 * Prefer after-school (15:30–21:00); fall back to morning only if evening is full.
 */
export function pickProtectSlot({
  durationMinutes,
  busy = [],
  preferAfter = SCHOOL_DAY_END,
  windowEnd = WORK_WINDOW_END,
  fallbackStart = WORK_WINDOW_FALLBACK_START
} = {}) {
  const need = Math.max(25, Math.round(durationMinutes || 60));
  const prefer = parseHm(preferAfter) ?? 15 * 60 + 30;
  const endCap = parseHm(windowEnd) ?? 21 * 60;
  const morning = parseHm(fallbackStart) ?? 7 * 60 + 30;

  for (let start = prefer; start + need <= endCap; start += 15) {
    if (!overlaps(start, start + need, busy)) {
      return { start: formatHm(start), end: formatHm(start + need) };
    }
  }
  for (let start = morning; start + need <= prefer; start += 15) {
    if (!overlaps(start, start + need, busy)) {
      return { start: formatHm(start), end: formatHm(start + need) };
    }
  }
  return null;
}

function coarseAvailableMinutes(today, due, busyByDate) {
  const days = daysBetween(today, due) + 1;
  let free = 0;
  for (let i = 0; i < days; i += 1) {
    const date = addCalendarDays(today, i);
    const busy = busyByDate[date] ?? [];
    const eveningStart = parseHm(SCHOOL_DAY_END);
    const eveningEnd = parseHm(WORK_WINDOW_END);
    let cursor = eveningStart;
    const sorted = [...busy].sort((a, b) => a.start - b.start);
    for (const iv of sorted) {
      if (iv.end <= eveningStart || iv.start >= eveningEnd) continue;
      const gapStart = Math.max(cursor, eveningStart);
      const gapEnd = Math.min(iv.start, eveningEnd);
      if (gapEnd > gapStart) free += gapEnd - gapStart;
      cursor = Math.max(cursor, iv.end);
    }
    if (eveningEnd > cursor) free += eveningEnd - Math.max(cursor, eveningStart);
  }
  return Math.max(0, free);
}

/**
 * Open tasks due within 48h that need a protected work block.
 * Id includes due date so a moved deadline can re-propose after dismiss.
 */
export function proposeDeadlineRunwayGhosts({
  tasks,
  today,
  nowIso,
  workBlocks = [],
  lessons = [],
  events = []
}) {
  if (!Array.isArray(tasks) || !/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) return [];
  const horizon = addCalendarDays(today, 2);
  const out = [];

  const busyByDate = {};
  for (let i = 0; i <= daysBetween(today, horizon); i += 1) {
    const date = addCalendarDays(today, i);
    busyByDate[date] = busyIntervalsForDate(date, { lessons, events, workBlocks });
  }

  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    if (task.status === 'done' || task.status === 'dead') continue;
    const due = typeof task.due_date === 'string' ? task.due_date : null;
    if (!due || due < today || due > horizon) continue;

    const remaining = Math.max(0, Math.round(Number(task.estimated_duration) || 60));
    if (remaining <= 0) continue;

    const already = minutesScheduledForTask(workBlocks, task.id, today, due);
    if (already >= remaining) continue;

    const daysLeft = daysBetween(today, due);
    const available = coarseAvailableMinutes(today, due, busyByDate);
    const runway = computeDeadlineRunway({
      today,
      deadline: due,
      remaining_minutes: remaining,
      already_scheduled_minutes: already,
      available_minutes_until_deadline: available
    });

    if (runway.risk === 'clear' && daysLeft > 1) continue;

    const blockMinutes = Math.min(120, Math.max(25, runway.required_blocks?.[0]?.minutes ?? (remaining - already)));
    const date = runway.recommended_start && runway.recommended_start >= today
      ? runway.recommended_start
      : today;
    const slot = pickProtectSlot({
      durationMinutes: blockMinutes,
      busy: busyByDate[date] ?? []
    });
    if (!slot) continue;

    const ghost = {
      id: `clare-runway-${task.id}-${due}`,
      agent: 'clare',
      kind: 'protect_block',
      date,
      start: slot.start,
      end: slot.end,
      title: `Work: ${String(task.title ?? 'task').trim() || 'task'}`,
      reason: runway.note,
      taskId: task.id,
      created_at: nowIso,
      status: 'pending',
      via: 'deadline-runway'
    };
    validateGhost(ghost);
    out.push(ghost);
  }

  return out;
}
