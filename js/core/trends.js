import { daysBetween, enumerateDateKeys, getSydneyWeekStart } from './time.js';

const MAX_WEEKLY_POINTS = 120;

const intensityFor = (magnitude, [light, medium, strong]) =>
  magnitude >= strong ? 'strong'
    : magnitude >= medium ? 'medium'
      : magnitude >= light ? 'light'
        : 'none';

function resultFor(delta, config, suffix = '') {
  const direction = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = delta === 0 ? null : config.good === direction;
  const sign = delta < 0 ? '−' : delta > 0 ? '+' : '';

  return {
    direction,
    colour: good == null ? 'neutral' : good ? 'green' : 'red',
    intensity: intensityFor(Math.abs(delta), config.thresholds),
    label: `${sign}${Math.abs(delta).toFixed(1)} ${config.unit}${suffix}`,
    delta
  };
}

export function getTrend(current, previous, config) {
  if (!previous || previous[config.field] == null) {
    return {
      direction: 'neutral',
      colour: 'neutral',
      intensity: 'none',
      label: 'First reading',
      delta: null
    };
  }

  const old = daysBetween(previous.date, current.date) > 60;
  const dateLabel = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', timeZone: 'UTC'
  }).format(new Date(`${previous.date}T00:00:00Z`));
  const suffix = old ? ` since ${dateLabel}` : '';

  return resultFor(current[config.field] - previous[config.field], config, suffix);
}

export function comparePeriods(current, previous, config) {
  if (previous == null) {
    return {
      direction: 'neutral',
      colour: 'neutral',
      intensity: 'none',
      label: 'no prior data',
      delta: null
    };
  }

  return resultFor(current - previous, config);
}

export function downsampleWeekly(points, valueField) {
  if (points.length === 0) return [];

  const firstWeek = getSydneyWeekStart(points[0].date);
  const lastWeek = getSydneyWeekStart(points.at(-1).date);
  const weeks = enumerateDateKeys(firstWeek, lastWeek)
    .filter((date, index) => index % 7 === 0);

  if (weeks.length > MAX_WEEKLY_POINTS) {
    throw new RangeError(`Weekly series exceeds ${MAX_WEEKLY_POINTS} points`);
  }

  const valuesByWeek = new Map();
  for (const point of points) {
    if (point[valueField] == null) continue;
    const week = getSydneyWeekStart(point.date);
    const values = valuesByWeek.get(week) ?? [];
    values.push(point[valueField]);
    valuesByWeek.set(week, values);
  }

  return weeks.map(date => {
    const values = valuesByWeek.get(date) ?? [];
    const value = values.length === 0
      ? null
      : values.reduce((sum, observation) => sum + observation, 0) / values.length;
    return { date, value };
  });
}
