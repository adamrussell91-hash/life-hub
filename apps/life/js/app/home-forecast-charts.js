/**
 * Chart data for the Home forecast cards (Stimulus, Scale, Recomp).
 * Pure data only: numbers, dates and labels. Geometry lives in chart-kit,
 * DOM and interaction live in render-home-charts.js.
 */
import {
  LEAN_PRESERVATION_GATE,
  UPPER_BODY_REGIONS,
  buildWeightTrend,
  upperBodySetsPerWeek
} from '../core/forecast-body.js';
import { weightTrackingPrompt } from '../core/forecast-inputs.js';
import { addCalendarDays, daysBetween } from '../core/time.js';
import { REGION_KEYS, REGION_LABELS } from './fitness-model.js';

export const GLIDE_HISTORY_DAYS = 56;
export const GLIDE_MIN_TREND_READINGS = 5;

const round = (value, digits = 1) => (
  value == null || !Number.isFinite(Number(value)) ? null : Number(Number(value).toFixed(digits))
);

/* ── Stimulus ──────────────────────────────────────────────────────────── */

function proteinPerKg(training, forecast) {
  if (training?.protein_g_kg_day != null) {
    return { value: round(training.protein_g_kg_day, 2), reason: null };
  }
  const habitual = forecast?.input_quality?.habitual_intake;
  const weight = Number(forecast?.current?.weight_kg);
  if (habitual?.status === 'ready' && habitual.protein_g_day != null && weight > 0) {
    return { value: round(habitual.protein_g_day / weight, 2), reason: null };
  }
  const missing = habitual?.missing?.[0] ?? habitual?.attempts?.[0]?.missing?.[0] ?? null;
  return {
    value: null,
    reason: missing ? `Needs ${missing}.` : 'Needs logged intake history.'
  };
}

export function buildStimulusChartData(training, forecast) {
  const days = Number(training?.window?.days ?? 0);
  const weeks = days / 7;
  const byRegion = training?.loaded_sets_by_muscle_group ?? {};
  const upper = training?.upper_body_loaded_sets_per_week
    ?? round(upperBodySetsPerWeek(byRegion, days), 1);
  const protein = proteinPerKg(training, forecast);
  const gate = LEAN_PRESERVATION_GATE;
  const keys = [
    {
      key: 'sessions',
      label: 'Sessions / week',
      short: 'Sessions',
      value: round(training?.sessions_per_week ?? 0, 1),
      threshold: gate.resistance_sessions_week,
      unit: '/wk',
      reason: null,
      note: 'Completed sessions with at least one set above 0 kg and 0 reps.'
    },
    {
      key: 'upper_sets',
      label: 'Upper sets / week',
      short: 'Upper sets',
      value: round(upper ?? 0, 1),
      threshold: gate.upper_body_loaded_sets_week_proxy,
      unit: ' sets',
      reason: null,
      note: 'Chest, shoulders, arms, back and full body. A practical volume proxy, not a biological cutoff.'
    },
    {
      key: 'protein',
      label: 'Protein g/kg/day',
      short: 'Protein',
      value: protein.value,
      threshold: gate.protein_g_kg_day,
      unit: ' g/kg',
      reason: protein.reason,
      note: 'Plateau of the protein response to resistance training (Morton et al.).'
    }
  ].map(item => ({
    ...item,
    status: item.value == null ? 'unscored' : item.value >= item.threshold ? 'met' : 'short',
    ratio: item.value == null ? null : round(item.value / item.threshold, 2)
  }));

  const regions = REGION_KEYS.map(key => ({
    key,
    label: REGION_LABELS[key] ?? key,
    setsPerWeek: weeks > 0 ? round(Number(byRegion[key] ?? 0) / weeks, 1) : 0,
    inGate: UPPER_BODY_REGIONS.includes(key)
  }));

  return {
    windowDays: days,
    from: training?.window?.from ?? null,
    to: training?.window?.to ?? null,
    keys,
    metCount: keys.filter(item => item.status === 'met').length,
    scoredCount: keys.filter(item => item.status !== 'unscored').length,
    supported: training?.lean_preservation_supported ?? null,
    regions,
    regionReference: gate.upper_body_loaded_sets_week_proxy,
    ignored: training?.ignored ?? null
  };
}

/* ── Scale: glide slope ────────────────────────────────────────────────── */

function entryDays(value, slopePerDay, low, high) {
  if (!Number.isFinite(value) || !Number.isFinite(slopePerDay) || slopePerDay === 0) return null;
  if (value >= low && value <= high) return 0;
  const edge = value > high ? high : low;
  const days = (edge - value) / slopePerDay;
  return days > 0 ? Math.ceil(days) : null;
}

