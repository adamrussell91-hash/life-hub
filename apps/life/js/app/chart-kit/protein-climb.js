// Running protein total across the clock. x is placed by meal *time* (minutes after
// midnight), never by list order; y is cumulative grams. Pure geometry, no DOM.
export const CLIMB_DAY_START = 6 * 60;
export const CLIMB_DAY_END = 23 * 60;
const MERGE_WINDOW = 30;

const round = value => Math.round(value * 10) / 10;

export function formatClock(minutes) {
  const total = Math.round(minutes);
  const hours24 = Math.floor(total / 60) % 24;
  const mins = total % 60;
  const suffix = hours24 >= 12 ? 'pm' : 'am';
  const hours = hours24 % 12 || 12;
  return mins ? `${hours}:${String(mins).padStart(2, '0')} ${suffix}` : `${hours} ${suffix}`;
}

function tickLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  if (hours === 12) return '12p';
  return hours > 12 ? `${hours - 12}p` : `${hours}a`;
}

export function buildProteinClimb({
  meals = [],
  goal = 0,
  nowMinutes = null,
  usual = null,
  width = 440,
  height = 200,
  padding = {}
} = {}) {
  const pad = { left: 30, right: 14, top: 22, bottom: 64, ...padding };
  const sorted = meals
    .filter(meal => Number.isFinite(meal.minutes))
    .map(meal => ({ ...meal, protein_g: Math.max(0, Number(meal.protein_g) || 0) }))
    .sort((a, b) => a.minutes - b.minutes);
  const total = sorted.reduce((sum, meal) => sum + meal.protein_g, 0);

  const start = Math.min(CLIMB_DAY_START, ...sorted.map(meal => Math.floor(meal.minutes / 60) * 60));
  const end = Math.max(CLIMB_DAY_END, ...sorted.map(meal => Math.ceil(meal.minutes / 60) * 60),
    nowMinutes == null ? 0 : Math.ceil(nowMinutes / 60) * 60);
  const usualMax = usual?.length ? Math.max(...usual.map(point => point.protein_g)) : 0;
  const yMax = Math.max(goal * 1.12, total * 1.05, usualMax * 1.05, 10);

  const left = pad.left;
  const right = width - pad.right;
  const top = pad.top;
  const base = height - pad.bottom;
  const x = minutes => left + ((minutes - start) / (end - start)) * (right - left);
  const y = grams => base - (grams / yMax) * (base - top);

  // Step line through every meal (markers merge below, the line never does).
  const lineEnd = nowMinutes == null ? end : Math.max(nowMinutes, sorted.at(-1)?.minutes ?? start);
  const points = [[x(start), y(0)]];
  let running = 0;
  let goalHitMinutes = null;
  for (const meal of sorted) {
    points.push([x(meal.minutes), y(running)]);
    running += meal.protein_g;
    points.push([x(meal.minutes), y(running)]);
    if (goalHitMinutes == null && goal > 0 && running >= goal) goalHitMinutes = meal.minutes;
  }
  points.push([x(lineEnd), y(running)]);
  const stepPath = `M${points.map(([px, py]) => `${round(px)} ${round(py)}`).join(' L')}`;
  const areaPath = `${stepPath} L${round(x(lineEnd))} ${round(base)} L${round(x(start))} ${round(base)} Z`;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }

  const markers = [];
  for (const meal of sorted) {
    const last = markers.at(-1);
    if (last && meal.minutes - last.minutes < MERGE_WINDOW) {
      last.meals.push(meal);
      last.protein_g += meal.protein_g;
      last.timeKnown = last.timeKnown && meal.timeKnown !== false;
      continue;
    }
    markers.push({ minutes: meal.minutes, protein_g: meal.protein_g, timeKnown: meal.timeKnown !== false, meals: [meal] });
  }
  for (const marker of markers) {
    marker.x = x(marker.minutes);
    marker.r = Math.min(11, 3 + Math.sqrt(marker.protein_g) * 1.1);
    marker.label = marker.meals.length === 1
      ? `${marker.meals[0].label} · ${round(marker.protein_g)} g`
      : `${marker.meals.length} meals · ${round(marker.protein_g)} g`;
    // Fraction of the line's horizontal travel at which it reaches this marker (for timing).
    marker.progress = (marker.x - x(start)) / Math.max(1, x(lineEnd) - x(start));
  }

  const now = nowMinutes == null ? null : { minutes: nowMinutes, x: x(nowMinutes), y: y(total) };
  const projection = now && goal > 0 && total < goal
    ? { x1: now.x, y1: now.y, x2: x(end), y2: y(goal), remaining: goal - total }
    : null;

  const usualPath = usual?.length
    ? `M${usual.map(point => `${round(x(point.minutes))} ${round(y(point.protein_g))}`).join(' L')}`
    : null;
  const usualAtNow = usual?.length && nowMinutes != null
    ? [...usual].reverse().find(point => point.minutes <= nowMinutes)?.protein_g ?? 0
    : null;

  const ticks = [];
  for (let minutes = Math.ceil(start / 180) * 180; minutes <= end; minutes += 180) {
    ticks.push({ minutes, x: x(minutes), label: tickLabel(minutes) });
  }
  const step = yMax > 150 ? 50 : yMax > 60 ? 40 : 20;
  const yTicks = [];
  for (let grams = 0; grams < yMax * 0.92; grams += step) yTicks.push({ grams, y: y(grams) });

  return {
    width,
    height,
    plot: { left, right, top, base },
    domain: { start, end },
    yMax,
    x,
    y,
    total,
    goal,
    empty: sorted.length === 0,
    stepPath,
    areaPath,
    length,
    markers,
    goalBand: goal > 0 ? { y: y(goal), top } : null,
    now,
    projection,
    usualPath,
    usualAtNow,
    goalHitMinutes,
    ticks,
    yTicks
  };
}
