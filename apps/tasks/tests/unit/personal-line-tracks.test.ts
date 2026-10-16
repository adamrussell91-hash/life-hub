import { describe, expect, it } from 'vitest';
import { BRANCH_MAX, BRANCH_MIN, planTracks } from '@/personal-line/tracks';
import type { LineItem } from '@/personal-line/model';

function item(id: string, on: LineItem['on'], format: string | null, subjects: string[] = []): LineItem {
  return {
    id, name: id, type: 'Competition', on, matched: [], years: [10], run: null, due: null, close: null,
    length: null, level: null, cost: '', basis: null, window: '', organiser: '', location: '', description: '',
    link: null, format, subjects
  };
}

const many = (prefix: string, n: number, on: LineItem['on'], format: string | null, subjects: string[] = []) =>
  Array.from({ length: n }, (_, i) => item(`${prefix}${i}`, on, format, subjects));

describe('branch tracks', () => {
  it('splits a line by format once a branch has enough stops, the rest on Other', () => {
    const items = [...many('s', 4, ['J'], 'Simulation'), ...many('e', BRANCH_MIN, ['J'], 'Exam'), ...many('w', BRANCH_MIN - 1, ['J'], 'Written entry')];
    const plan = planTracks(['J'], items);
    expect(plan.tracks.map((t) => t.label)).toEqual(['Simulation', 'Exam', 'Other']);
    expect(plan.tracksOf(items.at(-1)!)).toEqual(['J:Other']);
    expect(plan.branched).toBe(true);
  });

  it('gives Civics its own Justice branch whatever the format', () => {
    const items = [...many('c', 3, ['J'], 'Simulation', ['Civics']), ...many('s', 3, ['J'], 'Simulation')];
    const plan = planTracks(['J'], items);
    expect(plan.tracks.map((t) => t.key)).toEqual(['J:Civics', 'J:Simulation']);
  });

  it('keeps at most BRANCH_MAX branches and puts an entry on the matching branch of each of its lines', () => {
    const formats = ['Exam', 'Project', 'Program', 'Day event', 'Speaking'];
    const items = formats.flatMap((format, i) => many(format, 3 + i, ['I'], format));
    const shared = item('shared', ['I', 'R'], 'Speaking');
    const plan = planTracks(['I', 'R'], [...items, shared, ...many('r', 2, ['R'], 'Exam')]);
    expect(plan.tracks.filter((t) => t.line === 'I' && t.branch !== 'Other')).toHaveLength(BRANCH_MAX);
    expect(plan.tracks.find((t) => t.key === 'I:Exam')).toBeUndefined();
    // R has too few stops to split, so it stays one track.
    expect(plan.tracksOf(shared)).toEqual(['I:Speaking', 'R']);
  });

  it('draws one plain track per line when branches are off or a line has nothing to split', () => {
    const items = many('s', 5, ['J'], 'Simulation');
    expect(planTracks(['J'], items).tracks).toEqual([{ key: 'J', line: 'J', branch: null, label: 'Justice', count: 5 }]);
    expect(planTracks(['J'], [...items, ...many('e', 3, ['J'], 'Exam')], false).branched).toBe(false);
  });
});
