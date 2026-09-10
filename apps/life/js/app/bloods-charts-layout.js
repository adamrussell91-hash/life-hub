import { formatDisplayDate } from '../core/time.js';

const BAND_PAD = 0.28;
const VALUE_PAD = 0.06;

/**
 * Scales a marker against its reference band rather than against its own
 * readings. Anchoring on the band keeps the sage stripe in the same place on
 * every chart, so "where does this sit in normal" reads at a glance, and a
 * marker that barely moves stays flat instead of being zoomed into a dramatic
 * squiggle. Values outside the band always stay inside the plot.
 *
 * An open-ended range (a lone upper or lower limit) gets a working band three
 * times the distance from the limit to the reading, which is enough to place
 * the reading without pretending the missing limit exists.
 */
export function bandDomain({ values = [], refLow, refHigh } = {}) {
  const finite = n => n != null && n !== '' && Number.isFinite(Number(n));
  const points = values.map(Number).filter(Number.isFinite);
  const low = finite(refLow) ? Number(refLow) : null;
  const high = finite(refHigh) ? Number(refHigh) : null;
  const reading = points.length ? points.at(-1) : null;

  let bandLow = low;
  let bandHigh = high;
  if (bandLow == null && bandHigh == null) {
    const min = points.length ? Math.min(...points) : 0;
    const max = points.length ? Math.max(...points) : 1;
    bandLow = min;
    bandHigh = max > min ? max : min + 1;
  } else if (bandLow == null) {
    bandLow = bandHigh - Math.max(bandHigh - Math.min(reading ?? bandHigh, bandHigh), 0) * 3;
  } else if (bandHigh == null) {
    bandHigh = bandLow + Math.max(Math.max(reading ?? bandLow, bandLow) - bandLow, 0) * 3;
  }

  let width = bandHigh - bandLow;
  if (!(width > 0)) width = Math.max(Math.abs(bandHigh) * 0.1, 1);
  let min = bandLow - width * BAND_PAD;
  let max = bandHigh + width * BAND_PAD;
  for (const point of points) {
    min = Math.min(min, point - width * VALUE_PAD);
    max = Math.max(max, point + width * VALUE_PAD);
  }

  return {
    min,
    max,
    bandLow: low == null ? null : bandLow,
    bandHigh: high == null ? null : bandHigh,
    // Where a value sits across the plot, 0 at min and 1 at max.
    fraction: value => {
      const n = Number(value);
      if (!Number.isFinite(n) || max === min) return 0;
      return Math.min(1, Math.max(0, (n - min) / (max - min)));
    }
  };
}

/**
 * Judges one reading against the reference limits, in the same vocabulary the
 * lab uses, so it can be passed through `statusTone` for markers where a high
 * number is the good direction.
 */
export function pointStatus(value, refLow, refHigh) {
  // Number(null) is 0, so a missing limit has to be rejected before conversion
  // or every reading gets judged against zero.
  const numeric = input => (input == null || input === '' || !Number.isFinite(Number(input))
    ? null
    : Number(input));
  const n = numeric(value);
  const low = numeric(refLow);
  const high = numeric(refHigh);
  if (n == null || (low == null && high == null)) return null;
  if (low != null && n < low) return 'Low';
  if (high != null && n > high) return 'High';
  return 'Normal';
}

export { rangeBarLayout } from './chart-kit/range-bar.js';

const FASTING_KEYS = new Set(['fasting_glucose', 'glucose_fasting']);
const HBA1C_PCT_KEYS = new Set(['hba1c', 'hba1c_ngsp']);
const HBA1C_IFCC_KEYS = new Set(['hba1c_ifcc']);
const TOTAL_CHOL_KEYS = new Set(['cholesterol', 'total_cholesterol']);
const HDL_KEYS = new Set(['hdl', 'hdl_cholesterol']);
const LIPID_FALLBACK_LIMIT = {
  total: 5.6,
  ldl: 3.1,
  triglycerides: 1.7,
  non_hdl: 4,
  ratio: 4.5
};

/** 0 is maximum headroom, 1 is a reference edge, above 1 is out of range. */
export function allowanceUsed({ value, refLow, refHigh, favourHigh = false } = {}) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  const low = refLow == null || refLow === '' || !Number.isFinite(Number(refLow))
    ? null
    : Number(refLow);
  const high = refHigh == null || refHigh === '' || !Number.isFinite(Number(refHigh))
    ? null
    : Number(refHigh);
  if (low == null && high == null) return null;
  if (favourHigh && low != null && low !== 0) return low / n;
  if (low != null && high != null && high !== low) {
    return Math.abs(2 * ((n - low) / (high - low)) - 1);
  }
  if (high != null && high !== 0) return n / high;
  if (low != null && n !== 0) return low / n;
  return null;
}

