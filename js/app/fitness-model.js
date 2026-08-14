import { calculateWorkoutStreak, resolveDayType } from '../core/aggregate.js';
import { addCalendarDays, enumerateDateKeys, getSydneyWeekStart } from '../core/time.js';
import { resolveMuscleMapKeys } from './muscle-maps.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const LONG_TERM_WEEKS = 26;
const WORKOUT_TARGET_PER_WEEK = 4;

export const REGION_KEYS = ['chest', 'arms', 'abs', 'legs', 'back'];

const REGION_LABELS = {
  chest: 'Chest',
  arms: 'Arms',
  abs: 'Abs',
  legs: 'Legs',
  back: 'Back'
};

const FOCUS_TO_REGION = {
  chest: 'chest',
  arms: 'arms',
  abs: 'abs',
  core: 'abs',
  legs: 'legs',
  back: 'back'
};

/** Name regex fallbacks — checked in REGION_KEYS order. */
const REGION_NAME_PATTERNS = [
  ['chest', /bench|\bchest\b|chest press|pec/i],
  ['arms', /\b(curl|tricep|triceps|bicep|biceps)\b/i],
  ['abs', /\b(crunch|plank|ab|abs|core)\b/i],
  ['legs', /\b(squat|deadlift|leg|lunge|rdl|calf|calves)\b/i],
  ['back', /\b(row|pull[\s-]?up|pullup|lat|pulldown)\b/i]
];

export function normalizeExerciseName(name) {
  return String(name ?? '').trim().toLowerCase();
}

