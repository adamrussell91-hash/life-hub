import { bodyCompositionTargets } from './forecast-targets.js';
import {
  buildCurrentBodyState,
  buildEnergyCalibration,
  buildOnPlanIntake,
  buildTrainingSupport,
  selectHabitualIntake,
  simulateBodyScenario
} from './forecast-body.js';
import {
  buildLiftForecasts,
  buildMedicalContext,
  buildMindBehaviourContext,
  buildTapeForecast
} from './forecast-target-clocks.js';

export const FORECAST_MODEL_VERSION = '2026-09-21.1';

export const MODEL_REFERENCES = Object.freeze({
  weight_trend: 'Theil-Sen robust slope with Sen 95% slope interval',
  body_partition: 'Forbes/Hall dynamic fat-versus-fat-free-mass partition',
  tissue_energy: 'Hall tissue-change energy densities: fat ≈9400 kcal/kg, FFM ≈1800 kcal/kg',
  strength: 'Epley estimated 1RM: weight × (1 + reps/30)',
  resistance_gate: 'ACSM 2026 resistance-training evidence: ≥2 sessions/week for strength; higher weekly volume around ≥10 sets supports hypertrophy',
  protein_gate: 'Morton et al. meta-regression: RET FFM response plateau around 1.62 g/kg/day total protein',
  lean_preservation: 'Resistance training during energy restriction attenuates FFM loss on average; preservation is modelled as an explicit scenario, not an individual certainty'
});

function round(value, digits = 2) {
  return value == null ? null : Number(Number(value).toFixed(digits));
}

function currentGaps(current, targets) {
  if (current?.status !== 'ready' || !targets) return null;
  return {
    weight_to_enter_band_kg: current.weight_kg > targets.weight_kg_max
      ? round(current.weight_kg - targets.weight_kg_max, 2)
      : current.weight_kg < targets.weight_kg_min
        ? round(targets.weight_kg_min - current.weight_kg, 2)
        : 0,
    body_fat_to_enter_band_pct_points: current.body_fat_pct > targets.body_fat_pct_max
      ? round(current.body_fat_pct - targets.body_fat_pct_max, 2)
      : current.body_fat_pct < targets.body_fat_pct_min
        ? round(targets.body_fat_pct_min - current.body_fat_pct, 2)
        : 0,
    body_fat_to_tight_target_pct_points: Math.max(0, round(current.body_fat_pct - targets.body_fat_pct_tight, 2))
  };
}

function scenarioBinding(body, tape) {
  const blockers = [];
  if (!body?.date) blockers.push('body_box');
  if (!body?.tight_body_fat_date) blockers.push('body_fat_8');
  if (!tape?.date) blockers.push('shoulder_waist');
  if (blockers.length) {
    return {
      status: 'locked',
      blockers,
      note: 'The physique binding target is only dated when every physique clock is dated.'
    };
  }
  const targets = [
    { target: 'body_box', date: body.date },
    { target: 'body_fat_8', date: body.tight_body_fat_date },
    { target: 'shoulder_waist', date: tape.date }
  ].sort((a, b) => a.date.localeCompare(b.date));
  return { status: 'dated', binding: targets.at(-1).target, date: targets.at(-1).date, targets };
}

export function buildForecast({
  items,
  asOf,
  targetsConfig,
  libraryByName = null,
  measuredRmrKcal = null,
  horizonDays = 730
} = {}) {
  const targets = bodyCompositionTargets(targetsConfig);
  const current = buildCurrentBodyState(items, asOf);
  const habitual = selectHabitualIntake(items, asOf);
  const calibration = buildEnergyCalibration(
    items,
    asOf,
    targetsConfig,
    libraryByName,
    { measuredRmrKcal }
  );

  let training = null;
  let asLogged = { status: 'locked', missing: ['usable energy calibration'] };
  let onPlan = { status: 'locked', missing: ['usable energy calibration'] };
  let onPlanIntake = null;

  if (calibration.status === 'ready' && current.status === 'ready' && habitual.status === 'ready' && targets) {
    training = buildTrainingSupport(
      items,
      asOf,
      calibration.window.days,
      targetsConfig,
      libraryByName,
      habitual.protein_g_day,
      current.weight_kg
    );

    asLogged = simulateBodyScenario({
      asOf,
      body: current,
      intakeKcalDay: habitual.calories_kcal_day,
      expenditureKcalDay: calibration.inferred_expenditure_kcal_day,
      expenditureRangeKcalDay: calibration.inferred_expenditure_95_range_kcal_day,
      partitionMode: training.lean_preservation_supported ? 'preserve_ffm' : 'forbes',
      targets,
      horizonDays
    });
    asLogged.assumption = training.lean_preservation_supported
      ? 'recent logged resistance and protein support the lean-preservation scenario'
      : 'recent logged behaviour does not meet the preservation gate, so Forbes/Hall partition is used';

    onPlanIntake = buildOnPlanIntake(items, asOf, calibration.window.days, targetsConfig, current.weight_kg);
    if (onPlanIntake.status === 'ready') {
      onPlan = simulateBodyScenario({
        asOf,
        body: current,
        intakeKcalDay: onPlanIntake.calories_kcal_day,
        expenditureKcalDay: calibration.inferred_expenditure_kcal_day,
        expenditureRangeKcalDay: calibration.inferred_expenditure_95_range_kcal_day,
        partitionMode: 'preserve_ffm',
        targets,
        horizonDays
      });
      onPlan.assumption = 'configured calorie targets plus genuine resistance stimulus and adequate protein; FFM preservation is a scenario assumption, not a guarantee';
    }
  }

  const tape = buildTapeForecast(items, asOf, Number(targets?.shoulder_waist_ratio));
  const lifts = buildLiftForecasts(items, asOf, targetsConfig);

  return {
    model_version: FORECAST_MODEL_VERSION,
    generated_for: asOf,
    references: MODEL_REFERENCES,
    current: {
      ...current,
      gaps: currentGaps(current, targets)
    },
    input_quality: {
      habitual_intake: habitual,
      energy_calibration: calibration,
      training_support: training,
      on_plan_intake: onPlanIntake
    },
    body: {
      targets,
      as_logged: asLogged,
      on_plan: onPlan
    },
    tape,
    lifts,
    physique_binding: {
      as_logged: scenarioBinding(asLogged, tape),
      on_plan: scenarioBinding(onPlan, tape)
    },
    strength_deadline: {
      date: targetsConfig?.forecast?.strength?.deadline ?? null,
      note: 'Strength clocks are separate from the physique binding date.'
    },
    medical_context: buildMedicalContext(items, asOf),
    mind_context: buildMindBehaviourContext(items, asOf),
    sleep: {
      status: 'unavailable',
      numeric_forecast_modifier_applied: false,
      note: 'Sleep is not currently recorded, so no proxy is invented.'
    }
  };
}
