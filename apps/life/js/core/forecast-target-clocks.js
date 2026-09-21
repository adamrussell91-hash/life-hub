import { strengthTargets } from './forecast-targets.js';
import { addCalendarDays, daysBetween } from './time.js';
import { estimateOneRepMax, normalizeExerciseName } from '../app/fitness-model.js';
import { median, spearmanCorrelation, theilSenTrend } from './forecast-statistics.js';

const MIN_TAPE_POINTS = 4;
const MIN_LIFT_EXPOSURES = 4;
const MIN_LIFT_SPAN_DAYS = 14;
const MAX_RATIO_HORIZON_DAYS = 730;

const recordOf = item => item?.record ?? item;
const num = value => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const round = (value, digits = 2) => value == null ? null : Number(Number(value).toFixed(digits));

function validLoadedSet(set) {
  return num(set?.weight_kg) > 0 && num(set?.reps) > 0;
}

function resistanceMode(set) {
  return set?.cable_type ? String(set.cable_type) : 'unspecified';
}

function ratioRows(items, asOf) {
  const byDate = new Map();
  for (const item of items ?? []) {
    const record = recordOf(item);
    if (record?.type !== 'measurements' || record.date > asOf) continue;
    const shoulders = num(record.shoulders);
    const waist = num(record.waist);
    if (!(shoulders > 0) || !(waist > 0)) continue;
    const ratio = shoulders / waist;
    if (!byDate.has(record.date)) byDate.set(record.date, []);
    byDate.get(record.date).push({
      date: record.date,
      ratio,
      shoulders_cm: shoulders,
      waist_cm: waist,
      id: record.id ?? item?.path ?? null
    });
  }

  const rows = [];
  const warnings = [];
  for (const date of [...byDate.keys()].sort()) {
    const variants = byDate.get(date);
    const unique = [];
    for (const row of variants) {
      if (!unique.some(existing => Math.abs(existing.ratio - row.ratio) < 1e-9)) unique.push(row);
    }
    if (unique.length > 1) {
      warnings.push({
        code: 'ambiguous_shoulder_waist_same_date',
        date,
        ratios: unique.map(row => round(row.ratio, 4)),
        ids: variants.map(row => row.id).filter(Boolean)
      });
    }
    // If same-date records differ elsewhere but shoulder and waist are the same,
    // they are one ratio observation, not an ambiguity for this clock.
    rows.push(unique[0]);
  }
  return { rows, warnings };
}

export function buildTapeForecast(items, asOf, targetRatio) {
  const target = num(targetRatio);
  if (!(target > 0)) return { status: 'locked', missing: ['shoulder-to-waist target'] };
  const { rows, warnings } = ratioRows(items, asOf);
  if (!rows.length) return { status: 'locked', missing: ['paired shoulder and waist measurement'] };

  const latest = rows.at(-1);
  const current = latest.ratio;
  const gap = target - current;
  if (gap <= 0) {
    return {
      status: 'complete',
      date: latest.date,
      current_ratio: round(current, 4),
      target_ratio: target,
      gap: 0,
      warnings
    };
  }

  if (warnings.some(w => w.date === latest.date)) {
    return {
      status: 'locked',
      current_ratio: round(current, 4),
      target_ratio: target,
      gap: round(gap, 4),
      missing: ['resolve latest same-date shoulder/waist ambiguity'],
      warnings
    };
  }

  const gaps = rows.slice(1).map((row, i) => daysBetween(rows[i].date, row.date));
  const usualGap = median(gaps) ?? 0;
  const staleAfter = Math.max(30, Math.ceil(usualGap * 1.5));
  const age = daysBetween(latest.date, asOf);
  if (age > staleAfter) {
    return {
      status: 'locked',
      current_ratio: round(current, 4),
      target_ratio: target,
      gap: round(gap, 4),
      latest_measurement_date: latest.date,
      latest_age_days: age,
      stale_after_days: staleAfter,
      missing: ['fresh paired shoulder and waist measurement'],
      warnings
    };
  }

  if (rows.length < MIN_TAPE_POINTS) {
    return {
      status: 'locked',
      current_ratio: round(current, 4),
      target_ratio: target,
      gap: round(gap, 4),
      observation_count: rows.length,
      hard_measurements_missing: MIN_TAPE_POINTS - rows.length,
      missing: [`${MIN_TAPE_POINTS - rows.length} more paired tape measurements`],
      warnings
    };
  }

  const trend = theilSenTrend(rows, 'ratio');
  if (!(trend.slope_per_day > 0)) {
    return {
      status: 'will_not_arrive',
      current_ratio: round(current, 4),
      target_ratio: target,
      gap: round(gap, 4),
      trend,
      warnings
    };
  }
  const date = addCalendarDays(latest.date, Math.ceil(gap / trend.slope_per_day));
  if (daysBetween(asOf, date) > MAX_RATIO_HORIZON_DAYS) {
    return {
      status: 'will_not_arrive',
      reason: 'projected ratio date exceeds forecast horizon',
      current_ratio: round(current, 4),
      target_ratio: target,
      gap: round(gap, 4),
      trend,
      warnings
    };
  }
  return {
    status: 'dated',
    date,
    current_ratio: round(current, 4),
    target_ratio: target,
    gap: round(gap, 4),
    latest_measurement_date: latest.date,
    observation_count: rows.length,
    trend,
    warnings
  };
}

