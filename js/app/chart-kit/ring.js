const DEFAULT_SIZE = 64;
const DEFAULT_STROKE_WIDTH = 8;

export function buildRingTarget(
  { value, target },
  { size = DEFAULT_SIZE, strokeWidth = DEFAULT_STROKE_WIDTH } = {}
) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const raw = target > 0 ? value / target : 0;
  const fraction = Math.min(1, Math.max(0, raw));

  return {
    size,
    strokeWidth,
    center,
    radius,
    circumference,
    fraction,
    dashoffset: circumference * (1 - fraction),
    value,
    target
  };
}
