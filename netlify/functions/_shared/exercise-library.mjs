import { formatLogDate } from '../../../apps/life/js/core/central-node-write.js';
import { addCalendarDays, daysBetween } from '../../../apps/life/js/core/time.js';
import { collapseSetSplitExercises } from './workout-history.mjs';
import {
  COUNTS_AS,
  DIFFICULTIES,
  TRACKING_TYPES,
  bestSetPerformance,
  performanceUnit,
  resolveTrackingType
} from '../../../apps/life/js/core/exercise-tracking.js';

export const EXERCISE_LIBRARY_PATH = 'data/exercise-library.json';

const CABLE_TYPES = ['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing', 'none'];
const MAX_HIGHLIGHTS = 20;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 25;
export const MAX_LIBRARY_BATCH = 15;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function boundedString(value, max) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

export function parseExerciseLibrary(content) {
  if (typeof content !== 'string') return [];
  let parsed;
  try { parsed = JSON.parse(content); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.name === 'string');
}

export function validateExerciseLibraryEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.name !== 'string' || input.name.trim() === '') return null;

  const entry = { name: input.name.trim() };
  if (typeof input.target_area === 'string' && input.target_area.trim()) {
    entry.target_area = input.target_area.trim();
  }

  const equipment = normalizeStringList(input.equipment);
  if (equipment) entry.equipment = equipment;
  const focus = normalizeStringList(input.focus_areas);
  if (focus) entry.focus_areas = focus;

  if (typeof input.setup_cues === 'string' && input.setup_cues.trim()) entry.setup_cues = input.setup_cues.trim();
  if (typeof input.attachment === 'string' && input.attachment.trim()) entry.attachment = input.attachment.trim();
  if (typeof input.movement_pattern === 'string' && input.movement_pattern.trim()) {
    entry.movement_pattern = input.movement_pattern.trim();
  }
  if (typeof input.demo_link === 'string' && input.demo_link.trim()) entry.demo_link = input.demo_link.trim();

  // What a learned move is: which muscles it hits, how hard it is, how it is
  // measured, and where the idea came from. Chadwick fills these when he
  // researches a move so the next session can use it without re-researching.
  for (const field of ['primary_muscles', 'secondary_muscles', 'progressions', 'regressions']) {
    const list = normalizeStringList(input[field]);
    if (list) entry[field] = list.slice(0, 12);
  }
  if (input.difficulty != null) {
    if (!DIFFICULTIES.includes(input.difficulty)) return null;
    entry.difficulty = input.difficulty;
  }
  if (input.tracking_type != null) {
    if (!TRACKING_TYPES.includes(input.tracking_type)) return null;
    entry.tracking_type = input.tracking_type;
  }
  if (input.counts_as != null) {
    if (!COUNTS_AS.includes(input.counts_as)) return null;
    entry.counts_as = input.counts_as;
  }
  const textFields = {
    safety_notes: 300,
    aeke_translation: 400,
    source_title: 200,
    source_url: 500,
    source_program: 160
  };
  for (const [field, max] of Object.entries(textFields)) {
    const value = boundedString(input[field], max);
    if (value) entry[field] = value;
  }
  if (input.learned_on != null) {
    if (typeof input.learned_on !== 'string' || !DATE_RE.test(input.learned_on)) return null;
    entry.learned_on = input.learned_on;
  }

  if (input.in_rotation != null) {
    if (typeof input.in_rotation !== 'boolean') return null;
    entry.in_rotation = input.in_rotation;
  }

  for (const field of [
    'default_sets',
    'default_reps',
    'working_weight_kg',
    'best_weight_kg',
    'default_bench_angle_deg',
    'default_duration_sec',
    'default_time_cap_sec',
    'best_reps',
    'best_duration_sec',
    'best_reps_in_time',
    'best_time_cap_sec'
  ]) {
    if (input[field] == null) continue;
    if (typeof input[field] !== 'number' || !Number.isFinite(input[field])) return null;
    entry[field] = input[field];
  }

  if (input.default_cable_type != null) {
    if (!CABLE_TYPES.includes(input.default_cable_type)) return null;
    entry.default_cable_type = input.default_cable_type;
  }

  if (input.last_performed != null) {
    if (typeof input.last_performed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.last_performed)) return null;
    entry.last_performed = input.last_performed;
  }

  // Shelving is how "Adam said he's over this move" becomes a durable fact instead
  // of something only the current chat turn remembers -- see isExerciseShelved and
  // selectExerciseHighlights below, which keep a shelved move out of what Chadwick
  // is shown until the date passes.
  if (input.clear_shelved === true) {
    entry.shelved_until = null;
    entry.shelved_reason = null;
  } else if (input.shelved_until != null) {
    if (typeof input.shelved_until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.shelved_until)) return null;
    entry.shelved_until = input.shelved_until;
    if (typeof input.shelved_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.shelved_on)) {
      entry.shelved_on = input.shelved_on;
    }
    if (typeof input.shelved_reason === 'string' && input.shelved_reason.trim()) {
      entry.shelved_reason = input.shelved_reason.trim().slice(0, 200);
    }
  }

  return entry;
}

