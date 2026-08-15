import { buildAreaLine } from './area-line.js';

export function buildBumpLines(ranks, themes, { width = 320, height = 80 } = {}) {
  const rows = ranks ?? [];
  const keys = themes ?? [];
  const maxRank = Math.max(
    1,
    ...rows.flatMap(row => Object.values(row.rankByTheme ?? {}).map(Number))
  );
  return keys.map(key => {
    const days = rows.map(row => ({
      date: row.week,
      value: maxRank + 1 - (Number(row.rankByTheme?.[key]) || maxRank)
    }));
    return { key, ...buildAreaLine(days, { width, height, padding: 8 }) };
  });
}