export function estimateOneRepMax(weightKg, reps) {
  const w = Number(weightKg);
  const r = Number(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return null;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

export function bestSet(exercise) {
  let best = null;
  for (const set of exercise?.sets ?? []) {
    const e1rm = estimateOneRepMax(set.weight_kg, set.reps);
    if (e1rm == null) continue;
    if (!best || e1rm > best.e1rm) {
      best = { reps: set.reps, weight_kg: set.weight_kg, e1rm };
    }
  }
  return best;
}

export function sessionVolume(record) {
  if (!record || record.status !== 'completed') return 0;
  let total = 0;
  for (const exercise of record.exercises ?? []) {
    for (const set of exercise.sets ?? []) {
      const reps = Number(set.reps);
      const weight = Number(set.weight_kg);
      if (!Number.isFinite(reps) || !Number.isFinite(weight)) continue;
      total += reps * weight;
    }
  }
  return total;
}

function asFocusList(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

function focusToRegion(tag) {
  const key = String(tag ?? '').trim().toLowerCase();
  return FOCUS_TO_REGION[key] ?? null;
}

function regionFromName(name) {
  const text = String(name ?? '');
  for (const [region, pattern] of REGION_NAME_PATTERNS) {
    if (pattern.test(text)) return region;
  }
  return null;
}

/**
 * Map an exercise to a strength region.
 * Prefer focus tags (exercise, then unique workout focus), then name regex.
 */
export function resolveExerciseRegion(exercise, workoutFocus = []) {
  for (const tag of asFocusList(exercise?.focus ?? exercise?.focus_areas)) {
    const region = focusToRegion(tag);
    if (region) return region;
  }

  const workoutRegions = [...new Set(
    asFocusList(workoutFocus).map(focusToRegion).filter(Boolean)
  )];
  if (workoutRegions.length === 1) return workoutRegions[0];

  return regionFromName(exercise?.name);
}

function workoutEvents(events) {
  return (events ?? []).filter(event => event?.record?.type === 'workout');
}

function completedOn(events, date) {
  return events.some(({ record }) => record.date === date && record.status === 'completed');
}

function withHeroMeta(event) {
  if (!event) return null;
  return {
    ...event.record,
    path: event.path ?? null,
    notes: typeof event.body === 'string' ? event.body : (event.record.notes ?? '')
  };
}

function selectHeroSession(events, date) {
  const todaysCompleted = events
    .filter(({ record }) => record.date === date && record.status === 'completed')
    .sort((a, b) => String(b.record.time ?? '').localeCompare(String(a.record.time ?? '')));
  if (todaysCompleted[0]) return withHeroMeta(todaysCompleted[0]);

  const planned = events.find(({ record }) => record.date === date && record.status === 'planned');
  if (planned) return withHeroMeta(planned);

  const prior = events
    .filter(({ record }) => record.status === 'completed' && record.date <= date)
    .sort((a, b) => b.record.date.localeCompare(a.record.date)
      || String(b.record.time ?? '').localeCompare(String(a.record.time ?? '')));
  return withHeroMeta(prior[0] ?? null);
}

function buildComparisons(hero, events) {
  if (!hero?.exercises?.length) return [];
  const prior = events
    .map(({ record }) => record)
    .filter(record => record.status === 'completed' && record.date < hero.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  return hero.exercises.map(exercise => {
    const name = exercise.name;
    const key = normalizeExerciseName(name);
    const currentBest = bestSet(exercise);

    let previousBest = null;
    for (const session of prior) {
      const match = (session.exercises ?? []).find(ex => normalizeExerciseName(ex.name) === key);
      if (!match) continue;
      previousBest = bestSet(match);
      break;
    }

    let historicalBestE1rm = null;
    for (const session of prior) {
      for (const candidate of session.exercises ?? []) {
        if (normalizeExerciseName(candidate.name) !== key) continue;
        const set = bestSet(candidate);
        if (set && (historicalBestE1rm == null || set.e1rm > historicalBestE1rm)) {
          historicalBestE1rm = set.e1rm;
        }
      }
    }

    const firstLogged = historicalBestE1rm == null;
    const isPr = !firstLogged && currentBest != null && currentBest.e1rm > historicalBestE1rm;
    return {
      name,
      currentBest,
      previousBest,
      e1rm: currentBest?.e1rm ?? null,
      previousE1rm: previousBest?.e1rm ?? null,
      isPr: Boolean(isPr),
      firstLogged
    };
  });
}

function focusHits(events, weekDates) {
  const counts = new Map();
  for (const { record } of events) {
    if (record.status !== 'completed' || !weekDates.includes(record.date)) continue;
    for (const tag of record.focus ?? []) {
      const key = String(tag).trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function percentDelta(current, prior) {
  if (current == null || prior == null || !Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) {
    return null;
  }
  return ((current - prior) / Math.abs(prior)) * 100;
}

function strengthColour(deltaKg) {
  if (deltaKg == null || !Number.isFinite(deltaKg) || deltaKg === 0) return 'neutral';
  return deltaKg > 0 ? 'green' : 'red';
}

function bestWorkingWeight(exercise) {
  let best = null;
  for (const set of exercise?.sets ?? []) {
    const weight = Number(set.weight_kg);
    const reps = Number(set.reps);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!Number.isFinite(reps) || reps <= 0) continue;
    if (best == null || weight > best) best = weight;
  }
  return best;
}

function exerciseVolume(exercise) {
  let total = 0;
  for (const set of exercise?.sets ?? []) {
    const reps = Number(set.reps);
    const weight = Number(set.weight_kg);
    if (!Number.isFinite(reps) || !Number.isFinite(weight)) continue;
    total += reps * weight;
  }
  return total;
}

function regionMetricsForPeriod(events, from, to) {
  const bestByRegion = Object.fromEntries(REGION_KEYS.map(key => [key, null]));
  const volumeByRegion = Object.fromEntries(REGION_KEYS.map(key => [key, 0]));

  for (const { record } of events) {
    if (record.status !== 'completed' || record.date < from || record.date > to) continue;
    for (const exercise of record.exercises ?? []) {
      const region = resolveExerciseRegion(exercise, record.focus);
      if (!region) continue;
      const weight = bestWorkingWeight(exercise);
      if (weight != null && (bestByRegion[region] == null || weight > bestByRegion[region])) {
        bestByRegion[region] = weight;
      }
      volumeByRegion[region] += exerciseVolume(exercise);
    }
  }

  return { bestByRegion, volumeByRegion };
}

function buildRegions(events, date) {
  const currentFrom = addCalendarDays(date, -(MONTH_DAYS - 1));
  const priorTo = addCalendarDays(currentFrom, -1);
  const priorFrom = addCalendarDays(priorTo, -(MONTH_DAYS - 1));

  const current = regionMetricsForPeriod(events, currentFrom, date);
  const prior = regionMetricsForPeriod(events, priorFrom, priorTo);

  return REGION_KEYS.map(key => {
    const currentBest = current.bestByRegion[key];
    const priorBest = prior.bestByRegion[key];
    const bestSetDeltaKg = currentBest != null && priorBest != null
      ? currentBest - priorBest
      : null;
    const currentVol = current.volumeByRegion[key];
    const priorVol = prior.volumeByRegion[key];
    const volumeDeltaPct = priorVol > 0 ? percentDelta(currentVol, priorVol) : null;

    return {
      key,
      label: REGION_LABELS[key],
      image: `assets/fitness/regions/${key}.png`,
      bestSetDeltaKg,
      currentBestKg: currentBest,
      currentVolume: currentVol,
      volumeDeltaPct,
      colour: strengthColour(bestSetDeltaKg)
    };
  });
}

function buildLongTerm(events, date) {
  const endWeek = getSydneyWeekStart(date);
  const startWeek = addCalendarDays(endWeek, -7 * (LONG_TERM_WEEKS - 1));
  const seriesStart = startWeek;
  const seriesEnd = addCalendarDays(endWeek, 6);

  const weeklyVolume = [];
  for (let i = 0; i < LONG_TERM_WEEKS; i++) {
    const weekStart = addCalendarDays(startWeek, 7 * i);
    const weekEnd = addCalendarDays(weekStart, 6);
    let value = 0;
    for (const { record } of events) {
      if (record.status !== 'completed' || record.date < weekStart || record.date > weekEnd) continue;
      value += sessionVolume(record);
    }
    weeklyVolume.push({ weekStart, value });
  }

  const half = Math.floor(LONG_TERM_WEEKS / 2);
  const earlier = weeklyVolume.slice(0, half).reduce((sum, week) => sum + week.value, 0);
  const recent = weeklyVolume.slice(half).reduce((sum, week) => sum + week.value, 0);
  const volumeDeltaPct = percentDelta(recent, earlier);

  let completedCount = 0;
  for (const { record } of events) {
    if (record.status !== 'completed') continue;
    if (record.date < seriesStart || record.date > seriesEnd) continue;
    if (record.date > date) continue;
    completedCount += 1;
  }

  const workoutsPerWeek = completedCount / LONG_TERM_WEEKS;
  const adherencePct = (workoutsPerWeek / WORKOUT_TARGET_PER_WEEK) * 100;

  const currentFrom = addCalendarDays(date, -(MONTH_DAYS - 1));
  const priorTo = addCalendarDays(currentFrom, -1);
  const priorFrom = addCalendarDays(priorTo, -(MONTH_DAYS - 1));
  const current = regionMetricsForPeriod(events, currentFrom, date);
  const prior = regionMetricsForPeriod(events, priorFrom, priorTo);
  const strengthPcts = [];
  for (const key of REGION_KEYS) {
    const pct = percentDelta(current.bestByRegion[key], prior.bestByRegion[key]);
    if (pct != null) strengthPcts.push(pct);
  }

  const strengthDeltaPct = strengthPcts.length
    ? strengthPcts.reduce((sum, pct) => sum + pct, 0) / strengthPcts.length
    : null;

  return {
    weeklyVolume,
    volumeDeltaPct,
    workoutsPerWeek,
    adherencePct,
    strengthDeltaPct
  };
}

export function buildFitnessModel({ events, date, libraryByName = null }) {
  if (!date) throw new RangeError('Fitness display date is unavailable');
  const workoutEvts = workoutEvents(events);
  const weekDates = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date);
  const monthDates = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date);
  const heroSession = selectHeroSession(workoutEvts, date);
  if (heroSession) {
    heroSession.muscleMapKeys = resolveMuscleMapKeys({
      focus: heroSession.focus,
      exercises: heroSession.exercises,
      libraryByName
    });
  }

  const regions = buildRegions(workoutEvts, date);
  const longTerm = buildLongTerm(workoutEvts, date);

  return {
    date,
    dayType: resolveDayType(events, date),
    streak: calculateWorkoutStreak(events, date),
    weekDots: weekDates.map(day => ({
      date: day,
      completed: completedOn(workoutEvts, day),
      isToday: day === date
    })),
    heroSession,
    weekVolume: weekDates.map(day => ({
      date: day,
      volume: workoutEvts
        .filter(({ record }) => record.date === day && record.status === 'completed')
        .reduce((sum, { record }) => sum + sessionVolume(record), 0)
    })),
    focusHits: focusHits(workoutEvts, weekDates),
    comparisons: buildComparisons(heroSession, workoutEvts),
    month: monthDates.map(day => ({
      date: day,
      completed: completedOn(workoutEvts, day)
    })),
    longTerm,
    regions
  };
}
