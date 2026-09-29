/**
 * Sunday Ann teaching-load one-liner → Ann→Hammond Cross-Agent (Tier 1).
 * Deterministic from Teaching scheduled lessons + Tasks marking shadows — no model call.
 */
import { createGitHubClient } from './github-client.mjs';
import { sydneyHourParts } from './remember-service.mjs';
import { isoWeekKey } from './career-scan-service.mjs';
import { defaultListScheduledLessons, defaultListTasks } from './hub-agent-context.mjs';
import {
  applyScheduledCrossAgentLine,
  readGithubJsonState,
  writeGithubJsonState
} from './cn-scheduled-write.mjs';
import { addCalendarDays, getSydneyDateKey } from '../../../apps/life/js/core/time.js';

export const ANN_TEACHING_FORECAST_STATE_PATH = 'data/hammond/ann-teaching-forecast-state.json';
export const ANN_FORECAST_WINDOW_DAYS = 14;

/** Sunday 18:00 Sydney, once per ISO week. */
export function shouldRunAnnTeachingForecastNow(now = new Date(), state = {}) {
  const { hour, dayKey } = sydneyHourParts(now);
  const dow = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short'
  }).format(now);
  const weekKey = isoWeekKey(now);
  if (dow !== 'Sun' || hour !== 18) {
    return { run: false, dayKey, weekKey };
  }
  if (state?.last_success_week === weekKey) {
    return { run: false, dayKey, weekKey };
  }
  return { run: true, dayKey, weekKey };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value) {
  return typeof value === 'string' && ISO_DATE_RE.test(value);
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function isCountableLesson(item, today, until) {
  if (!item || typeof item !== 'object') return false;
  if (item.delivery_status === 'cancelled') return false;
  return isIsoDate(item.date) && item.date >= today && item.date <= until;
}

/** Prefer marking.return_by; fall back to task.due_date. */
function markingDeadline(task) {
  const marking = task?.marking;
  if (!marking || typeof marking !== 'object' || Array.isArray(marking)) return '';
  if (isIsoDate(marking.return_by)) return marking.return_by;
  return isIsoDate(task.due_date) ? task.due_date : '';
}

/** Open marking-shadow tasks with return_by (or due_date) inside [today, until]. */
export function countOpenMarkingInWindow(tasks = [], today, until) {
  if (!isIsoDate(today) || !isIsoDate(until)) return 0;
  let count = 0;
  for (const task of tasks ?? []) {
    if (!task || typeof task !== 'object') continue;
    if (task.status === 'done' || task.status === 'dead') continue;
    const returnBy = markingDeadline(task);
    if (!returnBy || returnBy < today || returnBy > until) continue;
    count += 1;
  }
  return count;
}

/**
 * Build the Ann→Hammond teaching-load line from scheduled lessons + marking tasks
 * in [today, today+window].
 */
export function buildAnnTeachingForecastLine({
  lessons = [],
  tasks = [],
  today,
  windowDays = ANN_FORECAST_WINDOW_DAYS
} = {}) {
  if (!isIsoDate(today)) return null;
  const until = addCalendarDays(today, windowDays);
  const upcoming = (lessons ?? []).filter(item => isCountableLesson(item, today, until));
  const days = new Set(upcoming.map(item => item.date));
  const marking = countOpenMarkingInWindow(tasks, today, until);
  const range = `${today}–${until}`;
  const markingLabel = plural(marking, 'open marking task');
  if (!upcoming.length && !marking) {
    return `Ann→Hammond: Teaching load ${range}: no scheduled lessons in the next ${windowDays} days.`;
  }
  if (!upcoming.length) {
    return `Ann→Hammond: Teaching load ${range}: no scheduled lessons; ${markingLabel}.`;
  }
  const markingBit = marking ? `; ${markingLabel}` : '';
  return `Ann→Hammond: Teaching load ${range}: ${plural(upcoming.length, 'lesson')} across ${plural(days.size, 'day')}${markingBit}.`;
}

export async function runAnnTeachingForecast({
  env = process.env,
  now = new Date(),
  deps = {}
} = {}) {
  const readState = deps.readState
    ?? (async () => {
      const client = deps.client ?? createGitHubClient({ env });
      return readGithubJsonState(client, ANN_TEACHING_FORECAST_STATE_PATH);
    });
  const { state, sha } = await readState();
  const gate = shouldRunAnnTeachingForecastNow(now, state);
  if (!gate.run) return { ok: true, skipped: 'gate', ...gate };

  const today = getSydneyDateKey(now);
  const lessons = deps.lessons
    ?? await (deps.listScheduledLessons ?? defaultListScheduledLessons)(env);
  const tasks = deps.tasks
    ?? await (deps.listTasks ?? defaultListTasks)(env);
  const line = buildAnnTeachingForecastLine({
    lessons: Array.isArray(lessons) ? lessons : [],
    tasks: Array.isArray(tasks) ? tasks : [],
    today
  });
  if (!line) return { ok: true, skipped: 'no_line', weekKey: gate.weekKey };

  const client = deps.client ?? (deps.applyLine && deps.writeState
    ? null
    : createGitHubClient({ env }));
  const apply = deps.applyLine
    ?? (args => applyScheduledCrossAgentLine({ client, ...args }));
  const applied = await apply({
    line,
    summary: 'Ann teaching-load forecast',
    agentSlug: 'ann',
    now
  });

  const nextState = {
    ...state,
    last_success_week: gate.weekKey,
    last_run_at: now.toISOString(),
    last_line: line
  };
  if (deps.writeState) {
    await deps.writeState(nextState, { sha });
  } else {
    await writeGithubJsonState(client, ANN_TEACHING_FORECAST_STATE_PATH, nextState, {
      sha,
      message: `chore(ann): teaching forecast ${gate.weekKey}`
    });
  }

  return {
    ok: true,
    weekKey: gate.weekKey,
    applied: Boolean(applied?.applied),
    line
  };
}
