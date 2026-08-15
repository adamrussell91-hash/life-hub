import { stack } from './d3-layout.js';
import { stackOffsetWiggle } from './vendor/d3-shape.min.js';

function areaFromBands(points) {
  if (!points.length) return 'M0,0';
  if (points.length === 1) {
    const point = points[0];
    const x1 = point.x + point.band;
    return `M${point.x},${point.y1} L${x1},${point.y1} L${x1},${point.y0} L${point.x},${point.y0} Z`;
  }
  let d = `M${points[0].x},${points[0].y1}`;
  for (let i = 1; i < points.length; i += 1) d += ` L${points[i].x},${points[i].y1}`;
  for (let i = points.length - 1; i >= 0; i -= 1) d += ` L${points[i].x},${points[i].y0}`;
  return `${d} Z`;
}

function scaleLayers(layers, { width, height, padding }) {
  const ys = layers.flatMap(layer => layer.flatMap(pair => [pair[0], pair[1]]));
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(1, ...ys);
  const span = maxY - minY || 1;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  const count = layers[0]?.length ?? 0;
  const step = count > 1 ? innerW / (count - 1) : innerW;
  const band = count > 1 ? step : innerW;
  const y = value => padding + innerH - ((value - minY) / span) * innerH;
  return layers.map(layer => ({
    key: layer.key,
    d: areaFromBands(layer.map((pair, index) => ({
      x: padding + index * (count > 1 ? step : 0),
      y0: y(pair[0]),
      y1: y(pair[1]),
      band
    })))
  }));
}

function handStack(weekly, size) {
  const series = weekly.series ?? [];
  const weeks = weekly.weeks ?? [];
  const baseline = weeks.map(() => 0);
  const layers = series.map(item => {
    const layer = (item.values ?? []).map((value, index) => {
      const y0 = baseline[index] ?? 0;
      const y1 = y0 + (Number(value) || 0);
      baseline[index] = y1;
      return [y0, y1];
    });
    layer.key = item.key;
    return layer;
  });
  return scaleLayers(layers, size);
}

export function buildStreamPaths(weekly, { width = 320, height = 80, padding = 4 } = {}) {
  const series = weekly?.series ?? [];
  const weeks = weekly?.weeks ?? [];
  if (!series.length) return [];
  const size = { width, height, padding };
  try {
    const rows = weeks.map((_, index) => {
      const row = {};
      for (const item of series) row[item.key] = Number(item.values?.[index]) || 0;
      return row;
    });
    const layout = stack().keys(series.map(item => item.key));
    if (typeof stackOffsetWiggle === 'function') layout.offset(stackOffsetWiggle);
    return scaleLayers(layout(rows), size);
  } catch {
    return handStack(weekly, size);
  }
}
