// Hyaluronica's treatment-window eyes: bounded skincare-log scan for clinic
// procedures, plus a 7-day nutrition rollup for the skin axis.
//
// Detection signal (do not invent another): skincare log markdown body starts
// with the literal string `Procedure:` — same filter apps/life/js/app/skincare-model.js
// already uses to separate clinic procedures from AM/PM routine logs.
//
// Budget discipline: selectors only inspect the already-fetched repo tree and
// return a capped path list. The caller reads only those blobs.

import { daysBetween } from '../../../apps/life/js/core/time.js';

export const SKINCARE_LOG_PATH =
  /^data\/skincare\/(?<year>\d{4})\/(?<month>\d{2})\/(?<date>\d{4}-\d{2}-\d{2})-(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export const NUTRITION_LOG_PATH =
  /^data\/nutrition\/(?<year>\d{4})\/(?<month>\d{2})\/(?<date>\d{4}-\d{2}-\d{2})-(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export const PROCEDURE_BODY_PREFIX = 'Procedure:';
export const PROCEDURE_LOOKBACK_DAYS = 21;
export const POST_PROCEDURE_WINDOW_DAYS = 14;
export const UPCOMING_APPOINTMENT_WINDOW_DAYS = 7;
export const NUTRITION_LOOKBACK_DAYS = 7;
export const MAX_SKINCARE_SCAN = 40;
export const MAX_NUTRITION_SCAN = 40;

export function isProcedureBody(body) {
  return String(body ?? '').startsWith(PROCEDURE_BODY_PREFIX);
}

export function procedureTitleFromBody(body) {
  const line = String(body ?? '').split('\n')[0] ?? '';
  if (!line.startsWith(PROCEDURE_BODY_PREFIX)) return null;
  return line.slice(PROCEDURE_BODY_PREFIX.length).replace(/\.\s*$/, '').trim() || 'Procedure';
}

function dateFromPath(path, regex) {
  const match = regex.exec(path);
  return match?.groups?.date ?? null;
}

function selectDatedEntries(tree, regex, { today, lookbackDays, limit }) {
  if (!Array.isArray(tree) || !today) return [];
  const out = [];
  for (const entry of tree) {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') continue;
    const date = dateFromPath(entry.path, regex);
    if (!date) continue;
    const age = daysBetween(date, today);
    if (age == null || Number.isNaN(age) || age < 0 || age > lookbackDays) continue;
    out.push(entry);
  }
  return out
    .slice()
    .sort((a, b) => String(b.path).localeCompare(String(a.path)))
    .slice(0, limit);
}

export function selectRecentSkincareEntries(tree, { today, lookbackDays = PROCEDURE_LOOKBACK_DAYS, limit = MAX_SKINCARE_SCAN } = {}) {
  return selectDatedEntries(tree, SKINCARE_LOG_PATH, { today, lookbackDays, limit });
}

export function selectRecentNutritionEntries(tree, { today, lookbackDays = NUTRITION_LOOKBACK_DAYS, limit = MAX_NUTRITION_SCAN } = {}) {
  return selectDatedEntries(tree, NUTRITION_LOG_PATH, { today, lookbackDays, limit });
}

/** Upcoming clinic/procedure cue from Constraints & Priorities prose (best-effort). */
export function findUpcomingProcedureInConstraints(constraintsText, { today, withinDays = UPCOMING_APPOINTMENT_WINDOW_DAYS } = {}) {
  const text = String(constraintsText ?? '');
  if (!text.trim() || !today) return null;
  for (const line of text.split('\n')) {
    if (!/(procedure|laser|peel|inject|filler|botox|clinic|contour)/i.test(line)) continue;
    const dates = line.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    for (const date of dates) {
      const delta = daysBetween(today, date);
      if (delta != null && !Number.isNaN(delta) && delta >= 0 && delta <= withinDays) {
        return { date, line: line.replace(/^[-*]\s*/, '').trim() };
      }
    }
  }
  return null;
}

export function formatTreatmentStateForPrompt({
  procedureEvents = [],
  constraintsText = '',
  today
} = {}) {
  if (!today) return '';

  const procedures = (Array.isArray(procedureEvents) ? procedureEvents : [])
    .filter(event => isProcedureBody(event?.body))
    .map(event => ({
      date: event.record?.date ?? dateFromPath(event.path ?? '', SKINCARE_LOG_PATH),
      title: procedureTitleFromBody(event.body),
      path: event.path ?? null
    }))
    .filter(event => event.date && event.title)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const recent = procedures.find(event => {
    const age = daysBetween(event.date, today);
    return age != null && !Number.isNaN(age) && age >= 0 && age <= POST_PROCEDURE_WINDOW_DAYS;
  });
  const upcoming = findUpcomingProcedureInConstraints(constraintsText, { today });

  if (!recent && !upcoming) {
    return 'Treatment state: no active treatment window (no Procedure: log in the last 14 days, no upcoming procedure flagged in Constraints within 7 days).';
  }

  const lines = ['Treatment state (clinic procedures — overrides routine optimisation when active):'];
  if (recent) {
    const age = daysBetween(recent.date, today);
    lines.push(
      `- Most recent procedure: ${recent.title} on ${recent.date} (${age} day${age === 1 ? '' : 's'} ago, still inside the 14-day recovery window). Shift into treatment-aware advice: pause routine optimisation unless clearly safe; prioritise protection, recovery, and contraindicated-product avoidance.`
    );
  }
  if (upcoming) {
    lines.push(
      `- Upcoming procedure flagged in Constraints: ${upcoming.date} — ${upcoming.line}. Pre-procedure mode: flag contraindicated actives/actions before that date.`
    );
  }
  return lines.join('\n');
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

export function formatNutritionSkinWeekForPrompt({ mealRecords = [], today, lookbackDays = NUTRITION_LOOKBACK_DAYS } = {}) {
  const meals = (Array.isArray(mealRecords) ? mealRecords : []).filter(record => {
    if (!record?.date || record.type !== 'meal') return false;
    const age = daysBetween(record.date, today);
    return age != null && !Number.isNaN(age) && age >= 0 && age < lookbackDays;
  });
  if (!meals.length) {
    return `Nutrition→skin (past ${lookbackDays} days): no meal logs in window — cannot assess calcium / protein / fat for barrier support.`;
  }

  const days = new Set(meals.map(meal => meal.date));
  const dayCount = days.size;
  const calcium = averageDaily(sumFinite(meals, 'calcium_mg'), dayCount);
  const protein = averageDaily(sumFinite(meals, 'protein_g'), dayCount);
  const fat = averageDaily(sumFinite(meals, 'fat_g'), dayCount);
  const omegaBits = meals.map(meal => meal.omega3).filter(Boolean);
  const omegaSummary = omegaBits.length
    ? `omega-3 tags seen: ${[...new Set(omegaBits)].join(', ')}`
    : 'omega-3 tags missing on meals';

  const bits = [
    calcium != null ? `calcium ~${calcium} mg/day avg` : null,
    protein != null ? `protein ~${protein} g/day avg` : null,
    fat != null ? `fat ~${fat} g/day avg` : null,
    omegaSummary
  ].filter(Boolean);

  return `Nutrition→skin (past ${lookbackDays} days, ${dayCount} day${dayCount === 1 ? '' : 's'} with meals): ${bits.join('; ')}. If calcium / protein / fat / omega-3s look consistently low, flag with a skin-specific framing and a concrete fix — do not dump the raw macro table at Adam.`;
}
