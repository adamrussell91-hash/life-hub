// Sara's Constraints-gated clinical eyes: bounded 7-day nutrition + recent
// workout completion signal, only injected when Constraints mention bone / iron / taper.
//
// Option 1 from docs/superpowers/plans/2026-09-05-restore-notion-agent-depth.md.
// Bounded blobs may load on Sara turns; prompt injection stays keyword-gated.

import { daysBetween } from '../../../apps/life/js/core/time.js';

export const NUTRITION_LOOKBACK_DAYS = 7;

export const CLINICAL_TRIGGER_RE =
  /osteopen|osteopor|bone density|dexa|iron infusion|ferratin|ferritin|iron therap|corticosteroid|prednisol|entocort|budesonide|steroid taper|\btaper\b/i;

export function constraintsNeedClinicalContext(constraintsText) {
  return CLINICAL_TRIGGER_RE.test(String(constraintsText ?? ''));
}

function sumFinite(records, key) {
  let total = 0;
  let seen = false;
  for (const record of records) {
    const value = record?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      total += value;
      seen = true;
    }
  }
  return seen ? total : null;
}

function averageDaily(total, dayCount) {
  if (total == null || !dayCount) return null;
  return Math.round((total / dayCount) * 10) / 10;
}

export function formatSaraNutritionWindowForPrompt({
  mealRecords = [],
  today,
  lookbackDays = NUTRITION_LOOKBACK_DAYS
} = {}) {
  const meals = (Array.isArray(mealRecords) ? mealRecords : []).filter(record => {
    if (!record?.date || record.type !== 'meal') return false;
    const age = daysBetween(record.date, today);
    return age != null && !Number.isNaN(age) && age >= 0 && age < lookbackDays;
  });
  if (!meals.length) {
    return `Nutrition window (past ${lookbackDays} days): no meal logs — ask Adam directly about calcium / protein / iron-rich intake rather than inventing a trend.`;
  }
  const days = new Set(meals.map(meal => meal.date));
  const dayCount = days.size;
  const calcium = averageDaily(sumFinite(meals, 'calcium_mg'), dayCount);
  const protein = averageDaily(sumFinite(meals, 'protein_g'), dayCount);
  const bits = [
    calcium != null ? `calcium ~${calcium} mg/day avg` : null,
    protein != null ? `protein ~${protein} g/day avg` : null,
    `${dayCount} day${dayCount === 1 ? '' : 's'} with meals`
  ].filter(Boolean);
  return `Nutrition window (past ${lookbackDays} days): ${bits.join('; ')}. Use for bone/iron framing only — do not dump a macro table.`;
}

export function formatSaraWorkoutSignalForPrompt({ workoutRecords = [], today } = {}) {
  const workouts = (Array.isArray(workoutRecords) ? workoutRecords : [])
    .filter(record => record?.date)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!workouts.length) {
    return 'Recent training signal: no completed workout logs in the bounded window — ask before claiming an exercise gap.';
  }
  const latest = workouts[0];
  const age = daysBetween(latest.date, today);
  const ageText = age == null || Number.isNaN(age)
    ? latest.date
    : age === 0
      ? 'today'
      : `${age} day${age === 1 ? '' : 's'} ago`;
  const title = latest.title || latest.name || latest.focus || 'session';
  return `Recent training signal: last logged session "${title}" ${ageText}. Coordinate weight-bearing / fatigue notes with Chadwick; do not rewrite his programme.`;
}

export function formatSaraClinicalContextForPrompt({
  constraintsText = '',
  mealRecords = [],
  workoutRecords = [],
  today
} = {}) {
  if (!constraintsNeedClinicalContext(constraintsText)) return '';
  const text = String(constraintsText);
  const triggers = [];
  if (/osteopen|osteopor|bone density|dexa/i.test(text)) triggers.push('bone');
  if (/iron infusion|ferratin|ferritin|iron therap/i.test(text)) triggers.push('iron');
  if (/corticosteroid|prednisol|entocort|budesonide|steroid taper|\btaper\b/i.test(text)) {
    triggers.push('taper');
  }
  return [
    `Constraints triggered clinical watch: ${triggers.join(', ') || 'general'}.`,
    formatSaraNutritionWindowForPrompt({ mealRecords, today }),
    formatSaraWorkoutSignalForPrompt({ workoutRecords, today }),
    'Call search_medical_records for the latest relevant labs before advising. Never hardcode stale Notion dates, doses, or lab values.'
  ].join('\n');
}
