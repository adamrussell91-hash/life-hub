import { aggregateNutrition, hasRecoveryBonus, resolveDayType } from '../core/aggregate.js';
import { getDayTargets } from '../core/targets.js';
import { comparePeriods } from '../core/trends.js';
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
export const PROTEIN_TREND_CONFIG = { unit: 'g', good: 'up', thresholds: [5, 15, 30] };

const EMPTY_TARGETS = {
  calories: 0,
  protein_g: 0,
  fat_ceiling_g: 0,
  sodium_ceiling_mg: 0,
  calcium_target_mg: 0,
  polyphenol_daily_aim: 0,
  meal_protein_g: { breakfast: 0, lunch: 0, dinner: 0, snack: 0, minimum: 0 }
};

function dailyNutrition(events, date, targetsConfig) {
  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : null;
  const proteinTarget = targets?.protein_g ?? 0;

  return {
    date,
    calories: nutrition.calories,
    protein_g: nutrition.protein_g,
    fat_g: nutrition.fat_g,
    proteinTarget,
    hitProtein: proteinTarget > 0 && nutrition.protein_g >= proteinTarget
  };
}

const averageProtein = days => (
  days.length === 0 ? 0 : days.reduce((sum, day) => sum + day.protein_g, 0) / days.length
);

export function buildNutritionModel({ events, targetsConfig, date }) {
  if (!date) throw new RangeError('Nutrition display date is unavailable');

  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : EMPTY_TARGETS;

  const week = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date)
    .map(day => dailyNutrition(events, day, targetsConfig));
  const month = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date)
    .map(day => dailyNutrition(events, day, targetsConfig));
  const previousWeek = enumerateDateKeys(
    addCalendarDays(date, -(2 * WEEK_DAYS - 1)),
    addCalendarDays(date, -WEEK_DAYS)
  ).map(day => dailyNutrition(events, day, targetsConfig));

  return {
    date,
    nutrition,
    dayType,
    targets,
    week,
    month,
    proteinTrend: comparePeriods(averageProtein(week), averageProtein(previousWeek), PROTEIN_TREND_CONFIG)
  };
}
