/**
 * The non-Life-repo evidence the readiness model needs, read the way the calendar views
 * read it, so server planners (Almanac, ghost proposer, goal reads) compute the same
 * capacity number the Day and Week views show:
 *   - morning check-ins (tasks store, capacity/observations/…)
 *   - tracked work sessions (tasks store, work_sessions/)
 *   - scheduled lessons (teaching store rows, passed in by the caller)
 * Best effort: a store failure returns what it could read, never throws.
 */
import { addDays, checkinEvents } from '../../../packages/design-kit/js/calendar/readiness-model.js';
import { tasksEventsFromWorkSessions } from '../../../packages/design-kit/js/calendar/tasks-calendar.js';
import { teachingEventsFromCurriculum } from '../../../packages/design-kit/js/calendar/teaching-calendar.js';
import { getJSON, listJSON, readIndex } from './tasks-blobs.mjs';
import { withoutDeleted } from './record-liveness.mjs';

export const READINESS_LOOKBACK_DAYS = 25;

/** Live check-in observations for [from, to] (deleted ones dropped; supersede handled by the model). */
export async function loadObservations(store, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const prefix = `capacity/observations/${d}/`;
    const ids = await readIndex(store, `${prefix}_index`).catch(() => []);
    const rows = await Promise.all(ids.map(id => getJSON(store, `${prefix}${id}`).catch(() => null)));
    out.push(...withoutDeleted(rows.filter(Boolean)));
  }
  return out;
}

/**
 * @param {{ store?: object|null, today: string, lessons?: object[], now?: number, lookback?: number }} opts
 * @returns {Promise<Array<{ path: string, record: object, body: string }>>}
 */
export async function readinessEvidenceEvents({ store = null, today, lessons = [], now = Date.now(), lookback = READINESS_LOOKBACK_DAYS }) {
  const events = [];
  if (Array.isArray(lessons) && lessons.length) {
    events.push(...teachingEventsFromCurriculum({ scheduled_lessons: withoutDeleted(lessons) }));
  }
  if (!store || !today) return events;
  try {
    events.push(...checkinEvents(await loadObservations(store, addDays(today, -lookback), today)));
  } catch {
    /* no check-ins: the model treats them as unanswered */
  }
  try {
    const sessions = await listJSON(store, 'work_sessions/');
    events.push(...tasksEventsFromWorkSessions(withoutDeleted(sessions), new Map(), { now }));
  } catch {
    /* no tracked sessions: workload falls back to scheduled classes */
  }
  return events;
}
