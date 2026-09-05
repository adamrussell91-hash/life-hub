import { addCalendarDays, getSydneyWeekStart } from '../core/time.js';
import {
  REGION_KEYS,
  REGION_LABELS,
  bestSet,
  canonicalExerciseName,
  estimateOneRepMax,
  normalizeExerciseName,
  resolveExerciseRegion,
  sessionVolume
} from './fitness-model.js';

const MONTH_DAYS = 30;
const REP_RANGES = [
  { key: '1-5', label: '1–5 reps', min: 1, max: 5, colour: 'var(--wave)' },
  { key: '6-8', label: '6–8 reps', min: 6, max: 8, colour: 'var(--navy-2)' },
  { key: '9-12', label: '9–12 reps', min: 9, max: 12, colour: 'var(--success)' },
  { key: '13+', label: '13+ reps', min: 13, max: Infinity, colour: 'var(--high-sea)' }
];
const REGION_COLOURS = {
  chest: 'var(--wave)',
  arms: 'var(--navy-2)',
  abs: 'var(--success)',
  legs: 'var(--high-sea)',
  back: 'var(--pastel-lilac-ink)'
};
const PUSH_NAME = /press|dip|push|fly|pec|bench/i;
const PULL_NAME = /row|pull|curl|lat|chin/i;

function completedRecords(events, from, to) {
  return (events ?? [])
    .map(({ record }) => record)
    .filter(record => record?.status === 'completed' && record.date >= from && record.date <= to);
}

function validSet(set) {
  const reps = Number(set?.reps);
  const weight = Number(set?.weight_kg);
  return Number.isFinite(reps) && reps > 0 && Number.isFinite(weight) && weight >= 0;
}

export function setCount(record) {
  let count = 0;
  for (const exercise of record?.exercises ?? []) {
    for (const set of exercise.sets ?? []) {
      if (validSet(set)) count += 1;
    }
  }
  return count;
}

export function classifyRepRange(reps) {
  const value = Number(reps);
  if (!Number.isFinite(value) || value <= 0) return null;
  return REP_RANGES.find(range => value >= range.min && value <= range.max) ?? null;
}

export function classifyPushPull(exercise, workoutFocus = []) {
  const name = String(exercise?.name ?? '');
  if (PULL_NAME.test(name) && !PUSH_NAME.test(name)) return 'pull';
  if (PUSH_NAME.test(name) && !PULL_NAME.test(name)) return 'push';
  if (PUSH_NAME.test(name) && /curl/i.test(name)) return 'pull';
  const region = resolveExerciseRegion(exercise, workoutFocus);
  if (region === 'chest') return 'push';
  if (region === 'back') return 'pull';
  return null;
}

export function longestCompletedStreak(dates) {
  const ordered = [...new Set((dates ?? []).filter(Boolean))].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const date of ordered) {
    run = prev && addCalendarDays(prev, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

function pieItems(items) {
  return items.filter(item => Number(item.value) > 0);
}

function seriesIfReady(points) {
  const ready = (points ?? []).filter(point => Number.isFinite(point.value) && point.value > 0);
  return ready.length >= 2 ? ready : [];
}

function buildRepRanges(records) {
  const counts = Object.fromEntries(REP_RANGES.map(range => [range.key, 0]));
  for (const record of records) {
    for (const exercise of record.exercises ?? []) {
      for (const set of exercise.sets ?? []) {
        if (!validSet(set)) continue;
        const range = classifyRepRange(set.reps);
        if (range) counts[range.key] += 1;
      }
    }
  }
  return pieItems(REP_RANGES.map(range => ({
    key: range.key,
    label: range.label,
    value: counts[range.key],
    colour: range.colour
  })));
}

function buildRegionVolume(records) {
  const volume = Object.fromEntries(REGION_KEYS.map(key => [key, 0]));
  for (const record of records) {
    for (const exercise of record.exercises ?? []) {
      const region = resolveExerciseRegion(exercise, record.focus);
      if (!region) continue;
      for (const set of exercise.sets ?? []) {
        if (!validSet(set)) continue;
        volume[region] += Number(set.reps) * Number(set.weight_kg);
      }
    }
  }
  return pieItems(REGION_KEYS.map(key => ({
    key,
    label: REGION_LABELS[key],
    value: volume[key],
    colour: REGION_COLOURS[key]
  })));
}

function buildPushPull(records) {
  const volume = { push: 0, pull: 0 };
  for (const record of records) {
    for (const exercise of record.exercises ?? []) {
      const side = classifyPushPull(exercise, record.focus);
      if (!side) continue;
      for (const set of exercise.sets ?? []) {
        if (!validSet(set)) continue;
        volume[side] += Number(set.reps) * Number(set.weight_kg);
      }
    }
  }
  return pieItems([
    { key: 'push', label: 'Push', value: volume.push, colour: 'var(--wave)' },
    { key: 'pull', label: 'Pull', value: volume.pull, colour: 'var(--navy-2)' }
  ]);
}

function buildRestRatio(trainedDays, windowDays) {
  const trained = Math.max(0, trainedDays);
  const rest = Math.max(0, windowDays - trained);
  return pieItems([
    { key: 'trained', label: 'Trained', value: trained, colour: 'var(--wave)' },
    { key: 'rest', label: 'Rest', value: rest, colour: 'color-mix(in srgb, var(--marine) 18%, white)' }
  ]);
}

function buildE1rmTrends(records) {
  const byLift = new Map();
  for (const record of records) {
    for (const exercise of record.exercises ?? []) {
      const name = canonicalExerciseName(exercise.name) || String(exercise.name ?? '').trim();
      const key = normalizeExerciseName(name);
      const set = bestSet(exercise);
      if (!key || !set) continue;
      const e1rm = estimateOneRepMax(set.weight_kg, set.reps);
      if (e1rm == null) continue;
      const points = byLift.get(key) ?? { name, byDate: new Map() };
      const existing = points.byDate.get(record.date);
      if (existing == null || e1rm > existing) points.byDate.set(record.date, e1rm);
      byLift.set(key, points);
    }
  }
  return [...byLift.values()]
    .map(entry => ({
      name: entry.name,
      series: [...entry.byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({ date, value }))
    }))
    .filter(entry => entry.series.length >= 2)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildVolumePerSetWeeks(records, date) {
  const endWeek = getSydneyWeekStart(date);
  const startWeek = addCalendarDays(endWeek, -7 * 7);
  const buckets = new Map();
  for (const record of records) {
    if (record.date < startWeek) continue;
    const weekStart = getSydneyWeekStart(record.date);
    const bucket = buckets.get(weekStart) ?? { volume: 0, sets: 0 };
    bucket.volume += sessionVolume(record);
    bucket.sets += setCount(record);
    buckets.set(weekStart, bucket);
  }
  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.sets > 0 && bucket.volume > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, bucket]) => ({
      weekStart,
      value: bucket.volume / bucket.sets
    }));
}

