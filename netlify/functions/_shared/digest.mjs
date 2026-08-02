import { load } from 'js-yaml';
import { parseEventDocument } from '../../../js/core/records.js';
import {
  aggregateNutrition,
  calculateWorkoutStreak,
  getLoggingCompleteness,
  hasRecoveryBonus,
  resolveDayType
} from '../../../js/core/aggregate.js';
import { getDayTargets } from '../../../js/core/targets.js';
import { addCalendarDays } from '../../../js/core/time.js';

export function summarizeRecentHistory(files, targetsConfig, today) {
  const events = [];
  for (const file of files) {
    try {
      events.push(parseEventDocument(file.content, file.path, load));
    } catch {
      // A file that fails validation is skipped: the digest is best-effort chat context, not the record of truth.
    }
  }

  const nutrition = aggregateNutrition(events, today);
  const dayType = resolveDayType(events, today);
  const recovery = hasRecoveryBonus(events, today);
  const targets = getDayTargets(targetsConfig, today, dayType, recovery);
  const completeness = getLoggingCompleteness(events, today);
  const streak = calculateWorkoutStreak(events, today);
  const yesterday = addCalendarDays(today, -1);
  const loggedYesterday = events.some(event => event.record.date === yesterday);
  const loggedToday = ['nutrition', 'fitness', 'diary', 'body', 'skincare'].filter(key => completeness[key]);

  return [
    `Today (${today}) so far: ${nutrition.calories} of ${targets.calories} kcal, ${nutrition.protein_g} of ${targets.protein_g} g protein, ${nutrition.fat_g} of ${targets.fat_ceiling_g} g fat ceiling.`,
    `Day type: ${dayType}. Workout streak: ${streak} day(s).`,
    `Logged today: ${loggedToday.length ? loggedToday.join(', ') : 'nothing yet'}.`,
    loggedYesterday ? 'Yesterday has at least one logged record.' : 'Nothing was logged yesterday.'
  ].join('\n');
}
