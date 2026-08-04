import { aggregateNutrition, getLoggingCompleteness, hasRecoveryBonus, resolveDayType } from '../core/aggregate.js';
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractLongTermTrends,
  extractRecentAgentActions,
  extractThisMonth,
  extractThisWeek,
  extractTodaysStatus
} from '../core/constraints.js';
import { getDayTargets } from '../core/targets.js';
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

function workoutCompleted(events, date) {
  return events.some(({ record }) => (
    record.type === 'workout' && record.date === date && record.status === 'completed'
  ));
}

function eatingTargetsForDay(events, date, targetsConfig) {
  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : null;
  const proteinTarget = targets?.protein_g ?? 0;
  const fatCeiling = targets?.fat_ceiling_g ?? 0;
  const hitProtein = proteinTarget > 0 && nutrition.protein_g >= proteinTarget;
  const underFatCeiling = fatCeiling > 0 && nutrition.fat_g <= fatCeiling;

  return { date, hitEatingTargets: hitProtein && underFatCeiling };
}

export function buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown, date }) {
  if (!date) throw new RangeError('Central Node display date is unavailable');
  const markdown = centralNodeMarkdown ?? '';

  const weekDates = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date);
  const monthDates = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date);

  const week = weekDates.map(day => ({ date: day, protein_g: aggregateNutrition(events, day).protein_g }));
  const loggingMonth = monthDates.map(day => {
    const completeness = getLoggingCompleteness(events, day);
    return { date: day, complete: completeness.complete === completeness.total };
  });
  const exerciseMonth = monthDates.map(day => ({ date: day, completed: workoutCompleted(events, day) }));
  const eatingMonth = monthDates.map(day => eatingTargetsForDay(events, day, targetsConfig));

  const nutrition = aggregateNutrition(events, date);
  const completeness = getLoggingCompleteness(events, date);

  return {
    date,
    sections: {
      constraints: extractConstraints(markdown),
      todaysStatus: extractTodaysStatus(markdown),
      thisWeek: extractThisWeek(markdown),
      thisMonth: extractThisMonth(markdown),
      longTermTrends: extractLongTermTrends(markdown),
      crossAgentCoordination: extractCrossAgentCoordination(markdown),
      recentAgentActions: extractRecentAgentActions(markdown)
    },
    completeness,
    liveStatus: {
      completeness,
      snapshot: {
        calories: nutrition.calories,
        protein_g: nutrition.protein_g,
        fat_g: nutrition.fat_g
      }
    },
    week,
    loggingMonth,
    exerciseMonth,
    eatingMonth
  };
}
