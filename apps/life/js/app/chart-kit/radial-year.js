const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(year) {
  return Number(year) % 4 === 0;
}

function monthLengths(year) {
  const days = MONTH_LENGTHS.slice();
  if (isLeap(year)) days[1] = 29;
  return days;
}

export function buildRadialYear({ year, byDate = {} } = {}) {
  const total = isLeap(year) ? 366 : 365;
  const lengths = monthLengths(year);
  const ticks = [];
  let month = 1;
  let day = 1;
  for (let index = 0; index < total; index += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    ticks.push({
      date,
      mood: byDate[date] ?? null,
      index,
      angle: (2 * Math.PI * index) / total - Math.PI / 2
    });
    day += 1;
    if (day > lengths[month - 1]) {
      day = 1;
      month += 1;
    }
  }
  return ticks;
}
