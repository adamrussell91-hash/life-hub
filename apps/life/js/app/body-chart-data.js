/**
 * Chart data for the Body page (Weight, Body fat, Skeletal muscle).
 * Pure data only: numbers, dates and labels. Geometry lives in chart-kit
 * (shed-stack, stairs-down, carved-away, recomp-scissors, hundred-squares);
 * DOM and interaction live in render-body.js.
 */
import { BODY_RANGES, DEFAULT_BODY_RANGE, observationsFor, rangeWindow, weightObservations } from './body-model.js';
import { bodyCompositionTargets } from '../core/forecast-targets.js';
import { daysBetween, getSydneyWeekStart } from '../core/time.js';

/** How the stairs group weigh-ins for each Body range. */
export const STAIR_MODES = {
  monthly: 'reading',
  six_month: 'week',
  year: 'month',
  five_year: 'quarter'
};

/** Nearest weigh-in may stand in for a composition reading's weight within this many days. */
export const COMPOSITION_WEIGHT_WINDOW_DAYS = 7;

const round = (value, digits = 1) => (
  value == null || !Number.isFinite(Number(value)) ? null : Number(Number(value).toFixed(digits))
);

function weightBand(targets) {
  if (!targets) return null;
  const low = Number(targets.weight_kg_min);
  const high = Number(targets.weight_kg_max);
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null;
}

function fatBand(targets) {
  if (!targets) return null;
  const low = Number(targets.body_fat_pct_min);
  const high = Number(targets.body_fat_pct_max);
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null;
}

const inWindow = ({ from, to }) => point => point.date >= from && point.date <= to;

/* ── Weight: shed stack ───────────────────────────────────────────────── */

/**
 * The stack is the whole journey since the heaviest weigh-in, not the selected
 * range: one block per whole kilogram between today and the heaviest, each dated
 * by the first weigh-in after the heaviest that went below it.
 */
export function buildShedStackData(weights, band) {
  if (weights.length < 2) return { status: 'none', reason: 'Needs two weigh-ins.' };
  const peak = weights.reduce((best, p) => (p.value > best.value ? p : best));
  const current = weights.at(-1);
  const top = Math.floor(peak.value);
  const now = Math.floor(current.value);
  if (peak.date >= current.date || top <= now) {
    return {
      status: 'none',
      reason: 'Nothing shed yet: today is your heaviest.',
      peak: { date: peak.date, kg: round(peak.value) },
      current: { date: current.date, kg: round(current.value) },
      band
    };
  }
  const after = weights.filter(p => p.date > peak.date);
  const blocks = [];
  for (let kg = top; kg > now; kg -= 1) {
    const hit = after.find(p => p.value < kg) ?? current;
    blocks.push({ kg, date: hit.date, weeks: Math.round(daysBetween(peak.date, hit.date) / 7) });
  }
  blocks.sort((a, b) => a.date.localeCompare(b.date) || b.kg - a.kg);
  const years = [...new Set(blocks.map(b => b.date.slice(0, 4)))];
  return {
    status: 'ready',
    peak: { date: peak.date, kg: round(peak.value) },
    current: { date: current.date, kg: round(current.value) },
    band,
    shedKg: round(peak.value - current.value),
    aboveBandKg: band && current.value > band.high ? round(current.value - band.high) : 0,
    years,
    blocks
  };
}

/* ── Weight: stairs down ──────────────────────────────────────────────── */

function quarterKey(date) {
  const month = Number(date.slice(5, 7));
  const start = Math.floor((month - 1) / 3) * 3 + 1;
  return `${date.slice(0, 4)}-${String(start).padStart(2, '0')}-01`;
}

function stepKey(date, mode) {
  if (mode === 'week') return getSydneyWeekStart(date);
  if (mode === 'month') return `${date.slice(0, 7)}-01`;
  if (mode === 'quarter') return quarterKey(date);
  return date;
}

export function buildStairsData(weights, bounds, range, band) {
  const mode = STAIR_MODES[range] ?? 'month';
  const inRange = weights.filter(inWindow(bounds));
  const buckets = new Map();
  for (const point of inRange) {
    const key = stepKey(point.date, mode);
    const bucket = buckets.get(key) ?? { total: 0, count: 0, last: point.date };
    bucket.total += point.value;
    bucket.count += 1;
    bucket.last = point.date;
    buckets.set(key, bucket);
  }
  const steps = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({ date, last: b.last, kg: round(b.total / b.count, 2), count: b.count }))
    .map((step, i, list) => ({
      ...step,
      change: i ? round(step.kg - list[i - 1].kg, 2) : null
    }));
  if (steps.length < 2) {
    return { status: 'none', reason: 'Needs weigh-ins in at least two steps of this range.', mode, band, steps };
  }
  const moves = steps.slice(1);
  const biggest = moves.reduce((best, s) => (s.change < best.change ? s : best));
  return {
    status: 'ready',
    mode,
    band,
    steps,
    downSteps: moves.filter(s => s.change <= 0).length,
    biggestDrop: biggest.change < 0 ? { date: biggest.date, kg: round(-biggest.change) } : null,
    toGoKg: band && steps.at(-1).kg > band.high ? round(steps.at(-1).kg - band.high) : 0
  };
}

