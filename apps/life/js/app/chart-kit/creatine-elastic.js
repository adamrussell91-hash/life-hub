import { smoothLinePath } from './area-line.js';

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const conservative = range => range?.low ?? 0;

/** Conservative relative loading geometry, matching the target/ETA threshold.
 * The shaded forecast retains both bounds; the open dot is dose potential,
 * never an absorption deadline. */
export function buildCreatineElastic(model, { width = 400, height = 240, progress = 1, previous = null } = {}) {
  const left = 8, right = width - 8, top = 32, base = height - 44;
  const now = left + (right - left) * 0.5;
  const y = value => base - clamp(value) * (base - top);
  const complete = model.confidence !== 'incomplete';
  const horizon = Math.max(7, Math.min(60, (model.eta?.high ?? 7) + 2));
  const trace = complete ? (model.trace ?? []).map((point, index, all) => ({
    x: left + (now - left) * index / Math.max(1, all.length - 1),
    y: y(index === all.length - 1 ? conservative(previous?.level ?? point) + (conservative(point) - conservative(previous?.level ?? point)) * progress : conservative(point))
  })) : [];
  const current = trace.at(-1) ?? { x: now, y: y(conservative(model.level)) };
  const forecast = complete ? (model.forecast ?? []).filter(point => point.days <= horizon)
    .map(point => ({ x: now + (right - now) * point.days / horizon, y: y(conservative(point)) })) : [];
  if (forecast.length) forecast[0] = current;
  const band = complete ? (model.forecast ?? []).filter(point => point.days <= horizon) : [];
  const edge = key => band.map(point => ({ x: now + (right - now) * point.days / horizon, y: y(point[key]) }));
  const upper = edge('high'), lower = edge('low').reverse();
  const forecastBand = upper.length ? smoothLinePath(upper) + ' ' + smoothLinePath(lower).replace(/^M/, 'L') + ' Z' : '';
  const pending = complete && model.pendingGrams > 0.01 ? {
    x: now + (right - now) * 0.14,
    y: y(conservative(previous?.pendingLevel ?? model.level) + (conservative(model.pendingLevel) - conservative(previous?.pendingLevel ?? model.level)) * progress)
  } : null;
  return {
    width, height, left, right, now, base, targetY: y(model.target), top, horizon,
    trace, current, pending, line: smoothLinePath(trace), forecast: smoothLinePath(forecast), forecastBand,
    area: trace.length ? smoothLinePath(trace) + ' L ' + now + ' ' + base + ' L ' + left + ' ' + base + ' Z' : ''
  };
}
