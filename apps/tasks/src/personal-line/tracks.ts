/**
 * Branch lines (Adam, 16 Oct 2026). Each of the student's lines splits into branches by what the
 * student does there (the catalogue `format`), like a train line splitting into named branches.
 * Civics is its own branch on Justice. A branch needs enough stops to be worth drawing; the rest of
 * the line stays on one track labelled "Other". The thresholds are a first guess, to tune on real lines.
 */
import { LINES, type LineKey } from './lines';
import type { LineItem } from './model';

/** Fewest stops a branch needs for this student. */
export const BRANCH_MIN = 3;
/** Most branches one line splits into (plus "Other"). */
export const BRANCH_MAX = 4;

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
  /** The tracks an item stands on, one per line it's on, in line order. */
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
  for (const line of lines) {
    const on = items.filter((item) => item.on.includes(line));
    const counts = new Map<string, number>();
    for (const item of on) {
      const branch = branchFor(item, line);
      if (branch) counts.set(branch, (counts.get(branch) ?? 0) + 1);
    }
    const picked = split
      ? [...counts]
          .filter(([, count]) => count >= BRANCH_MIN)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, BRANCH_MAX)
          .map(([branch]) => branch)
      : [];
    // A single branch that holds the whole line is just the line.
    const rest = on.filter((item) => !picked.includes(branchFor(item, line) ?? '')).length;
    if (!picked.length || (picked.length === 1 && rest === 0)) {
      tracks.push({ key: line, line, branch: null, label: LINES[line].name, count: on.length });
      chosenBranches.set(line, new Set());
      continue;
    }
    chosenBranches.set(line, new Set(picked));
    for (const branch of picked) {
      tracks.push({ key: `${line}:${branch}`, line, branch, label: branch, count: counts.get(branch)! });
    }
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
