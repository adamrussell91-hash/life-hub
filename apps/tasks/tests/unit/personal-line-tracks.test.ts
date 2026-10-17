import { describe, expect, it } from 'vitest';
import { BRANCH_MAX, TRACK_STOPS, planTracks } from '@/personal-line/tracks';
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
  it('keeps a quiet line on one track, however many formats it has', () => {
    const items = [...many('s', 3, ['J'], 'Simulation'), ...many('e', 3, ['J'], 'Exam'), item('w', ['J'], 'Written entry')];
    expect(planTracks(['J'], items).tracks.map((t) => t.key)).toEqual(['J']);
  });

  it('splits a busy line by format, one track per TRACK_STOPS stops, the rest on Other', () => {
    const items = [...many('s', 10, ['J'], 'Simulation'), ...many('e', 6, ['J'], 'Exam'), ...many('w', 5, ['J'], 'Written entry'), ...many('d', 3, ['J'], 'Day event')];
    const plan = planTracks(['J'], items);
    // 24 stops make three tracks: two branches and Other. Day event is too small to be a branch.
    expect(Math.floor(items.length / TRACK_STOPS)).toBe(3);
    expect(plan.tracks.map((t) => [t.label, t.count])).toEqual([['Simulation', 10], ['Exam', 6], ['Other', 8]]);
    expect(plan.tracksOf(items.at(-1)!)).toEqual(['J:Other']);
    expect(plan.branched).toBe(true);
  });

  it('never leaves an Other too small to be a branch', () => {
    const items = [...many('e', 18, ['I'], 'Exam'), ...many('p', 2, ['I'], 'Project')];
    expect(planTracks(['I'], items).tracks.map((t) => t.key)).toEqual(['I']);
  });

  it('gives Civics its own Justice branch whatever the format', () => {
    const items = [...many('c', 8, ['J'], 'Simulation', ['Civics']), ...many('s', 8, ['J'], 'Simulation')];
    const plan = planTracks(['J'], items);
    expect(plan.tracks.map((t) => t.key)).toEqual(['J:Civics', 'J:Simulation']);
  });

  it('keeps at most BRANCH_MAX branches', () => {
    const formats = ['Exam', 'Project', 'Program', 'Day event', 'Speaking'];
    const items = formats.flatMap((format) => many(format, 10, ['I'], format));
    const plan = planTracks(['I'], items);
    expect(plan.tracks.filter((t) => t.branch !== 'Other')).toHaveLength(BRANCH_MAX);
    expect(plan.tracks.at(-1)!.key).toBe('I:Other');
  });

  it('a shared stop belongs to its first line and does not split the line it passes through', () => {
    // Every stop is on Justice and Reasoning (a Debating only student): Justice splits, Reasoning stays one track.
    const items = [...many('s', 12, ['J', 'R'], 'Simulation'), ...many('d', 12, ['J', 'R'], 'Day event')];
    const plan = planTracks(['J', 'R'], items);
    expect(plan.tracks.map((t) => [t.key, t.count])).toEqual([['J:Day event', 12], ['J:Simulation', 12], ['R', 24]]);
    expect(plan.tracksOf(items[0]!)).toEqual(['J:Simulation', 'R']);
  });

  it('puts a shared stop on the matching branch of its second line when that line splits on its own stops', () => {
    const own = [...many('r', 10, ['R'], 'Exam'), ...many('w', 8, ['R'], 'Written entry')];
    const shared = item('shared', ['J', 'R'], 'Exam');
    const plan = planTracks(['J', 'R'], [...own, shared]);
    expect(plan.tracksOf(shared)).toEqual(['J', 'R:Exam']);
    expect(plan.tracks.find((t) => t.key === 'R:Exam')!.count).toBe(11);
  });

  it('draws one plain track per line when branches are off', () => {
    const items = [...many('s', 12, ['J'], 'Simulation'), ...many('e', 12, ['J'], 'Exam')];
    expect(planTracks(['J'], items).branched).toBe(true);
    expect(planTracks(['J'], items, false).tracks).toEqual([{ key: 'J', line: 'J', branch: null, label: 'Justice', count: 24 }]);
  });
});