/**
 * True while an entry's shelved_until date hasn't passed yet. Without `today`
 * (a caller that hasn't got a date on hand) nothing is treated as shelved --
 * callers that care about shelving must pass today's date explicitly.
 */
export function isExerciseShelved(entry, today) {
  if (!entry || typeof entry.shelved_until !== 'string' || !today) return false;
  return entry.shelved_until >= today;
}

const DURATION_NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function restrictionDurationDays(notes) {
  const match = String(notes).match(
    /(?:for|at least)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(day|week|month)s?/i,
  );
  if (!match) return 21;
  const raw = match[1].toLowerCase();
  const value = /^\d+$/.test(raw) ? Number(raw) : DURATION_NUMBER_WORDS[raw];
  const amount = Math.min(Math.max(value || 1, 1), 365);
  if (match[2].toLowerCase() === 'week') return amount * 7;
  if (match[2].toLowerCase() === 'month') return amount * 30;
  return amount;
}

/**
 * Turn explicit post-workout boredom / exclusion notes into durable exercise shelves.
 * This is deterministic because Fitness notes are written without a Chadwick chat turn.
 */
export function applyWorkoutNoteRestrictionsToLibrary(entries, record, notes, today, updatedAt) {
  const text = typeof notes === 'string' ? notes.trim() : '';
  if (!text || !today || !/(do not|don't|dont|stop|avoid|sick of|bored of|over this|retire|shelve)/i.test(text)) {
    return { entries: Array.isArray(entries) ? entries.slice() : [], restrictions: [] };
  }

  const exercises = collapseSetSplitExercises(record?.exercises ?? []);
  const lower = text.toLowerCase();
  let targets = exercises.filter(exercise => lower.includes(String(exercise.name ?? '').trim().toLowerCase()));
  if (
    targets.length === 0
    && exercises.length === 1
    && /\b(this|that)\s+(exercise|move)\b/i.test(text)
  ) {
    targets = exercises;
  }
  const shelvesWorkout = /\b(this|that|same)\s+workout\b/i.test(text) && typeof record?.title === 'string';
  if (targets.length === 0 && !shelvesWorkout) {
    return { entries: Array.isArray(entries) ? entries.slice() : [], restrictions: [] };
  }

  const shelvedUntil = addCalendarDays(today, restrictionDurationDays(text));
  let next = Array.isArray(entries) ? entries.slice() : [];
  const restrictions = [];
  if (shelvesWorkout) {
    const name = `Workout: ${record.title.trim()}`;
    next = upsertExerciseLibraryEntry(next, {
      name,
      target_area: 'workout',
      entry_kind: 'workout',
      shelved_on: today,
      shelved_until: shelvedUntil,
      shelved_reason: text.replace(/\s+/g, ' ').slice(0, 200)
    }, updatedAt);
    restrictions.push({ name, shelved_on: today, shelved_until: shelvedUntil });
  }
  for (const exercise of targets) {
    const name = String(exercise.name ?? '').trim();
    if (!name) continue;
    next = upsertExerciseLibraryEntry(next, {
      name,
      shelved_on: today,
      shelved_until: shelvedUntil,
      shelved_reason: text.replace(/\s+/g, ' ').slice(0, 200)
    }, updatedAt);
    restrictions.push({ name, shelved_on: today, shelved_until: shelvedUntil });
  }
  return { entries: next, restrictions };
}

/**
 * Blocking guardrail used before a workout proposal is shown. Active exercise and
 * named workout shelves must be cleared or allowed to expire before reuse.
 */
export function shelvedExerciseWarnings(record, entries, today) {
  if (!record || record.type !== 'workout' || !Array.isArray(record.exercises)) return [];
  if (!Array.isArray(entries) || !today) return [];
  const shelvedByKey = new Map();
  for (const entry of entries) {
    if (isExerciseShelved(entry, today)) shelvedByKey.set(libraryKey(entry), entry);
  }
  if (shelvedByKey.size === 0) return [];
  const warnings = [];
  const workoutShelf = shelvedByKey.get(libraryKey({ name: `Workout: ${record.title ?? ''}` }));
  if (workoutShelf) {
    const reason = workoutShelf.shelved_reason ? ` (${workoutShelf.shelved_reason})` : '';
    warnings.push(`"${record.title}" is shelved until ${workoutShelf.shelved_until}${reason} — Adam asked not to repeat this workout.`);
  }
  for (const exercise of record.exercises) {
    const shelved = shelvedByKey.get(libraryKey({ name: exercise?.name }));
    if (!shelved) continue;
    const reason = shelved.shelved_reason ? ` (${shelved.shelved_reason})` : '';
    warnings.push(`"${shelved.name}" is shelved until ${shelved.shelved_until}${reason} — Adam asked to skip it.`);
  }
  return warnings;
}

export function upsertExerciseLibraryEntry(entries, entry, updatedAt) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  const key = libraryKey(entry);
  const index = list.findIndex(existing => libraryKey(existing) === key);
  // Merge rather than replace -- a partial update (e.g. shelving a move, or
  // flipping in_rotation) must not silently wipe last_performed/best_weight_kg/
  // times_performed that this same call didn't mention.
  if (index === -1) {
    list.push({ target_area: 'unspecified', ...entry, updated_at: updatedAt });
  } else {
    list[index] = { ...list[index], ...entry, updated_at: updatedAt };
  }
  return list;
}

