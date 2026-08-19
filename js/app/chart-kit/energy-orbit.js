import {
  angleTicksForRange,
  dayNumber,
  MONTHS,
  polar,
  thetaForDate
} from './polar-clock.js';

const SIZE = 680;
const CX = SIZE / 2;
const CY = SIZE / 2;
const LABEL_PAD = 78;
const R_PLOT = CX - LABEL_PAD;
const TICK_GEOMETRY = { cx: CX, cy: CY, rim: R_PLOT, labelOffset: 28 };
const DOT_R = 3.5;
const STREAK_R = 6.5;
const MIN_STREAK = 3;
const ENERGY_RANK = { low: 0, medium: 1, high: 2 };
const ENERGY_COLOUR = {
  high: 'var(--wave)',
  medium: 'var(--marine)',
  low: 'var(--high-sea)'
};
const RING_FRACTIONS = [
  { key: 'high', label: 'High', fraction: 0.88 },
  { key: 'medium', label: 'Medium', fraction: 0.66 },
  { key: 'low', label: 'Low', fraction: 0.44 }
];
const RANGE_MOTION = {
  weekly: 'A week in motion',
  monthly: 'A month in motion',
  six_month: 'Six months in motion',
  year: 'A year in motion'
};
const RANGE_PERIOD = {
  weekly: 'Past 7 days',
  monthly: 'Past 30 days',
  six_month: 'Past 6 months',
  year: 'This year'
};

function capitalise(value) {
  return String(value ?? '').charAt(0).toUpperCase() + String(value ?? '').slice(1);
}

