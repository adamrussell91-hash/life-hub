import { addCalendarDays, daysBetween, isCalendarDate } from '../../../apps/life/js/core/time.js';

export const FITNESS_SESSION_PATH =
  /^data\/fitness\/(?<year>\d{4})\/(?<month>\d{2})\/(?<date>\d{4}-\d{2}-\d{2})-(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export const MAX_RECENT_WORKOUTS = 20;
export const WORKOUT_COMPARE_WEEKS = 8;
const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 20;
const SET_SUFFIX = /\s+set\s+\d+\s*$/i;

export function normalizeExerciseName(name) {
  return String(name ?? '')
    .replace(SET_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function collapseSetSplitExercises(exercises) {
  if (!Array.isArray(exercises)) return [];
  const out = [];
  const indexByKey = new Map();
  for (const exercise of exercises) {
    if (!exercise || typeof exercise !== 'object') continue;
    const name = normalizeExerciseName(exercise.name);
    if (!name) continue;
    const key = name.toLowerCase();
    const sets = Array.isArray(exercise.sets) ? exercise.sets.slice() : [];
    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, out.length);
      out.push({ ...exercise, name, sets });
      continue;
    }
    const existing = out[existingIndex];
    existing.sets = [...(existing.sets ?? []), ...sets];
  }
  return out;
}

export function selectRecentWorkoutEntries(tree, { limit = MAX_RECENT_WORKOUTS } = {}) {
  if (!Array.isArray(tree)) return [];
  const cap = Math.min(Math.max(Number(limit) || MAX_RECENT_WORKOUTS, 1), 20);
  return tree
    .filter(entry => entry && entry.type === 'blob' && FITNESS_SESSION_PATH.test(entry.path ?? ''))
    .sort((a, b) => String(b.path).localeCompare(String(a.path)))
    .slice(0, cap);
}

export function selectWorkoutEntriesInRange(tree, { from, to } = {}) {
  if (!Array.isArray(tree) || !isCalendarDate(from) || !isCalendarDate(to) || from > to) return [];
  return tree
    .filter(entry => {
      if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') return false;
      const match = FITNESS_SESSION_PATH.exec(entry.path);
      return Boolean(match && match.groups.date >= from && match.groups.date <= to);
    })
    .sort((a, b) => String(a.path).localeCompare(String(b.path)));
}

export function mergeWorkoutEntries(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const entry of Array.isArray(list) ? list : []) {
      if (entry?.path) map.set(entry.path, entry);
    }
  }
  return [...map.values()];
}

export function workoutWindowBounds(today, { weeks = WORKOUT_COMPARE_WEEKS } = {}) {
  if (!isCalendarDate(today) || !Number.isInteger(weeks) || weeks < 1) return null;
  const currentTo = today;
  const currentFrom = addCalendarDays(today, -(weeks * 7 - 1));
  const previousTo = addCalendarDays(currentFrom, -1);
  const previousFrom = addCalendarDays(previousTo, -(weeks * 7 - 1));
  return { weeks, currentFrom, currentTo, previousFrom, previousTo };
}

function completedWorkouts(records) {
  return (Array.isArray(records) ? records : []).filter(record =>
    record?.type === 'workout'
    && record.status === 'completed'
    && isCalendarDate(record.date)
  );
}

export function compareWorkoutWindows(records, today, { weeks = WORKOUT_COMPARE_WEEKS } = {}) {
  const bounds = workoutWindowBounds(today, { weeks });
  if (!bounds) return { ok: false, error: 'invalid_input' };
  const sessions = completedWorkouts(records);
  const countIn = (from, to) => sessions.filter(record => record.date >= from && record.date <= to).length;
  const currentCount = countIn(bounds.currentFrom, bounds.currentTo);
  const previousCount = countIn(bounds.previousFrom, bounds.previousTo);
  return {
    ok: true,
    weeks: bounds.weeks,
    current: { from: bounds.currentFrom, to: bounds.currentTo, count: currentCount },
    previous: { from: bounds.previousFrom, to: bounds.previousTo, count: previousCount },
    delta: currentCount - previousCount
  };
}

