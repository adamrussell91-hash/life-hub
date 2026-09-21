import { daysBetween, isCalendarDate } from './time.js';

const Z95 = 1.959963984540054;

export function median(values) {
  const xs = (values ?? []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

export function mean(values) {
  const xs = (values ?? []).map(Number).filter(Number.isFinite);
  return xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : null;
}

function ordinal(date) {
  return Date.parse(`${date}T00:00:00Z`) / 86400000;
}

function uniqueByDate(points, key) {
  const byDate = new Map();
  for (const point of points ?? []) {
    if (!isCalendarDate(point?.date)) continue;
    const value = Number(point?.[key]);
    if (!Number.isFinite(value)) continue;
    if (!byDate.has(point.date)) byDate.set(point.date, []);
    byDate.get(point.date).push(value);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, [key]: median(values) }));
}

/**
 * Theil-Sen robust trend: median of every pairwise slope.
 * Sen's normal-approximation interval is returned as a useful slope uncertainty band.
 */
export function theilSenTrend(points, key) {
  const rows = uniqueByDate(points, key);
  if (rows.length < 2) {
    return {
      method: 'theil_sen',
      observation_count: rows.length,
      span_days: 0,
      max_gap_days: null,
      slope_per_day: null,
      slope_per_week: null,
      slope_ci_95_per_week: null,
      residual_mad: null,
      fitted: []
    };
  }

  const x0 = ordinal(rows[0].date);
  const vals = rows.map(row => ({ date: row.date, x: ordinal(row.date) - x0, y: row[key] }));
  const slopes = [];
  for (let i = 0; i < vals.length - 1; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      const dx = vals[j].x - vals[i].x;
      if (dx > 0) slopes.push((vals[j].y - vals[i].y) / dx);
    }
  }
  slopes.sort((a, b) => a - b);
  const slope = median(slopes);
  const intercept = median(vals.map(row => row.y - slope * row.x));
  const fitted = vals.map(row => ({ date: row.date, value: intercept + slope * row.x }));
  const residualMad = median(vals.map((row, i) => Math.abs(row.y - fitted[i].value)));
  const gaps = rows.slice(1).map((row, i) => daysBetween(rows[i].date, row.date));

  const n = vals.length;
  const m = slopes.length;
  const sigma = Math.sqrt(n * (n - 1) * (2 * n + 5) / 18);
  const c = Z95 * sigma;
  const lo = Math.max(0, Math.floor((m - c) / 2));
  const hi = Math.min(m - 1, Math.ceil((m + c) / 2) - 1);
  const r = (v, d = 4) => Number(v.toFixed(d));

  return {
    method: 'theil_sen',
    observation_count: rows.length,
    span_days: daysBetween(rows[0].date, rows.at(-1).date),
    max_gap_days: gaps.length ? Math.max(...gaps) : null,
    slope_per_day: r(slope, 5),
    slope_per_week: r(slope * 7, 3),
    slope_ci_95_per_week: [r((slopes[lo] ?? slope) * 7, 3), r((slopes[hi] ?? slope) * 7, 3)],
    residual_mad: r(residualMad, 3),
    fitted: fitted.map(row => ({ date: row.date, value: r(row.value, 3) }))
  };
}

function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length);
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j++;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) result[sorted[k].index] = rank;
    i = j + 1;
  }
  return result;
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return dx2 > 0 && dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : null;
}

export function spearmanCorrelation(pairs) {
  const clean = (pairs ?? []).filter(pair => Number.isFinite(pair?.x) && Number.isFinite(pair?.y));
  if (clean.length < 2) return null;
  return pearson(ranks(clean.map(pair => pair.x)), ranks(clean.map(pair => pair.y)));
}
