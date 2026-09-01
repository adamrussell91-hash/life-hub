import { smoothLinePath } from './area-line.js';
import { MONTHS } from './polar-clock.js';
import { WATCHLIST_SLOTS } from './watchlist-heat.js';

const WIDTH = 960;
const HEIGHT = 420;
const PAD = { top: 28, right: 176, bottom: 52, left: 52 };

function formatWeekLabel(dateKey) {
  const [, month, day] = String(dateKey).split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

function weekShows(index, count) {
  if (count <= 8) return true;
  if (index === 0 || index === count - 1) return true;
  const step = Math.ceil(count / 6);
  return index % step === 0;
}

function trendDir(points) {
  if (!points.length) return 'flat';
  const first = points[0].rank;
  const last = points[points.length - 1].rank;
  if (last <= first - 1) return 'up';
  if (last >= first + 1) return 'down';
  return 'flat';
}

function nudgeLabels(lines) {
  const ordered = [...lines].sort((a, b) => a.labelY - b.labelY);
  const minGap = 18;
  for (let index = 1; index < ordered.length; index += 1) {
    const prev = ordered[index - 1];
    const next = ordered[index];
    if (next.labelY - prev.labelY < minGap) next.labelY = prev.labelY + minGap;
  }
  const byKey = new Map(ordered.map(line => [line.key, line.labelY]));
  for (const line of lines) line.labelY = byKey.get(line.key);
}

/**
 * Rank-over-weeks bump chart. Rank 1 sits at the top. Dot size is weekly
 * mention count. Trend compares first week to last week.
 */
export function buildBumpChart({
  ranks = [],
  weekly = null,
  themes = []
} = {}) {
  const rows = ranks ?? [];
  const keys = (themes.length ? themes : weekly?.themes ?? []).filter(Boolean);
  const weeks = rows.map(row => row.week);
  const counts = new Map((weekly?.series ?? []).map(item => [item.key, item.values ?? []]));
  const maxRank = Math.max(
    keys.length,
    1,
    ...rows.flatMap(row => Object.values(row.rankByTheme ?? {}).map(Number))
  );
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xAt = index => (
    weeks.length <= 1
      ? PAD.left + plotW / 2
      : PAD.left + (index / (weeks.length - 1)) * plotW
  );
  const yAt = rank => PAD.top + ((Number(rank) - 1) / Math.max(maxRank - 1, 1)) * plotH;
  const maxCount = Math.max(
    1,
    ...(weekly?.series ?? []).flatMap(item => item.values ?? []).map(value => Number(value) || 0)
  );

  const lines = keys.map((key, index) => {
    const values = counts.get(key) ?? [];
    const points = rows.map((row, weekIndex) => {
      const rank = Number(row.rankByTheme?.[key]) || maxRank;
      const count = Number(values[weekIndex]) || 0;
      return {
        week: row.week,
        rank,
        count,
        x: xAt(weekIndex),
        y: yAt(rank),
        r: 3.2 + (count / maxCount) * 6.5
      };
    });
    const last = points[points.length - 1];
    return {
      key,
      colour: key === 'other' ? 'var(--orca)' : WATCHLIST_SLOTS[index % WATCHLIST_SLOTS.length],
      d: smoothLinePath(points),
      points,
      lastRank: last?.rank ?? null,
      labelY: last?.y ?? PAD.top,
      dir: trendDir(points)
    };
  });
  nudgeLabels(lines);

  return {
    width: WIDTH,
    height: HEIGHT,
    pad: PAD,
    maxRank,
    weeks: weeks.map((week, index) => ({
      week,
      x: xAt(index),
      label: formatWeekLabel(week),
      show: weekShows(index, weeks.length)
    })),
    ranks: Array.from({ length: maxRank }, (_, index) => ({
      rank: index + 1,
      y: yAt(index + 1)
    })),
    lines,
    empty: weeks.length < 2 || keys.length < 1
  };
}

export function buildBumpLines(ranks, themes, { width = 320, height = 80 } = {}) {
  const chart = buildBumpChart({ ranks, themes });
  return chart.lines.map(line => ({
    key: line.key,
    width,
    height,
    linePath: line.d,
    points: line.points
  }));
}