function numberedSeries(records, read) {
  return records
    .map(record => {
      const value = read(record);
      return { date: record.date, value };
    })
    .filter(point => Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildPainBySite(records) {
  const counts = new Map();
  for (const record of records) {
    for (const flag of record.pain_flags ?? []) {
      const site = typeof flag === 'string'
        ? flag.trim()
        : String(flag?.site ?? flag?.area ?? flag?.note ?? '').trim();
      if (!site) continue;
      const key = site.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { site, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
}

function skipStats(events, from, date) {
  const inWindow = (events ?? [])
    .map(({ record }) => record)
    .filter(record => record?.date >= from && record.date <= date);
  const completed = inWindow.filter(record => record.status === 'completed').length;
  const skipped = inWindow.filter(record => record.status === 'skipped').length;
  const pastDue = inWindow.filter(record => record.status === 'planned' && record.date < date).length;
  const missed = skipped + pastDue;
  const scheduled = completed + missed;
  return { missed, scheduled, skipped, pastDue, completed };
}

export function buildFitnessCharts({
  events,
  date,
  weekCompletedCount = 0,
  weekTarget = 4,
  monthDates = []
} = {}) {
  const from = monthDates[0] ?? addCalendarDays(date, -(MONTH_DAYS - 1));
  const records = completedRecords(events, from, date);
  const trainedDates = [...new Set(records.map(record => record.date))];
  const windowDays = monthDates.length || MONTH_DAYS;
  const skips = skipStats(events, from, date);
  const recoveryFlagged = records.filter(record => record.recovery_flag_next_day === true).length;
  const totalSets = records.reduce((sum, record) => sum + setCount(record), 0);
  const totalVolume = records.reduce((sum, record) => sum + sessionVolume(record), 0);
  const uniqueLifts = new Set();
  for (const record of records) {
    for (const exercise of record.exercises ?? []) {
      const name = normalizeExerciseName(exercise.name);
      if (name) uniqueLifts.add(name);
    }
  }

  const durationSeries = seriesIfReady(numberedSeries(records, record => Number(record.duration_min)));
  const distanceSeries = seriesIfReady(numberedSeries(records, record => Number(record.distance_km)));
  const hrSeries = seriesIfReady(numberedSeries(records, record => Number(record.avg_hr)));
  const paceSeries = seriesIfReady(numberedSeries(records, record => {
    const km = Number(record.distance_km);
    const min = Number(record.duration_min);
    if (!(km > 0) || !(min > 0)) return null;
    return min / km;
  }));
  const volumePerSetWeeks = buildVolumePerSetWeeks(records, date);

  return {
    longestStreak: longestCompletedStreak(trainedDates),
    uniqueLifts: uniqueLifts.size,
    volumePerSetKg: totalSets > 0 ? totalVolume / totalSets : null,
    weekRing: { value: weekCompletedCount, target: weekTarget },
    skipRing: { value: skips.missed, target: Math.max(skips.scheduled, 1), ...skips },
    recoveryRing: { value: recoveryFlagged, target: Math.max(records.length, 1), flagged: recoveryFlagged, completed: records.length },
    restRatio: buildRestRatio(trainedDates.length, windowDays),
    restCounts: { trained: trainedDates.length, rest: Math.max(0, windowDays - trainedDates.length), days: windowDays },
    repRanges: buildRepRanges(records),
    regionVolume: buildRegionVolume(records),
    pushPull: buildPushPull(records),
    e1rmTrends: buildE1rmTrends(records),
    volumePerSetWeeks: volumePerSetWeeks.length >= 2 ? volumePerSetWeeks : [],
    durationSeries,
    distanceSeries,
    paceSeries,
    hrSeries,
    painBySite: buildPainBySite(records)
  };
}
