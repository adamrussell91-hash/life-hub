const DEFAULT_SIZE = 64;
const DEFAULT_STROKE_WIDTH = 8;

export function buildCompletionRing({ complete, total }, { size = DEFAULT_SIZE, strokeWidth = DEFAULT_STROKE_WIDTH } = {}) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, Math.max(0, complete / total)) : 0;

  return {
    size,
    strokeWidth,
    center,
    radius,
    circumference,
    dashoffset: circumference * (1 - fraction)
  };
}