function collectLiftModeSeries(items, asOf, exerciseName) {
  const key = normalizeExerciseName(exerciseName);
  const byModeDate = new Map();
  for (const item of items ?? []) {
    const record = recordOf(item);
    if (record?.type !== 'workout' || record.status !== 'completed' || record.date > asOf) continue;
    for (const exercise of record.exercises ?? []) {
      if (normalizeExerciseName(exercise?.name) !== key) continue;
      for (const set of exercise.sets ?? []) {
        if (!validLoadedSet(set)) continue;
        const e1rm = estimateOneRepMax(set.weight_kg, set.reps);
        if (!(e1rm > 0)) continue;
        const mode = resistanceMode(set);
        const seriesKey = `${mode}|${record.date}`;
        const existing = byModeDate.get(seriesKey);
        if (!existing || e1rm > existing.e1rm_kg) {
          byModeDate.set(seriesKey, {
            date: record.date,
            mode,
            e1rm_kg: e1rm,
            weight_kg: Number(set.weight_kg),
            reps: Number(set.reps)
          });
        }
      }
    }
  }

  const modes = new Map();
  for (const row of byModeDate.values()) {
    if (!modes.has(row.mode)) modes.set(row.mode, []);
    modes.get(row.mode).push(row);
  }
  return [...modes.entries()].map(([mode, observations]) => ({
    mode,
    observations: observations.sort((a, b) => a.date.localeCompare(b.date))
  }));
}

function chooseMode(series) {
  return series
    .slice()
    .sort((a, b) => b.observations.length - a.observations.length
      || String(b.observations.at(-1)?.date ?? '').localeCompare(String(a.observations.at(-1)?.date ?? '')))[0] ?? null;
}

export function buildLiftForecasts(items, asOf, targetsConfig) {
  const config = strengthTargets(targetsConfig);
  return config.lifts.map(target => {
    const series = collectLiftModeSeries(items, asOf, target.exercise);
    const chosen = chooseMode(series);
    if (!chosen?.observations.length) {
      return {
        id: target.id,
        exercise: target.exercise,
        target_e1rm_kg: target.target,
        status: 'locked',
        hard_sessions_missing: MIN_LIFT_EXPOSURES,
        deadline: config.deadline,
        deadline_test_possible: config.deadline ? config.deadline >= asOf : null,
        missing: ['comparable completed loaded exposures']
      };
    }

    const observations = chosen.observations;
    const latest = observations.at(-1);
    const current = latest.e1rm_kg;
    const gap = Math.max(0, target.target - current);
    const span = observations.length > 1 ? daysBetween(observations[0].date, latest.date) : 0;
    const sessionsMissing = Math.max(0, MIN_LIFT_EXPOSURES - observations.length);
    const modes = series.map(row => ({ mode: row.mode, exposure_count: row.observations.length }));
    const deadlinePossible = config.deadline ? config.deadline >= asOf : null;

    if (gap <= 0) {
      return {
        id: target.id,
        exercise: target.exercise,
        target_e1rm_kg: target.target,
        status: 'complete',
        date: latest.date,
        mode: chosen.mode,
        exposure_count: observations.length,
        current_e1rm_kg: round(current, 1),
        gap_kg: 0,
        deadline: config.deadline,
        deadline_test_possible: deadlinePossible,
        available_modes: modes
      };
    }

    if (observations.length < MIN_LIFT_EXPOSURES || span < MIN_LIFT_SPAN_DAYS) {
      return {
        id: target.id,
        exercise: target.exercise,
        target_e1rm_kg: target.target,
        status: 'locked',
        mode: chosen.mode,
        exposure_count: observations.length,
        current_e1rm_kg: round(current, 1),
        gap_kg: round(gap, 1),
        hard_sessions_missing: sessionsMissing,
        deadline: config.deadline,
        deadline_test_possible: deadlinePossible,
        missing: [
          observations.length < MIN_LIFT_EXPOSURES ? `${sessionsMissing} more comparable hard sessions` : null,
          span < MIN_LIFT_SPAN_DAYS ? `at least ${MIN_LIFT_SPAN_DAYS} days of comparable exposure span` : null
        ].filter(Boolean),
        available_modes: modes
      };
    }

    const trend = theilSenTrend(observations, 'e1rm_kg');
    if (!(trend.slope_per_day > 0)) {
      return {
        id: target.id,
        exercise: target.exercise,
        target_e1rm_kg: target.target,
        status: 'will_not_arrive',
        mode: chosen.mode,
        exposure_count: observations.length,
        current_e1rm_kg: round(current, 1),
        gap_kg: round(gap, 1),
        trend,
        deadline: config.deadline,
        deadline_test_possible: deadlinePossible,
        available_modes: modes
      };
    }

    const date = addCalendarDays(latest.date, Math.ceil(gap / trend.slope_per_day));
    return {
      id: target.id,
      exercise: target.exercise,
      target_e1rm_kg: target.target,
      status: 'dated',
      date,
      mode: chosen.mode,
      exposure_count: observations.length,
      current_e1rm_kg: round(current, 1),
      gap_kg: round(gap, 1),
      trend,
      deadline: config.deadline,
      deadline_test_possible: deadlinePossible,
      projected_by_deadline: config.deadline ? date <= config.deadline : null,
      available_modes: modes
    };
  });
}

