/**
 * Equity wedge (`equity-wedge`): a rising value line over a falling loan line,
 * the gap between them filled as equity, with milestone pins and a year cursor.
 * Used on Life → Property (Time machine).
 */

/**
 * @param {{ year: number, worth: number, loan: number }[]} series
 * @param {{ width?: number, height?: number, padLeft?: number, padRight?: number, top?: number, bottom?: number, sample?: number }} options
 */
export function buildEquityWedge(series, { width = 900, height = 260, padLeft = 58, padRight = 16, top = 16, bottom = 38, sample = 4 } = {}) {
  if (!series?.length) return null;
  const y0 = series[0].year;
  const y1 = series[series.length - 1].year;
  const base = height - bottom;
  const maxValue = Math.max(...series.map(point => point.worth), 1) * 1.04;
  const sx = year => padLeft + ((year - y0) / Math.max(y1 - y0, 1e-6)) * (width - padLeft - padRight);
  const sy = value => base - (Math.max(0, value) / maxValue) * (base - top);
  const points = series.filter((_, index) => index % sample === 0 || index === series.length - 1);
  const line = key => points.map((point, index) => `${index ? 'L' : 'M'}${sx(point.year).toFixed(1)},${sy(point[key]).toFixed(1)}`).join(' ');
  const worthPath = line('worth');
  const loanPath = line('loan');
  const wedgePath = `${worthPath} ${[...points].reverse().map(point => `L${sx(point.year).toFixed(1)},${sy(point.loan).toFixed(1)}`).join(' ')} Z`;
  const step = maxValue > 3e6 ? 1e6 : maxValue > 1.2e6 ? 5e5 : 2.5e5;
  const yTicks = [];
  for (let value = 0; value <= maxValue; value += step) yTicks.push({ value, y: sy(value) });
  const firstTick = Math.ceil(y0 / 5) * 5;
  const xTicks = [];
  for (let year = firstTick; year <= y1; year += 5) xTicks.push({ year, x: sx(year) });
  return { width, height, base, top, padLeft, padRight, y0, y1, sx, sy, worthPath, loanPath, wedgePath, yTicks, xTicks };
}

/** Year under a horizontal pixel position, clamped to the series span. */
export function yearAtX(wedge, x) {
  const span = wedge.width - wedge.padLeft - wedge.padRight;
  const year = wedge.y0 + ((x - wedge.padLeft) / span) * (wedge.y1 - wedge.y0);
  return Math.min(wedge.y1, Math.max(wedge.y0, year));
}
