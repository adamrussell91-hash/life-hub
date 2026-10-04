/**
 * Day capacity: how much Adam has in the tank, from what he logged.
 *
 * Pure functions. Inputs are Life calendar events ({ record, body }) as the calendar
 * already loads them. Output is a percentage, a short note ("sore throat, poor sleep")
 * and the factors behind it, so the UI can explain itself and agents can cite it.
 *
 * The daily formula is the readiness model (readiness-model.js, documented in
 * docs/capacity-forecast-handoff/algorithm.md). This file keeps the calendar-facing API:
 * capacityForDates, load budgets and the long-range forecast series.
 */
import { READINESS, noteFor, readinessForDates } from './readiness-model.js';
import { symptomsInRecord } from './readiness-symptoms.js';

export const CAPACITY = Object.freeze({
  baseline: READINESS.normal, // a normal, unremarkable day
  floor: READINESS.floor,
  ceiling: READINESS.ceiling, // 100 is reachable: everything is peaches
  belowParPct: 60,
  softenPct: READINESS.softenPct, // under this the day is flagged and agents may propose softening it
  budgetHours: 6, // discretionary commitment hours a 100% day can carry
  recovery: 0.6, // long-range forecast: share of the gap to baseline still open after each day
  holidayLift: READINESS.holidayLift
});

/** Symptoms from a diary record: its `symptoms` array if present, else unnegated words in its text. */
export const symptomsIn = symptomsInRecord;

function clamp(pct) {
  return Math.round(Math.min(CAPACITY.ceiling, Math.max(CAPACITY.floor, pct)));
}

/**
 * Capacity for one day from that day's logs alone (no history).
 * - sleepHours: the sleep record dated this day (the night that ended this morning), or null
 * - diaries: diary events ({ record, body }) dated this day
 * Prefer capacityForDates, which carries each domain across days.
 */
export function dayCapacity({ sleepHours = null, diaries = [] } = {}) {
  const date = '2000-01-01';
  const events = diaries.map(d => ({ ...d, record: { type: 'diary', ...d.record, date } }));
  if (sleepHours != null && Number.isFinite(sleepHours)) events.push({ record: { type: 'sleep', date, duration_h: sleepHours } });
  if (!events.length) events.push({ record: { type: 'diary', date } });
  return readinessForDates(events, [date], { lookbackDays: 0 }).get(date);
}

export { noteFor };

/**
 * Forecast for a day with no logs yet, `daysAhead` after the last logged day.
 * Recovers toward baseline; holidays lift it a little.
 */
export function forecastCapacity(lastPct, daysAhead, { holiday = false } = {}) {
  const gap = CAPACITY.baseline - lastPct;
  const recovered = lastPct + gap * (1 - CAPACITY.recovery ** Math.max(0, daysAhead));
  const pct = clamp(recovered + (holiday ? CAPACITY.holidayLift : 0));
  return { pct, note: 'forecast', factors: [], soften: pct < CAPACITY.softenPct, forecast: true };
}

/**
 * Capacity for every date in `dateKeys` (ascending YYYY-MM-DD).
 * Logged days are observed; other days carry each domain forward with drift and are forecasts.
 * Evidence from the ten days before the first date counts, so a Monday sees Sunday.
 * `isHoliday(dateKey)` lifts forecasts a little in the holidays.
 */
export function capacityForDates(events, dateKeys, { isHoliday = () => false } = {}) {
  return readinessForDates(events, dateKeys, { isHoliday });
}

/**
 * Hours of commitment that draw on capacity. Class time, protected time (Corey, walls)
 * and logs do not count; appointments, meetings, PD, marking and workouts do.
 * items: [{ start, end, kind, protected?, isClass?, ghost? }] with start/end in hours.
 */
export function dayLoadHours(items) {
  return (items ?? [])
    .filter(i => !i.isClass && !i.protected && !i.ghost && i.kind !== 'corey' && i.kind !== 'log')
    .reduce((sum, i) => sum + Math.max(0, i.end - i.start), 0);
}

/** True when the day's load needs more than its capacity allows. */
export function isOverCapacity(pct, loadHours) {
  return loadHours > (pct / 100) * CAPACITY.budgetHours;
}

/**
 * A long forecast (the Almanac's tide chart): one point per date after the last log.
 * `pattern(dateKey)` adds what past terms say about that point in the term (e.g. the
 * report-writing dip); it returns a delta in percentage points. The band widens with
 * distance so the chart never pretends to know December.
 * Returns [{ date, pct, low, high }].
 */
export function forecastSeries(dateKeys, { lastPct, lastDate, isHoliday = () => false, pattern = () => 0 }) {
  const DAY = 86_400_000;
  const at = d => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return dateKeys.map(date => {
    const ahead = Math.max(0, Math.round((at(date) - at(lastDate)) / DAY));
    if (ahead === 0) return { date, pct: lastPct, low: lastPct, high: lastPct };
    const base = forecastCapacity(lastPct, ahead, { holiday: isHoliday(date) }).pct;
    const pct = clamp(base + pattern(date));
    const spread = 3 + 1.2 * Math.sqrt(ahead);
    return { date, pct, low: Math.max(CAPACITY.floor, Math.round(pct - spread)), high: Math.min(CAPACITY.ceiling, Math.round(pct + spread)) };
  });
}
