import { load } from 'js-yaml';
import { parseEventDocument } from '../../../js/core/records.js';
import { buildHomeModel } from '../../../js/app/home-model.js';
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
  if (files.length > 0 && events.length === 0) {
    console.warn(`summarizeRecentHistory: all ${files.length} file(s) failed to parse; digest will look empty.`);
  }

  const { nutrition, targets, dayType, workoutStreak, completeness } = buildHomeModel({ events, targetsConfig, date: today });
  const yesterday = addCalendarDays(today, -1);
  const loggedYesterday = events.some(event => event.record.date === yesterday);
  const loggedToday = ['nutrition', 'fitness', 'diary', 'body', 'skincare'].filter(key => completeness[key]);

  return [
    `Today (${today}) so far: ${nutrition.calories} of ${targets.calories} kcal, ${nutrition.protein_g} of ${targets.protein_g} g protein, ${nutrition.fat_g} of ${targets.fat_ceiling_g} g fat ceiling.`,
    `Day type: ${dayType}. Workout streak: ${workoutStreak} day(s).`,
    `Logged today: ${loggedToday.length ? loggedToday.join(', ') : 'nothing yet'}.`,
    loggedYesterday ? 'Yesterday has at least one logged record.' : 'Nothing was logged yesterday.'
  ].join('\n');
}
