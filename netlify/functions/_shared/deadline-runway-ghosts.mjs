/**
 * Deadline runway → calendar ghost proposals (deterministic).
 * Extends the morning ghost-propose pass — no new cron, no LLM.
 *
 * Respects existing work blocks (already_scheduled) and busy intervals
 * (lessons / events). Prefer after-school slots, not a blind 09:00.
 */
import { addCalendarDays, daysBetween } from '../../../apps/life/js/core/time.js';
import { validateGhost } from '../../../packages/design-kit/js/calendar/ghost-writes.js';
import { DURATION, dependencyIndex, remainingByEstimate } from '../../../packages/design-kit/js/calendar/duration-model.js';
import { taskProgress } from '../../../packages/design-kit/js/calendar/tasks-calendar.js';

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

export const RUNWAY_HORIZON_DAYS = 13; // the propose run reads two weeks ahead
export const RUNWAY_MAX_PER_DAY = 2;
export const RUNWAY_MAX_PARTS = 3;
export const RUNWAY_SOFTEN_PCT = 40; // never block out work on a day forecast under this
const RUNWAY_LEAD_DAYS = 3; // look this many days before the first day the work strictly needs

const WEEKDAY = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "Wed 7 Oct" */
const dayLabel = (date) => {
  const parts = Object.fromEntries(WEEKDAY.formatToParts(new Date(`${date}T00:00:00Z`)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}`;
};

function isWeekend(date) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

function hoursText(minutes) {
  const value = Math.round(minutes / 30) / 2;
  if (value < 1) return `${Math.round(minutes / 5) * 5} min`;
  return `${Math.floor(value)}${value % 1 ? '½' : ''} h`;
}

/** iCloud rows (from the feed cache) as busy intervals. All-day rows never block. */
function icalBusy(rows, date) {
  const out = [];
  for (const row of rows ?? []) {
    if (!row || row.date !== date || row.all_day) continue;
    const start = parseHm(row.time);
    const end = parseHm(row.end_time);
    if (start == null) continue;
    out.push({ start, end: end != null && end > start ? end : start + 60 });
  }
  return out;
}

function partsFor(minutes, maxBlock, minBlock) {
  const parts = [];
  let left = minutes;
  while (left > 0 && parts.length < RUNWAY_MAX_PARTS) {
    const chunk = Math.max(minBlock, Math.min(maxBlock, left));
    parts.push(chunk);
    left -= chunk;
  }
  return parts;
}

/**
 * Ghost time-blocking across the whole runway (Day Sense step 8).
 *
 * For each open task with an estimate due in the next two weeks: what is left (count
 * progress taken off), minus work blocks already planned, is split into parts no longer
 * than the task's own maximum block, and each part is proposed as a real Tasks work block
 * (`task_block`) on the best-capacity day in the few days before it is due.
 *
 * Never: on a day forecast under 40%; more than two a day; into lessons, meetings, walls,
 * Corey, protected time, iCloud events or other blocks; before an open blocker is due
 * (a blocker with no date means nothing is placed). Tasks that need a run-up get evening
 * slots of 45 min or more on school days, never the gaps between classes.
 * Tasks due within 48 h keep the old default of 60 min when they have no estimate.
 */
export function proposeDeadlineRunwayGhosts({
  tasks,
  today,
  nowIso,
  workBlocks = [],
  lessons = [],
  events = [],
  icalRows = [],
  capacity = null,
  isSchoolDay = (date) => !isWeekend(date),
  pending = []
}) {
  if (!Array.isArray(tasks) || !/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) return [];
  const horizon = addCalendarDays(today, RUNWAY_HORIZON_DAYS);
  const byId = new Map(tasks.filter(t => t && typeof t.id === 'string').map(t => [t.id, t]));
  const open = (t) => t && t.status !== 'done' && t.status !== 'dead';
  const deps = dependencyIndex(tasks);
  const stepsOf = new Map();
  for (const t of tasks) {
    if (t && typeof t.parent_task_id === 'string') stepsOf.set(t.parent_task_id, [...(stepsOf.get(t.parent_task_id) ?? []), t]);
  }

  const busyByDate = {};
  const perDay = {};
  for (let i = 0; i <= RUNWAY_HORIZON_DAYS; i += 1) {
    const date = addCalendarDays(today, i);
    busyByDate[date] = [...busyIntervalsForDate(date, { lessons, events, workBlocks }), ...icalBusy(icalRows, date)];
    perDay[date] = 0;
  }
  // Runway proposals still waiting for a decision count toward the two a day.
  for (const ghost of pending ?? []) {
    if (ghost?.via === 'deadline-runway' && (ghost.status ?? 'pending') === 'pending' && perDay[ghost.date] != null) perDay[ghost.date] += 1;
  }
  const pctOf = (date) => capacity?.get?.(date)?.pct ?? 80;

  const candidates = tasks
    .filter(t => open(t) && typeof t.due_date === 'string' && t.due_date >= today && t.due_date <= horizon)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || (deps.get(b.id)?.unlocks ?? 0) - (deps.get(a.id)?.unlocks ?? 0));

  const out = [];
  for (const task of candidates) {
    const due = task.due_date;
    const withinTwoDays = daysBetween(today, due) <= 2;
    const progress = taskProgress(task, stepsOf.get(task.id) ?? []);
    const estimate = remainingByEstimate({ ...task, progress });
    const remaining = estimate ?? (withinTwoDays ? 60 : null);
    if (remaining == null) continue; // no estimate: unknown, never guessed
    const already = minutesScheduledForTask(workBlocks, task.id, today, due);
    const needed = remaining - already;
    if (needed < DURATION.minBlock) continue; // too small to block out; it is just a task

    // Explicit blockers: start the day after the latest one is due; undated blocker → wait.
    const blockers = deps.get(task.id)?.blockedBy ?? [];
    if (blockers.some(b => !b.due)) continue;
    const afterBlockers = blockers.reduce((latest, b) => (b.due > latest ? b.due : latest), '');
    const runup = task.resumability === 'runup';
    const minBlock = runup ? DURATION.runupMinBlock : DURATION.minBlock;
    const maxBlock = Math.max(minBlock, Number(task.max_block_minutes) > 0 ? Number(task.max_block_minutes) : DURATION.defaultMaxBlock);
    const parts = partsFor(needed, maxBlock, minBlock);
    const leadFrom = addCalendarDays(due, -(parts.length + RUNWAY_LEAD_DAYS));
    let earliest = leadFrom > today ? leadFrom : today;
    if (afterBlockers) {
      const next = addCalendarDays(afterBlockers, 1);
      if (next > earliest) earliest = next;
    }
    if (earliest > due) continue;

    const days = [];
    for (let date = earliest; date <= due; date = addCalendarDays(date, 1)) days.push(date);
    const ranked = days
      .filter(date => pctOf(date) >= RUNWAY_SOFTEN_PCT)
      .sort((a, b) => pctOf(b) - pctOf(a) || a.localeCompare(b));

    const used = new Set();
    const placed = [];
    for (const minutes of parts) {
      let chosen = null;
      for (const date of ranked) {
        if (used.has(date) || perDay[date] >= RUNWAY_MAX_PER_DAY) continue;
        const dueTime = date === due ? parseHm(task.due_time) : null;
        const school = isSchoolDay(date);
        const slot = pickProtectSlot({
          durationMinutes: minutes,
          busy: busyByDate[date] ?? [],
          preferAfter: school ? SCHOOL_DAY_END : '09:30',
          windowEnd: dueTime != null ? formatHm(Math.min(dueTime, parseHm(WORK_WINDOW_END))) : WORK_WINDOW_END,
          // Run-up work never goes into the school day; quick work may use the morning.
          fallbackStart: school && runup ? SCHOOL_DAY_END : WORK_WINDOW_FALLBACK_START
        });
        if (slot) {
          chosen = { date, slot, minutes };
          break;
        }
      }
      if (!chosen) break;
      used.add(chosen.date);
      perDay[chosen.date] += 1;
      const start = parseHm(chosen.slot.start);
      busyByDate[chosen.date] = [...(busyByDate[chosen.date] ?? []), { start, end: start + chosen.minutes }]
        .sort((a, b) => a.start - b.start);
      placed.push(chosen);
    }
    placed.sort((a, b) => a.date.localeCompare(b.date));
    placed.forEach((row, index) => {
      const title = String(task.title ?? 'task').trim() || 'task';
      const part = placed.length > 1 ? ` (${index + 1} of ${placed.length})` : '';
      const reasonParts = [
        `Due ${dayLabel(due)}.`,
        `${estimate == null ? 'No estimate, so 60 min' : `About ${hoursText(remaining)} left`}${already ? `, ${hoursText(already)} already planned` : ''}.`,
        `Forecast ${pctOf(row.date)}% on ${dayLabel(row.date)}.`
      ];
      if (runup) reasonParts.push('Needs a run-up, so an evening slot.');
      if (afterBlockers) reasonParts.push(`After ${blockers.map(b => b.title).join(', ')}.`);
      const ghost = {
        id: index === 0 ? `clare-runway-${task.id}-${due}` : `clare-runway-${task.id}-${due}-${index + 1}`,
        agent: 'clare',
        kind: 'task_block',
        date: row.date,
        start: row.slot.start,
        end: formatHm(parseHm(row.slot.start) + row.minutes),
        title,
        reason: reasonParts.join(' '),
        taskId: task.id,
        created_at: nowIso,
        status: 'pending',
        via: 'deadline-runway'
      };
      validateGhost(ghost);
      out.push({
        ...ghost,
        label: `Work: ${title}${part}`,
        meta: `Clare · due ${dayLabel(due)}`,
        chip: { date: ghost.date, start: ghost.start, end: ghost.end, kind: 'task' }
      });
    });
  }
  return out;
}
