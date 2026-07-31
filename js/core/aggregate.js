import { addCalendarDays } from './time.js';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const DAY_TYPE_RANK = { movement: 0, workout_30: 1, workout_45_60: 2 };
const BODY_TYPES = new Set(['weight', 'composition']);

const toRecord = item => item?.record ?? item;
const getRecords = items => items.map(toRecord);
const sum = (items, field) => items.reduce(
  (total, item) => total + (Number(item[field]) || 0),
  0
);

export function aggregateNutrition(items, date) {
  const meals = getRecords(items).filter(record => record.type === 'meal' && record.date === date);
  const distribution = Object.fromEntries(MEAL_TYPES.map(mealType => [mealType, {
    protein_g: sum(meals.filter(meal => meal.meal === mealType), 'protein_g')
  }]));

  return {
    calories: sum(meals, 'calories'),
    protein_g: sum(meals, 'protein_g'),
    fat_g: sum(meals, 'fat_g'),
    sodium_mg: sum(meals, 'sodium_mg'),
    calcium_mg: sum(meals, 'calcium_mg'),
    polyphenol_score: sum(meals, 'polyphenol_score'),
    meals: distribution
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
