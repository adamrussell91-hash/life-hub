import { resolveDayType } from './aggregate.js';
import { bodyCompositionTargets } from './forecast-targets.js';
import {
  collectWeightObservations,
  estimateHabitualIntake,
  summariseTrainingBehaviour
} from './forecast-inputs.js';
import { addCalendarDays, daysBetween, enumerateDateKeys } from './time.js';
import { median, theilSenTrend } from './forecast-statistics.js';

export const FAT_ENERGY_KCAL_PER_KG = 9400;
export const LEAN_ENERGY_KCAL_PER_KG = 1800;
export const FORBES_MASS_CONSTANT_KG = 10.4;
export const RMR_FAT_KCAL_PER_KG_DAY = 4.5;
export const RMR_FFM_KCAL_PER_KG_DAY = 19;

const WINDOWS = [28, 42, 56];
const MIN_WEIGHT_DAYS = 5;
const MIN_WEIGHT_SPAN = 21;
const MAX_WEIGHT_GAP = 21;
const MIN_COMPLETE_DAYS = 7;
const MIN_COMPLETE_COVERAGE = 0.25;
const MAX_HORIZON = 730;

const recordOf = item => item?.record ?? item;
const num = value => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const round = (value, digits = 2) => value == null ? null : Number(Number(value).toFixed(digits));

function latestComposition(items, asOf) {
  return (items ?? []).map(recordOf)
    .filter(record => record?.type === 'composition'
      && record.date <= asOf
      && num(record.weight_kg) > 0
      && num(record.body_fat_pct) > 0
      && num(record.body_fat_pct) < 100)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.time ?? '').localeCompare(String(a.time ?? '')))[0] ?? null;
}

export function buildCurrentBodyState(items, asOf) {
  const weights = collectWeightObservations(items, { to: asOf }).observations;
  const weight = weights.at(-1);
  const composition = latestComposition(items, asOf);
  const missing = [];
  if (!weight) missing.push('current weight');
  if (!composition) missing.push('body-fat seed');
  if (missing.length) return { status: 'locked', missing };

  const weightKg = weight.weight_kg;
  const bf = Number(composition.body_fat_pct);
  const fm = weightKg * bf / 100;
  return {
    status: 'ready',
    weight_kg: round(weightKg, 2),
    body_fat_pct: round(bf, 2),
    fat_mass_kg: round(fm, 3),
    fat_free_mass_kg: round(weightKg - fm, 3),
    latest_weight_date: weight.date,
    body_fat_seed_date: composition.date,
    body_fat_seed_age_days: daysBetween(composition.date, asOf),
    seed_note: 'The scale body-fat value seeds FM/FFM. It is not re-read as weekly ground truth.'
  };
}

export function buildWeightTrend(items, asOf, days) {
  const from = addCalendarDays(asOf, -(days - 1));
  const collected = collectWeightObservations(items, { from, to: asOf });
  const trend = theilSenTrend(collected.observations, 'weight_kg');
  const missing = [];
  if (trend.observation_count < MIN_WEIGHT_DAYS) missing.push(`at least ${MIN_WEIGHT_DAYS} distinct weight days`);
  if (trend.span_days < MIN_WEIGHT_SPAN) missing.push(`at least ${MIN_WEIGHT_SPAN} days of weight span`);
  if (trend.max_gap_days != null && trend.max_gap_days > MAX_WEIGHT_GAP) missing.push(`no weight gap greater than ${MAX_WEIGHT_GAP} days`);
  if (collected.warnings.some(w => w.code === 'ambiguous_weight_same_date')) missing.push('resolve ambiguous same-date weight');
  return {
    window: { from, to: asOf, days },
    status: missing.length ? 'locked' : 'ready',
    missing,
    observations: collected.observations,
    warnings: collected.warnings,
    trend
  };
}

function reconstructedWeekly(intake, weekdayKey, weekendKey, fallbackKey) {
  const weekday = num(intake?.[weekdayKey]);
  const weekend = num(intake?.[weekendKey]);
  if (weekday != null && weekend != null) return (weekday * 5 + weekend * 2) / 7;
  return num(intake?.[fallbackKey]);
}

