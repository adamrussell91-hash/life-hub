import { addCalendarDays, enumerateDateKeys, formatWeekday, getSydneyWeekStart } from '../core/time.js';
import { CLINICAL_CHART_SLOTS } from './chart-kit/clinical-slots.js';
import { minutesFromTime } from './chart-kit/polar-clock.js';
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
const STREAM_WEEKS = 12;
const HORIZON_WEEKS = 8;
const CHRONIC_WEEKS = 4;
const GAUGE_DAYS = 28;
const ACWR_LOW = 0.8;
const ACWR_HIGH = 1.3;
const REP_READ = {
  '1-5': 'Mostly Strength',
  '6-8': 'Mostly Hypertrophy',
  '9-12': 'Mostly Hypertrophy',
  '13+': 'Mostly Endurance'
};
const REP_RANGES = [
  { key: '1-5', label: '1–5 reps', min: 1, max: 5, colour: CLINICAL_CHART_SLOTS[0] },
  { key: '6-8', label: '6–8 reps', min: 6, max: 8, colour: CLINICAL_CHART_SLOTS[1] },
  { key: '9-12', label: '9–12 reps', min: 9, max: 12, colour: CLINICAL_CHART_SLOTS[2] },
  { key: '13+', label: '13+ reps', min: 13, max: Infinity, colour: CLINICAL_CHART_SLOTS[4] }
];
export const REGION_COLOURS = {
  chest: CLINICAL_CHART_SLOTS[0],
  arms: CLINICAL_CHART_SLOTS[1],
  abs: CLINICAL_CHART_SLOTS[2],
  legs: CLINICAL_CHART_SLOTS[3],
  back: CLINICAL_CHART_SLOTS[4]
};
const DAY_TYPE_COLOURS = {
  movement: CLINICAL_CHART_SLOTS[7],
  workout_30: CLINICAL_CHART_SLOTS[0],
  workout_45_60: CLINICAL_CHART_SLOTS[1]
};
const TRAIN_BANDS = [
  { key: 'morning', label: 'Morning', adverb: 'mornings' },
  { key: 'afternoon', label: 'Afternoon', adverb: 'afternoons' },
  { key: 'evening', label: 'Evening', adverb: 'evenings' },
  { key: 'night', label: 'Night', adverb: 'nights' }
];
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

function seriesChange(points) {
  if (!points?.length) return { current: null, previous: null, delta: null };
  const current = points.at(-1).value;
  const previous = points.length > 1 ? points[0].value : null;
  return {
    current,
    previous,
    delta: previous == null ? null : current - previous
  };
}

function readingFromSeries(points, { key, label, unit }) {
  const ready = seriesIfReady(points);
  if (!ready.length) return null;
  const last = ready.at(-1);
  const prev = ready.at(-2);
  return {
    key,
    label,
    unit,
    current: last.value,
    previous: prev.value,
    delta: last.value - prev.value,
    date: last.date
  };
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
    { key: 'push', label: 'Push', value: volume.push, colour: CLINICAL_CHART_SLOTS[0] },
    { key: 'pull', label: 'Pull', value: volume.pull, colour: CLINICAL_CHART_SLOTS[4] }
  ]);
}

