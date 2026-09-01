import { stack } from './d3-layout.js';
import { stackOffsetWiggle } from './vendor/d3-shape.min.js';
import { smoothLinePath } from './area-line.js';
import { MONTHS, addDays } from './polar-clock.js';
import { WATCHLIST_SLOTS } from './watchlist-heat.js';

const WIDTH = 960;
const HEIGHT = 480;
const PAD = { top: 24, right: 64, bottom: 58, left: 28 };

function formatWeekLabel(dateKey) {
  const [, month, day] = String(dateKey).split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

function weekShows(index, count) {
  if (count <= 8) return true;
  if (index === 0 || index === count - 1) return true;
  const step = Math.ceil(count / 6);
  return index % step === 0;
}

function colourFor(key, index) {
  if (key === 'other') return 'var(--orca)';
  return WATCHLIST_SLOTS[index % WATCHLIST_SLOTS.length];
}

function ribbonPath(samples) {
  if (!samples.length) return '';
  if (samples.length === 1) {
    const sample = samples[0];
    const x1 = sample.x + Math.max(sample.band, 12);
    return `M${sample.x},${sample.y1} L${x1},${sample.y1} L${x1},${sample.y0} L${sample.x},${sample.y0} Z`;
  }
  const top = samples.map(sample => ({ x: sample.x, y: sample.y1 }));
  const bot = [...samples].reverse().map(sample => ({ x: sample.x, y: sample.y0 }));
  return `${smoothLinePath(top)} ${smoothLinePath(bot).replace(/^M/, 'L')} Z`;
}

function contourLines(samples) {
  const thickest = Math.max(0, ...samples.map(sample => Math.abs(sample.y1 - sample.y0)));
  const levels = Math.max(0, Math.min(5, Math.floor(thickest / 16)));
  const lines = [];
  for (let level = 1; level <= levels; level += 1) {
    const t = level / (levels + 1);
    const points = samples.map(sample => ({
      x: sample.x,
      y: sample.y0 + (sample.y1 - sample.y0) * t
    }));
    lines.push({ level, d: smoothLinePath(points) });
  }
  return lines;
}

function weekDelta(values, index) {
  const current = Number(values[index]) || 0;
  const previous = index > 0 ? Number(values[index - 1]) || 0 : null;
  if (previous == null) return { dir: 'flat', pct: 0 };
  if (previous === 0 && current === 0) return { dir: 'flat', pct: 0 };
  const diff = current - previous;
  const pct = previous === 0 ? 100 : Math.round((diff / previous) * 100);
  if (diff === 0) return { dir: 'flat', pct: 0 };
  return { dir: diff > 0 ? 'up' : 'down', pct };
}

function scaleLayers(layers, weeks, valuesByKey, { width, height, pad }) {
  const ys = layers.flatMap(layer => layer.flatMap(pair => [pair[0], pair[1]]));
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(1, ...ys);
  const span = maxY - minY || 1;
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);
  const count = layers[0]?.length ?? 0;
  const step = count > 1 ? innerW / (count - 1) : innerW;
  const band = count > 1 ? step : innerW;
  const y = value => pad.top + innerH - ((value - minY) / span) * innerH;
  const xAt = index => pad.left + (count > 1 ? index * step : 0);

  return layers.map((layer, index) => {
    const key = layer.key;
    const values = valuesByKey.get(key) ?? [];
    const maxCount = Math.max(0, ...values.map(value => Number(value) || 0));
    const samples = layer.map((pair, weekIndex) => {
      const count = Number(values[weekIndex]) || 0;
      const y0 = y(pair[0]);
      const y1 = y(pair[1]);
      const delta = weekDelta(values, weekIndex);
      return {
        week: weeks[weekIndex],
        x: xAt(weekIndex),
        y0,
        y1,
        midY: (y0 + y1) / 2,
        band,
        count,
        peak: maxCount > 0 && count === maxCount,
        dir: delta.dir,
        pct: delta.pct
      };
    });
    const widest = samples.reduce((best, sample) => (
      Math.abs(sample.y1 - sample.y0) > Math.abs(best.y1 - best.y0) ? sample : best
    ), samples[0]);
    const last = samples[samples.length - 1];
    return {
      key,
      colour: colourFor(key, index),
      d: ribbonPath(samples),
      contours: contourLines(samples),
      samples,
      labelX: pad.left + 12,
      labelY: widest?.midY ?? pad.top + innerH / 2,
      end: last ? { x: last.x, y: last.midY } : null
    };
  });
}

