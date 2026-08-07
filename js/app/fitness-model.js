import { calculateWorkoutStreak, resolveDayType } from '../core/aggregate.js';
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';
import { resolveMuscleMapKeys } from './muscle-maps.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

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
    }))
  };
}
