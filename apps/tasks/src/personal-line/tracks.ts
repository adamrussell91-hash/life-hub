/**
 * Branch lines (Adam, 16 Oct 2026). Each of the student's lines splits into branches by what the
 * student does there (the catalogue `format`), like a train line splitting into named branches.
 * Civics is its own branch on Justice. A branch needs enough stops to be worth drawing; the rest of
 * the line stays on one track labelled "Other".
 *
 * 17 Oct 2026: a line only splits when it is busy. A one or two interest student had a branch for
 * every format with three stops, so a 16 stop line drew as four thin tracks (and an "Other" with one
 * stop). Now a line gets one track per TRACK_STOPS of its own stops, and a branch must hold a fair
 * share of the line. A stop on two of the student's lines belongs to the first (its home); it only
 * passes through the other, so it doesn't make the other line split.
 */
import { LINES, type LineKey } from './lines';
import type { LineItem } from './model';

/** Fewest stops a branch needs for this student. */
export const BRANCH_MIN = 4;
/** And the share of its line's own stops a branch needs. */
export const BRANCH_SHARE = 0.2;
/** A line gets one track for every this many of its own stops, so a quiet line stays one track. */
export const TRACK_STOPS = 8;
/** Most branches one line splits into (plus "Other"). */
export const BRANCH_MAX = 3;

export type Track = {
  /** "J" for an unbranched line, "J:Exam", "J:Civics", "J:Other" for branches. */
  key: string;
  line: LineKey;
  /** The branch name, or null for an unbranched line. */
  branch: string | null;
  /** What the flag on the track says. */
  label: string;
  count: number;
};

export type TrackPlan = {
  tracks: Track[];
  /** True when at least one line is split. */
  branched: boolean;
  /** The tracks an item stands on, one per line it's on, in line order. The first is its home. */
  tracksOf(item: LineItem): string[];
};

/** The branch an item would join on `line`: Civics on Justice, otherwise its format. */
export function branchFor(item: LineItem, line: LineKey): string | null {
  if (line === 'J' && item.subjects?.includes('Civics')) return 'Civics';
  return item.format ?? null;
}

export function planTracks(lines: readonly LineKey[], items: readonly LineItem[], split = true): TrackPlan {
  const tracks: Track[] = [];
  const chosenBranches = new Map<LineKey, Set<string>>();
  const homeOf = (item: LineItem) => lines.find((line) => item.on.includes(line));
  for (const line of lines) {
    const on = items.filter((item) => item.on.includes(line));
    const own = on.filter((item) => homeOf(item) === line);
    const counts = new Map<string, number>();
    for (const item of own) {
      const branch = branchFor(item, line);
      if (branch) counts.set(branch, (counts.get(branch) ?? 0) + 1);
    }
    const budget = Math.min(BRANCH_MAX + 1, Math.floor(own.length / TRACK_STOPS));
    const least = Math.max(BRANCH_MIN, Math.ceil(own.length * BRANCH_SHARE));
    const picked =
      split && budget > 1
        ? [...counts]
            .filter(([, count]) => count >= least)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, budget)
            .map(([branch]) => branch)
        : [];
    const restOf = () => own.filter((item) => !picked.includes(branchFor(item, line) ?? '')).length;
    // Leave a track for the rest, and never draw an "Other" too small to be a branch itself.
    if (restOf() && picked.length >= budget) picked.pop();
    while (picked.length && restOf() && restOf() < least) picked.pop();
    // A single branch that holds the whole line is just the line.
    if (!picked.length || (picked.length === 1 && restOf() === 0)) {
      tracks.push({ key: line, line, branch: null, label: LINES[line].name, count: on.length });
      chosenBranches.set(line, new Set());
      continue;
    }
    chosenBranches.set(line, new Set(picked));
    const onBranch = (branch: string) => on.filter((item) => branchFor(item, line) === branch).length;
    for (const branch of picked) {
      tracks.push({ key: `${line}:${branch}`, line, branch, label: branch, count: onBranch(branch) });
    }
    const rest = on.filter((item) => !picked.includes(branchFor(item, line) ?? '')).length;
    if (rest) tracks.push({ key: `${line}:Other`, line, branch: 'Other', label: 'Other', count: rest });
  }
  const cache = new Map<LineItem, string[]>();
  const tracksOf = (item: LineItem) => {
    let keys = cache.get(item);
    if (keys) return keys;
    keys = lines
      .filter((line) => item.on.includes(line))
      .map((line) => {
        const picked = chosenBranches.get(line)!;
        if (!picked.size) return line;
        const branch = branchFor(item, line);
        return branch && picked.has(branch) ? `${line}:${branch}` : `${line}:Other`;
      });
    cache.set(item, keys);
    return keys;
  };
  return { tracks, branched: tracks.some((track) => track.branch), tracksOf };
}
