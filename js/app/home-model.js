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

export function selectDisplayDate(events) {
  return events.map(event => event.record.date).sort().at(-1) ?? null;
}

export function buildHomeModel({ events, targetsConfig, date }) {
  if (!date) throw new RangeError('Home display date is unavailable');

  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = getDayTargets(targetsConfig, date, dayType, recovery);
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
