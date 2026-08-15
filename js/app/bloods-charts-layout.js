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
