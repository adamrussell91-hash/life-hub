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
