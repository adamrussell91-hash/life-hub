import { load } from 'js-yaml';
import { parseEventDocument } from '../../../apps/life/js/core/records.js';
// Deliberately reused from the browser bundle: pure aggregation logic with no DOM
// dependency, kept as one source of truth rather than re-derived for the server digest.
import { buildHomeModel } from '../../../apps/life/js/app/home-model.js';
import { addCalendarDays } from '../../../apps/life/js/core/time.js';

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
    // Sodium, calcium, polyphenol and omega-3 are mandatory on every meal Brisket logs.
    // They were aggregated for the Nutrition tab but never surfaced here, so the agent
    // requiring them could never read a day total back -- see the 2026-08-11 Brisket audit.
    `Micronutrients so far: ${nutrition.sodium_mg} of ${targets.sodium_ceiling_mg} mg sodium ceiling, ${nutrition.calcium_mg} of ${targets.calcium_target_mg} mg calcium target, polyphenol score ${nutrition.polyphenol_score} against a daily aim of ${targets.polyphenol_daily_aim}.`,
    `Omega-3 across today's meals: ${formatOmega3Tally(nutrition.omega3)}.`,
    `Protein by meal so far: ${formatMealSplit(nutrition.meals, targets.meal_protein_g)}.`,
    `Day type: ${dayType}. Workout streak: ${workoutStreak} day(s).`,
    `Logged today: ${loggedToday.length ? loggedToday.join(', ') : 'nothing yet'}.`,
    loggedYesterday ? 'Yesterday has at least one logged record.' : 'Nothing was logged yesterday.'
  ].join('\n');
}

function formatOmega3Tally(tally) {
  const levels = ['high', 'medium', 'low', 'none'];
  const present = levels.filter(level => (tally?.[level] ?? 0) > 0);
  if (present.length === 0) return 'no meals logged yet';
  return present.map(level => `${tally[level]} ${level}`).join(', ');
}

function formatMealSplit(meals, guides) {
  return ['breakfast', 'lunch', 'dinner', 'snack']
    .map(slot => {
      const logged = meals?.[slot]?.protein_g ?? 0;
      const guide = guides?.[slot] ?? 0;
      return logged > 0 ? `${slot} ${logged} g` : `${slot} not logged (guide ${guide} g)`;
    })
    .join(', ');
}
