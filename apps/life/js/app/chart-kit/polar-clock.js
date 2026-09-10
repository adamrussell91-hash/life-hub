export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dayNumber(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

export function addDays(dateKey, count) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

function weekdayLabel(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function formatDayMonth(dateKey) {
  const [, month, day] = String(dateKey).split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

function isLeap(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function windowDays(bounds) {
  if (Number(bounds?.days) > 0) return Number(bounds.days);
  if (bounds?.from && bounds?.to) return Math.max(1, dayNumber(bounds.to) - dayNumber(bounds.from) + 1);
  return 1;
}

/** Minutes past midnight from `HH:MM` or `HH:MM:SS`. */
export function minutesFromTime(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Angle for a clock time: midnight = 0°, clockwise through 24 hours. */
export function thetaForTime(time) {
  const minutes = minutesFromTime(time);
  if (minutes == null) return null;
  return (minutes / (24 * 60)) * 360;
}

export function thetaForDate(date, bounds, range) {
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

export function polar(cx, cy, radius, thetaDeg) {
  const rad = (thetaDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.sin(rad),
    y: cy - radius * Math.cos(rad)
  };
}

function angleTick(date, label, bounds, range, { cx, cy, rim, labelOffset = 22 }) {
  const theta = thetaForDate(date, bounds, range);
  const rimPoint = polar(cx, cy, rim, theta);
  const labelPoint = polar(cx, cy, rim + labelOffset, theta);
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

function weeklyTicks(bounds, geometry) {
  const from = bounds.from;
  const days = windowDays(bounds);
  const ticks = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(from, offset);
    ticks.push(angleTick(date, weekdayLabel(date), bounds, 'weekly', geometry));
  }
  return ticks;
}

function monthlyTicks(bounds, geometry) {
  const from = bounds.from;
  const to = bounds.to;
  const ticks = [];
  for (let date = from; date <= to; date = addDays(date, 7)) {
    ticks.push(angleTick(date, formatDayMonth(date), bounds, 'monthly', geometry));
  }
  const last = ticks.at(-1)?.date;
  if (last && dayNumber(to) - dayNumber(last) >= 3) {
    ticks.push(angleTick(to, formatDayMonth(to), bounds, 'monthly', geometry));
  }
  return ticks;
}

function sixMonthTicks(bounds, geometry) {
  const from = bounds.from;
  const to = bounds.to;
  const ticks = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  if (Number(from.slice(8, 10)) !== 1) {
    ticks.push(angleTick(from, MONTHS[month - 1], bounds, 'six_month', geometry));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  while (true) {
    const date = `${year}-${String(month).padStart(2, '0')}-01`;
    if (date > to) break;
    ticks.push(angleTick(date, MONTHS[month - 1], bounds, 'six_month', geometry));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return ticks;
}

function yearTicks(bounds, geometry) {
  const year = Number(String(bounds.to ?? bounds.from).slice(0, 4));
  return MONTHS.map((label, index) => {
    const date = `${year}-${String(index + 1).padStart(2, '0')}-01`;
    return angleTick(date, label, bounds, 'year', geometry);
  });
}

export function angleTicksForRange(bounds, range, geometry) {
  if (!bounds?.from || !bounds?.to) return [];
  if (range === 'weekly') return weeklyTicks(bounds, geometry);
  if (range === 'six_month') return sixMonthTicks(bounds, geometry);
  if (range === 'year') return yearTicks(bounds, geometry);
  return monthlyTicks(bounds, geometry);
}
