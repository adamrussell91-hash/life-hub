/**
 * Day capacity: one number per day, the same in every view.
 *
 * Since Oct 2026 this is the readiness model (readiness-model.js, see
 * docs/capacity-forecast-handoff/BUILD.md): sleep, diaries, check-ins, workload and
 * training, with an uncertainty band and an explanation. Every caller — Day, Week,
 * Term, Year, Almanac, hub calendars, ghost proposer, goal reads — goes through
 * capacityForDates / forecastSeries here, so the same day never shows two numbers.
 *
 * Pure functions. Load-budget helpers (dayLoadHours, isOverCapacity) live here too.
 */
import { READINESS, RECOVERY, forecastAhead, readinessForDates, symptomsIn } from './readiness-model.js';

export { symptomsIn };

export const CAPACITY = Object.freeze({
  baseline: READINESS.baseline,
  floor: 0,
  ceiling: 100, // 100 means full capacity, and it is reachable
  belowParPct: 60,
  softenPct: 40, // under this the day is flagged and agents may propose softening it
  budgetHours: 6, // discretionary commitment hours a 100% day can carry
  recovery: RECOVERY.rate,
  holidayLift: RECOVERY.holidayLift
});

function clamp(pct) {
  return Math.round(Math.min(CAPACITY.ceiling, Math.max(CAPACITY.floor, pct)));
}

/** Forecast for a day with no logs, `daysAhead` after the last logged day. */
export function forecastCapacity(lastPct, daysAhead, { holiday = false } = {}) {
  const pct = forecastAhead(lastPct, daysAhead, { holiday });
  return { pct, note: 'forecast', factors: [], soften: pct < CAPACITY.softenPct, forecast: true };
}

/**
 * Capacity for every date in `dateKeys` (YYYY-MM-DD).
 * Pass `today` so today is always computed, and include check-in events
 * (checkinEvents) so answers count the same everywhere.
 */
export function capacityForDates(events, dateKeys, { isHoliday = () => false, today = null } = {}) {
  return readinessForDates(events, dateKeys, { isHoliday, today });
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
    const base = forecastAhead(lastPct, ahead, { holiday: isHoliday(date) });
    const pct = clamp(base + pattern(date));
    const spread = 3 + 1.2 * Math.sqrt(ahead);
    return { date, pct, low: Math.max(CAPACITY.floor, Math.round(pct - spread)), high: Math.min(CAPACITY.ceiling, Math.round(pct + spread)) };
  });
}