export function formatWorkoutWindowCompareForPrompt(comparison) {
  if (!comparison?.ok) return '';
  const { weeks, current, previous, delta } = comparison;
  const signed = delta > 0 ? `+${delta}` : String(delta);
  const currentLabel = current.count === 1 ? '1 completed workout' : `${current.count} completed workouts`;
  const previousLabel = previous.count === 1 ? '1 completed workout' : `${previous.count} completed workouts`;
  return [
    `Computed training volume (do not re-count or estimate — this is the number):`,
    `Last ${weeks} weeks (${current.from} to ${current.to}): ${currentLabel}.`,
    `Previous ${weeks} weeks (${previous.from} to ${previous.to}): ${previousLabel}.`,
    `Delta: ${signed}.`
  ].join('\n');
}

export function lastCompletedWorkout(records) {
  return (Array.isArray(records) ? records : [])
    .filter(record => record?.type === 'workout' && record.status === 'completed' && record.date)
    .slice()
    .sort((a, b) => {
      const dateCmp = String(b.date).localeCompare(String(a.date));
      if (dateCmp !== 0) return dateCmp;
      return String(b.time ?? '').localeCompare(String(a.time ?? ''));
    })[0] ?? null;
}

export function daysSinceLastCompletedWorkout(records, today) {
  const last = lastCompletedWorkout(records);
  if (!last?.date) return null;
  return daysBetween(last.date, today);
}

export function combineSessionAdherenceDays(fromRecords, fromLibrary) {
  const known = [fromRecords, fromLibrary].filter(value => typeof value === 'number');
  return known.length ? Math.min(...known) : null;
}

function summarizeExercises(exercises) {
  return collapseSetSplitExercises(exercises)
    .map(exercise => {
      const setCount = Array.isArray(exercise.sets) ? exercise.sets.length : 0;
      return setCount > 0 ? `${exercise.name} (${setCount} set${setCount === 1 ? '' : 's'})` : exercise.name;
    })
    .filter(Boolean);
}

/** Session notes live in the markdown body, not YAML — attach body onto the record for prompt/tools. */
export function attachWorkoutNotes(record, body) {
  if (!record || typeof record !== 'object') return record;
  const notes = typeof body === 'string' ? body.trim() : '';
  if (!notes) return record;
  return { ...record, notes };
}

function compactNote(text, max = 120) {
  const cleaned = String(text).trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned.length > max ? `${cleaned.slice(0, max - 3)}...` : cleaned;
}

function formatPainFlags(flags) {
  if (!Array.isArray(flags) || flags.length === 0) return '';
  const parts = [];
  for (const flag of flags) {
    if (!flag || typeof flag !== 'object') continue;
    const site = typeof flag.site === 'string' ? flag.site.trim() : '';
    if (!site) continue;
    const note = typeof flag.note === 'string' && flag.note.trim()
      ? `${site}: ${flag.note.trim().replace(/\s+/g, ' ')}`
      : site;
    parts.push(note);
  }
  return parts.length ? `pain: ${parts.join('; ')}` : '';
}

function sortSessionsNewestFirst(records) {
  return records.slice().sort((a, b) => {
    const dateCmp = String(b.date).localeCompare(String(a.date));
    if (dateCmp !== 0) return dateCmp;
    return String(b.time ?? '').localeCompare(String(a.time ?? ''));
  });
}

function sessionPromptLine(record) {
  const moves = summarizeExercises(record.exercises);
  const moveBit = moves.length ? ` — ${moves.join(', ')}` : '';
  const title = record.title || 'Untitled session';
  const noteText = typeof record.notes === 'string' ? compactNote(record.notes) : '';
  const noteBit = noteText ? ` — notes: ${noteText}` : '';
  const painBit = formatPainFlags(record.pain_flags);
  const painSuffix = painBit ? ` — ${painBit}` : '';
  return `${record.date} · ${title}${moveBit}${noteBit}${painSuffix}`;
}

export function formatRecentWorkoutsForPrompt(records) {
  if (!Array.isArray(records) || records.length === 0) return '';
  const workouts = records.filter(record => record?.type === 'workout' && record.date);
  const completed = sortSessionsNewestFirst(workouts.filter(record => record.status === 'completed'));
  const planned = sortSessionsNewestFirst(workouts.filter(record => record.status === 'planned'));
  const lines = [];
  if (completed[0]) {
    lines.push(`- Last completed: ${sessionPromptLine(completed[0])}`);
    for (const extra of completed.slice(1, 4)) {
      lines.push(`- Completed: ${sessionPromptLine(extra)}`);
    }
  }
  for (const plan of planned.slice(0, 3)) {
    lines.push(`- Planned (not yet trained): ${sessionPromptLine(plan)}`);
  }
  return lines.join('\n');
}

