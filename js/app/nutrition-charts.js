import { buildAreaLine } from './chart-kit/area-line.js';

export function buildProteinLineChart(series, options = {}) {
  const normalized = series.map(day => ({ date: day.date, value: day.protein_g }));
  const chart = buildAreaLine(normalized, options);
  return {
    ...chart,
    last: chart.points.at(-1) ?? null
  };
}