export function selectHabitualIntake(items, asOf) {
  const attempts = WINDOWS.map(days => {
    const intake = estimateHabitualIntake(items, { asOf, days });
    const directCalories = num(intake.direct_calories_median);
    const reconstructedCalories = reconstructedWeekly(
      intake,
      'reconstructed_expected_calories_weekday',
      'reconstructed_expected_calories_weekend',
      'reconstructed_expected_calories'
    );
    const directProtein = num(intake.direct_protein_median);
    const reconstructedProtein = reconstructedWeekly(
      intake,
      'reconstructed_expected_protein_weekday',
      'reconstructed_expected_protein_weekend',
      'reconstructed_expected_protein_g'
    );
    const calories = median([directCalories, reconstructedCalories].filter(Number.isFinite));
    const protein = median([directProtein, reconstructedProtein].filter(Number.isFinite));
    const missing = [];
    if (intake.complete_days < MIN_COMPLETE_DAYS) missing.push(`at least ${MIN_COMPLETE_DAYS} complete nutrition days`);
    if ((intake.complete_day_coverage ?? 0) < MIN_COMPLETE_COVERAGE) missing.push(`at least ${Math.round(MIN_COMPLETE_COVERAGE * 100)}% complete-day coverage`);
    if (calories == null) missing.push('usable calorie estimate');
    return {
      days,
      status: missing.length ? 'locked' : 'ready',
      missing,
      calories_kcal_day: round(calories, 1),
      protein_g_day: round(protein, 1),
      complete_days: intake.complete_days,
      partial_days: intake.partial_days,
      unlogged_days: intake.unlogged_days,
      complete_day_coverage: intake.complete_day_coverage,
      direct_calories_median: directCalories,
      reconstructed_calories: round(reconstructedCalories, 1),
      source: intake
    };
  });
  return attempts.find(row => row.status === 'ready') ?? { status: 'locked', attempts, missing: attempts[0]?.missing ?? ['nutrition history'] };
}

/**
 * Forbes/Hall energy partition.
 * p is the fraction of energy imbalance assigned to FFM:
 * p = C/(C+FM), C = 10.4*rhoFFM/rhoFM.
 */
export function forbesEnergyPartition(fatMassKg) {
  const fm = Number(fatMassKg);
  if (!(fm > 0)) return null;
  const c = FORBES_MASS_CONSTANT_KG * LEAN_ENERGY_KCAL_PER_KG / FAT_ENERGY_KCAL_PER_KG;
  const leanEnergyFraction = c / (c + fm);
  const fatEnergyFraction = 1 - leanEnergyFraction;
  const leanKgPerKcal = leanEnergyFraction / LEAN_ENERGY_KCAL_PER_KG;
  const fatKgPerKcal = fatEnergyFraction / FAT_ENERGY_KCAL_PER_KG;
  const kgPerKcal = leanKgPerKcal + fatKgPerKcal;
  return {
    method: 'forbes_hall',
    lean_energy_fraction: round(leanEnergyFraction, 4),
    fat_energy_fraction: round(fatEnergyFraction, 4),
    lean_mass_fraction: round(leanKgPerKcal / kgPerKcal, 4),
    fat_mass_fraction: round(fatKgPerKcal / kgPerKcal, 4),
    effective_kcal_per_kg: round(1 / kgPerKcal, 1)
  };
}

function targetSet(targetsConfig, asOf) {
  const sets = (targetsConfig?.target_sets ?? [])
    .filter(set => !set.valid_from || set.valid_from <= asOf)
    .sort((a, b) => String(b.valid_from ?? '').localeCompare(String(a.valid_from ?? '')));
  return sets[0] ?? null;
}

function validLoadedSet(set) {
  return num(set?.weight_kg) > 0 && num(set?.reps) > 0;
}

function hasLoadedResistance(record) {
  return record?.type === 'workout'
    && record.status === 'completed'
    && record.session_kind !== 'walk'
    && record.session_kind !== 'mobility'
    && (record.exercises ?? []).some(exercise => (exercise.sets ?? []).some(validLoadedSet));
}

