const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 120;
const DEFAULT_PADDING = 12;

function rollingMeans(values, window) {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, n) => sum + n, 0) / slice.length;
  });
}

function fmt(n) {
  return Number(n).toFixed(1);
}

/** Catmull-Rom → cubic Bézier path through points (smooth line). */
export function smoothLinePath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;

  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}

export function smoothAreaPath(points, { width, baselineY, padding }) {
  const line = smoothLinePath(points);
  if (!line) return '';
  return `${line} L ${fmt(width - padding)} ${fmt(baselineY)} L ${fmt(padding)} ${fmt(baselineY)} Z`;
}

export function buildAreaLine(
  series,
  {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    padding = DEFAULT_PADDING,
    paddingBottom = padding,
    valueKey = 'value',
    rollingAverage = 0,
    guideValue = null,
    yDomain = 'zero'
  } = {}
) {
  const values = series.map(day => Number(day[valueKey]) || 0);
  const means = rollingAverage > 0 ? rollingMeans(values, rollingAverage) : [];
  const guide = guideValue == null || !Number.isFinite(Number(guideValue)) ? null : Number(guideValue);
  const stepX = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;
  const plotBottom = height - paddingBottom;

  let scaleY;
  if (yDomain === 'padded') {
    const finite = values.filter(Number.isFinite);
    const rawMin = Math.min(...finite);
    const rawMax = Math.max(...finite);
    const pad = Math.max((rawMax - rawMin) * 0.15, rawMax === rawMin ? 1 : 0);
    const min = rawMin - pad;
    const max = rawMax + pad;
    scaleY = value => plotBottom - ((value - min) / (max - min)) * (plotBottom - padding);
  } else {
    const max = Math.max(1, ...values, ...means, guide ?? 0);
    scaleY = value => plotBottom - (value / max) * (plotBottom - padding);
  }

  const points = series.map((day, index) => ({
    x: padding + stepX * index,
    y: scaleY(values[index]),
    date: day.date,
    value: values[index]
  }));

  const linePoints = points.map(point => `${fmt(point.x)},${fmt(point.y)}`).join(' ');
  const areaPoints = points.length === 0
    ? ''
    : `${padding},${plotBottom} ${linePoints} ${width - padding},${plotBottom}`;
  const linePath = smoothLinePath(points);
  const areaPath = smoothAreaPath(points, { width, baselineY: plotBottom, padding });

  const result = {
    width,
    height,
    paddingBottom,
    points,
    linePoints,
    areaPoints,
    linePath,
    areaPath,
    dayLabels: points.map(({ date, x }) => ({ date, x })),
    guideY: guide == null ? null : scaleY(guide)
  };

  if (rollingAverage > 0 && points.length > 0) {
    const meanPoints = means.map((mean, index) => ({
      x: points[index].x,
      y: scaleY(mean)
    }));
    result.rollingLinePoints = meanPoints.map(point => `${fmt(point.x)},${fmt(point.y)}`).join(' ');
    result.rollingLinePath = smoothLinePath(meanPoints);
  }

  return result;
}
