/**
 * Chadwick Fitness tool pack — thin wrappers over buildFitnessModel / charts /
 * body-state / templates. Same numbers as the Fitness and Body pages.
 */
import { addCalendarDays, daysBetween, isCalendarDate } from '../../../apps/life/js/core/time.js';
import {
  buildFitnessModel,
  normalizeExerciseName,
  sessionVolume
} from '../../../apps/life/js/app/fitness-model.js';
import { collapseSetSplitExercises } from './workout-history.mjs';
import {
  computeShoulderWaistRatio,
  formatBodyStateForPrompt
} from './body-state.mjs';
import {
  parseTemplateMarkdown,
  slugifyWorkoutTitle
} from './workout-templates.mjs';

/** Cover Fitness long-term (26w) + load horizon. */
export const FITNESS_HISTORY_WEEKS = 26;

function roundPct(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function roundKg(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

export function workoutEventsFromRecords(records) {
  return (Array.isArray(records) ? records : [])
    .filter(record => record && (record.type === 'workout' || record.type == null))
    .map(record => ({ record: { ...record, type: 'workout' } }));
}

export function fitnessHistoryBounds(today, { weeks = FITNESS_HISTORY_WEEKS } = {}) {
  if (!isCalendarDate(today) || !Number.isInteger(weeks) || weeks < 1) return null;
  return {
    weeks,
    from: addCalendarDays(today, -(weeks * 7 - 1)),
    to: today
  };
}

function modelFor(records, today) {
  if (!isCalendarDate(today)) return null;
  return buildFitnessModel({
    events: workoutEventsFromRecords(records),
    date: today
  });
}

function baseMeta(today, sameAs) {
  return {
    ok: true,
    store: 'life_hub_fitness',
    same_as: sameAs,
    date: today
  };
}

export function getFitnessSnapshot(records, today) {
  const model = modelFor(records, today);
  if (!model) return { ok: false, error: 'invalid_date' };
  const charts = model.charts ?? {};
  const last = model.lastCompletedDate ?? null;
  return {
    ...baseMeta(today, 'Fitness page header / week / month summary'),
    streak_days: model.streak ?? null,
    longest_streak_days: charts.longestStreak ?? null,
    last_completed_date: last,
    days_since_last_completed: last && last <= today ? daysBetween(last, today) : null,
    week: {
      completed: model.weekCompletedCount,
      target: model.weekTarget,
      remaining: model.weekRemaining,
      volume_kg: roundKg(model.weekVolumeKg),
      last_week_volume_kg: roundKg(model.lastWeekVolumeKg),
      volume_delta_pct: roundPct(model.weekVolumeDeltaPct),
      focus_hits: model.focusHits ?? []
    },
    month: {
      completed_days: model.monthHitCount,
      volume_kg: roundKg(model.monthVolumeKg),
      avg_session_volume_kg: roundKg(model.avgSessionVolumeKg),
      avg_duration_min: model.avgDurationMin
    },
    long_term: {
      workouts_per_week: roundPct(model.longTerm?.workoutsPerWeek),
      adherence_pct: roundPct(model.longTerm?.adherencePct),
      volume_delta_pct: roundPct(model.longTerm?.volumeDeltaPct),
      strength_delta_pct: roundPct(model.longTerm?.strengthDeltaPct)
    },
    next_planned: model.nextPlanned ?? null
  };
}

export function getFitnessSnapshotSchema() {
  return {
    name: 'get_fitness_snapshot',
    description:
      'Read the Fitness page dashboard summary from Adam\'s loaded workout files: streak, this-week completed/target/volume vs last week, month volume, long-term adherence, next planned session. Use when he asks how training is going, whether he is on track this week, or for a Fitness overview — never invent streak/volume numbers or claim you cannot see the Fitness dashboard.',
    input_schema: { type: 'object', properties: {} }
  };
}

export function getTrainingVolume(records, today) {
  const model = modelFor(records, today);
  if (!model) return { ok: false, error: 'invalid_date' };
  const weeks = (model.volumeWeeks ?? []).map(week => ({
    week_start: week.weekStart,
    volume_kg: roundKg(week.value)
  }));
  return {
    ...baseMeta(today, 'Fitness page week/month volume tiles'),
    how_to_read:
      'These are kg tonnage (reps×weight), not session counts. Use compare_workout_windows for completed-session counts.',
    this_week_volume_kg: roundKg(model.weekVolumeKg),
    last_week_volume_kg: roundKg(model.lastWeekVolumeKg),
    week_volume_delta_pct: roundPct(model.weekVolumeDeltaPct),
    month_volume_kg: roundKg(model.monthVolumeKg),
    avg_session_volume_kg: roundKg(model.avgSessionVolumeKg),
    recent_volume_weeks: weeks,
    long_term_volume_delta_pct: roundPct(model.longTerm?.volumeDeltaPct)
  };
}

export function getTrainingVolumeSchema() {
  return {
    name: 'get_training_volume',
    description:
      'Read Fitness page training volume in kg (this week vs last week, month total, recent weekly tonnage, long-term volume %). Use when Adam asks if volume is up/down, how much tonnage he has done, or whether training load dropped — do not answer volume questions with compare_workout_windows session counts alone.',
    input_schema: { type: 'object', properties: {} }
  };
}

export function getWorkingWeights(records, today, { query, limit = 12 } = {}) {
  const model = modelFor(records, today);
  if (!model) return { ok: false, error: 'invalid_date' };
  let lifts = (model.workingWeights ?? []).map(lift => ({
    name: lift.name,
    weight_kg: lift.weight_kg,
    reps: lift.reps,
    e1rm: roundKg(lift.e1rm),
    date: lift.date
  }));
  if (query != null && String(query).trim()) {
    const needle = String(query).trim().toLowerCase();
    lifts = lifts.filter(lift => String(lift.name).toLowerCase().includes(needle));
  }
  const cap = Math.min(Math.max(Number(limit) || 12, 1), 30);
  return {
    ...baseMeta(today, 'Fitness page Working weights tile'),
    window_days: 30,
    count: Math.min(lifts.length, cap),
    lifts: lifts.slice(0, cap)
  };
}

export function getWorkingWeightsSchema() {
  return {
    name: 'get_working_weights',
    description:
      'Read Fitness page Working weights (30-day best e1RM leaders per lift) from loaded workout files. Optional query filters by exercise name. Use when Adam asks what he is working with on a lift, top working weights, or current training loads.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional case-insensitive exercise name fragment.' },
        limit: { type: 'number', description: 'Max lifts to return (default 12, max 30).' }
      }
    }
  };
}

