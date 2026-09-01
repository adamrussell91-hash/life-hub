const DEFAULT_SIZE = 218;
const DEFAULT_RADIUS = 90;
const DEFAULT_GAP = 7;

function largestRemainderPercents(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return values.map(() => 0);
  const rows = values.map((value, index) => {
    const exact = (value / total) * 100;
    const pct = Math.floor(exact);
    return { index, pct, rem: exact - pct };
  });
  let used = rows.reduce((sum, row) => sum + row.pct, 0);
  const leftover = 100 - used;
  rows.sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < leftover; i += 1) rows[i].pct += 1;
  const byIndex = new Array(values.length);
  for (const row of rows) byIndex[row.index] = row.pct;
  return byIndex;
}

/**
 * Donut geometry for the Mood mix panel: stroke-dasharray arcs clockwise
 * from 12 o’clock, integer percents that sum to 100, one segment per mood
 * (including zeros, so the legend stays complete).
 */
export function buildMoodMixDonut(items, { size = DEFAULT_SIZE, radius = DEFAULT_RADIUS, gap = DEFAULT_GAP } = {}) {
  const segmentsIn = (items ?? []).map(item => ({
    ...item,
    key: item.key,
    label: item.label ?? item.key,
    value: Number(item.value) || 0,
    colour: item.colour
  }));
  const total = segmentsIn.reduce((sum, item) => sum + item.value, 0);
  const circumference = 2 * Math.PI * radius;
  if (!(total > 0)) {
    return {
      empty: true,
      total: 0,
      size,
      center: size / 2,
      radius,
      gap,
      circumference,
      dominant: null,
      segments: []
    };
  }

  const percents = largestRemainderPercents(segmentsIn.map(item => item.value));
  let offset = 0;
  const segments = segmentsIn.map((item, index) => {
    const pct = percents[index];
    const full = (pct / 100) * circumference;
    const visible = full <= 0
      ? 0
      : Math.max(full - gap, full > 2 ? full - gap : full * 0.6);
    const dashoffset = 0 - offset;
    offset += full;
    return {
      ...item,
      pct,
      visible,
      dasharray: `${visible} ${circumference - visible}`,
      dashoffset
    };
  });

  const dominant = segments.reduce((best, segment) => (
    segment.value > (best?.value ?? -1) ? segment : best
  ), null);

  return {
    empty: false,
    total,
    size,
    center: size / 2,
    radius,
    gap,
    circumference,
    dominant,
    segments
  };
}