function formatSession(record) {
  const collapsed = collapseSetSplitExercises(record.exercises);
  return {
    date: record.date,
    time: record.time,
    title: record.title,
    status: record.status,
    session_kind: record.session_kind,
    day_type: record.day_type,
    duration_min: record.duration_min,
    focus: record.focus,
    notes: record.notes,
    pain_flags: Array.isArray(record.pain_flags) ? record.pain_flags : [],
    exercises: collapsed.map(exercise => ({
      name: exercise.name,
      sets: exercise.sets,
      ...(exercise.bench_angle_deg != null ? { bench_angle_deg: exercise.bench_angle_deg } : {}),
      ...(exercise.intensification != null ? { intensification: exercise.intensification } : {}),
      ...(exercise.equipment != null ? { equipment: exercise.equipment } : {}),
      ...(exercise.coach_cues != null ? { coach_cues: exercise.coach_cues } : {}),
      ...(exercise.superset_group != null ? { superset_group: exercise.superset_group } : {}),
      ...(exercise.between_sets != null ? { between_sets: exercise.between_sets } : {})
    }))
  };
}

export function getLastWorkout(records) {
  const last = lastCompletedWorkout(records);
  if (!last) {
    return { ok: true, found: false, store: 'life_hub_fitness' };
  }
  return {
    ok: true,
    found: true,
    store: 'life_hub_fitness',
    session: formatSession(last)
  };
}

function queryTokens(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

function sessionHaystack(record) {
  const collapsed = collapseSetSplitExercises(record.exercises);
  const painBits = Array.isArray(record.pain_flags)
    ? record.pain_flags.flatMap(flag => {
      if (!flag || typeof flag !== 'object') return [];
      return [flag.site, flag.note].filter(Boolean);
    })
    : [];
  return [
    record.title,
    record.date,
    record.status,
    record.session_kind,
    record.day_type,
    record.notes,
    ...painBits,
    ...(Array.isArray(record.focus) ? record.focus : []),
    ...collapsed.map(exercise => exercise.name)
  ].filter(Boolean).join(' ').toLowerCase();
}

export function searchWorkoutRecords(records, { query, limit = DEFAULT_SEARCH_LIMIT } = {}) {
  const tokens = queryTokens(query);
  if (!tokens.length) {
    return { ok: false, error: 'empty_query' };
  }
  const cap = Math.min(Math.max(Number(limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const hits = (records ?? [])
    .filter(record => record?.type === 'workout')
    .map(record => {
      const haystack = sessionHaystack(record);
      const matched = tokens.filter(token => haystack.includes(token));
      return { record, score: matched.length };
    })
    .filter(row => row.score === tokens.length)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.record.date ?? '').localeCompare(String(a.record.date ?? ''));
    })
    .slice(0, cap)
    .map(({ record, score }) => ({
      date: record.date,
      title: record.title,
      status: record.status,
      session_kind: record.session_kind,
      day_type: record.day_type,
      duration_min: record.duration_min,
      focus: record.focus,
      notes: typeof record.notes === 'string' && record.notes.trim() ? record.notes.trim() : undefined,
      pain_flags: Array.isArray(record.pain_flags) && record.pain_flags.length
        ? record.pain_flags
        : undefined,
      exercises: summarizeExercises(record.exercises),
      score
    }));

  return {
    ok: true,
    store: 'life_hub_fitness',
    query,
    count: hits.length,
    results: hits
  };
}

export function getLastWorkoutSchema() {
  return {
    name: 'get_last_workout',
    description:
      'Read Adam\'s most recent completed workout from the recent fitness files already loaded this turn (not full history). Use whenever he asks when he last trained, what that session was, what he lifted, how it felt, or any pain flags. Returns title, date, notes, pain_flags, and collapsed exercises with sets.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  };
}

export function searchWorkoutRecordsSchema() {
  return {
    name: 'search_workout_records',
    description:
      'Search the recent workout files loaded this turn (not full history) by title, date, focus, exercise name, session notes, or pain flag site/note. Use when Adam asks about a past session in that window. Words are ANDed.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text; words are ANDed.' },
        limit: { type: 'number', description: 'Max results (default 8, max 20).' }
      },
      required: ['query']
    }
  };
}

export function compareWorkoutWindowsSchema() {
  return {
    name: 'compare_workout_windows',
    description:
      'Return the computed count of completed workouts in the last 8 weeks versus the previous 8 weeks. Use this (or the Computed training volume prompt block) whenever Adam asks how much he has been training versus the prior block. Do not estimate from Recent sessions lines.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  };
}
