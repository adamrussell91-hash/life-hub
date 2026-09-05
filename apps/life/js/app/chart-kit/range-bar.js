/**
 * Horizontal range gauge: a value placed on a reference span, plus a tick.
 * Promoted from Bloods so Fitness can share the same primitive.
 */
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

export function rangeBarTick(fraction, { width = 320, padding = 16 } = {}) {
  const clamped = Math.min(1, Math.max(0, Number(fraction) || 0));
  return padding + clamped * (width - padding * 2);
}
