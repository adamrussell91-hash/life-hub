/**
 * Sunday Ann teaching-load one-liner → Ann→Hammond Cross-Agent (Tier 1).
 * Deterministic from Teaching scheduled lessons — no model call.
 */
import { createGitHubClient } from './github-client.mjs';
import { sydneyHourParts } from './remember-service.mjs';
import { isoWeekKey } from './career-scan-service.mjs';
import { defaultListScheduledLessons } from './hub-agent-context.mjs';
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

function isCountableLesson(item, today, until) {
  if (!item || typeof item !== 'object') return false;
  if (item.delivery_status === 'cancelled') return false;
  const date = typeof item.date === 'string' ? item.date : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && date <= until;
}

function looksLikeMarking(item) {
  const blob = [
    item?.title,
    item?.topic,
    item?.focus,
    item?.notes,
    item?.kind,
    item?.type
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(mark|marking|assess|assessment|moderat|feedback|grade)\b/.test(blob);
}

/**
 * Build the Ann→Hammond teaching-load line from scheduled lessons in [today, today+window].
 */
export function buildAnnTeachingForecastLine({
  lessons = [],
  today,
  windowDays = ANN_FORECAST_WINDOW_DAYS
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) return null;
  const until = addCalendarDays(today, windowDays);
  const upcoming = (lessons ?? []).filter(item => isCountableLesson(item, today, until));
  const days = new Set(upcoming.map(item => item.date));
  const marking = upcoming.filter(looksLikeMarking).length;
  const range = `${today}–${until}`;
  if (!upcoming.length) {
    return `Ann→Hammond: Teaching load ${range}: no scheduled lessons in the next ${windowDays} days.`;
  }
  const markingBit = marking
    ? `; ${marking} look assessment/marking-heavy`
    : '';
  return `Ann→Hammond: Teaching load ${range}: ${upcoming.length} lesson${upcoming.length === 1 ? '' : 's'} across ${days.size} day${days.size === 1 ? '' : 's'}${markingBit}.`;
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
  const line = buildAnnTeachingForecastLine({
    lessons: Array.isArray(lessons) ? lessons : [],
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
