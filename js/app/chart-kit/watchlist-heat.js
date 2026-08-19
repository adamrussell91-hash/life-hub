import { MONTHS } from './polar-clock.js';

export const WATCHLIST_SLOTS = [
  'var(--wave)',
  'var(--high-sea)',
  'var(--success)',
  'var(--navy-2)',
  'var(--pastel-lilac-ink)',
  'var(--pastel-sage-ink)',
  'var(--pastel-gold-ink)',
  'var(--danger)'
];

function formatWeekTick(dateKey) {
  const [, month, day] = String(dateKey).split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

export function watchlistDelta(counts) {
  const values = (counts ?? []).map(value => Number(value) || 0);
  const n = values.length;
  if (n < 4) return { dir: 'flat', pct: 0 };
  const half = Math.floor(n / 2);
  const firstAvg = values.slice(0, half).reduce((sum, value) => sum + value, 0) / half;
  const lastAvg = values.slice(n - half).reduce((sum, value) => sum + value, 0) / half;
  if (firstAvg === 0 && lastAvg === 0) return { dir: 'flat', pct: 0 };
  const diff = lastAvg - firstAvg;
  const pct = firstAvg === 0 ? 100 : Math.round((diff / firstAvg) * 100);
  if (Math.abs(diff) < 0.4) return { dir: 'flat', pct };
  return { dir: diff > 0 ? 'up' : 'down', pct };
}

function axisStep(count) {
  if (count > 12) return 4;
  if (count > 6) return 2;
  return 1;
}

/**
 * Term × week heatmap. Each row scales to its own max so a quiet term still
 * has a visible busiest week. Zero weeks stay unmarked.
 */
export function buildWatchlistHeat(series) {
  const rowsIn = (series ?? []).filter(item => item?.term);
  const weeks = rowsIn[0]?.points?.map(point => point.date) ?? [];
  const step = axisStep(weeks.length);
  const rows = rowsIn.map((item, index) => {
    const points = item.points ?? [];
    const counts = points.map(point => Number(point.count) || 0);
    const max = Math.max(0, ...counts);
    const cells = points.map((point, cellIndex) => {
      const count = counts[cellIndex];
      const zero = !(count > 0);
      return {
        date: point.date,
        count,
        zero,
        mix: zero || max === 0 ? 0 : 20 + (count / max) * 80
      };
    });
    return {
      term: item.term,
      colour: WATCHLIST_SLOTS[index % WATCHLIST_SLOTS.length],
      last: counts.at(-1) ?? 0,
      total: counts.reduce((sum, value) => sum + value, 0),
      delta: watchlistDelta(counts),
      cells
    };
  });
  return {
    empty: rows.length === 0,
    weeks,
    axis: weeks.map((date, index) => ({
      date,
      label: formatWeekTick(date),
      show: index === 0 || index === weeks.length - 1 || index % step === 0
    })),
    rows
  };
}