export function buildGlideChartData(events, date, targets) {
  const trendWindow = buildWeightTrend(events, date, GLIDE_HISTORY_DAYS);
  const observations = trendWindow.observations.map(row => ({
    date: row.date,
    weight_kg: row.weight_kg
  }));
  const trend = trendWindow.trend;
  const prompt = weightTrackingPrompt(events, date);
  const band = targets
    ? { low: Number(targets.weight_kg_min), high: Number(targets.weight_kg_max) }
    : null;

  const fittedByDate = new Map((trend.fitted ?? []).map(row => [row.date, row.value]));
  const ready = trend.observation_count >= GLIDE_MIN_TREND_READINGS && trend.slope_per_day != null;
  const points = observations.map(row => {
    const fitted = ready ? fittedByDate.get(row.date) ?? null : null;
    return {
      ...row,
      trend_kg: round(fitted, 2),
      split_kg: fitted == null ? null : round(row.weight_kg - fitted, 2)
    };
  });

  let projection = null;
  if (ready && trend.fitted?.length) {
    const last = trend.fitted.at(-1);
    const todayTrend = last.value + trend.slope_per_day * daysBetween(last.date, date);
    const ci = (trend.slope_ci_95_per_week ?? []).map(v => v / 7);
    const entry = band ? entryDays(todayTrend, trend.slope_per_day, band.low, band.high) : null;
    const entries = band
      ? ci.map(slope => entryDays(todayTrend, slope, band.low, band.high)).filter(v => v != null).sort((a, b) => a - b)
      : [];
    projection = {
      from: date,
      trend_today_kg: round(todayTrend, 2),
      slope_per_week: trend.slope_per_week,
      slope_ci_95_per_week: trend.slope_ci_95_per_week,
      entry_day: entry,
      entry_date: entry == null ? null : addCalendarDays(date, entry),
      entry_range: entries.length === 2 && ci.length === 2
        ? { earliest: addCalendarDays(date, entries[0]), latest: addCalendarDays(date, entries[1]) }
        : null
    };
  }

  const mad = trend.residual_mad;
  return {
    date,
    historyDays: GLIDE_HISTORY_DAYS,
    from: addCalendarDays(date, -(GLIDE_HISTORY_DAYS - 1)),
    band,
    points,
    trendReady: ready,
    trendNeeds: ready ? null : Math.max(0, GLIDE_MIN_TREND_READINGS - trend.observation_count),
    residualMadKg: round(mad, 2),
    projection,
    weekDays: prompt.distinct_weight_days,
    weekWindow: prompt.window,
    promptNeeded: prompt.weight_tracking_prompt_needed,
    recordedToday: prompt.recorded_today
  };
}

/* ── Recomp: twin clocks and the road into the box ─────────────────────── */

function scenarioChart(key, label, scenario) {
  const status = scenario?.status ?? 'locked';
  return {
    key,
    label,
    status,
    date: scenario?.date ?? null,
    reason: scenario?.reason ?? null,
    partition: scenario?.partition_mode ?? null,
    intakeKcal: scenario?.intake_kcal_day ?? null,
    expenditureKcal: scenario?.expenditure_kcal_day ?? null,
    tightDate: scenario?.tight_body_fat_date ?? null,
    uncertainty: scenario?.uncertainty_95_approx ?? null,
    trace: scenario?.trace ?? null,
    range: scenario?.trace_range ?? null
  };
}

export function buildRecompChartData(forecast, date) {
  const targets = forecast?.body?.targets ?? null;
  const current = forecast?.current?.status === 'ready' ? forecast.current : null;
  const leanBand = targets
    ? {
        low: round(targets.weight_kg_min * (1 - targets.body_fat_pct_max / 100), 2),
        high: round(targets.weight_kg_max * (1 - targets.body_fat_pct_min / 100), 2)
      }
    : null;
  const lean = current ? round(current.fat_free_mass_kg, 2) : null;
  let leanGap = null;
  if (lean != null && leanBand) {
    if (lean < leanBand.low) leanGap = round(leanBand.low - lean, 2);
    else if (lean > leanBand.high) leanGap = round(leanBand.high - lean, 2);
    else leanGap = 0;
  }
  return {
    date,
    targets,
    current: current
      ? {
          weight_kg: current.weight_kg,
          body_fat_pct: current.body_fat_pct,
          fat_free_mass_kg: current.fat_free_mass_kg,
          fat_mass_kg: current.fat_mass_kg,
          seedDate: current.body_fat_seed_date,
          seedAgeDays: current.body_fat_seed_age_days
        }
      : null,
    leanBand,
    leanGapKg: leanGap,
    scenarios: [
      scenarioChart('as_logged', 'As logged', forecast?.body?.as_logged),
      scenarioChart('on_plan', 'On plan', forecast?.body?.on_plan)
    ]
  };
}