export function ifccToNgsp(mmolMol) {
  const n = Number(mmolMol);
  if (!Number.isFinite(n)) return null;
  return 0.09148 * n + 2.152;
}

export function buildFbcRadial(markers = []) {
  const spokes = markers
    .filter(marker => !marker?.qualitative && marker?.latest?.value != null)
    .map(marker => {
      const used = allowanceUsed({
        value: marker.latest.value,
        refLow: marker.latest.ref_low,
        refHigh: marker.latest.ref_high
      });
      if (used == null) return null;
      const series = numericSeries(marker);
      const previous = series.length > 1 ? series.at(-2) : null;
      const prevUsed = previous == null
        ? null
        : allowanceUsed({
          value: previous.value,
          refLow: marker.latest.ref_low,
          refHigh: marker.latest.ref_high
        });
      return {
        key: marker.key,
        label: marker.label || marker.key,
        value: Number(marker.latest.value),
        unit: marker.latest.unit ?? '',
        refLow: marker.latest.ref_low ?? null,
        refHigh: marker.latest.ref_high ?? null,
        date: marker.latest.date ?? null,
        used,
        prevValue: previous?.value ?? null,
        prevDate: previous?.date ?? null,
        prevUsed,
        tone: usedTone(used)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));

  const step = spokes.length ? 360 / spokes.length : 0;
  spokes.forEach((spoke, index) => {
    spoke.angle = step * (index + 0.5);
  });
  return { spokes };
}

export function buildGlucoseMap(markers = []) {
  const fasting = markers.find(marker => FASTING_KEYS.has(marker.key));
  const pct = markers.find(marker => HBA1C_PCT_KEYS.has(marker.key)
    && (marker.latest?.unit === '%' || !HBA1C_IFCC_KEYS.has(marker.key)));
  const ifcc = markers.find(marker => HBA1C_IFCC_KEYS.has(marker.key));
  const insulin = markers.find(marker => marker.key === 'insulin' && marker.latest?.value != null);

  const fastingPoints = numericSeries(fasting);
  const hba1cPoints = pct
    ? numericSeries(pct).map(point => ({ ...point, hba1c: point.value }))
    : numericSeries(ifcc).map(point => ({ ...point, hba1c: ifccToNgsp(point.value) }));

  const points = [];
  for (const draw of fastingPoints) {
    const pair = nearestWithinDays(draw.date, hba1cPoints, 14);
    if (!pair || pair.hba1c == null) continue;
    points.push({
      date: draw.date,
      fasting: draw.value,
      hba1c: pair.hba1c
    });
  }

  return {
    points,
    insulin: insulinCaption(insulin)
  };
}

export function buildLipidRings(markers = []) {
  const total = findMarker(markers, TOTAL_CHOL_KEYS);
  const hdl = findMarker(markers, HDL_KEYS);
  const ldl = findMarker(markers, new Set(['ldl']));
  const nonHdl = findMarker(markers, new Set(['non_hdl'])) ?? derivedMarker(
    total,
    hdl,
    (a, b) => a - b,
    'non_hdl'
  );
  const ratio = findMarker(markers, new Set(['tc_hdl_ratio'])) ?? derivedMarker(
    total,
    hdl,
    (a, b) => (b ? a / b : null),
    'ratio'
  );

  const totalValue = latestNumber(total);
  const hdlValue = latestNumber(hdl);
  const ldlValue = latestNumber(ldl);
  const totalLimit = limitOf(total, LIPID_FALLBACK_LIMIT.total);
  const rings = [
    ringFrom(total, {
      id: 'total',
      label: 'Total cholesterol',
      limit: totalLimit,
      segs: [
        { id: 'hdl', value: hdlValue },
        { id: 'ldl', value: ldlValue },
        { id: 'other', value: otherFraction(totalValue, hdlValue, ldlValue) }
      ]
    }),
    ringFrom(nonHdl, {
      id: 'non_hdl',
      label: 'Non-HDL-c',
      limit: limitOf(nonHdl, LIPID_FALLBACK_LIMIT.non_hdl)
    }),
    ringFrom(ratio, {
      id: 'ratio',
      label: 'Total : HDL',
      limit: limitOf(ratio, LIPID_FALLBACK_LIMIT.ratio)
    })
  ].filter(Boolean);

  return { rings };
}

function previousValue(marker) {
  const series = numericSeries(marker);
  return series.length > 1 ? series.at(-2).value : null;
}

function numericSeries(marker) {
  return (marker?.series ?? [])
    .filter(point => point?.value != null && Number.isFinite(Number(point.value)))
    .map(point => ({ date: point.date, value: Number(point.value) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function usedTone(used) {
  if (used > 1) return 'out';
  if (used >= 0.88) return 'ring';
  if (used >= 0.7) return 'leaning';
  return 'ok';
}

function nearestWithinDays(date, points, days) {
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return null;
  let best = null;
  let bestDays = Infinity;
  for (const point of points) {
    const other = Date.parse(point.date);
    if (!Number.isFinite(other)) continue;
    const gap = Math.abs(other - t) / 86400000;
    if (gap < bestDays) {
      bestDays = gap;
      best = point;
    }
  }
  return bestDays <= days ? best : null;
}

function insulinCaption(marker) {
  if (!marker) return null;
  const value = Number(marker.latest.value);
  if (!Number.isFinite(value)) return null;
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(1);
  const unit = marker.latest.unit ? ` ${marker.latest.unit}` : '';
  const date = marker.latest.date ? formatDisplayDate(marker.latest.date) : '';
  return {
    value,
    unit: marker.latest.unit ?? '',
    date: marker.latest.date ?? null,
    caption: date ? `Insulin ${amount}${unit} · ${date}` : `Insulin ${amount}${unit}`.trim()
  };
}

function findMarker(markers, keys) {
  return markers.find(marker => keys.has(marker.key) && latestNumber(marker) != null) ?? null;
}

function latestNumber(marker) {
  const n = Number(marker?.latest?.value);
  return Number.isFinite(n) ? n : null;
}

function derivedMarker(left, right, combine, key) {
  if (!left || !right) return null;
  const current = combine(latestNumber(left), latestNumber(right));
  if (current == null || !Number.isFinite(current)) return null;
  const leftSeries = numericSeries(left);
  const rightSeries = numericSeries(right);
  const dates = [...new Set([...leftSeries, ...rightSeries].map(point => point.date))].sort();
  const series = dates.map(date => {
    const a = nearestWithinDays(date, leftSeries, 0) ?? nearestWithinDays(date, leftSeries, 14);
    const b = nearestWithinDays(date, rightSeries, 0) ?? nearestWithinDays(date, rightSeries, 14);
    if (!a || !b) return null;
    const value = combine(a.value, b.value);
    return Number.isFinite(value) ? { date, value } : null;
  }).filter(Boolean);
  return {
    key,
    latest: { date: left.latest?.date, value: current, unit: left.latest?.unit ?? null },
    series
  };
}

function limitOf(marker, fallback) {
  const high = Number(marker?.latest?.ref_high);
  return Number.isFinite(high) && high > 0 ? high : fallback;
}

function otherFraction(total, hdl, ldl) {
  if (total == null) return 0;
  return Math.max(0, total - (hdl ?? 0) - (ldl ?? 0));
}

function ringFrom(marker, { id, label, limit, segs } = {}) {
  const value = latestNumber(marker);
  if (value == null || !limit) return null;
  const used = value / limit;
  const previous = previousValue(marker);
  const prevUsed = previous == null ? null : previous / limit;
  let direction = 'flat';
  if (prevUsed != null && used < prevUsed) direction = 'in';
  if (prevUsed != null && used > prevUsed) direction = 'out';
  return {
    id,
    label,
    value,
    limit,
    unit: marker.latest?.unit ?? '',
    date: marker.latest?.date ?? null,
    used,
    prevUsed,
    direction,
    segs: segs ?? null
  };
}

export function glucoseZones(unit) {
  if (unit === '%') {
    return [
      { id: 'normal', from: 0, to: 5.7, label: 'Normal' },
      { id: 'risk', from: 5.7, to: 6.5, label: 'At risk' },
      { id: 'diabetes', from: 6.5, to: 15, label: 'Diabetic range' }
    ];
  }
  return [
    { id: 'normal', from: 0, to: 39, label: 'Normal' },
    { id: 'risk', from: 39, to: 48, label: 'At risk' },
    { id: 'diabetes', from: 48, to: 120, label: 'Diabetic range' }
  ];
}

/**
 * Hover copy for one chart draw: the date, the amount, and the percent
 * move from the previous check. The first draw has no arrow.
 */
export function pointHoverNote(point, previous, { unit, name } = {}) {
  if (!point || point.value == null || !Number.isFinite(Number(point.value))) return null;
  const value = Number(point.value);
  const amount = name ? `${name} · ${formatAmount(value, unit)}` : formatAmount(value, unit);
  const date = formatDisplayDate(point.date);
  const prior = previous?.value == null || !Number.isFinite(Number(previous.value))
    ? null
    : Number(previous.value);
  if (prior == null) {
    return { date, amount, dir: null, change: '', label: `${date} · ${amount}` };
  }
  const delta = value - prior;
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
  const change = `${arrow}${formatPercent(delta, prior)}`;
  return {
    date,
    amount,
    dir,
    change,
    label: `${date} · ${amount} · ${change}`
  };
}

export function spokeHoverNote(spoke, { previous = false } = {}) {
  if (!spoke) return null;
  const value = previous ? spoke.prevValue : spoke.value;
  if (value == null || !Number.isFinite(Number(value))) return null;
  const date = formatDisplayDate(previous ? spoke.prevDate : spoke.date);
  const amount = `${spoke.label} · ${formatAmount(Number(value), spoke.unit)}`;
  const used = previous ? spoke.prevUsed : spoke.used;
  const usedText = used == null ? '' : `${Math.round(used * 100)}% used`;
  const ref = rangeText(spoke.refLow, spoke.refHigh);
  const detail = [ref, usedText].filter(Boolean).join(' · ');
  return {
    date,
    amount,
    detail,
    dir: null,
    change: '',
    label: [spoke.label, formatAmount(Number(value), spoke.unit), ref, usedText, date].filter(Boolean).join(' · ')
  };
}

export function glucoseHoverNote(point) {
  if (!point || point.fasting == null || point.hba1c == null) return null;
  const date = formatDisplayDate(point.date);
  const fasting = formatAmount(point.fasting, 'mmol/L');
  const hba1c = formatAmount(point.hba1c, '%');
  return {
    date,
    amount: `Fasting ${fasting}`,
    detail: `HbA1c ${hba1c}`,
    dir: null,
    change: '',
    label: `${date} · Fasting ${fasting} · HbA1c ${hba1c}`
  };
}

export function lipidHoverNote(ring) {
  if (!ring || ring.value == null) return null;
  const amount = `${ring.label} · ${formatAmount(ring.value, ring.unit)}`;
  const used = `${Math.round(ring.used * 100)}% spent`;
  const limit = ring.limit != null ? `limit ${formatAmount(ring.limit, ring.unit)}` : '';
  const date = formatDisplayDate(ring.date);
  const dir = ring.direction === 'out' ? 'up' : ring.direction === 'in' ? 'down' : null;
  const change = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '';
  return {
    date,
    amount,
    detail: [limit, used].filter(Boolean).join(' · '),
    dir,
    change,
    label: [ring.label, formatAmount(ring.value, ring.unit), limit, used, date].filter(Boolean).join(' · ')
  };
}

function rangeText(refLow, refHigh) {
  const low = refLow == null || refLow === '' || !Number.isFinite(Number(refLow)) ? null : Number(refLow);
  const high = refHigh == null || refHigh === '' || !Number.isFinite(Number(refHigh)) ? null : Number(refHigh);
  if (low != null && high != null) return `${low}–${high}`;
  if (high != null) return `<${high}`;
  if (low != null) return `>${low}`;
  return '';
}

function formatAmount(value, unit) {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${text} ${unit}` : text;
}

function formatPercent(delta, prior) {
  if (prior === 0) return delta === 0 ? '0%' : '—';
  const mag = Math.abs((delta / prior) * 100);
  const rounded = Math.round(mag * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function compareChartPoints(a, b) {
  if (!a || !b || a.date === b.date) return null;
  const [from, to] = a.date < b.date ? [a, b] : [b, a];
  const delta = Number(to.value) - Number(from.value);
  if (!Number.isFinite(delta)) return null;
  const days = Math.round((Date.parse(to.date) - Date.parse(from.date)) / 86400000);
  const base = Math.abs(Number(from.value)) || 1;
  const pct = Math.abs(delta) / base;
  const intensity = pct >= 0.3 ? 'strong' : pct >= 0.15 ? 'medium' : pct >= 0.05 ? 'light' : 'none';
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const mag = Math.abs(delta);
  const magText = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
  const span = `${days} day${days === 1 ? '' : 's'}`;
  const tail = intensity === 'none' ? '' : ` · ${intensity}`;
  return {
    from: from.date,
    to: to.date,
    delta,
    days,
    intensity,
    meaningful: intensity !== 'none',
    label: `${arrow}${magText} over ${span}${tail}`
  };
}

export function nextComparePins(pins, point) {
  if (!point) return pins ?? [];
  const current = pins ?? [];
  if (current.length === 0) return [point];
  if (current.length === 1) {
    if (current[0].date === point.date && current[0].value === point.value) return current;
    return [current[0], point];
  }
  return [point];
}

export function ratioTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'first';
  if (n >= 5) return 'high';
  if (n >= 3.5) return 'low';
  return 'normal';
}
