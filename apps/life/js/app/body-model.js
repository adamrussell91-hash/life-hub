import { getTrend } from '../core/trends.js';
import { addCalendarDays, isCalendarDate } from '../core/time.js';

export const BODY_RANGES = ['monthly', 'six_month', 'year', 'five_year'];
export const DEFAULT_BODY_RANGE = 'six_month';

const RANGE_DAYS = {
  monthly: 30,
  six_month: 182,
  year: 365,
  five_year: 1826
};

const RANGE_LABELS = {
  monthly: 'Month',
  six_month: '6M',
  year: 'Year',
  five_year: '5Y'
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
const MEASUREMENT_GOOD_UP = new Set([
  'chest', 'shoulders',
  'right_arm_flexed', 'left_arm_flexed',
  'right_arm_relaxed', 'left_arm_relaxed',
  'right_thigh', 'left_thigh', 'calves'
]);

export const TAPE_SITES = [
  'neck', 'shoulders', 'chest', 'waist', 'hips',
  'right_arm_flexed', 'left_arm_flexed',
  'right_arm_relaxed', 'left_arm_relaxed',
  'right_thigh', 'left_thigh', 'calves'
];

const TAPE_LABELS = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  chest: 'Chest',
  waist: 'Waist',
  hips: 'Hips',
  right_arm_flexed: 'Right arm flexed',
  left_arm_flexed: 'Left arm flexed',
  right_arm_relaxed: 'Right arm relaxed',
  left_arm_relaxed: 'Left arm relaxed',
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

function lastDayOfMonth(date) {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function aggregationBucket(date, mode) {
  if (mode === 'monthly') return lastDayOfMonth(date);
  if (mode === 'half_year') {
    const [year, month] = date.slice(0, 7).split('-').map(Number);
    return `${year}-${month <= 6 ? '06-30' : '12-31'}`;
  }
  throw new TypeError(`Unknown body aggregation mode: ${mode}`);
}

export function aggregateSeries(points, mode) {
  if (mode === 'raw') return points.map(point => ({ date: point.date, value: point.value }));
  if (mode !== 'monthly' && mode !== 'half_year') {
    throw new TypeError(`Unknown body aggregation mode: ${mode}`);
  }

  const buckets = new Map();
  for (const point of points) {
    const date = aggregationBucket(point.date, mode);
    const bucket = buckets.get(date) ?? { total: 0, count: 0 };
    bucket.total += point.value;
    bucket.count += 1;
    buckets.set(date, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, count }]) => ({ date, value: total / count }));
}

export function seriesInRange(observations, { from, to, days }, rangeKey) {
  const inRange = observations.filter(point => point.date >= from && point.date <= to);
  const mode = rangeKey === 'monthly'
    ? 'raw'
    : rangeKey === 'six_month' || rangeKey === 'year'
      ? 'monthly'
      : rangeKey === 'five_year'
        ? 'half_year'
        : days > 900
          ? 'half_year'
          : days > 90
            ? 'monthly'
            : 'raw';
  return aggregateSeries(inRange, mode);
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

function metricModel(observations, rangeBounds, selectedRange, trendConfig, { label, key } = {}) {
  const series = seriesInRange(observations, rangeBounds, selectedRange);
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

function physiqueColour(delta, good) {
  if (delta == null || !Number.isFinite(delta) || delta === 0) return 'neutral';
  const direction = delta > 0 ? 'up' : 'down';
  return good === direction ? 'green' : 'red';
}

function tapeHistory(observations) {
  return observations.map((point, index) => {
    const previous = index > 0 ? observations[index - 1] : null;
    const delta = previous ? point.value - previous.value : null;
    const pct = previous && previous.value !== 0
      ? ((point.value - previous.value) / Math.abs(previous.value)) * 100
      : null;
    return { date: point.date, value: point.value, delta, pct };
  });
}

function tapeMetricModel(observations, rangeBounds, selectedRange, site) {
  const good = measurementGood(site);
  const config = {
    ...TREND_CONFIG.measurement_cm,
    field: 'value',
    good
  };
  const base = metricModel(observations, rangeBounds, selectedRange, config, {
    key: site,
    label: TAPE_LABELS[site] ?? site
  });
  const current = observations.at(-1)?.value ?? null;
  const previous = observations.length > 1 ? observations.at(-2).value : null;
  const first = observations[0]?.value ?? null;
  const lastDelta = current != null && previous != null ? current - previous : null;
  const overallDelta = current != null && first != null && observations.length > 1
    ? current - first
    : null;

  return {
    ...base,
    site,
    current,
    lastDelta,
    overallDelta,
    lastColour: physiqueColour(lastDelta, good),
    overallColour: physiqueColour(overallDelta, good),
    history: tapeHistory(observations)
  };
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
    tapeMetrics.push(tapeMetricModel(obs, bounds, selectedRange, site));
  }

  const compositionMetrics = [
    metricModel(fatObs, bounds, selectedRange, TREND_CONFIG.body_fat_pct, {
      key: 'body_fat_pct',
      label: 'Body fat'
    })
  ];
  if (muscleObs.length) {
    compositionMetrics.push(metricModel(muscleObs, bounds, selectedRange, TREND_CONFIG.skeletal_muscle_kg, {
      key: 'skeletal_muscle_kg',
      label: 'Skeletal muscle'
    }));
  }

  return {
    date,
    range: selectedRange,
    rangeLabel: RANGE_LABELS[selectedRange],
    scale: {
      id: 'scale',
      title: 'Scale',
      metrics: [
        metricModel(mergedWeight, bounds, selectedRange, TREND_CONFIG.weight_kg, {
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