function formatCalloutDay(dateKey) {
  const [, month, day] = String(dateKey).split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

function formatCalloutRange(from, to) {
  if (from === to) return formatCalloutDay(from);
  return `${formatCalloutDay(from)} – ${formatCalloutDay(to)}`;
}

function meanRank(points) {
  const ranked = (points ?? []).filter(point => ENERGY_RANK[point.energy] != null);
  if (!ranked.length) return null;
  return ranked.reduce((sum, point) => sum + ENERGY_RANK[point.energy], 0) / ranked.length;
}

function dominantEnergy(points) {
  const tally = { high: 0, medium: 0, low: 0 };
  for (const point of points ?? []) {
    if (tally[point.energy] != null) tally[point.energy] += 1;
  }
  let best = null;
  let bestCount = 0;
  for (const key of ['high', 'medium', 'low']) {
    if (tally[key] >= bestCount && tally[key] > 0) {
      best = key;
      bestCount = tally[key];
    }
  }
  return best;
}

function headlineFor(points, previous, range) {
  const dominant = dominantEnergy(points);
  const current = meanRank(points);
  const prior = meanRank(previous);
  let trend = null;
  if (current != null && prior != null) {
    if (current < prior - 0.12) trend = 'Lower than last period';
    else if (current > prior + 0.12) trend = 'Higher than last period';
    else trend = 'About the same as last period';
  }
  const motion = RANGE_MOTION[range] ?? RANGE_MOTION.monthly;
  return {
    title: 'Energy',
    status: dominant ? `Mostly ${capitalise(dominant)}` : null,
    period: RANGE_PERIOD[range] ?? RANGE_PERIOD.monthly,
    trend,
    legend: `${motion}. Each day lands on the level that best reflects your energy.`
  };
}

function energyRuns(points) {
  const sorted = [...(points ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const groups = [];
  let current = null;
  for (const point of sorted) {
    const gap = current ? dayNumber(point.date) - dayNumber(current.to) : 0;
    if (!current || current.energy !== point.energy || gap > 1) {
      current = {
        energy: point.energy,
        from: point.date,
        to: point.date,
        dates: [point.date]
      };
      groups.push(current);
    } else {
      current.to = point.date;
      current.dates.push(point.date);
    }
  }
  return groups.map(group => ({ ...group, length: group.dates.length }));
}

function calloutTitle(run, highOrder) {
  if (run.energy === 'low') return 'Low streak';
  if (run.energy === 'medium') return 'Medium stretch';
  return highOrder === 0 ? 'High period' : 'Elevated stretch';
}

function buildCallouts(runs, rings, bounds, range) {
  const notable = runs
    .filter(run => run.length >= MIN_STREAK)
    .sort((a, b) => b.length - a.length || a.from.localeCompare(b.from))
    .slice(0, 3);
  const highOrder = new Map(
    notable
      .filter(run => run.energy === 'high')
      .sort((a, b) => a.from.localeCompare(b.from))
      .map((run, index) => [run.from + run.energy, index])
  );
  const byKey = Object.fromEntries(rings.map(ring => [ring.key, ring]));
  return notable.map(run => {
    const ring = byKey[run.energy];
    const mid = run.dates[Math.floor((run.dates.length - 1) / 2)];
    const theta = thetaForDate(mid, bounds, range);
    const anchor = polar(CX, CY, ring.radius, theta);
    const label = polar(CX, CY, R_PLOT + 46, theta);
    const title = calloutTitle(run, highOrder.get(run.from + run.energy) ?? 0);
    return {
      energy: run.energy,
      title,
      when: formatCalloutRange(run.from, run.to),
      colour: ENERGY_COLOUR[run.energy],
      from: run.from,
      to: run.to,
      dates: run.dates,
      x1: anchor.x,
      y1: anchor.y,
      x2: label.x,
      y2: label.y,
      labelX: label.x,
      labelY: label.y,
      textAnchor: label.x >= CX ? 'start' : 'end'
    };
  });
}

/**
 * Three energy orbits: angle = place in the window, radius = high / medium / low.
 */
export function buildEnergyOrbit(series, { bounds, range = 'monthly', previous = [] } = {}) {
  const points = (series ?? [])
    .filter(point => point?.date && ENERGY_RANK[point.energy] != null)
    .map(point => ({
      date: point.date,
      energy: point.energy,
      body: point.body ?? '',
      mood: point.mood ?? null
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const from = bounds?.from ?? points[0]?.date ?? null;
  const to = bounds?.to ?? points.at(-1)?.date ?? null;
  const resolvedBounds = {
    from,
    to,
    days: bounds?.days ?? (from && to ? dayNumber(to) - dayNumber(from) + 1 : 1)
  };

  const rings = RING_FRACTIONS.map(ring => {
    const radius = ring.fraction * R_PLOT;
    const labelPoint = polar(CX, CY, radius, -8);
    return {
      ...ring,
      radius,
      colour: ENERGY_COLOUR[ring.key],
      labelX: labelPoint.x,
      labelY: labelPoint.y
    };
  });
  const radiusByEnergy = Object.fromEntries(rings.map(ring => [ring.key, ring.radius]));
  const runs = energyRuns(points);
  const callouts = buildCallouts(runs, rings, resolvedBounds, range);
  const streakDates = new Set(callouts.flatMap(item => item.dates));
  const headline = headlineFor(points, previous, range);

  const plotted = points.map(point => {
    const theta = thetaForDate(point.date, resolvedBounds, range);
    const radius = radiusByEnergy[point.energy];
    const { x, y } = polar(CX, CY, radius, theta);
    return {
      ...point,
      theta,
      radius,
      r: streakDates.has(point.date) ? STREAK_R : DOT_R,
      x,
      y,
      colour: ENERGY_COLOUR[point.energy]
    };
  });

  return {
    width: SIZE,
    height: SIZE,
    cx: CX,
    cy: CY,
    plotRadius: R_PLOT,
    from,
    to,
    range,
    rings,
    angleTicks: angleTicksForRange(resolvedBounds, range, TICK_GEOMETRY),
    points: plotted,
    callouts,
    headline,
    legend: headline.legend
  };
}