/**
 * Close the progression loop: upsert per-exercise last_performed / times_performed /
 * working_weight_kg / best_weight_kg from a confirmed completed workout.
 *
 * Upserts per-exercise last_performed / working_weight / best_weight from a confirmed
 * completed workout. Unknown names get a stub library row (target_area: unspecified)
 * so progression and rotation checks still see them. Session pain_flags land on
 * last_pain so Chadwick does not blindly push load on a just-flagged move.
 *
 * Returns { entries, pbs } where pbs lists exercises that set a genuine new best
 * (strictly beat the prior best_weight_kg; a first-ever performance or a tied best
 * is not a PB, just an initial/unchanged reading).
 */
function summarizeSessionPain(record) {
  if (!Array.isArray(record?.pain_flags) || record.pain_flags.length === 0) return null;
  const bits = [];
  for (const flag of record.pain_flags) {
    if (!flag || typeof flag !== 'object') continue;
    const site = typeof flag.site === 'string' ? flag.site.trim() : '';
    if (!site) continue;
    const note = typeof flag.note === 'string' && flag.note.trim() ? flag.note.trim() : '';
    bits.push(note ? `${site}: ${note}` : site);
  }
  if (bits.length === 0) return null;
  const compact = bits.join('; ');
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

const BEST_FIELD = {
  bodyweight_reps: 'best_reps',
  timed: 'best_duration_sec',
  reps_in_time: 'best_reps_in_time'
};

const LAST_FIELD = {
  bodyweight_reps: 'last_reps',
  timed: 'last_duration_sec',
  reps_in_time: 'last_reps_in_time'
};

/**
 * Bodyweight / timed / reps-in-time progress: best reps, longest hold, or most
 * reps in the same window. A reps-in-time best only counts as a PB against the
 * same time_cap_sec — 30 push-ups in 60 s is not a PB over 25 in 30 s.
 */
function applyNonWeightedProgress(existing, exercise, tracking) {
  const performance = bestSetPerformance(exercise.sets, tracking);
  if (!performance) return { patch: {}, pb: null };
  const bestField = BEST_FIELD[tracking];
  const patch = { [LAST_FIELD[tracking]]: performance.value };
  let pb = null;
  const cap = tracking === 'reps_in_time' ? Number(performance.set.time_cap_sec) : null;
  if (cap) patch.last_time_cap_sec = cap;
  const hasBest = typeof existing?.[bestField] === 'number';
  const sameWindow = tracking !== 'reps_in_time' || existing?.best_time_cap_sec === cap;
  // A different window is a different test: keep the standing best untouched.
  if (hasBest && !sameWindow) return { patch, pb: null };
  const previous = hasBest ? existing[bestField] : null;
  if (previous == null) {
    patch[bestField] = performance.value;
    if (cap) patch.best_time_cap_sec = cap;
  } else if (performance.value > previous) {
    patch[bestField] = performance.value;
    pb = {
      name: existing.name,
      tracking_type: tracking,
      best_value: performance.value,
      previous_best_value: previous,
      unit: performanceUnit(tracking),
      ...(cap ? { time_cap_sec: cap } : {})
    };
  }
  return { patch, pb };
}

export function applyCompletedWorkoutToLibrary(entries, record, updatedAt) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  const pbs = [];
  if (!record || !Array.isArray(record.exercises)) return { entries: list, pbs };
  const sessionDate = typeof record.date === 'string' ? record.date : undefined;
  const sessionPain = summarizeSessionPain(record);
  const exercises = collapseSetSplitExercises(record.exercises);

  for (const exercise of exercises) {
    const name = typeof exercise?.name === 'string' ? exercise.name.trim() : '';
    if (!name) continue;
    const key = libraryKey({ name });
    const index = list.findIndex(existing => libraryKey(existing) === key);
    const existing = index === -1 ? null : list[index];
    const tracking = resolveTrackingType(exercise, existing);

    if (tracking !== 'weighted') {
      const { patch, pb } = applyNonWeightedProgress(existing ?? { name }, exercise, tracking);
      if (Object.keys(patch).length === 0 && !existing) continue;
      const timesPerformed = (typeof existing?.times_performed === 'number' ? existing.times_performed : 0) + 1;
      const next = {
        ...(existing ?? { name, target_area: 'unspecified', in_rotation: false }),
        // Learn the tracking type invisibly from how the move was logged.
        ...(existing?.tracking_type ? {} : { tracking_type: tracking }),
        ...patch,
        last_performed: sessionDate ?? existing?.last_performed,
        times_performed: timesPerformed,
        ...(sessionPain ? { last_pain: sessionPain } : existing ? { last_pain: null } : {}),
        updated_at: updatedAt
      };
      if (index === -1) list.push(next);
      else list[index] = next;
      if (pb) pbs.push(pb);
      continue;
    }

    const weights = (Array.isArray(exercise.sets) ? exercise.sets : [])
      .map(set => set?.weight_kg)
      .filter(weight => typeof weight === 'number' && Number.isFinite(weight));
    if (weights.length === 0) continue;
    const sessionMax = Math.max(...weights);

    // New moves must still close the progression loop — seed a stub row rather than skipping.
    if (index === -1) {
      list.push({
        name,
        target_area: 'unspecified',
        last_performed: sessionDate,
        times_performed: 1,
        working_weight_kg: sessionMax,
        best_weight_kg: sessionMax,
        in_rotation: false,
        ...(sessionPain ? { last_pain: sessionPain } : {}),
        updated_at: updatedAt
      });
      continue;
    }

    const hadBest = typeof existing.best_weight_kg === 'number';
    const previousBest = hadBest ? existing.best_weight_kg : null;
    const nextBest = hadBest ? Math.max(previousBest, sessionMax) : sessionMax;
    const isNewBest = hadBest && sessionMax > previousBest;
    const timesPerformed = (typeof existing.times_performed === 'number' ? existing.times_performed : 0) + 1;

    list[index] = {
      ...existing,
      last_performed: sessionDate ?? existing.last_performed,
      times_performed: timesPerformed,
      working_weight_kg: sessionMax,
      best_weight_kg: nextBest,
      ...(sessionPain ? { last_pain: sessionPain } : { last_pain: null }),
      updated_at: updatedAt
    };

    if (isNewBest) {
      pbs.push({ name: existing.name, best_weight_kg: nextBest, previous_best_weight_kg: previousBest });
    }
  }

  return { entries: list, pbs };
}

