import { aggregateNutrition, MEAL_TYPES } from './aggregate.js';
import { strengthTargets } from './forecast-targets.js';
import { addCalendarDays, daysBetween, enumerateDateKeys, isCalendarDate } from './time.js';
import { normalizeExerciseName, resolveExerciseRegion } from '../app/fitness-model.js';

export const FORECAST_WINDOWS_DAYS = Object.freeze([28, 42, 56]);
/** Trailing slice inside a supplied window. Not a hidden decay — callers pick the outer window. */
export const RECENT_PATTERN_DAYS = 14;
export const WEIGHT_PROMPT_DAYS = 7;
export const WEIGHT_PROMPT_MIN_READINGS = 3;

const toRecord = item => item?.record ?? item;
const round1 = value => Math.round(value * 10) / 10;
const round4 = value => Math.round(value * 10000) / 10000;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return round1(value);
}

function mean(values) {
  if (!values.length) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function ratio(part, whole) {
  if (!whole) return null;
  return round4(part / whole);
}

function isWeekend(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function resolveAnalysisWindow({ from, to, asOf, days } = {}) {
  if (isCalendarDate(from) && isCalendarDate(to) && from <= to) return { from, to, days: daysBetween(from, to) + 1 };
  if (isCalendarDate(asOf) && Number.isInteger(days) && days > 0) {
    return { from: addCalendarDays(asOf, -(days - 1)), to: asOf, days };
  }
  throw new TypeError('Analysis window requires {from, to} or {asOf, days}');
}

function mealsOn(items, date) {
  return (items ?? []).map(toRecord).filter(record => record?.type === 'meal' && record.date === date);
}

export function deriveDailyNutrition(items, date) {
  if (!isCalendarDate(date)) throw new TypeError(`Invalid calendar date: ${date}`);
  const nutrition = aggregateNutrition(items, date);
  return {
    date,
    logged_calories: nutrition.logged_calories,
    logged_protein_g: nutrition.logged_protein_g,
    logged_meal_count: nutrition.logged_meal_count,
    meal_types: nutrition.meal_types,
    nutrition_logging_status: nutrition.nutrition_logging_status,
    daily_intake_kcal: nutrition.daily_intake_kcal,
    daily_intake_protein_g: nutrition.daily_intake_protein_g
  };
}

function classifySpan(items, from, to) {
  return enumerateDateKeys(from, to).map(date => ({
    ...deriveDailyNutrition(items, date),
    meals: mealsOn(items, date),
    weekend: isWeekend(date)
  }));
}

function dayTotal(meals, mealType, field) {
  return round1(meals
    .filter(meal => meal.meal === mealType)
    .reduce((sum, meal) => sum + (Number(meal[field]) || 0), 0));
}

function mealTypeNames(days) {
  const seen = new Set();
  for (const day of days) {
    for (const meal of day.meals) if (meal.meal) seen.add(meal.meal);
  }
  return [
    ...MEAL_TYPES.filter(mealType => seen.has(mealType)),
    ...[...seen].filter(mealType => !MEAL_TYPES.includes(mealType)).sort()
  ];
}

function samples(days, mealType, field) {
  return days
    .map(day => dayTotal(day.meals, mealType, 'calories') > 0 ? dayTotal(day.meals, mealType, field) : null)
    .filter(value => value != null && (field === 'protein_g' || value > 0));
}

function expectedFrom(frequency, typical) {
  if (frequency == null) return null;
  if (frequency === 0) return 0;
  if (typical == null) return null;
  return round1(frequency * typical);
}

function eatenCount(days, mealType) {
  return days.filter(day => day.meals.some(meal => meal.meal === mealType)).length;
}

function summariseMealType(days, mealType, recentFrom) {
  const complete = days.filter(day => day.nutrition_logging_status === 'complete');
  const recentComplete = complete.filter(day => day.date >= recentFrom);
  const loggedDays = days.filter(day => (
    day.nutrition_logging_status !== 'unlogged' && day.meals.some(meal => meal.meal === mealType)
  ));
  const weekdayComplete = complete.filter(day => !day.weekend);
  const weekendComplete = complete.filter(day => day.weekend);
  const frequency = ratio(eatenCount(complete, mealType), complete.length);
  const weekdayFrequency = ratio(eatenCount(weekdayComplete, mealType), weekdayComplete.length);
  const weekendFrequency = ratio(eatenCount(weekendComplete, mealType), weekendComplete.length);
  const typicalCalories = median(samples(loggedDays, mealType, 'calories'));
  const typicalProtein = median(samples(loggedDays, mealType, 'protein_g'));
  const weekdayTypical = median(samples(loggedDays.filter(day => !day.weekend), mealType, 'calories')) ?? typicalCalories;
  const weekendTypical = median(samples(loggedDays.filter(day => day.weekend), mealType, 'calories')) ?? typicalCalories;
  const weekdayProtein = median(samples(loggedDays.filter(day => !day.weekend), mealType, 'protein_g')) ?? typicalProtein;
  const weekendProtein = median(samples(loggedDays.filter(day => day.weekend), mealType, 'protein_g')) ?? typicalProtein;

  return {
    meal: mealType,
    occurrences: days.reduce((sum, day) => sum + day.meals.filter(meal => meal.meal === mealType).length, 0),
    logged_days: loggedDays.length,
    typical_calories: typicalCalories,
    typical_protein_g: typicalProtein,
    weekday_typical_calories: median(samples(loggedDays.filter(day => !day.weekend), mealType, 'calories')),
    weekend_typical_calories: median(samples(loggedDays.filter(day => day.weekend), mealType, 'calories')),
    typical_statistic: 'median',
    frequency,
    weekday_frequency: weekdayFrequency,
    weekend_frequency: weekendFrequency,
    recent_frequency: ratio(eatenCount(recentComplete, mealType), recentComplete.length),
    recent_typical_calories: median(samples(loggedDays.filter(day => day.date >= recentFrom), mealType, 'calories')),
    expected_calories: expectedFrom(frequency, typicalCalories),
    expected_protein_g: expectedFrom(frequency, typicalProtein),
    weekday_expected_calories: expectedFrom(weekdayFrequency, weekdayTypical),
    weekend_expected_calories: expectedFrom(weekendFrequency, weekendTypical),
    weekday_expected_protein_g: expectedFrom(weekdayFrequency, weekdayProtein),
    weekend_expected_protein_g: expectedFrom(weekendFrequency, weekendProtein)
  };
}

function sumExpected(meals, field) {
  if (!meals.length || meals.some(meal => meal[field] == null)) return null;
  return round1(meals.reduce((sum, meal) => sum + meal[field], 0));
}

export function buildMealPattern(items, window, { recentDays = RECENT_PATTERN_DAYS } = {}) {
  const span = resolveAnalysisWindow(window);
  const days = classifySpan(items, span.from, span.to);
  const recentFrom = addCalendarDays(span.to, -(Math.min(recentDays, span.days) - 1));
  return {
    window: span,
    recent_window: {
      from: recentFrom,
      to: span.to,
      days: Math.min(recentDays, span.days),
      statistic: 'median'
    },
    statistics: {
      typical: 'median',
      frequency_denominator: 'complete_days_only',
      partial_days: 'meal_observations_only',
      unlogged_days: 'unknown_not_zero'
    },
    complete_days: days.filter(day => day.nutrition_logging_status === 'complete').length,
    partial_days: days.filter(day => day.nutrition_logging_status === 'partial').length,
    unlogged_days: days.filter(day => day.nutrition_logging_status === 'unlogged').length,
    meals: mealTypeNames(days).map(mealType => summariseMealType(days, mealType, recentFrom))
  };
}

export function estimateHabitualIntake(items, window, options) {
  const pattern = buildMealPattern(items, window, options);
  const days = classifySpan(items, pattern.window.from, pattern.window.to);
  const complete = days.filter(day => day.nutrition_logging_status === 'complete');
  const partial = days.filter(day => day.nutrition_logging_status === 'partial');
  const unlogged = days.filter(day => day.nutrition_logging_status === 'unlogged');
  const directCalories = complete.map(day => day.logged_calories);
  const directProtein = complete.map(day => day.logged_protein_g);
  const reconstructedCalories = sumExpected(pattern.meals, 'expected_calories');

  return {
    window: pattern.window,
    date_range: { from: pattern.window.from, to: pattern.window.to },
    direct_calories: median(directCalories),
    direct_calories_mean: mean(directCalories),
    direct_calories_median: median(directCalories),
    direct_protein_g: median(directProtein),
    direct_protein_mean: mean(directProtein),
    direct_protein_median: median(directProtein),
    reconstructed_expected_calories: reconstructedCalories,
    reconstructed_expected_protein_g: sumExpected(pattern.meals, 'expected_protein_g'),
    reconstructed_expected_calories_weekday: sumExpected(pattern.meals, 'weekday_expected_calories'),
    reconstructed_expected_calories_weekend: sumExpected(pattern.meals, 'weekend_expected_calories'),
    reconstructed_expected_protein_weekday: sumExpected(pattern.meals, 'weekday_expected_protein_g'),
    reconstructed_expected_protein_weekend: sumExpected(pattern.meals, 'weekend_expected_protein_g'),
    complete_days: complete.length,
    partial_days: partial.length,
    unlogged_days: unlogged.length,
    logging_coverage: ratio(complete.length + partial.length, days.length),
    complete_day_coverage: ratio(complete.length, days.length),
    meal_pattern: pattern,
    reliability: {
      direct_intake: complete.length ? 'observed' : 'unknown',
      reconstructed_intake: reconstructedCalories == null ? 'unknown' : 'inferred',
      partial_days: 'observed_meals_not_daily_totals',
      unlogged_days: 'unknown_not_zero',
      sufficient_complete_days: complete.length >= 7,
      weighting: 'median; recent fields use a trailing sub-window median, not a decay'
    }
  };
}

function loadedSet(set) {
  const reps = Number(set?.reps);
  const weight = Number(set?.weight_kg);
  return Number.isFinite(reps) && reps > 0 && Number.isFinite(weight) && weight > 0;
}

function resistanceMode(set) {
  return set?.cable_type ? String(set.cable_type) : 'unspecified';
}

function bumpMode(map, mode, field) {
  if (!map[mode]) map[mode] = { sessions: 0, sets: 0 };
  map[mode][field] += 1;
}

export function summariseTrainingBehaviour(items, window, { libraryByName = null, targetsConfig = null } = {}) {
  const span = resolveAnalysisWindow(window);
  const recentDays = Math.min(RECENT_PATTERN_DAYS, span.days);
  const recentFrom = addCalendarDays(span.to, -(recentDays - 1));
  const goals = strengthTargets(targetsConfig);
  const byRegion = {};
  const byMode = {};
  const exposures = new Map(goals.lifts.map(lift => [normalizeExerciseName(lift.exercise), {
    exercise: lift.exercise,
    id: lift.id,
    sessions: 0,
    sets: 0,
    by_mode: {}
  }]));
  const ignored = {
    planned_sessions: 0,
    walk_sessions: 0,
    mobility_sessions: 0,
    completed_without_loaded_sets: 0,
    invalid_sets: 0,
    other_status_sessions: 0
  };
  const unclassified = new Set();
  let sessions = 0;
  let sets = 0;
  let recentSessions = 0;

  for (const record of (items ?? []).map(toRecord)) {
    if (record?.type !== 'workout' || !isCalendarDate(record.date)) continue;
    if (record.date < span.from || record.date > span.to) continue;
    if (record.status === 'planned') {
      ignored.planned_sessions += 1;
      continue;
    }
    if (record.status !== 'completed') {
      ignored.other_status_sessions += 1;
      continue;
    }
    if (record.session_kind === 'walk') {
      ignored.walk_sessions += 1;
      continue;
    }
    if (record.session_kind === 'mobility') {
      ignored.mobility_sessions += 1;
      continue;
    }

    const valid = [];
    for (const exercise of record.exercises ?? []) {
      for (const set of exercise.sets ?? []) {
        if (!loadedSet(set)) {
          ignored.invalid_sets += 1;
          continue;
        }
        valid.push({ exercise, set, mode: resistanceMode(set) });
      }
    }
    if (!valid.length) {
      ignored.completed_without_loaded_sets += 1;
      continue;
    }

    sessions += 1;
    if (record.date >= recentFrom) recentSessions += 1;
    const liftsInSession = new Map();
    for (const entry of valid) {
      sets += 1;
      byMode[entry.mode] = (byMode[entry.mode] ?? 0) + 1;
      const region = resolveExerciseRegion(entry.exercise, record.focus, libraryByName) ?? 'unclassified';
      if (region === 'unclassified') unclassified.add(String(entry.exercise?.name ?? 'unknown'));
      byRegion[region] = (byRegion[region] ?? 0) + 1;
      const key = normalizeExerciseName(entry.exercise?.name);
      const exposure = exposures.get(key);
      if (!exposure) continue;
      exposure.sets += 1;
      bumpMode(exposure.by_mode, entry.mode, 'sets');
      if (!liftsInSession.has(key)) liftsInSession.set(key, new Set());
      liftsInSession.get(key).add(entry.mode);
    }
    for (const [key, modes] of liftsInSession) {
      const exposure = exposures.get(key);
      exposure.sessions += 1;
      for (const mode of modes) bumpMode(exposure.by_mode, mode, 'sessions');
    }
  }

  const weeks = span.days / 7;
  const recentWeeks = recentDays / 7;
  const perWeek = count => (weeks > 0 ? round1(count / weeks) : null);
  return {
    window: span,
    recent_window: { from: recentFrom, to: span.to, days: recentDays },
    genuine_loaded_sessions: sessions,
    valid_loaded_sets: sets,
    loaded_sets_by_muscle_group: byRegion,
    loaded_sets_by_resistance_mode: byMode,
    target_lift_exposures: [...exposures.values()],
    sessions_per_week: perWeek(sessions),
    loaded_sets_per_week: perWeek(sets),
    recent_sessions_per_week: recentWeeks > 0 ? round1(recentSessions / recentWeeks) : null,
    recent_training_frequency_per_week: recentWeeks > 0 ? round1(recentSessions / recentWeeks) : null,
    ignored,
    unclassified_exercises: [...unclassified].sort(),
    hypertrophy_stimulus: {
      sessions,
      loaded_sets: sets,
      note: 'Walks, mobility, planned workouts, and sets with weight <= 0 or reps <= 0 are not stimulus. duration_min is not used.'
    }
  };
}

function finiteWeight(value) {
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

function itemIdentity(item, record) {
  return item?.path ?? record?.path ?? record?.id ?? '';
}

export function collectWeightObservations(items, { from, to } = {}) {
  const warnings = [];
  const grouped = new Map();
  for (const item of items ?? []) {
    const record = toRecord(item);
    if (!record || !isCalendarDate(record.date)) continue;
    if (from && record.date < from) continue;
    if (to && record.date > to) continue;
    if (record.type !== 'weight' && record.type !== 'composition') continue;
    const weight = finiteWeight(record.weight_kg);
    if (weight == null) continue;
    if (!grouped.has(record.date)) grouped.set(record.date, []);
    grouped.get(record.date).push({
      date: record.date,
      weight_kg: weight,
      source_type: record.type,
      id: itemIdentity(item, record)
    });
  }

  const observations = [];
  for (const date of [...grouped.keys()].sort()) {
    const rows = grouped.get(date);
    const uniqueValues = [...new Set(rows.map(row => row.weight_kg))];
    if (rows.length > 1 && uniqueValues.length === 1) {
      warnings.push({
        code: 'duplicate_weight',
        date,
        weight_kg: uniqueValues[0],
        count: rows.length,
        ids: rows.map(row => row.id).filter(Boolean)
      });
    } else if (uniqueValues.length > 1) {
      warnings.push({
        code: 'ambiguous_weight_same_date',
        date,
        weights_kg: uniqueValues,
        ids: rows.map(row => row.id).filter(Boolean)
      });
    }
    observations.push(rows[0]);
  }
  return { observations, distinct_days: observations.length, warnings };
}

export function weightTrackingPrompt(items, asOf) {
  if (!isCalendarDate(asOf)) throw new TypeError(`Invalid calendar date: ${asOf}`);
  const from = addCalendarDays(asOf, -(WEIGHT_PROMPT_DAYS - 1));
  const collected = collectWeightObservations(items, { from, to: asOf });
  const recordedToday = collected.observations.some(row => row.date === asOf);
  return {
    as_of: asOf,
    window: { from, to: asOf, days: WEIGHT_PROMPT_DAYS },
    distinct_weight_days: collected.distinct_days,
    recorded_today: recordedToday,
    weight_tracking_prompt_needed: collected.distinct_days < WEIGHT_PROMPT_MIN_READINGS && !recordedToday,
    observations: collected.observations,
    warnings: collected.warnings
  };
}

function measurementSignature(record) {
  return Object.keys(record)
    .filter(key => key !== 'schema_version' && typeof record[key] === 'number' && Number.isFinite(record[key]))
    .sort()
    .map(key => `${key}:${record[key]}`)
    .join('|');
}

export function dedupeTapeMeasurements(items) {
  const warnings = [];
  const grouped = new Map();
  for (const item of items ?? []) {
    const record = toRecord(item);
    if (record?.type !== 'measurements' || !isCalendarDate(record.date)) continue;
    if (!grouped.has(record.date)) grouped.set(record.date, []);
    grouped.get(record.date).push({ record, id: itemIdentity(item, record) });
  }
  const measurements = [];
  for (const date of [...grouped.keys()].sort()) {
    const rows = grouped.get(date);
    const bySignature = new Map();
    for (const row of rows) {
      const signature = measurementSignature(row.record);
      if (!bySignature.has(signature)) bySignature.set(signature, []);
      bySignature.get(signature).push(row);
    }
    for (const group of bySignature.values()) {
      if (group.length > 1) {
        warnings.push({
          code: 'duplicate_tape',
          date,
          count: group.length,
          ids: group.map(row => row.id).filter(Boolean)
        });
      }
      measurements.push({ date, id: group[0].id, record: group[0].record });
    }
    if (bySignature.size > 1) {
      warnings.push({
        code: 'ambiguous_tape_same_date',
        date,
        variants: bySignature.size,
        ids: rows.map(row => row.id).filter(Boolean)
      });
    }
  }
  return { measurements, warnings };
}

function dateSpan(records, types) {
  const dates = records
    .filter(record => types.has(record?.type) && isCalendarDate(record.date))
    .map(record => record.date)
    .sort();
  if (!dates.length) return null;
  return { from: dates[0], to: dates[dates.length - 1] };
}

export function backfillForecastInputs(items, {
  asOf,
  windows = FORECAST_WINDOWS_DAYS,
  targetsConfig = null,
  libraryByName = null,
  recentDays = RECENT_PATTERN_DAYS
} = {}) {
  const records = (items ?? []).map(toRecord);
  const mealSpan = dateSpan(records, new Set(['meal']));
  const workoutSpan = dateSpan(records, new Set(['workout']));
  const bodySpan = dateSpan(records, new Set(['weight', 'composition', 'measurements']));
  const knownDates = [mealSpan?.from, mealSpan?.to, workoutSpan?.from, workoutSpan?.to, bodySpan?.from, bodySpan?.to]
    .filter(Boolean)
    .sort();
  const resolvedAsOf = isCalendarDate(asOf) ? asOf : (knownDates.at(-1) ?? null);
  if (!resolvedAsOf) {
    return {
      as_of: null,
      nutrition: null,
      training: null,
      weight: null,
      data_quality: { warnings: [{ code: 'no_source_records' }] }
    };
  }

  const nutritionFrom = mealSpan?.from ?? resolvedAsOf;
  const nutritionTo = [mealSpan?.to, resolvedAsOf].filter(Boolean).sort().at(-1);
  const daily = mealSpan
    ? enumerateDateKeys(nutritionFrom, nutritionTo).map(date => deriveDailyNutrition(records, date))
    : [];
  const options = { recentDays };
  const windowResults = {};
  for (const days of windows) {
    const window = { asOf: resolvedAsOf, days };
    windowResults[String(days)] = {
      habitual_intake: estimateHabitualIntake(records, window, options),
      meal_pattern: buildMealPattern(records, window, options),
      training: summariseTrainingBehaviour(records, window, { libraryByName, targetsConfig })
    };
  }

  const historyWindow = mealSpan
    ? { from: nutritionFrom, to: nutritionTo }
    : { asOf: resolvedAsOf, days: 1 };
  const trainingFrom = workoutSpan?.from ?? resolvedAsOf;
  const tape = dedupeTapeMeasurements(items);
  const weights = collectWeightObservations(items);
  const prompt = weightTrackingPrompt(items, resolvedAsOf);
  const warnings = [...tape.warnings, ...weights.warnings];
  if (!strengthTargets(targetsConfig).lifts.length) warnings.push({ code: 'strength_targets_unavailable' });
  warnings.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return {
    as_of: resolvedAsOf,
    nutrition: {
      date_range: mealSpan ? { from: nutritionFrom, to: nutritionTo } : null,
      days: daily.length,
      complete_days: daily.filter(day => day.nutrition_logging_status === 'complete').length,
      partial_days: daily.filter(day => day.nutrition_logging_status === 'partial').length,
      unlogged_days: daily.filter(day => day.nutrition_logging_status === 'unlogged').length,
      daily,
      habitual_intake: mealSpan ? estimateHabitualIntake(records, historyWindow, options) : null
    },
    windows: windowResults,
    training: summariseTrainingBehaviour(
      records,
      { from: trainingFrom, to: resolvedAsOf },
      { libraryByName, targetsConfig }
    ),
    weight: {
      observations: weights.observations,
      distinct_days: weights.distinct_days,
      prompt
    },
    measurements: tape.measurements.map(row => ({ date: row.date, id: row.id })),
    data_quality: { warnings }
  };
}