function nudgeLabels(bands) {
  const ordered = [...bands].sort((a, b) => a.labelY - b.labelY);
  const minGap = 16;
  for (let index = 1; index < ordered.length; index += 1) {
    const prev = ordered[index - 1];
    const next = ordered[index];
    if (next.labelY - prev.labelY < minGap) next.labelY = prev.labelY + minGap;
  }
  const byKey = new Map(ordered.map(band => [band.key, band.labelY]));
  for (const band of bands) band.labelY = byKey.get(band.key);
}

function stackedLayers(weekly) {
  const series = weekly?.series ?? [];
  const weeks = weekly?.weeks ?? [];
  if (!series.length) return [];
  const keys = series.map(item => item.key);
  const rows = weeks.map((_, index) => {
    const row = {};
    for (const item of series) row[item.key] = Number(item.values?.[index]) || 0;
    return row;
  });
  try {
    const layout = stack().keys(keys);
    if (typeof stackOffsetWiggle === 'function') layout.offset(stackOffsetWiggle);
    const stacked = layout(rows);
    stacked.forEach((layer, index) => {
      layer.key = keys[index];
    });
    return stacked;
  } catch {
    const baseline = weeks.map(() => 0);
    return series.map(item => {
      const layer = (item.values ?? []).map((value, index) => {
        const y0 = baseline[index] ?? 0;
        const y1 = y0 + (Number(value) || 0);
        baseline[index] = y1;
        return [y0, y1];
      });
      layer.key = item.key;
      return layer;
    });
  }
}

/**
 * Theme topography: a streamgraph whose contours thicken where a theme
 * swells. More contours = more volume that week.
 */
export function buildThemeTopography(weekly = {}) {
  const weeks = weekly?.weeks ?? [];
  const series = weekly?.series ?? [];
  const valuesByKey = new Map(series.map(item => [item.key, item.values ?? []]));
  const layers = stackedLayers(weekly);
  const size = { width: WIDTH, height: HEIGHT, pad: PAD };
  const bands = layers.length ? scaleLayers(layers, weeks, valuesByKey, size) : [];
  if (bands.length) nudgeLabels(bands);

  return {
    width: WIDTH,
    height: HEIGHT,
    pad: PAD,
    weeks: weeks.map((week, index) => ({
      week,
      x: bands[0]?.samples[index]?.x ?? PAD.left,
      label: formatWeekLabel(week),
      range: `${formatWeekLabel(week)} – ${formatWeekLabel(addDays(week, 6))}`,
      show: weekShows(index, weeks.length),
      now: index === weeks.length - 1
    })),
    bands,
    empty: bands.length === 0
  };
}

export function buildStreamPaths(weekly, { width = 320, height = 80, padding = 4 } = {}) {
  const chart = buildThemeTopography(weekly);
  if (width === WIDTH && height === HEIGHT) return chart.bands.map(band => ({ key: band.key, d: band.d }));
  const weeks = weekly?.weeks ?? [];
  const series = weekly?.series ?? [];
  const valuesByKey = new Map(series.map(item => [item.key, item.values ?? []]));
  const layers = stackedLayers(weekly);
  if (!layers.length) return [];
  return scaleLayers(layers, weeks, valuesByKey, {
    width,
    height,
    pad: { top: padding, right: padding, bottom: padding, left: padding }
  }).map(band => ({ key: band.key, d: band.d }));
}
