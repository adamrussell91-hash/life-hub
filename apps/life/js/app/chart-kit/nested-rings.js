// Concentric target rings, outermost first. A ring past its target keeps going for
// a second, darker lap (capped at one extra turn) so "140%" reads as overflow.
export function buildNestedRings(rings, { size = 200, strokeWidth = 11, gap = 2 } = {}) {
  const center = size / 2;
  return rings.map((ring, index) => {
    const radius = center - strokeWidth / 2 - index * (strokeWidth + gap);
    const circumference = 2 * Math.PI * radius;
    const hasTarget = Number(ring.target) > 0;
    const raw = hasTarget ? Math.max(0, Number(ring.value) || 0) / ring.target : 0;
    const fraction = Math.min(1, raw);
    const overflow = Math.min(1, Math.max(0, raw - 1));
    return {
      ...ring,
      center,
      radius,
      strokeWidth,
      circumference,
      hasTarget,
      ratio: raw,
      fraction,
      overflow,
      dashoffset: circumference * (1 - fraction),
      overflowDashoffset: circumference * (1 - overflow)
    };
  });
}