/**
 * Adherence signal for Phase 4b, at zero extra cost: every completed session's exercises
 * get last_performed set to the session date (Phase 1), so the max across the whole
 * library is exactly the date of the most recent completed session -- no extra blob
 * reads needed beyond the exercise library Chadwick already loads every turn.
 */
export function daysSinceLastSession(entries, today) {
  if (!Array.isArray(entries)) return null;
  const lastPerformedDates = entries
    .map(entry => entry?.last_performed)
    .filter(value => typeof value === 'string' && value);
  if (lastPerformedDates.length === 0) return null;
  const mostRecent = lastPerformedDates.sort().at(-1);
  return daysBetween(mostRecent, today);
}

export function selectExerciseHighlights(entries, limit = MAX_HIGHLIGHTS, today = null) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const eligible = entries.filter(e => !isExerciseShelved(e, today));
  return eligible
    .slice()
    .sort((a, b) => compareVarietyFirst(a, b))
    .slice(0, limit);
}

export function searchExerciseLibrary(entries, {
  query,
  target_area,
  in_rotation,
  tracking_type,
  difficulty,
  limit = DEFAULT_SEARCH_LIMIT
} = {}) {
  if (!Array.isArray(entries)) return [];
  const hasFilter = [target_area, in_rotation, tracking_type, difficulty].some(value => value != null);
  if ((typeof query !== 'string' || query.trim() === '') && !hasFilter) return [];
  const text = typeof query === 'string' ? query : '';
  const tokens = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const capped = Math.min(Math.max(Number(limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);

  return entries.filter(entry => {
    if (target_area != null && String(entry.target_area).toLowerCase() !== String(target_area).toLowerCase()) {
      return false;
    }
    if (in_rotation != null && Boolean(entry.in_rotation) !== Boolean(in_rotation)) return false;
    if (tracking_type != null && (entry.tracking_type ?? 'weighted') !== tracking_type) return false;
    if (difficulty != null && entry.difficulty !== difficulty) return false;
    const haystack = [
      entry.name,
      entry.target_area,
      ...(entry.equipment ?? []),
      ...(entry.focus_areas ?? []),
      ...(entry.primary_muscles ?? []),
      ...(entry.secondary_muscles ?? []),
      entry.movement_pattern ?? '',
      entry.source_program ?? '',
      entry.tracking_type ?? '',
      entry.setup_cues ?? ''
    ].join(' ').toLowerCase();
    return tokens.every(token => haystack.includes(token));
  }).slice(0, capped);
}

export function formatExerciseLibraryForPrompt(entries, today = null) {
  const highlights = selectExerciseHighlights(entries, MAX_HIGHLIGHTS, today);
  const shelved = Array.isArray(entries) ? entries.filter(e => isExerciseShelved(e, today)) : [];
  if (highlights.length === 0 && shelved.length === 0) return '';
  const lines = highlights.map(entry => {
    const equipment = Array.isArray(entry.equipment) ? entry.equipment.join(', ') : '';
    const weight = typeof entry.working_weight_kg === 'number' ? `${entry.working_weight_kg} kg` : '';
    const rotation = entry.in_rotation ? 'in rotation' : '';
    // Per-exercise progress so Chadwick programs from what actually happened last time,
    // not a blank slate -- last actual weight, the PB it's chasing, and how often it's run.
    const lastPerformed = typeof entry.last_performed === 'string' ? `last ${formatLogDate(entry.last_performed)}` : '';
    const best = typeof entry.best_weight_kg === 'number' ? `PB ${entry.best_weight_kg} kg` : '';
    const frequency = typeof entry.times_performed === 'number' ? `${entry.times_performed}x logged` : '';
    const pain = typeof entry.last_pain === 'string' && entry.last_pain.trim()
      ? `pain ${entry.last_pain.trim()}`
      : '';
    const tracking = entry.tracking_type && entry.tracking_type !== 'weighted'
      ? entry.tracking_type.replaceAll('_', ' ')
      : '';
    const muscles = Array.isArray(entry.primary_muscles) ? entry.primary_muscles.join('/') : '';
    const bestOther = typeof entry.best_duration_sec === 'number'
      ? `best hold ${entry.best_duration_sec} s`
      : typeof entry.best_reps_in_time === 'number'
        ? `best ${entry.best_reps_in_time} reps in ${entry.best_time_cap_sec ?? '?'} s`
        : typeof entry.best_reps === 'number' ? `best ${entry.best_reps} reps` : '';
    const bits = [
      entry.target_area,
      muscles,
      tracking,
      entry.difficulty,
      equipment,
      weight,
      lastPerformed,
      best,
      bestOther,
      frequency,
      rotation,
      pain,
      entry.source_program ? `from ${entry.source_program}` : ''
    ].filter(Boolean).join(' · ');
    return `- ${entry.name} — ${bits}`;
  });
  if (shelved.length) {
    const list = shelved.map(entry => {
      const reason = entry.shelved_reason ? `, ${entry.shelved_reason}` : '';
      const start = entry.shelved_on ? `shelved ${entry.shelved_on}, ` : '';
      const remaining = daysBetween(today, entry.shelved_until);
      return `${entry.name} (${start}until ${entry.shelved_until}, ${remaining} day${remaining === 1 ? '' : 's'} remaining${reason})`;
    }).join('; ');
    lines.push(`Shelved — do not program these until the date listed unless Adam explicitly asks for one back: ${list}`);
  }
  return lines.join('\n');
}

export function exerciseLibraryEntryFromCsvRow(row) {
  if (!row || typeof row !== 'object') return null;
  const get = (...keys) => {
    for (const key of keys) {
      if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim();
      const bom = `\ufeff${key}`;
      if (row[bom] != null && String(row[bom]).trim() !== '') return String(row[bom]).trim();
    }
    return '';
  };

  const name = get('Exercise');
  const target = get('Target area');
  if (!name || !target) return null;

  const input = {
    name,
    target_area: target,
    equipment: get('Equipment') || undefined,
    focus_areas: get('Focus areas') || undefined,
    setup_cues: get('Setup & cues') || undefined,
    in_rotation: /^yes$/i.test(get('In rotation')),
    movement_pattern: get('Movement pattern') || undefined,
    demo_link: get('Demo link') || undefined
  };

  const best = Number(get('Best weight kg'));
  if (Number.isFinite(best) && get('Best weight kg') !== '') input.best_weight_kg = best;
  const working = Number(get('Current working weight kg'));
  if (Number.isFinite(working) && get('Current working weight kg') !== '') input.working_weight_kg = working;
  const reps = Number(get('Default reps'));
  if (Number.isFinite(reps) && get('Default reps') !== '') input.default_reps = reps;
  const sets = Number(get('Default sets'));
  if (Number.isFinite(sets) && get('Default sets') !== '') input.default_sets = sets;

  const last = parseNotionDate(get('Last performed'));
  if (last) input.last_performed = last;

  return validateExerciseLibraryEntry(input);
}

export function searchExerciseLibrarySchema() {
  return {
    name: 'search_exercise_library',
    description: 'Search Adam\'s Exercise Library by name, target area, muscles, movement pattern, source program, equipment, or setup cues. Filter by tracking_type (e.g. timed for holds/yoga) or difficulty. Use before inventing a move or guessing attachment/cable/bench defaults. Pass query "" with a filter to list by filter alone.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text; tokens are ANDed' },
        target_area: { type: 'string' },
        in_rotation: { type: 'boolean' },
        tracking_type: { type: 'string', enum: TRACKING_TYPES },
        difficulty: { type: 'string', enum: DIFFICULTIES },
        limit: { type: 'number', description: 'Max results (default 10, max 25)' }
      },
      required: ['query']
    }
  };
}