export function getLongTermFitness(records, today) {
  const model = modelFor(records, today);
  if (!model) return { ok: false, error: 'invalid_date' };
  const lt = model.longTerm ?? {};
  return {
    ...baseMeta(today, 'Fitness page long-term trio tiles'),
    weeks: 26,
    workouts_per_week: roundPct(lt.workoutsPerWeek),
    adherence_pct: roundPct(lt.adherencePct),
    volume_delta_pct: roundPct(lt.volumeDeltaPct),
    strength_delta_pct: roundPct(lt.strengthDeltaPct),
    weekly_volume: (lt.weeklyVolume ?? []).map(week => ({
      week_start: week.weekStart,
      volume_kg: roundKg(week.value)
    }))
  };
}

export function getLongTermFitnessSchema() {
  return {
    name: 'get_long_term_fitness',
    description:
      'Read Fitness page long-term metrics (~26 weeks): workouts/week, adherence %, volume Δ %, strength Δ %, weekly volume series. Use for multi-month progress / adherence questions — never invent a long-term trend from a handful of recent sessions.',
    input_schema: { type: 'object', properties: {} }
  };
}

export function getSessionComparisons(records, today) {
  const model = modelFor(records, today);
  if (!model) return { ok: false, error: 'invalid_date' };
  const hero = model.heroSession;
  const comparisons = (model.comparisons ?? []).map(row => ({
    name: row.name,
    current_best: row.currentBest ?? null,
    previous_best: row.previousBest ?? null,
    e1rm: roundKg(row.e1rm),
    previous_e1rm: roundKg(row.previousE1rm),
    weight_delta_kg: row.weightDeltaKg ?? null,
    is_pr: row.isPr === true,
    first_logged: row.firstLogged === true
  }));
  return {
    ...baseMeta(today, 'Fitness page last-session comparisons / PR flags'),
    hero_session: hero
      ? {
        date: hero.date,
        title: hero.title,
        status: hero.status,
        volume_kg: roundKg(sessionVolume(hero)),
        duration_min: hero.duration_min ?? null,
        focus: hero.focus ?? []
      }
      : null,
    comparisons
  };
}