export function buildTrainingSupport(items, asOf, days, targetsConfig, libraryByName, proteinGDay, weightKg) {
  const summary = summariseTrainingBehaviour(items, { asOf, days }, { targetsConfig, libraryByName });
  const sessions = Number(summary.sessions_per_week ?? 0);
  const weeks = days / 7;
  const regions = summary.loaded_sets_by_muscle_group ?? {};
  const upperBodySets = ['chest', 'shoulders', 'arms', 'back', 'full_body']
    .reduce((sum, key) => sum + Number(regions[key] ?? 0), 0);
  const upperBodySetsPerWeek = weeks > 0 ? upperBodySets / weeks : 0;
  const proteinPerKg = weightKg > 0 && proteinGDay != null ? proteinGDay / weightKg : null;
  const sufficient = sessions >= 2
    && upperBodySetsPerWeek >= 10
    && proteinPerKg != null
    && proteinPerKg >= 1.62;
  return {
    ...summary,
    upper_body_loaded_sets_per_week: round(upperBodySetsPerWeek, 1),
    protein_g_kg_day: round(proteinPerKg, 2),
    thresholds: {
      resistance_sessions_week: 2,
      upper_body_loaded_sets_week_proxy: 10,
      protein_g_kg_day: 1.62
    },
    lean_preservation_supported: sufficient,
    interpretation: sufficient
      ? 'Meets the forecast scenario gate for lean preservation.'
      : 'Does not meet the forecast scenario gate; Forbes/Hall partition is used.',
    note: 'The resistance threshold is a practical upper-body hypertrophy proxy informed by ACSM volume evidence, not a claim that 10 aggregate sets is an exact biological cutoff. The preservation state remains a scenario assumption, not a guarantee.'
  };
}

function observedDayTypeMix(items, asOf, days) {
  const from = addCalendarDays(asOf, -(days - 1));
  const records = (items ?? []).map(recordOf);
  const counts = { movement: 0, workout_30: 0, workout_45_60: 0 };
  for (const date of enumerateDateKeys(from, asOf)) {
    let dayType = resolveDayType(items, date);
    const loaded = records.some(record => record.date === date && hasLoadedResistance(record));
    if (dayType === 'movement' && loaded) dayType = 'workout_30';
    counts[dayType] = (counts[dayType] ?? 0) + 1;
  }
  return counts;
}

export function buildOnPlanIntake(items, asOf, days, targetsConfig, weightKg) {
  const targets = targetSet(targetsConfig, asOf);
  if (!targets?.calories) return { status: 'locked', missing: ['configured calorie targets'] };
  const mix = observedDayTypeMix(items, asOf, days);
  const total = Object.values(mix).reduce((sum, x) => sum + x, 0);
  if (!total) return { status: 'locked', missing: ['observed day-type history'] };
  const calories = (
    mix.movement * Number(targets.calories.movement)
    + mix.workout_30 * Number(targets.calories.workout_30)
    + mix.workout_45_60 * Number(targets.calories.workout_45_60)
  ) / total;
  const protein = Math.max(Number(targets.protein?.daily ?? 0), Number(targets.protein?.recovery_daily ?? 0), 1.62 * weightKg);
  return {
    status: 'ready',
    calories_kcal_day: round(calories, 1),
    protein_g_day: round(protein, 1),
    observed_day_type_mix: mix,
    note: 'Future day types are estimated from the backwards observed distribution, not from a future workout plan.'
  };
}

