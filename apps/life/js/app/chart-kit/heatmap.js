import { enumerateDateKeys } from '../../core/time.js';

export function buildHeatmapRow({ from, to, today, hitDates = [] } = {}) {
  const hits = new Set(hitDates);
  return enumerateDateKeys(from, to).map(date => ({
    date,
    hit: hits.has(date),
    today: date === today
  }));
}