export function getSessionComparisonsSchema() {
  return {
    name: 'get_session_comparisons',
    description:
      'Read Fitness page lift comparisons for the hero/last session vs prior performances (weight deltas, PR flags). Use when Adam asks whether he PRd or how last session compared to the previous hit on those lifts.',
    input_schema: { type: 'object', properties: {} }
  };
}

export function getExerciseHistory(records, today, { query, limit = 5 } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date' };
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return { ok: false, error: 'empty_query' };
  const cap = Math.min(Math.max(Number(limit) || 5, 1), 12);
  const sessions = (Array.isArray(records) ? records : [])
    .filter(record => (record?.type === 'workout' || record?.type == null) && record.status === 'completed' && record.date)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const hits = [];
  for (const record of sessions) {
    const exercises = collapseSetSplitExercises(record.exercises);
    for (const exercise of exercises) {
      const name = String(exercise.name ?? '');
      const normalized = normalizeExerciseName(name).toLowerCase();
      if (!name.toLowerCase().includes(needle) && !normalized.includes(needle)) continue;
      hits.push({
        date: record.date,
        title: record.title,
        exercise: name,
        sets: (exercise.sets ?? []).map(set => ({
          reps: set.reps,
          weight_kg: set.weight_kg,
          ...(set.cable_type != null ? { cable_type: set.cable_type } : {})
        })),
        volume_kg: roundKg(sessionVolume({ status: 'completed', exercises: [exercise] }))
      });
      break;
    }
    if (hits.length >= cap) break;
  }

  return {
    ...baseMeta(today, 'Completed workout files (exercise history)'),
    query: String(query).trim(),
    count: hits.length,
    history: hits
  };
}

export function getExerciseHistorySchema() {
  return {
    name: 'get_exercise_history',
    description:
      'Search loaded completed workouts for the last N times Adam performed an exercise (sets/reps/weight). Use when he asks what he did last time / last few times on a named lift — do not invent prior sets.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Exercise name fragment (required).' },
        limit: { type: 'number', description: 'Max sessions to return (default 5, max 12).' }
      },
      required: ['query']
    }
  };
}

export function getLoadStatus(records, today) {
  const model = modelFor(records, today);
  if (!model) return { ok: false, error: 'invalid_date' };
  const horizon = model.charts?.loadHorizon ?? [];
  const series = Array.isArray(horizon) && horizon[0]?.points
    ? horizon[0].points.map(point => ({
      week_start: point.date,
      volume_kg: roundKg(point.value),
      acwr: roundPct(point.ratio),
      band: point.band ?? null
    }))
    : [];
  return {
    ...baseMeta(today, 'Fitness charts load horizon / ACWR band'),
    how_to_read:
      'Acute:chronic weekly tonnage ratio. Bands flag underload / sweet spot / spike — check before pushing load hard.',
    latest: series.at(-1) ?? null,
    weeks: series
  };
}

export function getLoadStatusSchema() {
  return {
    name: 'get_load_status',
    description:
      'Read Fitness load-horizon / acute:chronic volume ratio bands from loaded workouts. Use when Adam asks if he is ramping too hard, under-training, or whether this week\'s load is spiking.',
    input_schema: { type: 'object', properties: {} }
  };
}

function painFlagsOf(record) {
  if (Array.isArray(record?.pain_flags)) return record.pain_flags;
  if (Array.isArray(record?.painFlags)) return record.painFlags;
  return [];
}

export function getPainTrainingSummary(records, today, { limit = 20 } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date' };
  const model = modelFor(records, today);
  const chartSites = (model?.charts?.painBySite ?? []).map(row => ({
    site: row.site,
    count: row.count
  }));

  const bySite = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.status !== 'completed') continue;
    for (const flag of painFlagsOf(record)) {
      if (!flag || typeof flag !== 'object') continue;
      const site = String(flag.site ?? flag.location ?? '').trim();
      if (!site) continue;
      const key = site.toLowerCase();
      const entry = bySite.get(key) ?? {
        site,
        count: 0,
        latest_date: null,
        latest_note: null,
        sessions: []
      };
      entry.count += 1;
      if (!entry.latest_date || record.date > entry.latest_date) {
        entry.latest_date = record.date;
        entry.latest_note = typeof flag.note === 'string' ? flag.note.trim() : null;
      }
      if (entry.sessions.length < 5) {
        entry.sessions.push({
          date: record.date,
          title: record.title,
          note: typeof flag.note === 'string' ? flag.note.trim() : null
        });
      }
      bySite.set(key, entry);
    }
  }

  const sites = [...bySite.values()]
    .sort((a, b) => b.count - a.count || String(b.latest_date).localeCompare(String(a.latest_date)))
    .slice(0, Math.min(Math.max(Number(limit) || 20, 1), 40));

  return {
    ...baseMeta(today, 'Pain flags rolled up from completed workout files'),
    chart_sites: chartSites,
    site_count: sites.length,
    sites
  };
}