function exerciseLibraryEntryProperties() {
  return {
    name: { type: 'string' },
    target_area: { type: 'string', description: 'Main region, e.g. chest, back, shoulders, arms, core, legs, full body, mobility.' },
    primary_muscles: { type: 'array', items: { type: 'string' }, description: 'Muscles the move mainly trains, e.g. ["upper chest", "front delts"].' },
    secondary_muscles: { type: 'array', items: { type: 'string' } },
    difficulty: { type: 'string', enum: DIFFICULTIES, description: 'For Adam, on AEKE, today — not for an elite athlete.' },
    tracking_type: {
      type: 'string',
      enum: TRACKING_TYPES,
      description: 'How sets are measured. weighted = kg × reps (K1 cable work, default). bodyweight_reps = reps with bodyweight (push-ups). timed = held or done for seconds (plank, yoga pose). reps_in_time = max reps in a fixed window (push-ups in 60 s).'
    },
    counts_as: { type: 'string', enum: COUNTS_AS, description: 'What the work counts toward. Defaults from tracking_type.' },
    equipment: { type: 'array', items: { type: 'string' } },
    focus_areas: { type: 'array', items: { type: 'string' } },
    setup_cues: { type: 'string' },
    movement_pattern: { type: 'string', description: 'e.g. horizontal push, vertical pull, hinge, squat, carry, rotation, hip opener.' },
    progressions: { type: 'array', items: { type: 'string' }, description: 'Harder variations, in order.' },
    regressions: { type: 'array', items: { type: 'string' }, description: 'Easier variations, in order.' },
    safety_notes: { type: 'string', description: 'Knees / lower back / AC joint limits for Adam.' },
    aeke_translation: { type: 'string', description: 'How the original move is done on the AEKE K1 (or why it stays bodyweight).' },
    source_title: { type: 'string', description: 'Where you learned it, e.g. the article or program name.' },
    source_url: { type: 'string' },
    source_program: { type: 'string', description: 'Program it came from, e.g. "Tom Holland Spider-Man: Brand New Day".' },
    in_rotation: { type: 'boolean' },
    default_sets: { type: 'number' },
    default_reps: { type: 'number' },
    default_duration_sec: { type: 'number', description: 'timed moves: starting hold in seconds.' },
    default_time_cap_sec: { type: 'number', description: 'reps_in_time moves: the window in seconds.' },
    working_weight_kg: { type: 'number' },
    best_weight_kg: { type: 'number' },
    attachment: { type: 'string' },
    default_cable_type: { type: 'string', enum: CABLE_TYPES },
    default_bench_angle_deg: { type: 'number' },
    demo_link: { type: 'string' },
    last_performed: { type: 'string', description: 'YYYY-MM-DD' },
    shelved_until: { type: 'string', description: 'YYYY-MM-DD. Set when Adam says he is over this move / wants a break from it -- excludes it from highlights and proposals until this date.' },
    shelved_reason: { type: 'string', description: 'Short reason, e.g. "Adam said he is bored of it" or "front shoulder was cranky on this".' },
    clear_shelved: { type: 'boolean', description: 'Set true to lift a shelve early, e.g. Adam explicitly asks for the move back.' }
  };
}

