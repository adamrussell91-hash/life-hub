import { buildForecast } from '../core/forecast-engine.js';
import { summariseTrainingBehaviour, weightTrackingPrompt } from '../core/forecast-inputs.js';
import { formatDisplayDate } from '../core/time.js';

const STIMULUS_FALLBACK_DAYS = 28;

function weightBandLabel(targets) {
  if (!targets) return 'the weight band';
  return `${targets.weight_kg_min}–${targets.weight_kg_max} kg`;
}

function fatBandLabel(targets) {
  if (!targets) return 'the fat band';
  return `${targets.body_fat_pct_min}–${targets.body_fat_pct_max}%`;
}

function scenarioMain(scenario) {
  if (!scenario) return 'Unavailable';
  switch (scenario.status) {
    case 'dated':
      return formatDisplayDate(scenario.date);
    case 'will_not_arrive':
      return 'Will not arrive';
    case 'complete':
      return 'In target';
    default:
      return 'Date locked';
  }
}

function datedDetail(scenario) {
  const binding = scenario.binding_condition === 'body_fat'
    ? 'Body fat is binding.'
    : 'Weight is binding.';
  if (!scenario.tight_body_fat_date) {
    return `${binding} 8% not reached inside the band.`;
  }
  return `${binding} 8% clock ${formatDisplayDate(scenario.tight_body_fat_date)}.`;
}

function scenarioDetail(scenario, forecast) {
  if (!scenario) return 'Forecast unavailable.';
  switch (scenario.status) {
    case 'dated':
      return datedDetail(scenario);
    case 'will_not_arrive':
      return scenario.reason ?? 'Current direction does not enter the target box.';
    case 'complete':
      return 'Weight and body fat are simultaneously inside the target box.';
    default:
      return bodyLockText(forecast);
  }
}

function bodyLockText(forecast) {
  const attempts = forecast.input_quality?.energy_calibration?.attempts ?? [];
  let bestCount = 0;
  let smallestMaxGapDays = null;
  for (const attempt of attempts) {
    bestCount = Math.max(bestCount, Number(attempt?.weight?.trend?.observation_count ?? 0));
    const gap = Number(attempt?.weight?.trend?.max_gap_days);
    if (!Number.isFinite(gap)) continue;
    smallestMaxGapDays = smallestMaxGapDays == null ? gap : Math.min(smallestMaxGapDays, gap);
  }
  if (bestCount < 5) {
    const missing = 5 - bestCount;
    const plural = missing === 1 ? '' : 's';
    const gapNote = smallestMaxGapDays != null && smallestMaxGapDays > 21
      ? ' and close the >21-day gap'
      : '';
    return `${bestCount}/5 recent weight days. Need ${missing} more reading${plural}${gapNote}.`;
  }
  const missing = forecast.input_quality?.energy_calibration?.missing ?? [];
  return missing[0] ?? 'More overlapping weight and complete nutrition data is required.';
}

function pathCard(scenario, forecast) {
  return {
    status: scenario?.status ?? 'locked',
    main: scenarioMain(scenario),
    detail: scenarioDetail(scenario, forecast)
  };
}

function pathsCard(forecast) {
  const asLogged = forecast.body?.as_logged;
  const onPlan = forecast.body?.on_plan;
  const bothLocked = asLogged?.status === 'locked' && onPlan?.status === 'locked';
  return {
    headline: bothLocked ? 'Forecast needs more data.' : 'As logged versus on plan.',
    detail: bothLocked ? bodyLockText(forecast) : 'Independent clocks. No blended progress score.',
    asLogged: pathCard(asLogged, forecast),
    onPlan: pathCard(onPlan, forecast)
  };
}

function preservationGate(supported) {
  if (supported === true) return 'Preservation gate met for the on-plan scenario.';
  if (supported === false) return 'Preservation gate not met — Forbes/Hall partition is used.';
  return 'Need overlapping intake and weight history to score the preservation gate.';
}

function stimulusCopy(training) {
  const sessions = training.sessions_per_week;
  const sets = training.upper_body_loaded_sets_per_week ?? training.loaded_sets_per_week;
  const genuine = Number(training.genuine_loaded_sessions ?? sessions ?? 0);
  const rate = genuine <= 0 ? 'No loaded sessions' : `${sessions}/week loaded`;
  if (genuine <= 0 || sets == null) {
    return {
      rate,
      detail: 'Walks, mobility, and planned workouts do not count.'
    };
  }
  return {
    rate,
    detail: `${sets} upper-body loaded sets/week. Walks and mobility do not count.`
  };
}

function stimulusCard(forecast, events, date, targetsConfig) {
  const training = forecast.input_quality?.training_support
    ?? summariseTrainingBehaviour(
      events,
      { asOf: date, days: STIMULUS_FALLBACK_DAYS },
      { targetsConfig }
    );
  const copy = stimulusCopy(training);
  return {
    rate: copy.rate,
    detail: copy.detail,
    gate: preservationGate(training.lean_preservation_supported),
    sessionsPerWeek: training.sessions_per_week,
    leanPreservationSupported: training.lean_preservation_supported ?? null
  };
}

function fatGapDetail(fatGap, fatBand) {
  if (fatGap == null) return 'Body-fat gap unavailable.';
  if (fatGap === 0) return `Body fat inside ${fatBand}.`;
  return `${fatGap} points to enter ${fatBand} fat.`;
}

function scaleCard(forecast, events, date) {
  const current = forecast.current;
  const targets = forecast.body?.targets;
  const prompt = weightTrackingPrompt(events, date);
  const weight = current?.weight_kg;
  const weightBand = weightBandLabel(targets);
  let headline = 'No usable scale reading.';
  let detail = 'Log weight or composition so the forecast can start.';
  if (current?.status === 'ready' && weight != null) {
    const gap = current?.gaps?.weight_to_enter_band_kg;
    const band = gap === 0 ? `inside ${weightBand}` : `${gap} kg to enter ${weightBand}`;
    headline = `${weight} kg · ${band}`;
    detail = fatGapDetail(current?.gaps?.body_fat_to_enter_band_pct_points, fatBandLabel(targets));
  } else if (prompt.weight_tracking_prompt_needed) {
    detail = `${prompt.distinct_weight_days} of ${prompt.window.days} days weighed. Need denser weigh-ins.`;
  }
  return {
    headline,
    detail,
    promptNeeded: prompt.weight_tracking_prompt_needed,
    distinctWeightDays: prompt.distinct_weight_days
  };
}

/** Home pulse view of the forecast engine. Body keeps the full panel. */
export function buildHomeForecastCards({ events, date, targetsConfig } = {}) {
  if (!date) throw new RangeError('Home forecast date is unavailable');
  const forecast = buildForecast({
    items: events,
    asOf: date,
    targetsConfig
  });
  return {
    paths: pathsCard(forecast),
    stimulus: stimulusCard(forecast, events, date, targetsConfig),
    scale: scaleCard(forecast, events, date)
  };
}