function buildRestRatio(trainedDays, windowDays) {
  const trained = Math.max(0, trainedDays);
  const rest = Math.max(0, windowDays - trained);
  return pieItems([
    { key: 'trained', label: 'Trained', value: trained, colour: CLINICAL_CHART_SLOTS[0] },
    { key: 'rest', label: 'Rest', value: rest, colour: CLINICAL_CHART_SLOTS[7] }
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
    .map(entry => {
      const series = [...entry.byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({ date, value }));
      return { name: entry.name, series, ...seriesChange(series) };
    })
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

function sessionRegions(record) {
  const regions = new Set();
  for (const tag of record?.focus ?? []) {
    const region = resolveExerciseRegion({ focus: [tag] }, record.focus);
    if (region) regions.add(region);
  }
  for (const exercise of record?.exercises ?? []) {
    const region = resolveExerciseRegion(exercise, record.focus);
    if (region) regions.add(region);
  }
  return [...regions];
}

function primaryRegion(record) {
  return sessionRegions(record)[0] ?? null;
}

function mean(values) {
  const finite = (values ?? []).filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, n) => sum + n, 0) / finite.length;
}

export function acwrBand(ratio) {
  if (!Number.isFinite(ratio)) return 'medium';
  if (ratio > ACWR_HIGH) return 'high';
  if (ratio < ACWR_LOW) return 'low';
  return 'medium';
}

function trainBandForMinutes(minutes) {
  if (minutes >= 5 * 60 && minutes < 12 * 60) return 'morning';
  if (minutes >= 12 * 60 && minutes < 17 * 60) return 'afternoon';
  if (minutes >= 17 * 60 && minutes < 21 * 60) return 'evening';
  return 'night';
}

function formatClockMinutes(minutes) {
  const clamped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function medianMinutes(values) {
  // ponytail: linear median; circular midnight wrap is the upgrade if night sessions dominate.
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function weekdayHabit(records) {
  const counts = new Map();
  for (const record of records) {
    const day = formatWeekday(record.date);
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (!ranked.length || ranked[0][1] < 2) return '';
  const short = day => day.slice(0, 3);
  const [topDay, topCount] = ranked[0];
  const second = ranked[1];
  if (second && second[1] >= 2 && second[1] >= topCount - 1) {
    return `mostly ${short(topDay)} and ${short(second[0])}`;
  }
  if (topCount / records.length >= 0.4) return `mostly ${short(topDay)}`;
  return '';
}

function trainWhenRead(buckets, typicalTime, weekday) {
  const total = buckets.reduce((sum, band) => sum + band.value, 0);
  const ranked = [...buckets].sort((left, right) => right.value - left.value);
  const top = ranked[0];
  const second = ranked[1];
  const adverb = key => TRAIN_BANDS.find(band => band.key === key)?.adverb ?? key;
  let head = `Typical start ${typicalTime}`;
  if (top && total && top.value / total > 0.5) {
    head = `Usually ${adverb(top.key)}, around ${typicalTime}`;
  } else if (top && second?.value > 0 && (top.value + second.value) / total >= 0.75) {
    head = `Split ${adverb(top.key)} and ${adverb(second.key)} · typical start ${typicalTime}`;
  }
  return weekday ? `${head} · ${weekday}` : head;
}

export function buildTrainWhen(records) {
  const timed = (records ?? []).flatMap(record => {
    const minutes = minutesFromTime(record?.time);
    if (minutes == null) return [];
    return [{ ...record, minutes, band: trainBandForMinutes(minutes) }];
  });
  if (timed.length < 2) return null;
  const buckets = TRAIN_BANDS.map(band => ({
    key: band.key,
    label: band.label,
    value: timed.filter(record => record.band === band.key).length
  }));
  const typicalTime = formatClockMinutes(medianMinutes(timed.map(record => record.minutes)));
  return {
    count: timed.length,
    typicalTime,
    typicalBand: [...buckets].sort((left, right) => right.value - left.value)[0]?.key ?? null,
    buckets,
    read: trainWhenRead(buckets, typicalTime, weekdayHabit(timed))
  };
}

function buildOrbitDays(records, windowDates) {
  const byDate = new Map(records.map(record => [record.date, record]));
  const days = windowDates.map(date => {
    const record = byDate.get(date);
    return {
      date,
      volume: record ? sessionVolume(record) : 0,
      dayType: record?.day_type ?? (record ? 'workout_30' : 'rest'),
      colour: record ? (DAY_TYPE_COLOURS[record.day_type] ?? CLINICAL_CHART_SLOTS[0]) : CLINICAL_CHART_SLOTS[7]
    };
  });
  return days.some(day => day.volume > 0) && days.filter(day => day.volume > 0).length >= 2 ? days : [];
}

function buildE1rmRadial(trends) {
  const points = [];
  for (const lift of trends ?? []) {
    const peak = Math.max(...lift.series.map(point => point.value), 0);
    if (!(peak > 0) || lift.series.length < 2) continue;
    for (const point of lift.series) {
      points.push({
        name: lift.name,
        date: point.date,
        value: point.value,
        pct: (point.value / peak) * 100,
        colour: CLINICAL_CHART_SLOTS[points.length % CLINICAL_CHART_SLOTS.length]
      });
    }
  }
  return points.length >= 2 ? points : [];
}

function buildBumpRanks(trends, date) {
  const ready = (trends ?? []).filter(lift => lift.series.length >= 2);
  if (ready.length < 2) return [];
  const endWeek = getSydneyWeekStart(date);
  const weeks = [];
  for (let i = 7; i >= 0; i -= 1) weeks.push(addCalendarDays(endWeek, -7 * i));
  const ranks = weeks.map(week => {
    const rankByTheme = {};
    const scored = ready.map(lift => {
      const first = lift.series[0].value;
      const latest = [...lift.series].reverse().find(point => point.date <= addCalendarDays(week, 6));
      const pct = first > 0 && latest ? ((latest.value - first) / first) * 100 : -Infinity;
      return { name: lift.name, pct };
    }).sort((a, b) => b.pct - a.pct);
    scored.forEach((row, index) => {
      rankByTheme[row.name] = index + 1;
    });
    return { week, rankByTheme };
  });
  return ranks;
}

function buildRegionStream(records, date) {
  const endWeek = getSydneyWeekStart(date);
  const weeks = [];
  for (let i = STREAM_WEEKS - 1; i >= 0; i -= 1) weeks.push(addCalendarDays(endWeek, -7 * i));
  const series = REGION_KEYS.map(key => ({
    key,
    values: weeks.map(() => 0)
  }));
  for (const record of records) {
    const weekStart = getSydneyWeekStart(record.date);
    const weekIndex = weeks.indexOf(weekStart);
    if (weekIndex < 0) continue;
    for (const exercise of record.exercises ?? []) {
      const region = resolveExerciseRegion(exercise, record.focus);
      const slot = series.find(row => row.key === region);
      if (!slot) continue;
      for (const set of exercise.sets ?? []) {
        if (!validSet(set)) continue;
        slot.values[weekIndex] += Number(set.reps) * Number(set.weight_kg);
      }
    }
  }
  const live = series.filter(row => row.values.some(value => value > 0));
  const activeWeeks = weeks.filter((_, index) => live.some(row => row.values[index] > 0)).length;
  if (live.length < 2 || activeWeeks < 2) return null;
  return { weeks, series: live };
}

function buildPainHeat(records, date) {
  const endWeek = getSydneyWeekStart(date);
  const weeks = [];
  for (let i = 7; i >= 0; i -= 1) weeks.push(addCalendarDays(endWeek, -7 * i));
  const sites = new Map();
  const volumeByWeekRegion = new Map();
  for (const record of records) {
    const weekStart = getSydneyWeekStart(record.date);
    if (!weeks.includes(weekStart)) continue;
    for (const flag of record.pain_flags ?? []) {
      const site = typeof flag === 'string'
        ? flag.trim()
        : String(flag?.site ?? flag?.area ?? flag?.note ?? '').trim();
      if (!site) continue;
      const key = site.toLowerCase();
      const row = sites.get(key) ?? { term: site, byWeek: new Map() };
      row.byWeek.set(weekStart, (row.byWeek.get(weekStart) ?? 0) + 1);
      sites.set(key, row);
    }
    for (const region of sessionRegions(record)) {
      const key = `${weekStart}|${region}`;
      volumeByWeekRegion.set(key, (volumeByWeekRegion.get(key) ?? 0) + sessionVolume(record));
    }
  }
  if (!sites.size) return [];
  const weekMax = new Map();
  for (const [key, volume] of volumeByWeekRegion) {
    const week = key.split('|')[0];
    weekMax.set(week, Math.max(weekMax.get(week) ?? 0, volume));
  }
  return [...sites.values()].map(row => ({
    term: row.term,
    points: weeks.map(week => ({
      date: week,
      count: row.byWeek.get(week) ?? 0,
      spiked: (weekMax.get(week) ?? 0) > 0 && (weekMax.get(week) ?? 0) === Math.max(...weeks.map(w => weekMax.get(w) ?? 0))
    }))
  }));
}

function weekVolume(records, weekStart) {
  const weekEnd = addCalendarDays(weekStart, 6);
  return (records ?? [])
    .filter(record => record.date >= weekStart && record.date <= weekEnd)
    .reduce((sum, record) => sum + sessionVolume(record), 0);
}

function buildLoadHorizon(records, date) {
  const endWeek = getSydneyWeekStart(date);
  const computed = HORIZON_WEEKS + CHRONIC_WEEKS;
  const weeks = [];
  for (let i = computed - 1; i >= 0; i -= 1) weeks.push(addCalendarDays(endWeek, -7 * i));
  const scores = weeks.map(weekStart => ({
    date: weekStart,
    value: weekVolume(records, weekStart)
  }));
  const shown = scores.slice(-HORIZON_WEEKS);
  if (shown.filter(row => row.value > 0).length < 2) return [];
  return [{
    key: 'load',
    points: shown.map((row, index) => {
      const offset = scores.length - HORIZON_WEEKS + index;
      const prior = scores.slice(Math.max(0, offset - CHRONIC_WEEKS), offset);
      const chronic = mean(prior.map(item => item.value));
      const ratio = chronic > 0 ? row.value / chronic : null;
      return {
        date: row.date,
        value: row.value,
        ratio,
        band: acwrBand(ratio)
      };
    })
  }];
}

function buildPriorRegionVolume(events, date) {
  const currentFrom = addCalendarDays(date, -(MONTH_DAYS - 1));
  const priorTo = addCalendarDays(currentFrom, -1);
  const priorFrom = addCalendarDays(priorTo, -(MONTH_DAYS - 1));
  return buildRegionVolume(completedRecords(events, priorFrom, priorTo));
}

function buildE1rmBands(trends) {
  return (trends ?? []).map(lift => {
    const values = lift.series.map(point => point.value);
    const bandLow = Math.min(...values);
    const bandHigh = Math.max(...values);
    const latest = values.at(-1);
    return {
      ...lift,
      bandLow,
      bandHigh,
      outside: latest < bandLow || latest > bandHigh ? latest > bandHigh : false,
      tone: latest > bandHigh ? 'up' : latest < bandLow ? 'down' : 'same'
    };
  }).filter(lift => lift.series.length >= 2);
}

function buildSessionGauge(records) {
  const sorted = [...(records ?? [])]
    .filter(record => sessionVolume(record) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (sorted.length < 2) return null;
  const last = sorted.at(-1);
  const windowFrom = addCalendarDays(last.date, -(GAUGE_DAYS - 1));
  const inWindow = sorted.filter(record => record.date >= windowFrom && record.date < last.date);
  const baseline = inWindow.length ? inWindow : sorted.slice(0, -1);
  const avg = mean(baseline.map(sessionVolume));
  if (!(avg > 0)) return null;
  return {
    value: sessionVolume(last),
    average: avg,
    pct: (sessionVolume(last) / avg) * 100,
    date: last.date
  };
}

function buildYearDots(events, date) {
  const year = String(date).slice(0, 4);
  const dots = (events ?? [])
    .map(({ record }) => record)
    .filter(record => record?.status === 'completed' && String(record.date).startsWith(year) && record.date <= date)
    .map(record => ({
      date: record.date,
      region: primaryRegion(record),
      colour: REGION_COLOURS[primaryRegion(record)] ?? CLINICAL_CHART_SLOTS[7],
      volume: sessionVolume(record)
    }));
  return dots.length >= 2 ? dots : [];
}

function buildRepRead(items) {
  const dominant = [...items].sort((a, b) => b.value - a.value)[0];
  if (!dominant) return null;
  if (dominant.key === '6-8' || dominant.key === '9-12') return 'Mostly Hypertrophy';
  return REP_READ[dominant.key] ?? dominant.label;
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
  const windowDates = monthDates.length ? monthDates : enumerateDateKeys(from, date);
  const records = completedRecords(events, from, date);
  const historyFrom = addCalendarDays(getSydneyWeekStart(date), -7 * (STREAM_WEEKS - 1));
  const history = completedRecords(events, historyFrom, date);
  const trainedDates = [...new Set(records.map(record => record.date))];
  const allCompletedDates = [...new Set(
    (events ?? [])
      .map(({ record }) => record)
      .filter(record => record?.status === 'completed' && record.date && record.date <= date)
      .map(record => record.date)
  )];
  const windowDays = windowDates.length || MONTH_DAYS;
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
  const trainedSet = new Set(trainedDates);
  const recoveryFlags = records
    .filter(record => record.recovery_flag_next_day === true)
    .map(record => ({
      date: record.date,
      title: String(record.title ?? '').trim() || 'Session'
    }));

  return {
    longestStreak: longestCompletedStreak(allCompletedDates),
    uniqueLifts: uniqueLifts.size,
    volumePerSetKg: totalSets > 0 ? totalVolume / totalSets : null,
    weekRing: { value: weekCompletedCount, target: weekTarget },
    skipRing: { value: skips.missed, target: Math.max(skips.scheduled, 1), ...skips },
    recoveryRing: { value: recoveryFlagged, target: Math.max(records.length, 1), flagged: recoveryFlagged, completed: records.length },
    recoveryFlags,
    restRatio: trainedDates.length > 0 ? buildRestRatio(trainedDates.length, windowDays) : [],
    restCounts: { trained: trainedDates.length, rest: Math.max(0, windowDays - trainedDates.length), days: windowDays },
    trainedMarks: windowDates.map(day => ({
      date: day,
      trained: trainedSet.has(day)
    })),
    repRanges: buildRepRanges(records),
    regionVolume: buildRegionVolume(records),
    pushPull: buildPushPull(records),
    e1rmTrends: buildE1rmTrends(records),
    volumePerSetWeeks: volumePerSetWeeks.length >= 2 ? volumePerSetWeeks : [],
    durationSeries,
    distanceSeries,
    paceSeries,
    hrSeries,
    sessionReadings: [
      readingFromSeries(durationSeries, { key: 'duration', label: 'Duration', unit: 'min' }),
      readingFromSeries(distanceSeries, { key: 'distance', label: 'Distance', unit: 'km' }),
      readingFromSeries(paceSeries, { key: 'pace', label: 'Pace', unit: 'min/km' }),
      readingFromSeries(hrSeries, { key: 'hr', label: 'Heart rate', unit: 'bpm' })
    ].filter(Boolean),
    painBySite: buildPainBySite(records),
    trainWhen: buildTrainWhen(history),
    orbitDays: buildOrbitDays(records, windowDates),
    e1rmRadial: buildE1rmRadial(buildE1rmTrends(history)),
    bumpRanks: buildBumpRanks(buildE1rmTrends(history), date),
    regionStream: buildRegionStream(history, date),
    painHeat: buildPainHeat(history, date),
    loadHorizon: buildLoadHorizon(history, date),
    regionVolumePrior: buildPriorRegionVolume(events, date),
    e1rmBands: buildE1rmBands(buildE1rmTrends(history)),
    sessionGauge: buildSessionGauge(history),
    yearDots: buildYearDots(events, date),
    year: Number(String(date).slice(0, 4)),
    repRead: buildRepRead(buildRepRanges(records)),
    weekTarget
  };
}