function calibrationForWindow(items, asOf, days, targetsConfig, libraryByName, measuredRmrKcal) {
  const weight = buildWeightTrend(items, asOf, days);
  const intake = estimateHabitualIntake(items, { asOf, days });
  const missing = [...weight.missing];
  if (intake.complete_days < MIN_COMPLETE_DAYS) missing.push(`at least ${MIN_COMPLETE_DAYS} complete nutrition days`);
  if ((intake.complete_day_coverage ?? 0) < MIN_COMPLETE_COVERAGE) missing.push('sufficient complete-day nutrition coverage');

  const direct = num(intake.direct_calories_median);
  const reconstructed = reconstructedWeekly(
    intake,
    'reconstructed_expected_calories_weekday',
    'reconstructed_expected_calories_weekend',
    'reconstructed_expected_calories'
  );
  const calories = median([direct, reconstructed].filter(Number.isFinite));
  if (calories == null) missing.push('usable calorie estimate');

  const body = buildCurrentBodyState(items, asOf);
  if (body.status !== 'ready') missing.push(...body.missing);
  if (missing.length) return { status: 'locked', window: { days }, missing: [...new Set(missing)], weight, intake, body };

  const protein = median([
    num(intake.direct_protein_median),
    reconstructedWeekly(intake, 'reconstructed_expected_protein_weekday', 'reconstructed_expected_protein_weekend', 'reconstructed_expected_protein_g')
  ].filter(Number.isFinite));
  const training = buildTrainingSupport(items, asOf, days, targetsConfig, libraryByName, protein, body.weight_kg);
  const partition = training.lean_preservation_supported
    ? { method: 'preserve_ffm', effective_kcal_per_kg: FAT_ENERGY_KCAL_PER_KG }
    : forbesEnergyPartition(body.fat_mass_kg);

  const slope = weight.trend.slope_per_day;
  const bodyEnergyPerDay = slope * partition.effective_kcal_per_kg;
  const tee = calories - bodyEnergyPerDay;
  const ci = weight.trend.slope_ci_95_per_week ?? [weight.trend.slope_per_week, weight.trend.slope_per_week];
  const teeBounds = ci.map(weeklySlope => calories - (weeklySlope / 7) * partition.effective_kcal_per_kg).sort((a, b) => a - b);
  const rmr = num(measuredRmrKcal);
  const warnings = [];
  if (rmr != null && tee < rmr * 0.95) warnings.push('inferred expenditure is implausibly below measured RMR');
  if (rmr != null && tee > rmr * 3) warnings.push('inferred expenditure is unusually high relative to measured RMR');

  return {
    status: warnings.length ? 'locked' : 'ready',
    window: weight.window,
    missing: warnings,
    body,
    weight,
    intake,
    training,
    partition,
    intake_kcal_day: round(calories, 1),
    protein_g_day: round(protein, 1),
    body_energy_change_kcal_day: round(bodyEnergyPerDay, 1),
    inferred_expenditure_kcal_day: round(tee, 1),
    inferred_expenditure_95_range_kcal_day: teeBounds.map(value => round(value, 1)),
    measured_rmr_kcal_day: rmr,
    warnings
  };
}

export function buildEnergyCalibration(items, asOf, targetsConfig, libraryByName, { measuredRmrKcal = null } = {}) {
  const attempts = WINDOWS.map(days => calibrationForWindow(items, asOf, days, targetsConfig, libraryByName, measuredRmrKcal));
  const ready = attempts.find(row => row.status === 'ready');
  return ready ?? {
    status: 'locked',
    body: buildCurrentBodyState(items, asOf),
    missing: [...new Set(attempts.flatMap(row => row.missing ?? []))],
    attempts
  };
}

function inBox(state, targets) {
  return state.weight_kg >= Number(targets.weight_kg_min)
    && state.weight_kg <= Number(targets.weight_kg_max)
    && state.body_fat_pct >= Number(targets.body_fat_pct_min)
    && state.body_fat_pct <= Number(targets.body_fat_pct_max);
}

function stepBody(state, energyBalance, partitionMode) {
  let leanEnergyFraction;
  if (energyBalance < 0 && partitionMode === 'preserve_ffm') {
    leanEnergyFraction = 0;
  } else {
    leanEnergyFraction = forbesEnergyPartition(state.fat_mass_kg)?.lean_energy_fraction ?? 0;
  }
  const fatEnergyFraction = 1 - leanEnergyFraction;
  const deltaFfm = energyBalance * leanEnergyFraction / LEAN_ENERGY_KCAL_PER_KG;
  const deltaFm = energyBalance * fatEnergyFraction / FAT_ENERGY_KCAL_PER_KG;
  const fm = Math.max(0.1, state.fat_mass_kg + deltaFm);
  const ffm = Math.max(1, state.fat_free_mass_kg + deltaFfm);
  const weight = fm + ffm;
  return {
    fat_mass_kg: fm,
    fat_free_mass_kg: ffm,
    weight_kg: weight,
    body_fat_pct: fm / weight * 100
  };
}

