import { calculateWorkoutStreak, resolveDayType } from '../core/aggregate.js';
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';

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

function workoutRecords(events) {
  return events
    .map(event => event.record)
    .filter(record => record?.type === 'workout');
}

function completedOn(records, date) {
  return records.some(record => record.date === date && record.status === 'completed');
}

function selectHeroSession(records, date) {
  const todaysCompleted = records
    .filter(record => record.date === date && record.status === 'completed')
    .sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? '')));
  if (todaysCompleted[0]) return todaysCompleted[0];

  const planned = records.find(record => record.date === date && record.status === 'planned');
  if (planned) return planned;

  return records
    .filter(record => record.status === 'completed' && record.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.time ?? '').localeCompare(String(a.time ?? '')))
    .at(0) ?? null;
}

function buildComparisons(hero, records) {
  if (!hero?.exercises?.length) return [];
  const prior = records
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

function focusHits(records, weekDates) {
  const counts = new Map();
  for (const record of records) {
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

export function buildFitnessModel({ events, date }) {
  if (!date) throw new RangeError('Fitness display date is unavailable');
  const records = workoutRecords(events);
  const weekDates = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date);
  const monthDates = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date);
  const heroSession = selectHeroSession(records, date);

  return {
    date,
    dayType: resolveDayType(events, date),
    streak: calculateWorkoutStreak(events, date),
    weekDots: weekDates.map(day => ({
      date: day,
      completed: completedOn(records, day),
      isToday: day === date
    })),
    heroSession,
    weekVolume: weekDates.map(day => ({
      date: day,
      volume: records
        .filter(record => record.date === day && record.status === 'completed')
        .reduce((sum, record) => sum + sessionVolume(record), 0)
    })),
    focusHits: focusHits(records, weekDates),
    comparisons: buildComparisons(heroSession, records),
    month: monthDates.map(day => ({
      date: day,
      completed: completedOn(records, day)
    }))
  };
}