export function saveExerciseLibraryEntrySchema() {
  const properties = exerciseLibraryEntryProperties();
  return {
    name: 'save_exercise_library_entry',
    description: `Create or update Exercise Library entries (what a move trains, difficulty, how it is measured, cues, defaults, rotation, source). Pass one move as top-level fields, or up to ${MAX_LIBRARY_BATCH} moves at once in entries[] — use entries[] when you have researched several moves (e.g. a whole program) so they save in one write. Updates merge: only send the fields you are changing. Also the durable way to shelve a move Adam is over: set shelved_until (and shelved_reason) the same turn he says it, whether that comes up in chat or in a workout note -- do not just acknowledge it and move on. It stays out of the highlight list and off proposals until that date. Pass clear_shelved: true to bring a shelved move back early if Adam explicitly asks for it.`,
    input_schema: {
      type: 'object',
      properties: {
        ...properties,
        entries: {
          type: 'array',
          description: `Several moves in one save (max ${MAX_LIBRARY_BATCH}). Each item takes the same fields as a single entry.`,
          items: { type: 'object', properties, required: ['name'] }
        }
      }
    }
  };
}

/**
 * One tool call → list of validated entries. A new move learned from a source
 * gets learned_on today so Chadwick can tell fresh research from old rows.
 * Returns { entries, rejected } — a bad item never blocks the good ones.
 */
