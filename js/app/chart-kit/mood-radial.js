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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayNumber(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function addDays(dateKey, count) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

function weekdayLabel(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function formatDayMonth(dateKey) {
  const [, month, day] = String(dateKey).split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

function isLeap(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function clampScore(value) {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Number(value)));
}

function scoreToRadius(score) {
  return ((SCORE_MAX - clampScore(score)) / R_MAX_VALUE) * R_PLOT;
}

function polar(radius, thetaDeg) {
  const rad = (thetaDeg * Math.PI) / 180;
  return {
    x: CX + radius * Math.sin(rad),
    y: CY - radius * Math.cos(rad)
  };
}

function windowDays(bounds) {
  if (Number(bounds?.days) > 0) return Number(bounds.days);
  if (bounds?.from && bounds?.to) return Math.max(1, dayNumber(bounds.to) - dayNumber(bounds.from) + 1);
  return 1;
}

function thetaForDate(date, bounds, range) {
  if (range === 'year') {
    const year = Number(String(date).slice(0, 4));
    const start = `${year}-01-01`;
    const length = isLeap(year) ? 366 : 365;
    return ((dayNumber(date) - dayNumber(start)) / length) * 360;
  }
  const from = bounds?.from ?? date;
  const days = windowDays({ ...bounds, from });
  return ((dayNumber(date) - dayNumber(from)) / days) * 360;
}

function angleTick(date, label, bounds, range, rim = R_PLOT) {
  const theta = thetaForDate(date, bounds, range);
  const rimPoint = polar(rim, theta);
  const labelPoint = polar(rim + 22, theta);
  return {
    date,
    label,
    theta,
    x: rimPoint.x,
    y: rimPoint.y,
    labelX: labelPoint.x,
    labelY: labelPoint.y
  };
}

function weeklyTicks(bounds) {
  const from = bounds.from;
  const days = windowDays(bounds);
  const ticks = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(from, offset);
    ticks.push(angleTick(date, weekdayLabel(date), bounds, 'weekly'));
  }
  return ticks;
}

function monthlyTicks(bounds) {
  const from = bounds.from;
  const to = bounds.to;
  const ticks = [];
  for (let date = from; date <= to; date = addDays(date, 7)) {
    ticks.push(angleTick(date, formatDayMonth(date), bounds, 'monthly'));
  }
  const last = ticks.at(-1)?.date;
  if (last && dayNumber(to) - dayNumber(last) >= 3) {
    ticks.push(angleTick(to, formatDayMonth(to), bounds, 'monthly'));
  }
  return ticks;
}

function sixMonthTicks(bounds) {
  const from = bounds.from;
  const to = bounds.to;
  const ticks = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  if (Number(from.slice(8, 10)) !== 1) {
    ticks.push(angleTick(from, MONTHS[month - 1], bounds, 'six_month'));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  while (true) {
    const date = `${year}-${String(month).padStart(2, '0')}-01`;
    if (date > to) break;
    ticks.push(angleTick(date, MONTHS[month - 1], bounds, 'six_month'));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return ticks;
}

function yearTicks(bounds) {
  const year = Number(String(bounds.to ?? bounds.from).slice(0, 4));
  return MONTHS.map((label, index) => {
    const date = `${year}-${String(index + 1).padStart(2, '0')}-01`;
    return angleTick(date, label, bounds, 'year');
  });
}

function angleTicksForRange(bounds, range) {
  if (!bounds?.from || !bounds?.to) return [];
  if (range === 'weekly') return weeklyTicks(bounds);
  if (range === 'six_month') return sixMonthTicks(bounds);
  if (range === 'year') return yearTicks(bounds);
  return monthlyTicks(bounds);
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
    angleTicks: angleTicksForRange(resolvedBounds, range),
    points: plotted,
    averageScore: mean,
    averageRadius: mean == null ? null : scoreToRadius(mean)
  };
}
