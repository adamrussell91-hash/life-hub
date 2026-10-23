import { studentBand } from '@/evidence/patterns';
import type { Evidence } from '@/evidence/types';
import type { CoverageMap, MapItem } from './model';

/**
 * One student on the coverage map: which side lessons they took, their quiz
 * scores, and their state on each item lesson by lesson. A state holds until
 * new evidence changes it. Pure: no DOM, unit tested directly.
 */

export type ItemState = 'struggling' | 'working' | 'secure';
export type NodeState = ItemState | 'none' | 'skipped' | 'ahead';

export type StudentRoute = {
  /** Rows the student did (core rows up to now; side rows they took). */
  took: Set<string>;
  /** Index of the last row the student has reached. */
  now: number;
  scores: Map<string, { score: number; max: number }>;
  /** `${rowId}|${itemId}` → what the node shows. */
  nodes: Map<string, NodeState>;
  /** `${rowId}|${itemId}` where the item became mastered (secure at two checkpoints). */
  stars: Set<string>;
  /** Latest state per item. */
  current: Map<string, ItemState>;
};

export type StudentInput = {
  /** This student's evidence. */
  evidence: readonly Evidence[];
  /** Side lessons the teacher marked as taken. */
  took: readonly string[];
  scores: ReadonlyMap<string, { score: number; max: number }>;
  /** "2026-10-27"; rows dated after it are ahead. */
  today: string;
};

const BAND_STATE = { weak: 'struggling', developing: 'working', secure: 'secure' } as const;
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Evidence from one source that speaks to an item: a matching skill tag, else anything from a quiz in the lesson that teaches it. */
function sharesFor(item: MapItem, list: readonly Evidence[], taughtHere: boolean): number[] {
  const scored = list.filter((x) => x.share !== null);
  if (item.strand) {
    const tagged = scored.filter((x) => x.tags.some((t) => t.startsWith(`skill:${item.strand}.`) || t === `skill:${item.strand}`));
    if (tagged.length) return tagged.map((x) => x.share as number);
  }
  return taughtHere ? scored.map((x) => x.share as number) : [];
}

export function studentRoute(map: CoverageMap, input: StudentInput): StudentRoute {
  const items = map.groups.flatMap((g) => g.items);
  const bySource = new Map<string, Evidence[]>();
  for (const x of input.evidence) bySource.set(x.source, [...(bySource.get(x.source) ?? []), x]);
  const manual = new Set(input.took);

  // Where the student is: the last dated row on or before today, else the last row with their evidence or a tick.
  let now = -1;
  map.rows.forEach((row, i) => {
    if (row.date && row.date.slice(0, 10) <= input.today) now = i;
    if (bySource.has(`quiz:${row.id}`) || input.scores.has(row.id) || manual.has(row.id)) now = Math.max(now, i);
  });

  const took = new Set<string>();
  map.rows.forEach((row, i) => {
    if (i > now) return;
    const side = row.lane !== 'core';
    if (!side || manual.has(row.id) || input.scores.has(row.id) || bySource.has(`quiz:${row.id}`)) took.add(row.id);
  });

  const current = new Map<string, ItemState>();
  const secureAt = new Map<string, number>();
  const nodes = new Map<string, NodeState>();
  const stars = new Set<string>();
  /** Items just mastered, waiting for their next node to carry the star. */
  const pending = new Set<string>();
  map.rows.forEach((row, i) => {
    const list = bySource.get(`quiz:${row.id}`) ?? [];
    if (list.length && took.has(row.id)) {
      for (const item of items) {
        const shares = sharesFor(item, list, row.teaches.has(item.id));
        if (!shares.length) continue;
        const state = BAND_STATE[studentBand(avg(shares))];
        current.set(item.id, state);
        if (state === 'secure') {
          const n = (secureAt.get(item.id) ?? 0) + 1;
          secureAt.set(item.id, n);
          if (n === 2) pending.add(item.id);
        }
      }
    }
    for (const id of row.teaches.keys()) {
      const key = `${row.id}|${id}`;
      if (i > now) nodes.set(key, 'ahead');
      else if (!took.has(row.id)) nodes.set(key, 'skipped');
      else {
        nodes.set(key, current.get(id) ?? 'none');
        if (pending.has(id) && current.get(id) === 'secure') {
          stars.add(key);
          pending.delete(id);
        }
      }
    }
  });
  return { took, now, scores: new Map(input.scores), nodes, stars, current };
}