export function validateExerciseLibraryBatch(input, { today = null, existing = [] } = {}) {
  const raw = Array.isArray(input?.entries) && input.entries.length
    ? input.entries.slice(0, MAX_LIBRARY_BATCH)
    : [input];
  const known = new Set((Array.isArray(existing) ? existing : []).map(libraryKey));
  const entries = [];
  const rejected = [];
  for (const item of raw) {
    const withDates = item && typeof item === 'object' && today
      ? {
        ...item,
        ...(item.shelved_until && !item.shelved_on ? { shelved_on: today } : {}),
        ...(!item.learned_on && (item.source_title || item.source_url || item.source_program) && !known.has(libraryKey(item))
          ? { learned_on: today }
          : {})
      }
      : item;
    const entry = validateExerciseLibraryEntry(withDates);
    if (entry) entries.push(entry);
    else rejected.push(typeof item?.name === 'string' ? item.name : '(unnamed)');
  }
  return { entries, rejected };
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    const list = value.map(v => String(v).trim()).filter(Boolean);
    return list.length ? list : null;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(part => part.trim()).filter(Boolean);
  }
  return null;
}

function libraryKey(entry) {
  return String(entry?.name ?? '').trim().toLowerCase();
}

/**
 * Never-performed and long-stale moves sort first so Chadwick's highlight list
 * leads with fresh options instead of the handful of things he's already been
 * proposing every day. in_rotation only breaks a tie between two equally-stale
 * moves now -- it used to pin every in_rotation entry to the top unconditionally,
 * which is exactly what made the same small set of "current" lifts crowd out
 * everything else, session after session.
 */
function compareVarietyFirst(a, b) {
  const left = a.last_performed || '';
  const right = b.last_performed || '';
  if (left !== right) {
    if (!left) return -1;
    if (!right) return 1;
    return left.localeCompare(right);
  }
  const rotationDiff = Number(b.in_rotation === true) - Number(a.in_rotation === true);
  if (rotationDiff !== 0) return rotationDiff;
  return libraryKey(a).localeCompare(libraryKey(b));
}

function parseNotionDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(value);
  if (!match) return null;
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const month = months[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
}
