/**
 * Day capacity: how much Adam has in the tank, from what he logged.
 *
 * Pure functions. Inputs are Life calendar events ({ record, body }) as the calendar
 * already loads them. Output is a percentage, a short note ("sore throat, poor sleep")
 * and the factors behind it, so the UI can explain itself and agents can cite it.
 *
 * Every number lives in CAPACITY. Tune there, never in a view.
 * Reference: docs/superpowers/specs/2026-09-24-calendar-design.md ("Capacity").
 */

export const CAPACITY = Object.freeze({
  baseline: 80,
  floor: 10,
  ceiling: 95,
  sleepTarget: 7, // hours; below this costs capacity
  sleepPoor: 6, // below this the note says "poor sleep", else "short sleep"
  sleepPerHour: 8,
  sleepMaxPenalty: 30,
  energy: Object.freeze({ low: -15, medium: 0, high: 8 }),
  lowMoodScore: 3, // mood_score (1-10) at or below this costs capacity
  lowMoodPenalty: 8,
  symptomPenalty: 15,
  symptomMaxPenalty: 25,
  belowParPct: 60, // a day under this counts toward a streak
  streakPenalty: 4,
  streakMax: 8,
  softenPct: 40, // under this the day is flagged and agents may propose softening it
  budgetHours: 6, // discretionary commitment hours a 100% day can carry
  recovery: 0.6, // forecast: share of the gap to baseline still open after each day
  holidayLift: 5
});

/**
 * Symptom words recognised in diary text until the diary schema carries `symptoms`.
 * Order matters for the note: the first match is named.
 */
const SYMPTOM_PATTERNS = [
  ['sore throat', /\bsore throat\b/i],
  ['sniffles', /\bsniffl(?:es|y)\b|\brunny nose\b/i],
  ['run down', /\brun[- ]down\b/i],
  ['viral', /\bviral\b|\bvirus\b|\bflu\b/i],
  ['headache', /\bheadache\b|\bmigraine\b/i],
  ['nausea', /\bnause(?:a|ous)\b/i],
  ['flare', /\bflare(?:[- ]up)?\b/i],
  ['cramps', /\bcramp(?:s|ing)?\b/i],
  ['fatigue', /\bfatigue\b|\bexhausted\b|\bwiped out\b/i],
  ['fever', /\bfever\b|\btemperature\b/i]
];

/** Symptoms from a diary record: its `symptoms` array if present, else words in its text. */
export function symptomsIn(record, body = '') {
  if (Array.isArray(record?.symptoms)) {
    return record.symptoms.map(s => String(s).trim()).filter(Boolean);
  }
  const text = `${record?.title ?? ''}\n${record?.notes ?? ''}\n${body ?? ''}`;
  return SYMPTOM_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function clamp(pct) {
  return Math.round(Math.min(CAPACITY.ceiling, Math.max(CAPACITY.floor, pct)));
}

/**
 * Capacity for one day.
 * - sleepHours: the sleep record dated this day (the night that ended this morning), or null
 * - diaries: diary events ({ record, body }) dated this day
 * - priorBelowPar: consecutive earlier days under CAPACITY.belowParPct
 */
export function dayCapacity({ sleepHours = null, diaries = [], priorBelowPar = 0 } = {}) {
  const factors = [];
  if (sleepHours != null && Number.isFinite(sleepHours) && sleepHours < CAPACITY.sleepTarget) {
    const delta = -Math.min(CAPACITY.sleepMaxPenalty, (CAPACITY.sleepTarget - sleepHours) * CAPACITY.sleepPerHour);
    factors.push({ id: 'sleep', label: sleepHours < CAPACITY.sleepPoor ? 'poor sleep' : 'short sleep', delta });
  }
  const energies = diaries.map(d => d.record?.energy).filter(e => e in CAPACITY.energy);
  if (energies.length) {
    // The lowest energy logged that day wins: a bad afternoon is the day's truth.
    const worst = energies.reduce((a, b) => (CAPACITY.energy[a] <= CAPACITY.energy[b] ? a : b));
    const delta = CAPACITY.energy[worst];
    if (delta !== 0) factors.push({ id: 'energy', label: `${worst} energy`, delta });
  }
  const scores = diaries.map(d => d.record?.mood_score).filter(Number.isFinite);
  if (scores.length && Math.min(...scores) <= CAPACITY.lowMoodScore) {
    factors.push({ id: 'mood', label: 'low mood', delta: -CAPACITY.lowMoodPenalty });
  }
  const symptoms = [...new Set(diaries.flatMap(d => symptomsIn(d.record, d.body)))];
  if (symptoms.length) {
    const delta = -Math.min(CAPACITY.symptomMaxPenalty, symptoms.length * CAPACITY.symptomPenalty);
    factors.push({ id: 'symptoms', label: symptoms.slice(0, 2).join(', '), delta, symptoms });
  }
  if (priorBelowPar > 0) {
    const delta = -Math.min(CAPACITY.streakMax, priorBelowPar * CAPACITY.streakPenalty);
    factors.push({ id: 'streak', label: `${ordinal(priorBelowPar + 1)} low day in a row`, delta });
  }
  const pct = clamp(CAPACITY.baseline + factors.reduce((sum, f) => sum + f.delta, 0));
  return { pct, note: noteFor(factors), factors, soften: pct < CAPACITY.softenPct, forecast: false };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** The two biggest drains, symptoms and sleep first on ties. "steady" when nothing drains. */
export function noteFor(factors) {
  const order = { symptoms: 0, sleep: 1, energy: 2, mood: 3, streak: 4 };
  const drains = factors
    .filter(f => f.delta < 0)
    .sort((a, b) => a.delta - b.delta || order[a.id] - order[b.id]);
  if (!drains.length) return factors.some(f => f.delta > 0) ? 'good energy' : 'steady';
  const main = drains.find(f => f.id !== 'streak') ?? drains[0];
  const second = drains.find(f => f !== main && f.id !== 'streak');
  const firstLabel = main.id === 'symptoms' ? main.symptoms[0] : main.label;
  return second ? `${firstLabel}, ${second.id === 'symptoms' ? second.symptoms[0] : second.label}` : firstLabel;
}

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
 * Logged days are computed; days after the last logged day are forecast.
 * `isHoliday(dateKey)` lets forecasts lift in the holidays.
 */
export function capacityForDates(events, dateKeys, { isHoliday = () => false } = {}) {
  const byDate = new Map(dateKeys.map(d => [d, { sleepHours: null, diaries: [] }]));
  for (const event of events ?? []) {
    const rec = event?.record;
    const slot = rec && byDate.get(rec.date);
    if (!slot) continue;
    if (rec.type === 'sleep' && Number.isFinite(rec.duration_h)) slot.sleepHours = rec.duration_h;
    if (rec.type === 'diary') slot.diaries.push(event);
  }
  const out = new Map();
  let streak = 0;
  let last = null;
  let lastIndex = -1;
  dateKeys.forEach((date, i) => {
    const slot = byDate.get(date);
    const logged = slot.sleepHours != null || slot.diaries.length > 0;
    if (logged) {
      const result = dayCapacity({ ...slot, priorBelowPar: streak });
      out.set(date, result);
      streak = result.pct < CAPACITY.belowParPct ? streak + 1 : 0;
      last = result.pct;
      lastIndex = i;
    } else if (last != null) {
      out.set(date, forecastCapacity(last, i - lastIndex, { holiday: isHoliday(date) }));
    } else {
      out.set(date, { pct: CAPACITY.baseline, note: 'no logs', factors: [], soften: false, forecast: true });
    }
  });
  return out;
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