export function getPainTrainingSummarySchema() {
  return {
    name: 'get_pain_training_summary',
    description:
      'Roll up pain flags from loaded completed workouts by site (counts, latest note, recent sessions). Use before programming around injuries or when Adam asks where training has been hurting.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max sites to return (default 20).' }
      }
    }
  };
}

export function getBodyState({
  compositionRecords = [],
  measurementRecords = [],
  targetRatio
} = {}) {
  if (!compositionRecords.length && !measurementRecords.length) {
    return { ok: true, store: 'life_hub_body', found: false, summary: '' };
  }
  const latestMeasurements = measurementRecords[0] ?? null;
  const ratio = latestMeasurements ? computeShoulderWaistRatio(latestMeasurements) : null;
  const summary = formatBodyStateForPrompt({
    compositionRecords,
    measurementRecords,
    targetRatio
  });
  return {
    ok: true,
    store: 'life_hub_body',
    found: true,
    same_as: 'Body page latest composition / tape / shoulder:waist',
    summary,
    latest_composition: compositionRecords[0] ?? null,
    latest_measurements: latestMeasurements,
    shoulder_waist_ratio: ratio != null ? Math.round(ratio * 100) / 100 : null,
    target_ratio: typeof targetRatio === 'number' ? targetRatio : null
  };
}

export function getBodyStateSchema() {
  return {
    name: 'get_body_state',
    description:
      'Read the latest body composition, tape measurements, and shoulder:waist ratio toward Adam\'s physique target (same data as the Body page). Use when he asks about weight, body fat, tape, or ratio progress — call this rather than claiming you cannot see body metrics.',
    input_schema: { type: 'object', properties: {} }
  };
}

export function getWorkoutTemplate(templates, { query } = {}) {
  const list = Array.isArray(templates) ? templates : [];
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return { ok: false, error: 'empty_query' };

  const parsed = list
    .map(entry => {
      if (entry?.title && Array.isArray(entry?.exercises)) return entry;
      if (typeof entry?.content === 'string') return parseTemplateMarkdown(entry.content);
      if (typeof entry === 'string') return parseTemplateMarkdown(entry);
      return null;
    })
    .filter(Boolean);

  const matches = parsed.filter(template => {
    const title = String(template.title ?? '').toLowerCase();
    const slug = slugifyWorkoutTitle(template.title ?? '');
    return title.includes(needle) || slug.includes(needle.replace(/\s+/g, '-'));
  });

  if (!matches.length) {
    return {
      ok: true,
      store: 'life_hub_fitness_templates',
      found: false,
      query: String(query).trim(),
      results: []
    };
  }

  return {
    ok: true,
    store: 'life_hub_fitness_templates',
    found: true,
    query: String(query).trim(),
    count: matches.length,
    results: matches.slice(0, 5).map(template => ({
      title: template.title,
      session_kind: template.session_kind,
      day_type: template.day_type,
      focus: template.focus ?? [],
      exercises: (template.exercises ?? []).map(exercise => ({
        name: exercise.name,
        sets: exercise.sets,
        ...(exercise.bench_angle_deg != null ? { bench_angle_deg: exercise.bench_angle_deg } : {}),
        ...(exercise.intensification != null ? { intensification: exercise.intensification } : {})
      }))
    }))
  };
}

export function getWorkoutTemplateSchema() {
  return {
    name: 'get_workout_template',
    description:
      'Look up a saved workout template by title/fragment and return its full exercise list. Use when Adam says do X again / pull template Y and the template is not already fully spelled out in the prompt.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Template title or fragment (required).' }
      },
      required: ['query']
    }
  };
}

export function chadwickFitnessToolSchemas() {
  return [
    getFitnessSnapshotSchema(),
    getTrainingVolumeSchema(),
    getWorkingWeightsSchema(),
    getLongTermFitnessSchema(),
    getSessionComparisonsSchema(),
    getExerciseHistorySchema(),
    getLoadStatusSchema(),
    getPainTrainingSummarySchema(),
    getBodyStateSchema(),
    getWorkoutTemplateSchema()
  ];
}
