import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { load } from 'js-yaml';
import { parseEventDocument } from '../apps/life/js/core/records.js';
import { getSydneyDateKey } from '../apps/life/js/core/time.js';
import { backfillForecastInputs } from '../apps/life/js/core/forecast-inputs.js';
import { TARGETS_CONFIG } from '../netlify/functions/_shared/targets-config.mjs';

const dataRoot = process.argv[2];
if (!dataRoot) {
  console.error('Usage: node scripts/forecast-backfill-report.mjs <life-hub-data-root>');
  process.exit(1);
}

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.name.endsWith('.md') ? [path] : [];
  }))).flat();
}

const domains = ['nutrition', 'fitness', 'body'];
const paths = (await Promise.all(domains.map(async domain => {
  try {
    return await files(join(dataRoot, 'data', domain));
  } catch {
    return [];
  }
}))).flat().filter(path => !path.includes(`${sep}templates${sep}`)).sort();

const events = [];
const unclassified = [];
for (const path of paths) {
  const repoPath = relative(dataRoot, path).split(sep).join('/');
  try {
    events.push(parseEventDocument(await readFile(path, 'utf8'), repoPath, load));
  } catch (error) {
    unclassified.push({ path: repoPath, error: error.message });
  }
}

let libraryByName = null;
try {
  const library = JSON.parse(await readFile(join(dataRoot, 'data', 'exercise-library.json'), 'utf8'));
  libraryByName = new Map(library.map(entry => [entry.name, entry]));
} catch (error) {
  unclassified.push({ path: 'data/exercise-library.json', error: error.message });
}

const records = events.map(event => event.record);
const before = JSON.stringify(records.map(record => ({
  id: record.id, type: record.type, date: record.date, calories: record.calories, exercises: record.exercises
})));
const asOf = getSydneyDateKey();
const mealDates = records.filter(record => record.type === 'meal' && record.date).map(record => record.date).sort();
const loggedAsOf = mealDates.at(-1) ?? asOf;
const derived = backfillForecastInputs(events, {
  asOf,
  targetsConfig: TARGETS_CONFIG,
  libraryByName
});
const again = backfillForecastInputs(events, {
  asOf,
  targetsConfig: TARGETS_CONFIG,
  libraryByName
});
const loggedDerived = loggedAsOf === asOf ? derived : backfillForecastInputs(events, {
  asOf: loggedAsOf,
  targetsConfig: TARGETS_CONFIG,
  libraryByName
});
const after = JSON.stringify(records.map(record => ({
  id: record.id, type: record.type, date: record.date, calories: record.calories, exercises: record.exercises
})));

const nutritionDays = derived.nutrition?.daily ?? [];
const intakeChecks = {
  complete_below_1000: nutritionDays.filter(day => day.nutrition_logging_status === 'complete' && day.logged_calories < 1000).length,
  partial_outside_band: nutritionDays.filter(day => day.nutrition_logging_status === 'partial' && !(day.logged_calories > 0 && day.logged_calories < 1000)).length,
  unlogged_with_intake: nutritionDays.filter(day => day.nutrition_logging_status === 'unlogged' && day.daily_intake_kcal != null).length,
  source_unchanged: before === after,
  idempotent: JSON.stringify(derived) === JSON.stringify(again)
};

const mealLine = intake => (intake?.meal_pattern?.meals ?? []).map(meal => ({
  meal: meal.meal,
  occurrences: meal.occurrences,
  frequency: meal.frequency,
  typical_calories: meal.typical_calories,
  typical_protein_g: meal.typical_protein_g,
  weekday_frequency: meal.weekday_frequency,
  weekend_frequency: meal.weekend_frequency,
  recent_frequency: meal.recent_frequency,
  recent_typical_calories: meal.recent_typical_calories
}));

const windowSummary = (source, days) => {
  const block = source.windows[String(days)];
  const intake = block.habitual_intake;
  const training = block.training;
  return {
    days,
    date_range: intake.date_range,
    complete_days: intake.complete_days,
    partial_days: intake.partial_days,
    unlogged_days: intake.unlogged_days,
    logging_coverage: intake.logging_coverage,
    direct_calories_median: intake.direct_calories,
    direct_calories_mean: intake.direct_calories_mean,
    direct_protein_median: intake.direct_protein_g,
    reconstructed_expected_calories: intake.reconstructed_expected_calories,
    reconstructed_expected_protein_g: intake.reconstructed_expected_protein_g,
    reconstructed_expected_calories_weekday: intake.reconstructed_expected_calories_weekday,
    reconstructed_expected_calories_weekend: intake.reconstructed_expected_calories_weekend,
    reliability: intake.reliability,
    meals: mealLine(intake),
    genuine_loaded_sessions: training.genuine_loaded_sessions,
    valid_loaded_sets: training.valid_loaded_sets,
    sessions_per_week: training.sessions_per_week,
    loaded_sets_per_week: training.loaded_sets_per_week,
    recent_sessions_per_week: training.recent_sessions_per_week,
    loaded_sets_by_muscle_group: training.loaded_sets_by_muscle_group,
    loaded_sets_by_resistance_mode: training.loaded_sets_by_resistance_mode,
    target_lift_exposures: training.target_lift_exposures,
    ignored: training.ignored
  };
};

const report = {
  as_of: derived.as_of,
  last_logged_date: loggedAsOf,
  parsed_records: records.length,
  unclassified,
  checks: intakeChecks,
  nutrition: {
    date_range: derived.nutrition.date_range,
    days: derived.nutrition.days,
    complete_days: derived.nutrition.complete_days,
    partial_days: derived.nutrition.partial_days,
    unlogged_days: derived.nutrition.unlogged_days,
    full_history: derived.nutrition.habitual_intake && {
      direct_calories_median: derived.nutrition.habitual_intake.direct_calories,
      direct_calories_mean: derived.nutrition.habitual_intake.direct_calories_mean,
      direct_protein_median: derived.nutrition.habitual_intake.direct_protein_g,
      reconstructed_expected_calories: derived.nutrition.habitual_intake.reconstructed_expected_calories,
      reconstructed_expected_protein_g: derived.nutrition.habitual_intake.reconstructed_expected_protein_g,
      logging_coverage: derived.nutrition.habitual_intake.logging_coverage,
      meals: mealLine(derived.nutrition.habitual_intake)
    }
  },
  recent_ending_today: {
    28: windowSummary(derived, 28),
    56: windowSummary(derived, 56)
  },
  recent_ending_last_log: {
    28: windowSummary(loggedDerived, 28),
    42: windowSummary(loggedDerived, 42),
    56: windowSummary(loggedDerived, 56)
  },
  training_history: {
    window: derived.training.window,
    genuine_loaded_sessions: derived.training.genuine_loaded_sessions,
    valid_loaded_sets: derived.training.valid_loaded_sets,
    sessions_per_week: derived.training.sessions_per_week,
    target_lift_exposures: derived.training.target_lift_exposures,
    ignored: derived.training.ignored,
    unclassified_exercises: derived.training.unclassified_exercises
  },
  weight: derived.weight.prompt,
  data_quality: derived.data_quality
};

console.log(JSON.stringify(report, null, 2));
