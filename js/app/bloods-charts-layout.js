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

export function rangeBarLayout(value, refLow, refHigh, { width = 320, padding = 16 } = {}) {
  const span = Number(refHigh) - Number(refLow);
  const raw = !Number.isFinite(span) || span === 0
    ? 0.5
    : (Number(value) - Number(refLow)) / span;
  const fraction = Math.min(1, Math.max(0, raw));
  return {
    x: padding + fraction * (width - padding * 2),
    fraction,
    clamped: raw < 0 || raw > 1,
    overflow: raw < 0 ? 'low' : raw > 1 ? 'high' : null
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