/* ── Composition readings (body fat, skeletal muscle, weight) ─────────── */

function nearestWeight(weights, date) {
  let best = null;
  let bestGap = Infinity;
  for (const point of weights) {
    const gap = Math.abs(daysBetween(point.date, date));
    if (gap < bestGap) {
      bestGap = gap;
      best = point;
    }
  }
  return best && bestGap <= COMPOSITION_WEIGHT_WINDOW_DAYS ? best.value : null;
}

export function compositionReadings(events, weights = weightObservations(events)) {
  const byDate = new Map();
  const take = (field, name) => {
    for (const point of observationsFor(events, 'composition', field)) {
      const row = byDate.get(point.date) ?? { date: point.date };
      row[name] = point.value;
      byDate.set(point.date, row);
    }
  };
  take('body_fat_pct', 'fatPct');
  take('skeletal_muscle_kg', 'muscleKg');
  take('weight_kg', 'weightKg');
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => ({
      date: row.date,
      fatPct: row.fatPct ?? null,
      muscleKg: row.muscleKg ?? null,
      weightKg: row.weightKg ?? nearestWeight(weights, row.date)
    }));
}

/* ── Body fat: carved away ────────────────────────────────────────────── */

/**
 * Each reading carries the running high within the range. The gap between the
 * running high and the reading is what has been carved away; a new high carves
 * nothing, so earlier rises are never shown as progress.
 */
export function buildCarvedData(readings, bounds, band) {
  const points = readings.filter(r => r.fatPct != null).filter(inWindow(bounds));
  let high = -Infinity;
  const rows = points.map(r => {
    high = Math.max(high, r.fatPct);
    return { date: r.date, pct: round(r.fatPct), high: round(high), carved: round(high - r.fatPct) };
  });
  if (rows.length < 2) {
    return { status: 'none', reason: 'Needs two body fat readings in this range.', band, points: rows };
  }
  const last = rows.at(-1);
  const highRow = rows.find(r => r.pct === last.high);
  return {
    status: 'ready',
    band,
    points: rows,
    high: { date: highRow.date, pct: last.high },
    current: { date: last.date, pct: last.pct },
    carvedPts: last.carved,
    toGoPts: band && last.pct > band.high ? round(last.pct - band.high) : 0
  };
}

/* ── Skeletal muscle: recomp scissors ─────────────────────────────────── */

export function buildScissorsData(readings, bounds) {
  const both = readings.filter(r => r.fatPct != null && r.muscleKg != null).filter(inWindow(bounds));
  if (both.length < 2) {
    return { status: 'none', reason: 'Needs two readings with both body fat and muscle in this range.', points: [] };
  }
  const base = both[0];
  const points = both.map(r => ({
    date: r.date,
    fatPct: round(r.fatPct),
    muscleKg: round(r.muscleKg),
    fatChange: round((r.fatPct / base.fatPct - 1) * 100, 2),
    muscleChange: round((r.muscleKg / base.muscleKg - 1) * 100, 2)
  }));
  return { status: 'ready', base: { date: base.date, fatPct: round(base.fatPct), muscleKg: round(base.muscleKg) }, points };
}

/* ── Skeletal muscle: you, in 100 squares ─────────────────────────────── */

/** Whole squares for fat and muscle; everything else takes the remainder. */
export function squaresFor(reading) {
  let fat = Math.round(reading.fatPct);
  let muscle = Math.round((reading.muscleKg / reading.weightKg) * 100);
  fat = Math.max(0, Math.min(100, fat));
  muscle = Math.max(0, Math.min(100 - fat, muscle));
  return { fat, muscle, rest: 100 - fat - muscle };
}

export function buildSquaresData(readings) {
  const usable = readings.filter(r => r.fatPct != null && r.muscleKg != null && r.weightKg > 0);
  if (!usable.length) {
    return { status: 'none', reason: 'Needs a reading with body fat, muscle and a weigh-in within a week.', readings: [] };
  }
  return {
    status: 'ready',
    index: usable.length - 1,
    readings: usable.map(r => ({
      date: r.date,
      weightKg: round(r.weightKg),
      fatPct: round(r.fatPct),
      muscleKg: round(r.muscleKg),
      squares: squaresFor(r)
    }))
  };
}

/* ── Everything for one render ────────────────────────────────────────── */

export function buildBodyChartData({ events, date, range = DEFAULT_BODY_RANGE, targetsConfig = null }) {
  if (!date) throw new RangeError('Body display date is unavailable');
  const selected = BODY_RANGES.includes(range) ? range : DEFAULT_BODY_RANGE;
  const bounds = rangeWindow(date, selected);
  const targets = bodyCompositionTargets(targetsConfig);
  const wBand = weightBand(targets);
  const fBand = fatBand(targets);
  const weights = weightObservations(events).filter(p => p.date <= date);
  const readings = compositionReadings(events, weights).filter(r => r.date <= date);
  return {
    date,
    range: selected,
    weight: {
      stack: buildShedStackData(weights, wBand),
      stairs: buildStairsData(weights, bounds, selected, wBand)
    },
    fat: {
      carved: buildCarvedData(readings, bounds, fBand)
    },
    muscle: {
      scissors: buildScissorsData(readings, bounds),
      squares: buildSquaresData(readings)
    }
  };
}