function hasLoadedTraining(record) {
  return record?.type === 'workout'
    && record.status === 'completed'
    && record.session_kind !== 'walk'
    && record.session_kind !== 'mobility'
    && (record.exercises ?? []).some(exercise => (exercise.sets ?? []).some(validLoadedSet));
}

function energyScore(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (['very low', 'low', 'exhausted'].includes(key)) return 1;
  if (['neutral', 'medium', 'moderate', 'ok', 'okay'].includes(key)) return 2;
  if (['high', 'good', 'energised', 'energized'].includes(key)) return 3;
  return null;
}

export function buildMindBehaviourContext(items, asOf, days = 56) {
  const from = addCalendarDays(asOf, -(days - 1));
  const records = (items ?? []).map(recordOf);
  const diaries = records.filter(record => record?.type === 'diary' && record.date >= from && record.date <= asOf);
  const moodTraining = [];
  const energyTraining = [];
  for (const diary of diaries) {
    const trained = records.some(record => record.date === diary.date && hasLoadedTraining(record)) ? 1 : 0;
    const mood = num(diary.mood_score);
    const energy = energyScore(diary.energy);
    if (mood != null) moodTraining.push({ x: mood, y: trained });
    if (energy != null) energyTraining.push({ x: energy, y: trained });
  }
  const moodRho = moodTraining.length >= 10 ? spearmanCorrelation(moodTraining) : null;
  const energyRho = energyTraining.length >= 10 ? spearmanCorrelation(energyTraining) : null;
  const predictors = [];
  if (moodRho != null && Math.abs(moodRho) >= 0.35) {
    predictors.push({ predictor: 'mood_score', outcome: 'same_day_loaded_training', spearman_rho: round(moodRho, 3), n: moodTraining.length });
  }
  if (energyRho != null && Math.abs(energyRho) >= 0.35) {
    predictors.push({ predictor: 'energy', outcome: 'same_day_loaded_training', spearman_rho: round(energyRho, 3), n: energyTraining.length });
  }
  return {
    window: { from, to: asOf, days },
    diary_days: diaries.length,
    active_predictors: predictors,
    numeric_forecast_modifier_applied: false,
    note: 'Mind data is exposed only when a repeatable behavioural association is present. It does not directly alter metabolism.'
  };
}

export function buildMedicalContext(items, asOf, days = 180) {
  const from = addCalendarDays(asOf, -(days - 1));
  const records = (items ?? []).map(recordOf);
  const bloods = records
    .filter(record => record?.type === 'bloods' && record.date >= from && record.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = bloods[0] ?? null;
  const abnormal = (latest?.markers ?? []).filter(marker => String(marker?.status ?? '').toLowerCase() !== 'normal');
  const explicitBoundaries = records
    .filter(record => record?.date >= from && record.date <= asOf
      && (record.forecast_regime_boundary === true || record.regime_boundary === true))
    .map(record => ({ date: record.date, id: record.id ?? null, type: record.type ?? null, title: record.title ?? null }));
  const recentMedical = records
    .filter(record => record?.type === 'medical' && record.date >= from && record.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map(record => ({ date: record.date, id: record.id ?? null, title: record.title ?? null, record_type: record.record_type ?? null }));

  return {
    window: { from, to: asOf, days },
    latest_bloods_date: latest?.date ?? null,
    abnormal_markers: abnormal.map(marker => ({
      key: marker.key,
      label: marker.label,
      value: marker.value,
      unit: marker.unit,
      status: marker.status
    })),
    explicit_regime_boundaries: explicitBoundaries,
    recent_medical_records: recentMedical,
    numeric_rate_modifier_applied: false,
    note: 'Medical data supplies context, safety flags and explicit regime boundaries. No lab or diagnosis receives an invented metabolic multiplier.'
  };
}
