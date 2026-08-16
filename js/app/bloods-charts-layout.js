export function rangeTrackLayout({
  value,
  previous,
  refLow,
  refHigh,
  width = 320,
  padding = 16
} = {}) {
  const finite = n => n != null && n !== '' && Number.isFinite(Number(n));
  const v = finite(value) ? Number(value) : null;
  const prev = finite(previous) ? Number(previous) : null;
  const low = finite(refLow) ? Number(refLow) : null;
  const high = finite(refHigh) ? Number(refHigh) : null;
  const values = [v, prev, low, high].filter(n => n != null);
  let domainMin = values.length ? Math.min(...values) : 0;
  let domainMax = values.length ? Math.max(...values) : 1;
  if (domainMin === domainMax) {
    domainMin -= 1;
    domainMax += 1;
  }
  const inner = Math.max(0, width - padding * 2);
  const xAt = n => padding + ((Number(n) - domainMin) / (domainMax - domainMin)) * inner;
  const bandStartX = low != null ? xAt(low) : padding;
  const bandEndX = high != null ? xAt(high) : padding + inner;
  const latestX = v != null ? xAt(v) : padding;
  const previousX = prev != null ? xAt(prev) : null;
  let arrow = null;
  if (previousX != null && latestX !== previousX) {
    arrow = latestX > previousX ? 'right' : 'left';
  }
  const overflow = v != null && high != null && v > high
    ? 'high'
    : v != null && low != null && v < low
      ? 'low'
      : null;
  return {
    domainMin,
    domainMax,
    bandStartX,
    bandEndX,
    latestX,
    previousX,
    arrow,
    overflow
  };
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
