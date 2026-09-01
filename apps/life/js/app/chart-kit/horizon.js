import { enumerateDateKeys, getSydneyWeekStart } from '../../core/time.js';
import { MONTHS } from './polar-clock.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PLOT_WIDTH = 720;
const BAND_HEIGHT = 96;
const LEVEL_HEIGHT = { high: 0.92, medium: 0.58, low: 0.28 };
const ENERGY_RANK = { low: 0, medium: 1, high: 2 };

export function buildHorizonBands(metrics, { width = 320, height = 24 } = {}) {
  return (metrics ?? []).map(metric => {
    const points = metric.points ?? [];
    const max = Math.max(1, ...points.map(point => Math.abs(Number(point.value) || 0)));
    const step = points.length ? width / points.length : width;
    return {
      key: metric.key,
      height,
      rects: points.map((point, index) => ({
        x: index * step,
        y: 0,
        width: step,
        height,
        opacity: Math.min(1, Math.abs(Number(point.value) || 0) / max),
        date: point.date,
        value: point.value
      }))
    };
  });
}

function weekdayLabel(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function monthLabel(dateKey) {
  const month = Number(String(dateKey).slice(5, 7));
  return MONTHS[month - 1];
}

export function moodLevelFromScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  if (value >= 7) return 'high';
  if (value >= 5) return 'medium';
  return 'low';
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function moodOpacity(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  return 0.28 + clamp01((value - 1) / 9) * 0.72;
}

function energyOpacity(level) {
  if (level === 'high') return 1;
  if (level === 'medium') return 0.64;
  if (level === 'low') return 0.4;
  return 0;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function moodSummary(current, previous) {
  const now = mean((current ?? []).map(point => Number(point.value)).filter(Number.isFinite));
  if (now == null) return null;
  const prior = mean((previous ?? []).map(point => Number(point.value)).filter(Number.isFinite));
  if (prior == null || Math.abs(now - prior) < 0.5) return 'Mostly stable';
  return now > prior ? 'Lifted vs last period' : 'Lower than last period';
}

function energyMeanRank(points) {
  const ranked = (points ?? []).filter(point => ENERGY_RANK[point.energy] != null);
  if (!ranked.length) return null;
  return ranked.reduce((sum, point) => sum + ENERGY_RANK[point.energy], 0) / ranked.length;
}

function energySummary(current, previous) {
  const now = energyMeanRank(current);
  if (now == null) return { text: null, dir: 'flat' };
  const prior = energyMeanRank(previous);
  if (prior == null || Math.abs(now - prior) < 0.12) return { text: 'About the same as last period', dir: 'flat' };
  if (now < prior) return { text: 'Lower than last period', dir: 'down' };
  return { text: 'Higher than last period', dir: 'up' };
}

function axisFor(days, range) {
  const count = days.length;
  if (range === 'weekly') {
    return days.map((date, index) => ({
      date,
      label: weekdayLabel(date),
      x: ((index + 0.5) / count) * PLOT_WIDTH,
      show: true
    }));
  }
  if (range === 'monthly') {
    return days.map((date, index) => {
      const day = Number(date.slice(8, 10));
      const show = index === 0 || index === count - 1 || day === 1 || day % 7 === 1;
      return {
        date,
        label: `${Number(date.slice(8, 10))} ${monthLabel(date)}`,
        x: ((index + 0.5) / count) * PLOT_WIDTH,
        show
      };
    });
  }
  return days.map((date, index) => {
    const isFirst = date.slice(8, 10) === '01' || index === 0;
    return {
      date,
      label: monthLabel(date),
      x: ((index + 0.5) / count) * PLOT_WIDTH,
      show: isFirst
    };
  });
}

function ticksFor(days, byDate, levelOf, opacityOf, extra) {
  const count = days.length || 1;
  const step = PLOT_WIDTH / count;
  const markWidth = Math.max(1.15, Math.min(3.2, step * 0.55));
  const ticks = [];
  days.forEach((date, index) => {
    const point = byDate.get(date);
    if (!point) return;
    const level = levelOf(point);
    if (!level) return;
    const height = LEVEL_HEIGHT[level] * BAND_HEIGHT;
    ticks.push({
      date,
      level,
      opacity: opacityOf(point),
      x: index * step + (step - markWidth) / 2,
      y: BAND_HEIGHT - height,
      width: markWidth,
      height,
      hitX: index * step,
      hitWidth: step,
      ...extra(point)
    });
  });
  return ticks;
}

/**
 * Shared-timeline strip: one vertical tick per logged day, height = high /
 * medium / low, opacity = intensity.
 */
export function buildMetricStrip({
  bounds,
  range = 'monthly',
  mood = [],
  energy = [],
  previousMood = [],
  previousEnergy = []
} = {}) {
  const from = bounds?.from;
  const to = bounds?.to;
  const days = from && to ? enumerateDateKeys(from, to) : [];
  const moodByDate = new Map((mood ?? []).filter(point => point?.date).map(point => [point.date, point]));
  const energyByDate = new Map((energy ?? []).filter(point => point?.date).map(point => [point.date, point]));
  const energyTrend = energySummary(energy, previousEnergy);

  const bands = [
    {
      key: 'mood',
      label: 'Mood',
      blurb: 'How I felt',
      colour: 'var(--wave)',
      ticks: ticksFor(days, moodByDate, point => moodLevelFromScore(point.value), point => moodOpacity(point.value), point => ({
        value: point.value,
        mood: point.mood ?? null
      }))
    },
    {
      key: 'energy',
      label: 'Energy',
      blurb: 'My energy levels',
      colour: 'var(--high-sea)',
      ticks: ticksFor(days, energyByDate, point => (ENERGY_RANK[point.energy] != null ? point.energy : null), point => energyOpacity(point.energy), point => ({
        value: point.energy,
        energy: point.energy
      }))
    }
  ].filter(band => band.ticks.length);

  return {
    width: PLOT_WIDTH,
    bandHeight: BAND_HEIGHT,
    days,
    bands,
    axis: axisFor(days, range),
    summary: {
      mood: moodSummary(mood, previousMood),
      energy: energyTrend.text,
      energyDir: energyTrend.dir
    }
  };
}

const GROUP_HEIGHT = 96;
const MOOD_BAR = { great: 1, good: 0.8, neutral: 0.58, low: 0.36, bad: 0.2 };
const ENERGY_BAR = { high: 1, medium: 0.64, low: 0.32 };

function moodKeyFromPoint(point) {
  if (point?.mood && MOOD_BAR[point.mood] != null) return point.mood;
  return moodLevelFromScore(point?.value) === 'high'
    ? (Number(point.value) >= 8 ? 'great' : 'good')
    : moodLevelFromScore(point?.value) === 'medium' ? 'neutral' : 'low';
}

function modalEnergy(levels) {
  const tally = { high: 0, medium: 0, low: 0 };
  for (const level of levels) {
    if (tally[level] != null) tally[level] += 1;
  }
  return ['high', 'medium', 'low'].sort((a, b) => tally[b] - tally[a] || ENERGY_RANK[b] - ENERGY_RANK[a])[0];
}

function columnFrom(date, moodPoint, energyPoint) {
  const moodKey = moodPoint ? moodKeyFromPoint(moodPoint) : null;
  const energyKey = energyPoint?.energy && ENERGY_BAR[energyPoint.energy] != null ? energyPoint.energy : null;
  if (!moodKey && !energyKey) return null;
  return {
    date,
    mood: moodKey ? { key: moodKey, height: MOOD_BAR[moodKey] * GROUP_HEIGHT, value: moodPoint?.value ?? null } : null,
    energy: energyKey ? { key: energyKey, height: ENERGY_BAR[energyKey] * GROUP_HEIGHT, value: energyKey } : null
  };
}

/**
 * Grouped mood + energy columns. Day grain for week/month; week grain for 6M/year.
 */
export function buildGroupedMetricBars({
  bounds,
  range = 'monthly',
  mood = [],
  energy = []
} = {}) {
  const bucket = range === 'year' || range === 'six_month' ? 'week' : 'day';
  const moodByDate = new Map((mood ?? []).filter(point => point?.date).map(point => [point.date, point]));
  const energyByDate = new Map((energy ?? []).filter(point => point?.date).map(point => [point.date, point]));
  const columns = [];

  if (bucket === 'day') {
    const dates = [...new Set([...moodByDate.keys(), ...energyByDate.keys()])].sort();
    for (const date of dates) {
      const column = columnFrom(date, moodByDate.get(date), energyByDate.get(date));
      if (column) columns.push(column);
    }
  } else {
    const groups = new Map();
    for (const date of [...new Set([...moodByDate.keys(), ...energyByDate.keys()])]) {
      const week = getSydneyWeekStart(date);
      const group = groups.get(week) ?? { moods: [], energies: [] };
      const moodPoint = moodByDate.get(date);
      if (moodPoint) group.moods.push(moodPoint);
      const energyPoint = energyByDate.get(date);
      if (energyPoint?.energy) group.energies.push(energyPoint.energy);
      groups.set(week, group);
    }
    for (const week of [...groups.keys()].sort()) {
      const group = groups.get(week);
      const avg = mean(group.moods.map(point => Number(point.value)).filter(Number.isFinite));
      const moodPoint = avg == null ? null : { date: week, value: avg, mood: group.moods[0]?.mood };
      const energyPoint = group.energies.length ? { energy: modalEnergy(group.energies) } : null;
      const column = columnFrom(week, moodPoint, energyPoint);
      if (column) columns.push(column);
    }
  }

  return {
    width: PLOT_WIDTH,
    height: GROUP_HEIGHT,
    bucket,
    columns
  };
}
