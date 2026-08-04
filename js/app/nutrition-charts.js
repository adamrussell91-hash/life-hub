const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 120;
const DEFAULT_PADDING = 12;

export function buildProteinLineChart(series, { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, padding = DEFAULT_PADDING } = {}) {
  const values = series.map(day => day.protein_g);
  const max = Math.max(1, ...values);
  const stepX = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;
  const scaleY = value => height - padding - (value / max) * (height - padding * 2);

  const points = series.map((day, index) => ({
    x: padding + stepX * index,
    y: scaleY(day.protein_g),
    date: day.date,
    value: day.protein_g
  }));

  const linePoints = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const areaPoints = points.length === 0
    ? ''
    : `${padding},${height} ${linePoints} ${width - padding},${height}`;

  return {
    width,
    height,
    points,
    linePoints,
    areaPoints,
    last: points.at(-1) ?? null
  };
}
