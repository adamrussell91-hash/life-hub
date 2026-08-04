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

export function buildAreaLine(
  series,
  {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    padding = DEFAULT_PADDING,
    valueKey = 'value',
    rollingAverage = 0
  } = {}
) {
  const values = series.map(day => Number(day[valueKey]) || 0);
  const means = rollingAverage > 0 ? rollingMeans(values, rollingAverage) : [];
  const max = Math.max(1, ...values, ...means);
  const stepX = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;
  const scaleY = value => height - padding - (value / max) * (height - padding * 2);

  const points = series.map((day, index) => ({
    x: padding + stepX * index,
    y: scaleY(values[index]),
    date: day.date,
    value: values[index]
  }));

  const linePoints = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const areaPoints = points.length === 0
    ? ''
    : `${padding},${height} ${linePoints} ${width - padding},${height}`;

  const result = {
    width,
    height,
    points,
    linePoints,
    areaPoints,
    dayLabels: points.map(({ date, x }) => ({ date, x }))
  };

  if (rollingAverage > 0 && points.length > 0) {
    result.rollingLinePoints = means
      .map((mean, index) => `${points[index].x.toFixed(1)},${scaleY(mean).toFixed(1)}`)
      .join(' ');
  }

  return result;
}
