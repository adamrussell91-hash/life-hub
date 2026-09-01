import { buildAreaLine } from './chart-kit/area-line.js';

export function buildProteinLineChart(series, options = {}) {
  const normalized = series.map(day => ({ date: day.date, value: day.protein_g }));
  const {
    height = 140,
    padding = 14,
    paddingBottom = options.padding != null ? options.padding : 28,
    ...rest
  } = options;
  const chart = buildAreaLine(normalized, {
    height,
    padding,
    paddingBottom,
    ...rest
  });
  return {
    ...chart,
    last: chart.points.at(-1) ?? null
  };
}
