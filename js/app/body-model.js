import { getTrend, downsampleWeekly } from '../core/trends.js';
import { addCalendarDays, isCalendarDate } from '../core/time.js';

export const BODY_RANGES = ['weekly', 'monthly', 'six_month'];
export const DEFAULT_BODY_RANGE = 'monthly';

const RANGE_DAYS = {
  weekly: 7,
  monthly: 30,
  six_month: 182
};

export const TREND_CONFIG = {
  weight_kg: { field: 'weight_kg', unit: 'kg', good: 'down', thresholds: [0.2, 0.5, 1.0] },
  body_fat_pct: { field: 'body_fat_pct', unit: '%', good: 'down', thresholds: [0.2, 0.5, 1.0] },
  skeletal_muscle_kg: {
    field: 'skeletal_muscle_kg',
    unit: 'kg',
    good: 'up',
    thresholds: [0.1, 0.3, 0.6]
  },
  measurement_cm: { field: 'value', unit: 'cm', good: 'down', thresholds: [0.3, 0.8, 1.5] }
};

/** Sites where growth “up” is good (building). Others default down (leaning out). */
const MEASUREMENT_GOOD_UP = new Set(['chest', 'shoulders', 'right_arm', 'left_arm']);

export const TAPE_SITES = [
  'waist', 'chest', 'hips', 'shoulders', 'neck',
  'right_arm', 'left_arm', 'right_thigh', 'left_thigh', 'calves'
];

const TAPE_LABELS = {
  waist: 'Waist',
  chest: 'Chest',
  hips: 'Hips',
  shoulders: 'Shoulders',
  neck: 'Neck',
  right_arm: 'Right arm',
  left_arm: 'Left arm',
  right_thigh: 'Right thigh',
  left_thigh: 'Left thigh',
  calves: 'Calves'
};

export function rangeWindow(date, range) {
  if (!isCalendarDate(date)) throw new TypeError(`Invalid calendar date: ${date}`);
  if (!BODY_RANGES.includes(range)) throw new TypeError(`Unknown body range: ${range}`);
  const days = RANGE_DAYS[range];
  return { from: addCalendarDays(date, -(days - 1)), to: date, days };
}

export function observationsFor(events, type, field) {
  return (events ?? [])
    .filter(event => event?.record?.type === type && event.record[field] != null)
    .map(event => ({
      date: event.record.date,
      value: Number(event.record[field])
    }))
    .filter(point => isCalendarDate(point.date) && Number.isFinite(point.value))
    .sort((a, b) => a.date.localeCompare(b.date) || a.value - b.value);
}

export function seriesInRange(observations, { from, to, days }) {
  const inRange = observations.filter(point => point.date >= from && point.date <= to);
  if (days > 90 && inRange.length) {
    return downsampleWeekly(inRange, 'value')
      .filter(point => point.value != null)
      .map(point => ({ date: point.date, value: point.value }));
  }
  return inRange;
}

