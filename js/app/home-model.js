import {
  aggregateNutrition,
  calculateWorkoutStreak,
  getLoggingCompleteness,
  hasRecoveryBonus,
  resolveDayType
} from '../core/aggregate.js';
import { getDayTargets } from '../core/targets.js';

const percentage = (value, target) => (
  target > 0 ? Math.round((value / target) * 100) : 0
);

// A repository with no config/targets.yml yet (e.g. a freshly created data repo) is a
// recoverable state, not a fatal one -- load-live-events.js already reports it as a
// "missing_targets" warning rather than an error. Falling back to zeroed targets here
// keeps that contract honest instead of crashing the whole dashboard.
const EMPTY_TARGETS = {
  calories: 0,
  protein_g: 0,
  fat_ceiling_g: 0,
  sodium_ceiling_mg: 0,
  calcium_target_mg: 0,
  polyphenol_daily_aim: 0,
  meal_protein_g: { breakfast: 0, lunch: 0, dinner: 0, snack: 0, minimum: 0 }
};

export function selectDisplayDate(events) {
  return events.map(event => event.record.date).sort().at(-1) ?? null;
}

export function buildHomeModel({ events, targetsConfig, date }) {
  if (!date) throw new RangeError('Home display date is unavailable');

  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : EMPTY_TARGETS;
  const completeness = getLoggingCompleteness(events, date);

  return {
    date,
    nutrition,
    targets,
    dayType,
    recovery,
    workoutStreak: calculateWorkoutStreak(events, date),
    completeness,
    progress: {
      calories: percentage(nutrition.calories, targets.calories),
      protein: percentage(nutrition.protein_g, targets.protein_g),
      fat: percentage(nutrition.fat_g, targets.fat_ceiling_g),
      logging: percentage(completeness.complete, completeness.total)
    }
  };
}
