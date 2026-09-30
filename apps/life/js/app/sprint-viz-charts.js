/**
 * Adapt sprint headline/lane evidence into chart-kit payloads for Home cards.
 * Pure data builders — no DOM. Mounting lives in render-home-sprints.js.
 */

function finiteReadings(headline) {
  if (!Array.isArray(headline?.readings)) return [];
  return headline.readings
    .map(r => ({ date: r.date, value: Number(r.value) }))
    .filter(r => r.date && Number.isFinite(r.value));
}

function optionalBand(headline) {
  const band = headline?.target_band || headline?.band;
  if (!band) return null;
  const low = Number(band.low);
  const high = Number(band.high);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return { low, high };
}

/** Simple linear trend (least squares) for glide residual stalks when Theil-Sen isn't available. */
function linearTrend(readings) {
  const n = readings.length;
  if (n < 2) return readings.map(r => r.value);
  const xs = readings.map((_, i) => i);
  const ys = readings.map(r => r.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return xs.map(x => intercept + slope * x);
}

export function buildSprintGlideChart(headline) {
  const readings = finiteReadings(headline);
  if (readings.length < 2) return null;
  const trend = linearTrend(readings);
  const from = readings[0].date;
  const date = readings[readings.length - 1].date;
  return {
    from,
    date,
    band: optionalBand(headline),
    points: readings.map((r, i) => ({
      date: r.date,
      weight_kg: r.value,
      trend_kg: trend[i]
    })),
    projection: null
  };
}

export function buildSprintCarvedChart(headline) {
  const readings = finiteReadings(headline);
  if (readings.length < 2) {
    return { status: 'empty', reason: 'Need at least two readings for carved-away.' };
  }
  return {
    status: 'ready',
    points: readings.map(r => ({ date: r.date, pct: r.value })),
    band: optionalBand(headline)
  };
}

export function buildSprintStairsChart(headline) {
  const readings = finiteReadings(headline);
  if (!readings.length) {
    return { status: 'empty', reason: 'No readings yet for stairs-down.' };
  }
  const steps = readings.map((r, i) => ({
    date: r.date,
    kg: r.value,
    change: i === 0 ? 0 : r.value - readings[i - 1].value
  }));
  return {
    status: 'ready',
    mode: 'reading',
    steps,
    band: optionalBand(headline)
  };
}

export function buildSprintAreaSeries(headline) {
  return finiteReadings(headline).map(r => ({ date: r.date, value: r.value }));
}

export function buildSprintGateKeys(lanes) {
  const keys = [];
  for (const lane of lanes || []) {
    for (const measure of lane.measureSummaries || []) {
      const judged = Number(measure.judged) || 0;
      const met = Number(measure.met) || 0;
      const threshold = judged > 0 ? judged : 1;
      const value = judged > 0 ? met : null;
      keys.push({
        key: `${lane.agent}-${measure.label || keys.length}`.replace(/\s+/g, '_').slice(0, 24),
        label: `${lane.agent}: ${measure.label || 'Measure'}`,
        value,
        threshold,
        unit: '',
        ratio: value == null ? null : value / threshold,
        status: value == null ? 'unscored' : (value >= threshold ? 'met' : 'short'),
        note: judged > 0 ? `${met} of ${judged} days` : (lane.status || 'no evidence'),
        reason: value == null ? 'No judged days yet.' : undefined
      });
      if (keys.length >= 4) return keys;
    }
  }
  return keys;
}

export function headlineRingTarget(headline) {
  const latest = headline?.latest?.value ?? headline?.baseline;
  const target = headline?.target ?? headline?.metric?.target ?? headline?.baseline;
  if (latest == null || target == null) return null;
  const value = Number(latest);
  const tgt = Number(target);
  if (!Number.isFinite(value) || !Number.isFinite(tgt) || tgt === 0) return null;
  // Down metrics: progress = how much of the gap closed toward target.
  const direction = headline?.direction || 'down';
  const baseline = Number(headline?.baseline);
  if (direction === 'down' && Number.isFinite(baseline) && baseline !== tgt) {
    const progress = (baseline - value) / (baseline - tgt);
    return { value: Math.max(0, progress) * tgt, target: tgt };
  }
  return { value, target: tgt };
}
