import {
  angleTicksForRange,
  dayNumber,
  polar as polarAt,
  thetaForDate
} from './polar-clock.js';

const SIZE = 592; // 4 × the previous 148-tall mood line chart
const CX = SIZE / 2;
const CY = SIZE / 2;
const LABEL_PAD = 38;
const R_PLOT = CX - LABEL_PAD;
const R_MAX_VALUE = 9.3;
const SCORE_MIN = 1;
const SCORE_MAX = 10;
const RING_INVERTED = [0, 2, 4, 6, 8];
const RING_LABELS = ['10 great', '8', '6', '4', '2 rough'];
const ENERGY_RADIUS = { low: 11, medium: 18, high: 26 };
const TICK_GEOMETRY = { cx: CX, cy: CY, rim: R_PLOT };

function clampScore(value) {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Number(value)));
}

function scoreToRadius(score) {
  return ((SCORE_MAX - clampScore(score)) / R_MAX_VALUE) * R_PLOT;
}

function polar(radius, thetaDeg) {
  return polarAt(CX, CY, radius, thetaDeg);
}

/**
 * Polar bubble chart: angle = place in the window (clockwise from 12 o’clock;
 * calendar year for the year view), radius = inverted mood score (closer to
 * centre is better), bubble size = logged energy.
 */
export function buildMoodRadial(series, { bounds, range = 'monthly' } = {}) {
  const points = (series ?? [])
    .filter(point => Number.isFinite(Number(point.value)) && point.date)
    .map(point => ({
      date: point.date,
      value: Number(point.value),
      mood: point.mood ?? null,
      energy: ENERGY_RADIUS[point.energy] ? point.energy : 'low'
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const from = bounds?.from ?? points[0]?.date ?? null;
  const to = bounds?.to ?? points.at(-1)?.date ?? null;
  const resolvedBounds = {
    from,
    to,
    days: bounds?.days ?? (from && to ? dayNumber(to) - dayNumber(from) + 1 : 1)
  };

  const plotted = points.map(point => {
    const theta = thetaForDate(point.date, resolvedBounds, range);
    const radius = scoreToRadius(point.value);
    const { x, y } = polar(radius, theta);
    return {
      ...point,
      theta,
      radius,
      r: ENERGY_RADIUS[point.energy],
      x,
      y
    };
  });

  const rings = RING_INVERTED.map((inverted, index) => ({
    inverted,
    label: RING_LABELS[index],
    radius: (inverted / R_MAX_VALUE) * R_PLOT
  }));

  const mean = plotted.length
    ? plotted.reduce((sum, point) => sum + point.value, 0) / plotted.length
    : null;

  return {
    width: SIZE,
    height: SIZE,
    cx: CX,
    cy: CY,
    plotRadius: R_PLOT,
    scoreMin: SCORE_MIN,
    scoreMax: SCORE_MAX,
    from,
    to,
    range,
    rings,
    angleTicks: angleTicksForRange(resolvedBounds, range, TICK_GEOMETRY),
    points: plotted,
    averageScore: mean,
    averageRadius: mean == null ? null : scoreToRadius(mean)
  };
}