function simulateOne({ asOf, body, intake, expenditure, partitionMode, targets, horizonDays }) {
  let state = {
    fat_mass_kg: body.fat_mass_kg,
    fat_free_mass_kg: body.fat_free_mass_kg,
    weight_kg: body.weight_kg,
    body_fat_pct: body.body_fat_pct
  };
  const initial = { ...state };
  let boxDate = inBox(state, targets) ? asOf : null;
  let weightEntryDate = state.weight_kg >= targets.weight_kg_min && state.weight_kg <= targets.weight_kg_max ? asOf : null;
  let bfEntryDate = state.body_fat_pct >= targets.body_fat_pct_min && state.body_fat_pct <= targets.body_fat_pct_max ? asOf : null;
  let tightDate = state.body_fat_pct <= targets.body_fat_pct_tight
    && state.weight_kg >= targets.weight_kg_min && state.weight_kg <= targets.weight_kg_max ? asOf : null;
  let crossedBelowWeightBeforeBf = false;

  for (let day = 1; day <= horizonDays && (!boxDate || !tightDate); day++) {
    const expenditureToday = expenditure
      + RMR_FAT_KCAL_PER_KG_DAY * (state.fat_mass_kg - initial.fat_mass_kg)
      + RMR_FFM_KCAL_PER_KG_DAY * (state.fat_free_mass_kg - initial.fat_free_mass_kg);
    state = stepBody(state, intake - expenditureToday, partitionMode);
    const date = addCalendarDays(asOf, day);
    if (!weightEntryDate && state.weight_kg >= targets.weight_kg_min && state.weight_kg <= targets.weight_kg_max) weightEntryDate = date;
    if (!bfEntryDate && state.body_fat_pct >= targets.body_fat_pct_min && state.body_fat_pct <= targets.body_fat_pct_max) bfEntryDate = date;
    if (!boxDate && inBox(state, targets)) boxDate = date;
    if (!tightDate && state.body_fat_pct <= targets.body_fat_pct_tight
      && state.weight_kg >= targets.weight_kg_min && state.weight_kg <= targets.weight_kg_max) tightDate = date;
    if (state.weight_kg < targets.weight_kg_min && state.body_fat_pct > targets.body_fat_pct_max) crossedBelowWeightBeforeBf = true;
  }

  return {
    date: boxDate,
    weight_entry_date: weightEntryDate,
    body_fat_entry_date: bfEntryDate,
    tight_body_fat_date: tightDate,
    crossed_below_weight_before_body_fat: crossedBelowWeightBeforeBf,
    projected_end: {
      weight_kg: round(state.weight_kg, 2),
      body_fat_pct: round(state.body_fat_pct, 2),
      fat_mass_kg: round(state.fat_mass_kg, 2),
      fat_free_mass_kg: round(state.fat_free_mass_kg, 2)
    }
  };
}

export function simulateBodyScenario({
  asOf,
  body,
  intakeKcalDay,
  expenditureKcalDay,
  expenditureRangeKcalDay = null,
  partitionMode = 'forbes',
  targets,
  horizonDays = MAX_HORIZON
}) {
  if (!targets) return { status: 'locked', missing: ['body-composition targets'] };
  const intake = num(intakeKcalDay);
  const expenditure = num(expenditureKcalDay);
  if (body?.status !== 'ready' || intake == null || expenditure == null) {
    return { status: 'locked', missing: ['current body state, intake and expenditure'] };
  }

  const centre = simulateOne({
    asOf, body, intake, expenditure, partitionMode, targets,
    horizonDays: Math.min(MAX_HORIZON, horizonDays)
  });
  if (!centre.date) {
    return {
      status: 'will_not_arrive',
      reason: centre.crossed_below_weight_before_body_fat
        ? 'projected weight falls below the target band before body fat reaches the box'
        : 'no simultaneous weight/body-fat entry within the forecast horizon',
      partition_mode: partitionMode,
      intake_kcal_day: intake,
      expenditure_kcal_day: expenditure,
      ...centre
    };
  }

  let uncertainty = null;
  if (Array.isArray(expenditureRangeKcalDay) && expenditureRangeKcalDay.length === 2) {
    const low = simulateOne({ asOf, body, intake, expenditure: Math.min(...expenditureRangeKcalDay), partitionMode, targets, horizonDays });
    const high = simulateOne({ asOf, body, intake, expenditure: Math.max(...expenditureRangeKcalDay), partitionMode, targets, horizonDays });
    const dates = [low.date, high.date].filter(Boolean).sort();
    uncertainty = dates.length === 2 ? { earliest: dates[0], latest: dates[1] } : { earliest: dates[0] ?? null, latest: null };
  }
  const binding = [centre.weight_entry_date, centre.body_fat_entry_date].filter(Boolean).sort().at(-1);
  return {
    status: 'dated',
    partition_mode: partitionMode,
    intake_kcal_day: round(intake, 1),
    expenditure_kcal_day: round(expenditure, 1),
    binding_condition: binding === centre.body_fat_entry_date ? 'body_fat' : 'weight',
    uncertainty_95_approx: uncertainty,
    ...centre
  };
}

export function bodyTargets(targetsConfig) {
  return bodyCompositionTargets(targetsConfig);
}
