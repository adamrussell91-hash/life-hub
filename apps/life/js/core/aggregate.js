import { addCalendarDays } from './time.js';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'];
// A logged day at or above this total is complete enough to treat as daily intake.
// Below it, recorded foods stay real but are not a full day. Zero is unknown, not fasting.
export const NUTRITION_COMPLETE_KCAL = 1000;

export function nutritionLoggingStatus(loggedCalories, loggedMealCount) {
  const meals = Number(loggedMealCount) || 0;
  const calories = Number(loggedCalories);
  const kcal = Number.isFinite(calories) ? calories : 0;
  if (meals <= 0 || kcal <= 0) return 'unlogged';
  if (kcal >= NUTRITION_COMPLETE_KCAL) return 'complete';
  return 'partial';
}

const OMEGA3_LEVELS = ['high', 'medium', 'low', 'none'];
const DAY_TYPE_RANK = { movement: 0, workout_30: 1, workout_45_60: 2 };
const BODY_TYPES = new Set(['weight', 'composition']);

const toRecord = item => item?.record ?? item;
const getRecords = items => items.map(toRecord);
// Round to 1 decimal so summed meal macros don't print as 135.10000000000002.
const sum = (items, field) => {
  const total = items.reduce(
    (acc, item) => acc + (Number(item[field]) || 0),
    0
  );
  return Math.round(total * 10) / 10;
};

/** Grams for UI: whole numbers stay bare; otherwise one decimal (no float noise). */
export function formatGrams(n) {
  const v = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function aggregateNutrition(items, date) {
  const meals = getRecords(items).filter(record => record.type === 'meal' && record.date === date);
  const distribution = Object.fromEntries(MEAL_TYPES.map(mealType => [mealType, {
    protein_g: sum(meals.filter(meal => meal.meal === mealType), 'protein_g')
  }]));

  // omega3 is a categorical field, so it tallies by level rather than summing. It is
  // mandatory on every meal but had no reader anywhere in the system until now.
  const omega3 = Object.fromEntries(OMEGA3_LEVELS.map(level => [
    level,
    meals.filter(meal => meal.omega3 === level).length
  ]));

  const calories = sum(meals, 'calories');
  const protein_g = sum(meals, 'protein_g');
  const mealTypes = [
    ...MEAL_TYPES.filter(mealType => meals.some(meal => meal.meal === mealType)),
    ...[...new Set(meals.map(meal => meal.meal).filter(meal => meal && !MEAL_TYPES.includes(meal)))].sort()
  ];
  const nutrition_logging_status = nutritionLoggingStatus(calories, meals.length);
  // daily_intake_* is null unless the day is complete. logged_* is only what was written down.
  // Unlogged must stay unknown — a 0 here is "nothing recorded", not "ate nothing".
  const intakeKnown = nutrition_logging_status === 'complete';

  return {
    calories,
    protein_g,
    fat_g: sum(meals, 'fat_g'),
    carbs_g: sum(meals, 'carbs_g'),
    sodium_mg: sum(meals, 'sodium_mg'),
    calcium_mg: sum(meals, 'calcium_mg'),
    polyphenol_score: sum(meals, 'polyphenol_score'),
    omega3,
    meals: distribution,
    logged_calories: calories,
    logged_protein_g: protein_g,
    logged_meal_count: meals.length,
    meal_types: mealTypes,
    nutrition_logging_status,
    daily_intake_kcal: intakeKnown ? calories : null,
    daily_intake_protein_g: intakeKnown ? protein_g : null
  };
}

export function resolveDayType(items, date) {
  return getRecords(items)
    .filter(record => record.type === 'workout' && record.date === date && record.status === 'completed')
    .reduce(
      (best, record) => DAY_TYPE_RANK[record.day_type] > DAY_TYPE_RANK[best] ? record.day_type : best,
      'movement'
    );
}

export function hasRecoveryBonus(items, date) {
  const previousDate = addCalendarDays(date, -1);
  return getRecords(items).some(record => record.type === 'workout'
    && record.date === previousDate
    && record.status === 'completed'
    && record.recovery_flag_next_day === true);
}

export function calculateWorkoutStreak(items, asOfDate) {
  const completedDates = new Set(getRecords(items)
    .filter(record => record.type === 'workout'
      && record.status === 'completed'
      && record.date <= asOfDate)
    .map(record => record.date));
  const mostRecentDate = [...completedDates].sort().at(-1);
  if (!mostRecentDate) return 0;

  let streak = 0;
  for (let date = mostRecentDate; completedDates.has(date); date = addCalendarDays(date, -1)) {
    streak += 1;
  }
  return streak;
}

export function getTopSets(item) {
  const workout = toRecord(item);
  const topSets = {};

  for (const exercise of workout.exercises ?? []) {
    for (const set of exercise.sets ?? []) {
      const current = topSets[exercise.name];
      if (!current
        || set.weight_kg > current.weight_kg
        || (set.weight_kg === current.weight_kg && set.reps > current.reps)) {
        topSets[exercise.name] = { weight_kg: set.weight_kg, reps: set.reps };
      }
    }
  }
  return topSets;
}

export function getLoggingCompleteness(items, date) {
  const records = getRecords(items);
  const previousDate = addCalendarDays(date, -1);
  const result = {
    nutrition: records.some(record => record.type === 'meal' && record.date === date),
    fitness: records.some(record => record.type === 'workout' && record.date === date),
    diary: records.some(record => record.type === 'diary' && record.date === date),
    body: records.some(record => BODY_TYPES.has(record.type)
      && record.date >= previousDate
      && record.date <= date),
    skincare: records.some(record => record.type === 'skincare' && record.date === date)
  };

  return {
    ...result,
    complete: Object.values(result).filter(Boolean).length,
    total: 5
  };
}