export function rangeGrowthPercent(series) {
  if (!series?.length || series.length < 2) return null;
  const first = series[0].value;
  const last = series.at(-1).value;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

export function formatGrowthPercent(pct, { good } = {}) {
  if (pct == null || !Number.isFinite(pct)) {
    return { label: '—', colour: 'neutral', direction: 'neutral', pct: null };
  }
  const direction = pct === 0 ? 'flat' : pct > 0 ? 'up' : 'down';
  const colour = pct === 0 || good == null
    ? 'neutral'
    : (good === direction ? 'green' : 'red');
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return {
    label: `${sign}${Math.abs(pct).toFixed(1)}%`,
    colour,
    direction,
    pct
  };
}

function latestPair(observations) {
  if (!observations.length) return { current: null, previous: null };
  const current = observations.at(-1);
  const previous = observations.length > 1 ? observations.at(-2) : null;
  return { current, previous };
}

function metricModel(observations, rangeBounds, trendConfig, { label, key } = {}) {
  const series = seriesInRange(observations, rangeBounds);
  const { current, previous } = latestPair(observations);
  const primary = formatGrowthPercent(rangeGrowthPercent(series), trendConfig);
  const secondary = current
    ? getTrend(
      { date: current.date, [trendConfig.field]: current.value },
      previous ? { date: previous.date, [trendConfig.field]: previous.value } : null,
      trendConfig
    )
    : {
      direction: 'neutral',
      colour: 'neutral',
      intensity: 'none',
      label: 'No readings',
      delta: null
    };

  return {
    key,
    label,
    latest: current ? { date: current.date, value: current.value } : null,
    series: series.map(point => ({ date: point.date, value: point.value })),
    primaryGrowth: primary,
    secondaryTrend: secondary,
    empty: !current
  };
}

function measurementGood(site) {
  return MEASUREMENT_GOOD_UP.has(site) ? 'up' : 'down';
}

export function buildBodyModel({ events, date, range = DEFAULT_BODY_RANGE }) {
  if (!date) throw new RangeError('Body display date is unavailable');
  const selectedRange = BODY_RANGES.includes(range) ? range : DEFAULT_BODY_RANGE;
  const bounds = rangeWindow(date, selectedRange);

  const weightObs = observationsFor(events, 'weight', 'weight_kg');
  // Composition files may also carry weight_kg; prefer dedicated weight type, else composition weight.
  const compositionWeight = observationsFor(events, 'composition', 'weight_kg');
  const mergedWeight = mergeObservations(weightObs, compositionWeight);

  const fatObs = observationsFor(events, 'composition', 'body_fat_pct');
  const muscleObs = observationsFor(events, 'composition', 'skeletal_muscle_kg');

  const tapeMetrics = [];
  for (const site of TAPE_SITES) {
    const obs = observationsFor(events, 'measurements', site);
    if (!obs.length) continue;
    const config = {
      ...TREND_CONFIG.measurement_cm,
      field: 'value',
      good: measurementGood(site)
    };
    tapeMetrics.push(metricModel(obs, bounds, config, {
      key: site,
      label: TAPE_LABELS[site] ?? site
    }));
  }

  const compositionMetrics = [
    metricModel(fatObs, bounds, TREND_CONFIG.body_fat_pct, {
      key: 'body_fat_pct',
      label: 'Body fat'
    })
  ];
  if (muscleObs.length) {
    compositionMetrics.push(metricModel(muscleObs, bounds, TREND_CONFIG.skeletal_muscle_kg, {
      key: 'skeletal_muscle_kg',
      label: 'Skeletal muscle'
    }));
  }

  return {
    date,
    range: selectedRange,
    rangeLabel: selectedRange === 'weekly' ? 'Weekly' : selectedRange === 'monthly' ? 'Monthly' : '6M',
    scale: {
      id: 'scale',
      title: 'Scale',
      metrics: [
        metricModel(mergedWeight, bounds, TREND_CONFIG.weight_kg, {
          key: 'weight_kg',
          label: 'Weight'
        })
      ]
    },
    composition: {
      id: 'composition',
      title: 'Composition',
      metrics: compositionMetrics
    },
    tape: {
      id: 'tape',
      title: 'Tape',
      metrics: tapeMetrics
    }
  };
}

function mergeObservations(primary, secondary) {
  const byDate = new Map();
  for (const point of secondary) byDate.set(point.date, point);
  for (const point of primary) byDate.set(point.date, point);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildWeightPayload(date, weightKg) {
  return {
    candidate: {
      type: 'weight',
      date,
      fields: { weight_kg: weightKg }
    },
    slug: 'weight',
    overwrite: true
  };
}

export function buildCompositionPayload(date, fields) {
  return {
    candidate: {
      type: 'composition',
      date,
      fields: { ...fields }
    },
    slug: 'composition',
    overwrite: true
  };
}

export function buildMeasurementsPayload(date, fields) {
  return {
    candidate: {
      type: 'measurements',
      date,
      fields: { ...fields }
    },
    slug: 'measurements',
    overwrite: true
  };
}
